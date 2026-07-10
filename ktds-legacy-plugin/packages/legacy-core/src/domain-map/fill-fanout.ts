/**
 * FILL FAN-OUT(S8 대규모 채움 팬아웃) — 청크 준비·조각 감사·병합.
 *
 * 도메인 수·흐름 수가 커지면 "호스트가 도메인당 1회 fill 작성" 인라인 경로는
 * 컨텍스트가 폭발한다(egov: 도메인 11개·흐름 1,255개). 이 모듈은 그 실증 방법론을
 * 정식 자산화한다: 번들을 **흐름 N개 단위 자립 청크**로 쪼개고, 각 청크에 검증
 * 통과가 보장된 pre-cite(실파일에서 결정론 추출한 인용)를 동봉해 **인용 생산을
 * LLM 에서 제거**한다. 팬아웃 에이전트는 청크당 조각(fragment)을 쓰고, 결정론
 * 병합이 DomainFill 로 재조립한다. egov 실측 근거율 100% 의 핵심이 이 pre-cite 다.
 *
 *   prep : bundle/<key>.json → fill-prep/<chunkId>.json + fill-prep/index.json
 *   (팬아웃: 에이전트가 fill-frag/<chunkId>.json 작성 — SKILL.md / workflow 지시)
 *   audit: 조각 완결성 감사(존재 ∧ 스키마 ∧ id 정합 ∧ 커버리지) — 재디스패치 근거
 *   merge: fill-frag/*.json → fill/<key>.json (DomainFill — 헤더 필수·id dedupe)
 *
 * 완료의 진실은 디스크에 있다(audit) — 에이전트 ack 가 아니라. 중단 후 재실행하면
 * 완료 청크는 건너뛴다(멱등 재개). 결정론: 산출물 전부 stableJson + 자연키 정렬.
 */
import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { specMapDir, stableJson } from './persist.js'
import { cmp } from '../utils/cmp.js'
import {
  bundleDir,
  safeKeyFilename,
  sliceFile,
  BundleFileSchema,
  DomainBundleSchema,
  DEFAULT_SLICE_LINES,
  type DomainBundle,
} from './bundle.js'
import {
  CitationSchema,
  ClaimSchema,
  BusinessFlowProcessSchema,
  DomainFillSchema,
  fillDir,
  fillPathFor,
  type Citation,
  type DomainFill,
} from './fill.js'
import { normalizeCitationText, isTrivialSnippet } from './verify.js'
import { NodeDetailTemplateSchema } from './node-template.js'
import { FlowLayerSchema } from './types.js'

/** `.spec/map/fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export const FILL_PREP_DIR = 'fill-prep'
/** `.spec/map/fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export const FILL_FRAG_DIR = 'fill-frag'
/** 청크 색인 파일명(`fill-prep/` 하위). */
export const FILL_PREP_INDEX_FILENAME = 'index.json'
/** 청크당 흐름 수 기본값 — egov 실증값(93청크/1,255흐름). */
export const DEFAULT_CHUNK_FLOWS = 20
/** 청크당 소스 슬라이스 문자 예산 — 에이전트 1회 컨텍스트 유계. */
export const DEFAULT_CHUNK_CHAR_CAP = 60_000
/** pre-cite 후보 탐색 창 — 앵커 라인에서 위/아래로 훑는 최대 라인 수. */
const PRECITE_SCAN_LINES = 40
/** pre-cite 스니펫 길이 상한(정규화 substring 일치라 잘라도 안전). */
const PRECITE_SNIPPET_MAX = 200

const ChunkFlowSchema = z.object({
  flowId: z.string(),
  entryPoint: z.string(),
  entryType: z.string(),
  filePath: z.string(),
  line: z.number().int().positive(),
  stepIds: z.array(z.string()),
  /** 검증 통과 보장 인용(실파일 결정론 추출) — 없으면 null(정직 보고). */
  preCite: CitationSchema.nullable(),
})

const ChunkStepSchema = z.object({
  stepId: z.string(),
  relPath: z.string(),
  layer: FlowLayerSchema.optional(),
  preCite: CitationSchema.nullable(),
})

/** 헤더 청크 전용 — 도메인 전 흐름의 경량 색인(businessFlows flowRef·교차 서술용). */
const HeaderFlowIndexSchema = z.object({
  flowId: z.string(),
  entryPoint: z.string(),
  entryType: z.string(),
  filePath: z.string(),
  line: z.number().int().positive(),
  preCite: CitationSchema.nullable(),
})

