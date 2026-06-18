/**
 * 변경 영향도 문서 빌더 + 발행(A-A4) — `change-impact-analysis.md`.
 *
 * ImpactResult(+verify) + (선택) 생성예측 제안을 5종 정식문서와 동일한 GeneratedDoc
 * 모델로 변환하고 renderMarkdown 으로 발행한다. **read-only 분석물**: doc-state
 * 상태기계(DRAFT→APPROVED)에 등록하지 않는다(registerDraft 미호출, AC-13c).
 *
 * confidence(단일 소스 매핑): 기계 검증 GROUNDED → CONFIRMED_AI(인용 근거),
 * NEEDS_REVIEW → UNVERIFIED, 미검증(인용 없음) → INFERRED. 흐름/도메인은 file:line
 * 근거가 없어 INFERRED. net-new(`[생성]`)는 절대 CONFIRMED 아님(선례 앵커만 CONFIRMED).
 *
 * Profile-W 생산(AC-25): toProfileWChangeStory 가 생성예측을 P4.6 동결 스키마
 * (ProfileWChangeStory)의 객체로 PRODUCE 한다(AIDD 연동은 연기/deferred).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Confidence } from '../types.js'
import type { Claim, Evidence, GeneratedDoc, DocMeta, Section } from '../doc-generator/types.js'
import { claim, evidenceRate, renderMarkdown } from '../doc-generator/index.js'
import {
  ProfileWChangeStorySchema,
  type ProfileWChangeStory,
  type SourceCitation,
} from '../profile-w/index.js'
import type { CensusReport, ConfirmedPlan, Ownership } from '../domain-map/types.js'
import type { ImpactResult } from './types.js'
import type { ImpactVerifyReport } from './verify.js'
import type { CreationSuggestion } from './supplement-a.js'
import { cmp } from '../utils/cmp.js'

export const CHANGE_IMPACT_FILENAME = 'change-impact-analysis.md'
export const CHANGE_IMPACT_DOC_ID = '09_change-impact'
export const IMPACT_READONLY_NOTE =
  '이 문서는 **읽기전용 분석 산출물**입니다 — 검토·승인 상태기계(DRAFT→APPROVED) 밖이며 ' +
  '`[생성]` 예측은 net-new 라 CONFIRMED 를 받지 못합니다(선례 앵커만 실존 근거).'

function ev(file: string, line?: number | null): Evidence {
  return { file, line: line ?? null }
}

// ── 영향 규모 집계(공수 산정 입력) ───────────────────────────────────────────

export interface ImpactAggregateRow {
  label: string
  upstream: number
  downstream: number
}
export interface ImpactAggregate {
  byDomain: ImpactAggregateRow[] | null
  byLang: ImpactAggregateRow[]
}
export interface ImpactAggregateInputs {
  census: CensusReport['files']
  confirmed: ConfirmedPlan | null
  ownership: readonly Ownership[]
}

function tally(
  upPaths: readonly string[],
  downPaths: readonly string[],
  labelOf: (relPath: string) => string,
): ImpactAggregateRow[] {
  const rows = new Map<string, { upstream: number; downstream: number }>()
  const bump = (relPath: string, dir: 'upstream' | 'downstream') => {
    const label = labelOf(relPath)
    const row = rows.get(label) ?? { upstream: 0, downstream: 0 }
    row[dir] += 1
    rows.set(label, row)
  }
  for (const p of upPaths) bump(p, 'upstream')
  for (const p of downPaths) bump(p, 'downstream')
  return [...rows.entries()]
    .map(([label, r]) => ({ label, ...r }))
    .sort((a, b) => b.upstream + b.downstream - (a.upstream + a.downstream) || cmp(a.label, b.label))
}

export function aggregateImpactCounts(
  result: ImpactResult,
  inputs: ImpactAggregateInputs,
): ImpactAggregate {
  const upPaths = result.upstream.files.map((f) => f.relPath)
  const downPaths = result.downstream.files.map((f) => f.relPath)

  let byDomain: ImpactAggregateRow[] | null = null
  if (inputs.confirmed) {
    const rootLabel = new Map<string, string>()
    for (const d of inputs.confirmed.domains) {
      const label = d.name === d.key ? d.key : `${d.name} (${d.key})`
      for (const root of d.roots) rootLabel.set(root, label)
    }
    const ownersByFile = new Map(inputs.ownership.map((o) => [o.relPath, o.owners]))
    const domainOf = (relPath: string): string => {
      const direct = rootLabel.get(relPath)
      if (direct !== undefined) return direct
      const owners = ownersByFile.get(relPath)
      if (!owners || owners.length === 0) return '(미분류)'
      const labels = new Set<string>()
      for (const o of owners) {
        const l = rootLabel.get(o)
        if (l !== undefined) labels.add(l)
      }
      if (labels.size === 0) return '(미분류)'
      if (labels.size > 1) return '(공용)'
      return [...labels][0]
    }
    byDomain = tally(upPaths, downPaths, domainOf)
  }

  const langByFile = new Map(inputs.census.map((f) => [f.relPath, f.lang]))
  const byLang = tally(upPaths, downPaths, (p) => langByFile.get(p) ?? '(census 밖)')
  return { byDomain, byLang }
}

function aggregateTable(heading: string, rows: readonly ImpactAggregateRow[]): string {
  const lines = [`**${heading}**`, '', '| 구분 | 상류 | 하류 | 계 |', '| --- | ---: | ---: | ---: |']
  let up = 0
  let down = 0
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.upstream} | ${r.downstream} | ${r.upstream + r.downstream} |`)
    up += r.upstream
    down += r.downstream
  }
  lines.push(`| **계** | ${up} | ${down} | ${up + down} |`)
  return lines.join('\n')
}

function buildAggregateSection(result: ImpactResult, inputs: ImpactAggregateInputs): Section {
  const agg = aggregateImpactCounts(result, inputs)
  const parts = [
    '도달 폐포의 **파일 수 기준 규모 신호**다 — 공수 그 자체가 아니라 산정 입력. ' +
      '상류=영향받는 호출자, 하류=의존 협력자(시드 제외). 도메인 귀속=슬라이스 ownership.',
  ]
  if (agg.byDomain) parts.push(aggregateTable('도메인별', agg.byDomain))
  else parts.push('_도메인 미확정(/understand-map confirm 전) — 언어별 집계만 제공._')
  parts.push(aggregateTable('언어별', agg.byLang))
  return { heading: '영향 규모 집계 (공수 산정 입력)', claims: [], prose: parts.join('\n\n') }
}

// ── 생성예측 섹션(A-A4) ──────────────────────────────────────────────────────

function buildCreationSections(s: CreationSuggestion): Section[] {
  const changeClaims: Claim[] = s.change.map((c) => {
    const sym = c.symbols.length ? ` — ${c.symbols.join('; ')}` : ''
    return claim(`[변경] ${c.relPath}${sym}`, c.confidence, [ev(c.anchor.file, c.anchor.line)])
  })

  const createClaims: Claim[] = s.create.map((c) => {
    const target = c.suggestedPath ?? `역할 스캐폴드(${c.role})`
    const sym = c.symbols.length ? ` — ${c.symbols.join('; ')}` : ''
    // 근거 앵커: 선례(있으면) 또는 관례 앵커. net-new 자체는 INFERRED/UNVERIFIED.
    const anchors = [...c.precedentAnchors, ...c.conventionAnchors].map((a) => ev(a.file, a.line))
    const why = c.precedentAnchors.length ? ' (선례 앵커)' : c.conventionAnchors.length ? ' (관례 앵커)' : ''
    return claim(`[생성] ${target}${sym}${why}`, c.confidence, anchors)
  })

  const note =
    `생성예측 강도: **${s.strength}**` +
    (s.precedentFlowId ? ` · 선례 흐름 \`${s.precedentFlowId}\`` : ' · 선례 없음(역할 스캐폴드)') +
    `. ${IMPACT_READONLY_NOTE}`

  return [
    { heading: '신규 생성 권장 — 변경 ([변경])', claims: changeClaims, prose: note },
    { heading: '신규 생성 권장 — 생성 ([생성])', claims: createClaims },
  ]
}

// ── 문서 빌더 ────────────────────────────────────────────────────────────────

export interface BuildChangeImpactOptions {
  aggregate?: ImpactAggregateInputs
  suggestion?: CreationSuggestion
}

export function buildChangeImpact(
  result: ImpactResult,
  verify: ImpactVerifyReport,
  options: BuildChangeImpactOptions = {},
): GeneratedDoc {
  const verdict = new Map<string, 'GROUNDED' | 'NEEDS_REVIEW'>()
  for (const it of verify.items) verdict.set(`${it.kind}|${it.ref}`, it.verdict)
  const confFor = (kind: string, ref: string): Confidence => {
    const v = verdict.get(`${kind}|${ref}`)
    if (v === 'GROUNDED') return 'CONFIRMED_AI'
    if (v === 'NEEDS_REVIEW') return 'UNVERIFIED'
    return 'INFERRED'
  }

  const seedClaims = result.seeds.map((s) =>
    claim(`변경 시드: ${s.relPath} (origin: ${s.origin})`, s.confidence, [ev(s.relPath, null)]),
  )

  const apiClaims = result.upstream.api.map((a) => {
    const h = a.handler ? `, handler ${a.handler}` : ''
    return claim(`진입점 영향: ${a.id}${h} (검출 ${a.via})`, confFor('api', a.id), [ev(a.filePath, a.line)])
  })

  const flowClaims = result.upstream.flows.map((f) =>
    claim(`흐름 영향: ${f.flowId} → 도메인 ${f.domainName ?? f.domainKey ?? '(미상)'} (검출 ${f.via})`, f.confidence),
  )
  const domainClaims = result.upstream.domains.map((d) =>
    claim(`도메인 영향: ${d.name ?? d.key}`, d.confidence),
  )

  const mapperClaims = result.upstream.persistence.mappers.map((m) => {
    const ns = m.namespace ? ` [namespace ${m.namespace}]` : ''
    const owners = m.owners.length ? ` · 진입점 ${m.owners.length}개` : ''
    return claim(
      `영속성 영향(매퍼): ${m.relPath}${ns}${owners}`,
      confFor('mapper', m.relPath),
      m.citation ? [ev(m.citation.filePath, m.citation.line)] : [],
    )
  })
  const sqlClaims = result.upstream.persistence.sqlFiles.map((s) =>
    claim(`영속성 영향(SQL): ${s.relPath}`, 'INFERRED', [ev(s.relPath, null)]),
  )
  // JPA(보완 B, AC-16): entity↔table 애너테이션 경로 db-grounding. 명시=CONFIRMED, 암묵=INFERRED.
  const jpaClaims = result.upstream.persistence.jpaTables.map((t) => {
    const cols = t.columns.length ? ` · 컬럼 ${t.columns.length}개` : ''
    const naming = t.tableExplicit ? '' : ' [암묵 명명전략]'
    return claim(
      `영속성 영향(JPA): ${t.entityClass} → 테이블 ${t.tableName}${naming}${cols}`,
      t.confidence,
      [ev(t.citation.filePath, t.citation.line)],
    )
  })
  const dbProse = [
    result.upstream.persistence.note,
    `host 인용 추출 대상 매퍼 슬라이스 ${result.upstream.persistence.tableCandidateSlots.length}개` +
      ` · KG 테이블 카탈로그 ${result.upstream.persistence.kgTableCatalog.length}개.`,
  ].join('\n\n')

  const upstreamClaims = result.upstream.files.map((f) =>
    claim(
      `연관 모듈(상류): ${f.relPath} (via ${f.viaKinds.join(',')}, 깊이 ${f.minDepth})`,
      f.citation ? confFor('upstream', f.relPath) : 'INFERRED',
      f.citation ? [ev(f.citation.filePath, f.citation.line)] : [],
    ),
  )
  const downstreamClaims = result.downstream.files.map((f) =>
    claim(
      `연관 협력(하류): ${f.relPath} (via ${f.viaKinds.join(',')}, 깊이 ${f.minDepth})`,
      f.citation ? confFor('downstream', f.relPath) : 'INFERRED',
      f.citation ? [ev(f.citation.filePath, f.citation.line)] : [],
    ),
  )

  const reviewClaims = result.needsReview.map((n) => claim(`${n.ref}: ${n.reason}`, 'UNVERIFIED'))

  const sections: Section[] = [
    { heading: '변경 대상 (시드)', claims: seedClaims, prose: IMPACT_READONLY_NOTE },
    ...(options.aggregate ? [buildAggregateSection(result, options.aggregate)] : []),
    { heading: 'API · 진입점 영향', claims: apiClaims },
    { heading: '업무 흐름 · 도메인 영향', claims: [...flowClaims, ...domainClaims] },
    { heading: 'DB · 영속성 영향', claims: [...mapperClaims, ...sqlClaims, ...jpaClaims], prose: dbProse },
    { heading: '연관 모듈 (상류 영향)', claims: upstreamClaims },
    { heading: '연관 협력 (하류 의존 · 보조)', claims: downstreamClaims },
    ...(options.suggestion ? buildCreationSections(options.suggestion) : []),
    { heading: '검토 필요', claims: reviewClaims },
  ]

  return { docId: CHANGE_IMPACT_DOC_ID, title: '변경 영향도 분석', methodology: 'as-built', sections }
}

// ── 발행(read-only) ──────────────────────────────────────────────────────────

/** docs/09_release/change-impact-analysis.md 발행. doc-state 미등록(read-only). 절대 경로 반환. */
export function publishChangeImpact(
  projectRoot: string,
  doc: GeneratedDoc,
  meta: { sourceCommit: string | null },
): string {
  const docMeta: DocMeta = {
    docId: doc.docId,
    title: doc.title,
    methodology: doc.methodology,
    status: 'DRAFT', // read-only: 발행만 하고 doc-state 에 등록하지 않는다
    sourceCommit: meta.sourceCommit,
    evidenceRate: evidenceRate(doc),
  }
  const dir = join(projectRoot, 'docs', '09_release')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, CHANGE_IMPACT_FILENAME)
  writeFileSync(file, renderMarkdown(doc, docMeta), 'utf8')
  return file
}