/** 팬아웃 에이전트 1명이 읽는 자립 청크 — bundle 의 부분집합 + pre-cite. */
export const FillChunkSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  chunkId: z.string(),
  domainId: z.string(),
  key: z.string(),
  /** 확정 플랜의 도메인 표시명(채움 전 구조명) — 에이전트 명명 참고용. */
  domainName: z.string(),
  /** true = 이 청크 담당 에이전트가 도메인 헤더(요약/엔티티/규칙/업무흐름도)도 쓴다. */
  isHeaderChunk: z.boolean(),
  flows: z.array(ChunkFlowSchema),
  steps: z.array(ChunkStepSchema),
  /** 이 청크 step 들의 파일 슬라이스(도메인 번들과 동일 형식, 청크 charCap 적용). */
  files: z.array(BundleFileSchema),
  /** 청크 charCap 으로 슬라이스가 생략된 파일(조용한 누락 금지). */
  sliceOmitted: z.array(z.string()),
  header: z.object({ flowIndex: z.array(HeaderFlowIndexSchema) }).nullable(),
  nodeDetailTemplate: NodeDetailTemplateSchema,
})
export type FillChunk = z.infer<typeof FillChunkSchema>

const ChunkIndexEntrySchema = z.object({
  chunkId: z.string(),
  domainId: z.string(),
  key: z.string(),
  isHeaderChunk: z.boolean(),
  flowCount: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  /** pre-cite 미확보 항목 수(흐름+단계) — 근거 공백의 정직 보고. */
  preCiteMissing: z.number().int().nonnegative(),
})

export const FillChunkIndexSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  chunkFlows: z.number().int().positive(),
  chunks: z.array(ChunkIndexEntrySchema),
  totals: z.object({
    domains: z.number().int().nonnegative(),
    chunks: z.number().int().nonnegative(),
    flows: z.number().int().nonnegative(),
    steps: z.number().int().nonnegative(),
    preCiteMissing: z.number().int().nonnegative(),
  }),
})
export type FillChunkIndex = z.infer<typeof FillChunkIndexSchema>

/** 팬아웃 에이전트가 쓰는 조각 — DomainFill 의 청크 단위 부분집합. */
export const FillFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  chunkId: z.string(),
  domainId: z.string().regex(/^domain:/),
  /** 헤더 청크만 non-null — DomainFill 의 도메인 수준 필드. */
  header: z
    .object({
      name: z.string().min(1).max(120),
      summary: ClaimSchema,
      entities: z.array(ClaimSchema),
      businessRules: z.array(ClaimSchema),
      crossDomainInteractions: z.array(ClaimSchema),
      businessFlows: z.array(BusinessFlowProcessSchema).min(1).max(20).optional(),
    })
    .nullable(),
  flows: DomainFillSchema.shape.flows,
  steps: DomainFillSchema.shape.steps,
})
export type FillFragment = z.infer<typeof FillFragmentSchema>

/** `.spec/map/fill-prep/` 디렉터리 경로. */
export function fillPrepDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), FILL_PREP_DIR)
}

/** `.spec/map/fill-frag/` 디렉터리 경로. */
export function fillFragDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), FILL_FRAG_DIR)
}

function chunkPath(projectRoot: string, chunkId: string): string {
  return join(fillPrepDir(projectRoot), `${chunkId}.json`)
}

function fragPath(projectRoot: string, chunkId: string): string {
  return join(fillFragDir(projectRoot), `${chunkId}.json`)
}

/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export async function readFillChunkIndex(projectRoot: string): Promise<FillChunkIndex> {
  let raw: string
  try {
    raw = await readFile(join(fillPrepDir(projectRoot), FILL_PREP_INDEX_FILENAME), 'utf8')
  } catch {
    throw new Error('fill-prep/index.json 없음 — 먼저 fill-prep 을 실행하세요')
  }
  return FillChunkIndexSchema.parse(JSON.parse(raw))
}

/**
 * 실파일에서 검증 통과가 보장된 인용 1건을 결정론으로 추출한다.
 * 후보 순서: 앵커 라인 → 아래로 PRECITE_SCAN_LINES → 위로 PRECITE_SCAN_LINES.
 * verify.ts 와 동일 규칙(normalizeCitationText/isTrivialSnippet)을 공유하고,
 * CitationSchema 의 snippet min 8 도 함께 보장한다. 실패는 null(정직 보고).
 */
async function extractPreCite(
  projectRoot: string,
  relPath: string,
  anchorLine: number,
  cache: Map<string, string[] | null>,
): Promise<Citation | null> {
  let lines = cache.get(relPath)
  if (lines === undefined) {
    try {
      lines = (await readFile(join(projectRoot, relPath), 'utf8')).split('\n')
    } catch {
      lines = null
    }
    cache.set(relPath, lines)
  }
  if (!lines) return null
  const anchor = Math.min(Math.max(1, anchorLine), lines.length)
  const candidates: number[] = [anchor]
  for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
    if (anchor + d <= lines.length) candidates.push(anchor + d)
  }
  for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
    if (anchor - d >= 1) candidates.push(anchor - d)
  }
  for (const line of candidates) {
    const snippet = lines[line - 1].trim().slice(0, PRECITE_SNIPPET_MAX)
    if (snippet.length < 8) continue
    const normalized = normalizeCitationText(snippet)
    if (normalized.length === 0 || isTrivialSnippet(normalized)) continue
    return { filePath: relPath, line, snippet }
  }
  return null
}

export interface PrepFillChunksOptions {
  /** 청크당 흐름 수(기본 DEFAULT_CHUNK_FLOWS). */
  chunkFlows?: number
  /** 청크당 소스 슬라이스 문자 예산(기본 DEFAULT_CHUNK_CHAR_CAP). */
  charCap?: number
}

/** 번들 디렉터리의 도메인 번들 전부를 파일명 정렬 순서로 읽는다. */
async function readBundles(projectRoot: string): Promise<DomainBundle[]> {
  const dir = bundleDir(projectRoot)
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort(cmp)
  } catch {
    throw new Error('bundle/ 없음 — 먼저 bundle 을 실행하세요')
  }
  if (names.length === 0) throw new Error('bundle/ 이 비어 있음 — 먼저 bundle 을 실행하세요')
  const bundles: DomainBundle[] = []
  for (const name of names) {
    bundles.push(DomainBundleSchema.parse(JSON.parse(await readFile(join(dir, name), 'utf8'))))
  }
  return bundles
}

/**
 * 번들을 팬아웃 청크로 분해해 `.spec/map/fill-prep/` 에 영속한다.
 * 각 도메인의 흐름을 chunkFlows 개 단위로 자르고(첫 청크 = 헤더 청크), 흐름·단계
 * 마다 pre-cite 를 실파일에서 추출해 동봉한다. 번들에서 슬라이스가 생략된 파일
 * (sliceOmitted)은 청크 예산 안에서 재슬라이스를 시도한다(청크가 도메인보다 작아
 * 예산이 남는다 — egov 506개 생략 커버 실증). 기존 fill-prep/*.json 은 전부 지우고
 * 다시 쓴다(청크 수 변경 시 낡은 청크 잔존 방지 — fill-frag/ 는 재개 자산이라 보존).
 */