// ── Profile-W 생산(AC-25) ────────────────────────────────────────────────────

/**
 * 생성예측 제안 → Profile-W change-story 객체(P4.6 동결 스키마)를 PRODUCE 한다.
 * 결정론: 모든 배열 정렬, task id 는 안정 식별자. ProfileWChangeStorySchema 로 parse 해
 * 손편집/스큐를 조용히 통과시키지 않는다. AIDD 연동은 연기(deferred) — shape 만 생산.
 */
export function toProfileWChangeStory(
  suggestion: CreationSuggestion,
  result: ImpactResult,
): ProfileWChangeStory {
  const entity = suggestion.entityHint
  const acceptanceCriteria: string[] = []
  const tasks: ProfileWChangeStory['tasks'] = []
  const citations: SourceCitation[] = []
  const fileList = new Set<string>()

  // [변경] → task + AC + 인용
  for (const c of suggestion.change) {
    const sym = c.symbols.length ? ` (${c.symbols.join('; ')})` : ''
    tasks.push({ id: `change:${c.relPath}:${c.anchor.line}`, description: `[변경] ${c.relPath}${sym}`, fileList: [c.relPath] })
    acceptanceCriteria.push(`${c.relPath} 변경이 ${c.confidence} 근거로 반영된다`)
    fileList.add(c.relPath)
    citations.push({ file: c.anchor.file, line: c.anchor.line })
  }
  // [생성] → task + AC + 선례/관례 인용
  for (const c of suggestion.create) {
    const target = c.suggestedPath ?? `scaffold:${c.role}`
    const sym = c.symbols.length ? ` (${c.symbols.join('; ')})` : ''
    tasks.push({
      id: `create:${target}`,
      description: `[생성] ${target}${sym}`,
      fileList: c.suggestedPath ? [c.suggestedPath] : undefined,
    })
    acceptanceCriteria.push(`${target} 신규 생성(${c.strength}, ${c.confidence})`)
    if (c.suggestedPath) fileList.add(c.suggestedPath)
    for (const a of [...c.precedentAnchors, ...c.conventionAnchors]) citations.push({ file: a.file, line: a.line })
  }

  const dedupCitations = [...new Map(citations.map((c) => [`${c.file}:${c.line}`, c])).values()].sort(
    (a, b) => cmp(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0),
  )

  return ProfileWChangeStorySchema.parse({
    storyId: `change-story:${entity}`,
    title: `${entity} 변경 스토리 (영향도 ${result.seeds.length} 시드)`,
    acceptanceCriteria: [...acceptanceCriteria].sort(cmp),
    tasks: [...tasks].sort((a, b) => cmp(a.id, b.id)),
    sourceCitations: dedupCitations,
    fileList: [...fileList].sort(),
  })
}