export async function prepFillChunks(
  projectRoot: string,
  options: PrepFillChunksOptions = {},
): Promise<{ index: FillChunkIndex; paths: string[] }> {
  const chunkFlows = options.chunkFlows ?? DEFAULT_CHUNK_FLOWS
  const charCap = options.charCap ?? DEFAULT_CHUNK_CHAR_CAP
  const bundles = await readBundles(projectRoot)

  const prep = fillPrepDir(projectRoot)
  await mkdir(prep, { recursive: true })
  for (const name of (await readdir(prep)).filter((n) => n.endsWith('.json'))) {
    await rm(join(prep, name))
  }

  const fileCache = new Map<string, string[] | null>()
  const entries: FillChunkIndex['chunks'] = []
  const paths: string[] = []
  let totalFlows = 0
  let totalSteps = 0
  let totalMissing = 0

  for (const bundle of bundles) {
    const stepById = new Map(bundle.steps.map((s) => [s.stepId, s]))
    const fileByRel = new Map(bundle.files.map((f) => [f.relPath, f]))

    // 흐름별 pre-cite 를 도메인당 1회 계산(헤더 flowIndex 와 청크 flows 가 공유).
    const flowPreCites = new Map<string, Citation | null>()
    for (const flow of bundle.flows) {
      flowPreCites.set(
        flow.flowId,
        flow.filePath ? await extractPreCite(projectRoot, flow.filePath, flow.line, fileCache) : null,
      )
    }
    const flowIndex = bundle.flows.map((f) => ({
      flowId: f.flowId,
      entryPoint: f.entryPoint,
      entryType: f.entryType,
      filePath: f.filePath,
      line: f.line,
      preCite: flowPreCites.get(f.flowId) ?? null,
    }))

    // bundle.flows 는 flowId 정렬(생산 계약) — 그대로 chunkFlows 개 단위로 자른다.
    const groups: (typeof bundle.flows)[] = []
    for (let i = 0; i < bundle.flows.length; i += chunkFlows) {
      groups.push(bundle.flows.slice(i, i + chunkFlows))
    }
    if (groups.length === 0) groups.push([])

    for (let gi = 0; gi < groups.length; gi++) {
      const chunkId = `${safeKeyFilename(bundle.key)}-${String(gi).padStart(3, '0')}`
      const flows: FillChunk['flows'] = groups[gi].map((f) => ({
        flowId: f.flowId,
        entryPoint: f.entryPoint,
        entryType: f.entryType,
        filePath: f.filePath,
        line: f.line,
        stepIds: f.stepIds,
        preCite: flowPreCites.get(f.flowId) ?? null,
      }))

      // 이 청크 흐름들의 step (등장 순서 dedupe — flow_step weight 순서 보존).
      const seenSteps = new Set<string>()
      const steps: FillChunk['steps'] = []
      for (const f of groups[gi]) {
        for (const stepId of f.stepIds) {
          if (seenSteps.has(stepId)) continue
          seenSteps.add(stepId)
          const src = stepById.get(stepId)
          if (!src) continue
          const anchor = fileByRel.get(src.relPath)
          const preCite = await extractPreCite(projectRoot, src.relPath, anchor?.line ?? 1, fileCache)
          steps.push(src.layer ? { stepId, relPath: src.relPath, layer: src.layer, preCite } : { stepId, relPath: src.relPath, preCite })
        }
      }
      steps.sort((a, b) => cmp(a.stepId, b.stepId))

      // 청크 파일 슬라이스: 번들 슬라이스 재사용 + 번들 생략분은 청크 예산 안에서
      // 재슬라이스 시도. relPath 정렬 순서로 charCap 까지(초과분은 정직 보고).
      const relPaths = [...new Set(steps.map((s) => s.relPath))].sort(cmp)
      const files: FillChunk['files'] = []
      const sliceOmitted: string[] = []
      let used = 0
      for (const relPath of relPaths) {
        const bundleFile = fileByRel.get(relPath)
        const anchorLine = bundleFile?.line ?? 1
        let slice =
          bundleFile?.slice ?? (await sliceFile(projectRoot, relPath, anchorLine, DEFAULT_SLICE_LINES))
        if (slice && used + slice.text.length > charCap) {
          slice = null
          sliceOmitted.push(relPath)
        }
        if (slice) used += slice.text.length
        files.push({
          relPath,
          className: bundleFile?.className ?? null,
          line: anchorLine,
          slice,
          kgHint: bundleFile?.kgHint ?? null,
        })
      }

      const chunk: FillChunk = {
        schemaVersion: 1,
        gitCommit: bundle.gitCommit,
        chunkId,
        domainId: bundle.domainId,
        key: bundle.key,
        domainName: bundle.name,
        isHeaderChunk: gi === 0,
        flows,
        steps,
        files,
        sliceOmitted,
        header: gi === 0 ? { flowIndex } : null,
        nodeDetailTemplate: bundle.nodeDetailTemplate,
      }
      const filePath = chunkPath(projectRoot, chunkId)
      await writeFile(filePath, stableJson(FillChunkSchema.parse(chunk)), 'utf8')
      paths.push(filePath)

      const preCiteMissing =
        flows.filter((f) => f.preCite === null).length + steps.filter((s) => s.preCite === null).length
      entries.push({
        chunkId,
        domainId: bundle.domainId,
        key: bundle.key,
        isHeaderChunk: gi === 0,
        flowCount: flows.length,
        stepCount: steps.length,
        preCiteMissing,
      })
      totalFlows += flows.length
      totalSteps += steps.length
      totalMissing += preCiteMissing
    }
  }

  const index: FillChunkIndex = {
    schemaVersion: 1,
    gitCommit: bundles[0]?.gitCommit ?? null,
    chunkFlows,
    chunks: entries,
    totals: {
      domains: bundles.length,
      chunks: entries.length,
      flows: totalFlows,
      steps: totalSteps,
      preCiteMissing: totalMissing,
    },
  }
  await writeFile(
    join(prep, FILL_PREP_INDEX_FILENAME),
    stableJson(FillChunkIndexSchema.parse(index)),
    'utf8',
  )
  return { index, paths }
}

export interface FragmentAudit {
  complete: string[]
  incomplete: Array<{ chunkId: string; reason: string }>
}

/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId/domainId 정합 ∧ 헤더 존재
 * (헤더 청크) ∧ 커버리지(조각 flow/step id ⊇ 청크 선언 id). 완료의 진실은 이
 * 감사가 결정한다(에이전트 ack 아님). `only` 로 청크 부분 감사(스킵 가드용).
 */
export async function auditFillFragments(
  projectRoot: string,
  only?: string[],
): Promise<FragmentAudit> {
  const index = await readFillChunkIndex(projectRoot)
  const onlySet = only && only.length > 0 ? new Set(only) : null
  const complete: string[] = []
  const incomplete: Array<{ chunkId: string; reason: string }> = []

  for (const entry of index.chunks) {
    if (onlySet && !onlySet.has(entry.chunkId)) continue
    const fail = (reason: string) => incomplete.push({ chunkId: entry.chunkId, reason })

    let raw: string
    try {
      raw = await readFile(fragPath(projectRoot, entry.chunkId), 'utf8')
    } catch {
      fail('missing')
      continue
    }
    let frag: FillFragment
    try {
      frag = FillFragmentSchema.parse(JSON.parse(raw))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      fail(`schema: ${msg.slice(0, 300)}`)
      continue
    }
    if (frag.chunkId !== entry.chunkId) {
      fail(`chunkId-mismatch: ${frag.chunkId}`)
      continue
    }
    if (frag.domainId !== entry.domainId) {
      fail(`domainId-mismatch: ${frag.domainId} ≠ ${entry.domainId}`)
      continue
    }
    if (entry.isHeaderChunk && !frag.header) {
      fail('header-missing')
      continue
    }

    // 커버리지: 청크가 선언한 모든 id 가 조각에 있어야 한다(부분 산출 재디스패치).
    const chunk = FillChunkSchema.parse(
      JSON.parse(await readFile(chunkPath(projectRoot, entry.chunkId), 'utf8')),
    )
    const fragFlowIds = new Set(frag.flows.map((f) => f.flowId))
    const fragStepIds = new Set(frag.steps.map((s) => s.stepId))
    const missingFlows = chunk.flows.filter((f) => !fragFlowIds.has(f.flowId)).length
    const missingSteps = chunk.steps.filter((s) => !fragStepIds.has(s.stepId)).length
    if (missingFlows > 0 || missingSteps > 0) {
      fail(`coverage: flows ${chunk.flows.length - missingFlows}/${chunk.flows.length} · steps ${chunk.steps.length - missingSteps}/${chunk.steps.length}`)
      continue
    }
    complete.push(entry.chunkId)
  }
  complete.sort(cmp)
  incomplete.sort((a, b) => cmp(a.chunkId, b.chunkId))
  return { complete, incomplete }
}

export interface MergeFillResult {
  /** fill/<key>.json 으로 병합된 도메인. */
  written: Array<{
    key: string
    path: string
    flows: number
    steps: number
    /** 이 도메인에서 감사 미통과로 빠진 청크(부분 병합 — emit 폴백이 메운다). */
    missingChunks: string[]
  }>
  /** 헤더 청크 미완결로 병합 자체를 못 한 도메인(fill 미기록 → emit pending). */
  skippedDomains: Array<{ key: string; reason: string }>
  /** 조각이 청크 선언 밖 id 를 내 버린 항목 수(도메인 밖/유령 id — 병합서 제외). */
  droppedItems: number
}

/**
 * 조각을 도메인별 DomainFill 로 병합해 `.spec/map/fill/<key>.json` 에 쓴다.
 * 헤더(도메인 수준 필드)는 헤더 청크 조각에서, flows/steps 는 청크 순서로 이어
 * 붙이되 id dedupe(첫 등장 우선) + 청크 선언 밖 id 는 버리고 집계 보고한다.
 * 헤더 청크가 미완결인 도메인은 기록하지 않는다(pending 유지 — 도메인 단위 멱등).
 */
export async function mergeFillFragments(projectRoot: string): Promise<MergeFillResult> {
  const index = await readFillChunkIndex(projectRoot)
  const audit = await auditFillFragments(projectRoot)
  const completeSet = new Set(audit.complete)
  const incompleteBy = new Map(audit.incomplete.map((i) => [i.chunkId, i.reason]))

  const byKey = new Map<string, FillChunkIndex['chunks']>()
  for (const entry of index.chunks) {
    const list = byKey.get(entry.key)
    if (list) list.push(entry)
    else byKey.set(entry.key, [entry])
  }

  const written: MergeFillResult['written'] = []
  const skippedDomains: MergeFillResult['skippedDomains'] = []
  let droppedItems = 0
  await mkdir(fillDir(projectRoot), { recursive: true })

  for (const key of [...byKey.keys()].sort(cmp)) {
    const chunks = byKey.get(key)!.slice().sort((a, b) => cmp(a.chunkId, b.chunkId))
    const headerEntry = chunks.find((c) => c.isHeaderChunk)
    if (!headerEntry || !completeSet.has(headerEntry.chunkId)) {
      const reason = headerEntry
        ? `헤더 청크 미완결(${headerEntry.chunkId}): ${incompleteBy.get(headerEntry.chunkId) ?? 'missing'}`
        : '헤더 청크 없음'
      skippedDomains.push({ key, reason })
      continue
    }

    const flows: DomainFill['flows'] = []
    const steps: DomainFill['steps'] = []
    const seenFlow = new Set<string>()
    const seenStep = new Set<string>()
    const missingChunks: string[] = []
    let header: FillFragment['header'] = null

    for (const entry of chunks) {
      if (!completeSet.has(entry.chunkId)) {
        missingChunks.push(entry.chunkId)
        continue
      }
      const frag = FillFragmentSchema.parse(
        JSON.parse(await readFile(fragPath(projectRoot, entry.chunkId), 'utf8')),
      )
      if (entry.isHeaderChunk) header = frag.header
      const chunk = FillChunkSchema.parse(
        JSON.parse(await readFile(chunkPath(projectRoot, entry.chunkId), 'utf8')),
      )
      const declaredFlows = new Set(chunk.flows.map((f) => f.flowId))
      const declaredSteps = new Set(chunk.steps.map((s) => s.stepId))
      for (const f of frag.flows) {
        if (!declaredFlows.has(f.flowId)) {
          droppedItems++
          continue
        }
        if (seenFlow.has(f.flowId)) continue
        seenFlow.add(f.flowId)
        flows.push(f)
      }
      for (const s of frag.steps) {
        if (!declaredSteps.has(s.stepId)) {
          droppedItems++
          continue
        }
        if (seenStep.has(s.stepId)) continue
        seenStep.add(s.stepId)
        steps.push(s)
      }
    }

    // 헤더 청크 완결 ⊃ header 존재(감사 계약) — 그래도 fail-closed 로 재확인.
    if (!header) {
      skippedDomains.push({ key, reason: `헤더 조각 비어 있음(${headerEntry.chunkId})` })
      continue
    }
    flows.sort((a, b) => cmp(a.flowId, b.flowId))
    steps.sort((a, b) => cmp(a.stepId, b.stepId))
    const fill: DomainFill = DomainFillSchema.parse({
      schemaVersion: 1,
      domainId: headerEntry.domainId,
      name: header.name,
      summary: header.summary,
      entities: header.entities,
      businessRules: header.businessRules,
      crossDomainInteractions: header.crossDomainInteractions,
      ...(header.businessFlows ? { businessFlows: header.businessFlows } : {}),
      flows,
      steps,
    })
    const path = fillPathFor(projectRoot, key)
    await writeFile(path, stableJson(fill), 'utf8')
    written.push({ key, path, flows: flows.length, steps: steps.length, missingChunks })
  }

  return { written, skippedDomains, droppedItems }
}
