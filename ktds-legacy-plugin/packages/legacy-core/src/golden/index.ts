/**
 * golden(W10, P10) — LLM 보강 산출물 정확도 채점기(결정론).
 *
 * 지표 3종(설계: docs/ktds/GOLDEN_SET_DESIGN.md):
 *   ① 구조 일치율  : 골든의 구조 단위가 후보에 존재 + 필수 필드 충족 비율
 *   ② 근거 유효율  : 후보의 인용(file:line·스니펫)이 대상 레포에 실존하는 비율
 *                    (골든 불요 — 날조 인용의 기계 검출)
 *   ③ 핵심 항목 재현율: 골든의 핵심 항목(업무규칙·엔티티·id)이 후보에 재현된 비율
 *
 * 방향성(명시 한계): 재현율은 골든→후보(누락 검출)만 본다. 후보의 초과 항목은
 * 벌점 없음 — 날조는 ②가 인용 무효로 벌한다. 유사도 부분점수는 백로그(정확 포함 매칭).
 * 결정론: 모든 목록 정렬·타임스탬프 없음 — 동일 입력 → byte-identical 점수.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 소수 4자리 비율(0~1) — 결정론 반올림. 분모 0 은 null(측정 불가 ≠ 0점). */
function rate(num: number, den: number): number | null {
  return den === 0 ? null : Math.round((num / den) * 10000) / 10000
}

// ── ① 인용 수집 + ② 근거 유효율 ────────────────────────────────────────────

export interface Citation {
  file: string
  line: number | null
  snippet: string | null
}

/**
 * JSON 재귀로 인용 노드를 수집한다 — `{file|filePath: string, line?: number}` 형태.
 * domain-graph(ktdsClaims[].citations[].filePath)와 rtm(evidence[].file)을 모두 덮는
 * 범용 수집기(새 산출물에도 그대로 적용).
 */
export function collectCitations(value: unknown): Citation[] {
  const out: Citation[] = []
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    const o = v as Record<string, unknown>
    const file = typeof o.file === 'string' ? o.file : typeof o.filePath === 'string' ? o.filePath : null
    if (file !== null) {
      out.push({
        file,
        line: typeof o.line === 'number' ? o.line : null,
        snippet: typeof o.snippet === 'string' ? o.snippet : null,
      })
    }
    for (const k of Object.keys(o)) walk(o[k])
  }
  walk(value)
  return out.sort((a, b) => cmp(a.file, b.file) || cmp(String(a.line ?? ''), String(b.line ?? '')))
}

export interface CitationScore {
  total: number
  valid: number
  /** 분모 0(인용 자체가 없음)은 null — "인용 없음"과 "전부 유효"를 구분(정직). */
  rate: number | null
  /** 무효 사유 샘플(상한 20, 정렬) — 전수는 total-valid. */
  invalidSamples: Array<{ file: string; line: number | null; reason: string }>
}

/** 스니펫 검증 윈도(±) — 라인 소폭 이동 허용(fill-pipeline 검증과 동일 철학). */
const SNIPPET_WINDOW = 2
const INVALID_SAMPLE_CAP = 20

/** 인용이 projectRoot 에 실존하는지 — 파일·라인 범위·(있으면) 스니펫 근방 일치. */
export function scoreCitations(citations: Citation[], projectRoot: string): CitationScore {
  const lineCache = new Map<string, string[] | null>()
  const linesOf = (rel: string): string[] | null => {
    if (lineCache.has(rel)) return lineCache.get(rel)!
    let lines: string[] | null = null
    try {
      lines = readFileSync(join(projectRoot, rel), 'utf8').split('\n')
    } catch {
      lines = null
    }
    lineCache.set(rel, lines)
    return lines
  }

  let valid = 0
  const invalid: Array<{ file: string; line: number | null; reason: string }> = []
  for (const c of citations) {
    const lines = linesOf(c.file)
    let reason: string | null = null
    if (lines === null) {
      reason = '파일 없음'
    } else if (c.line !== null && (c.line < 1 || c.line > lines.length)) {
      reason = `라인 범위 밖(파일 ${lines.length}줄)`
    } else if (c.snippet !== null && c.line !== null) {
      const lo = Math.max(0, c.line - 1 - SNIPPET_WINDOW)
      const hi = Math.min(lines.length, c.line + SNIPPET_WINDOW)
      const windowText = lines.slice(lo, hi).join('\n')
      if (!windowText.includes(c.snippet.trim())) reason = `스니펫 불일치(±${SNIPPET_WINDOW}줄)`
    }
    if (reason === null) valid++
    else if (invalid.length < INVALID_SAMPLE_CAP) invalid.push({ file: c.file, line: c.line, reason })
  }
  return {
    total: citations.length,
    valid,
    rate: rate(valid, citations.length),
    invalidSamples: invalid.sort((a, b) => cmp(a.file, b.file) || cmp(String(a.line ?? ''), String(b.line ?? ''))),
  }
}

// ── ③ 구조 단위 + ④ 핵심 항목 ──────────────────────────────────────────────

export interface StructureUnit {
  /** 안정 키(노드/행 id). */
  key: string
  /**
   * 채워진 필드 이름(정렬). 일치 판정은 "골든이 채운 필드를 후보도 채웠는가" —
   * 골든 자체가 비운 필드(예: flow 노드의 businessRules)는 요구하지 않는다
   * (자기 채점 100% 보장 + 필드 소실 회귀는 그대로 검출).
   */
  filledFields: string[]
}

export interface KeyItem {
  /** 항목 출처 표기(리포트용, 예: "domain:account businessRule"). */
  kind: string
  /** 정규화 텍스트 또는 id. */
  text: string
}

/** 텍스트 정규화 — 공백 연쇄/개행 → 단일 공백, trim. 서식 둔감·의미 민감. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

interface DomainGraphLike {
  nodes?: Array<{
    id?: string
    summary?: string
    domainMeta?: {
      businessRules?: string[]
      entities?: Array<string | { name?: string }>
      ktdsClaims?: Array<{ text?: string }>
    }
  }>
}

/** domain-graph 구조 단위 — domainMeta 를 가진(=LLM 채움 대상) 노드. */
export function extractDomainGraphUnits(g: DomainGraphLike): StructureUnit[] {
  const out: StructureUnit[] = []
  for (const n of g.nodes ?? []) {
    if (!n.domainMeta || typeof n.id !== 'string') continue
    const filled: string[] = []
    if (normalizeText(n.summary ?? '') !== '') filled.push('summary')
    if ((n.domainMeta.businessRules ?? []).length > 0) filled.push('businessRules')
    if ((n.domainMeta.entities ?? []).length > 0) filled.push('entities')
    out.push({ key: n.id, filledFields: filled.sort(cmp) })
  }
  return out.sort((a, b) => cmp(a.key, b.key))
}

/** domain-graph 핵심 항목 — 업무규칙 문장 + 엔티티 이름(도메인 노드별). */
export function extractDomainGraphKeyItems(g: DomainGraphLike): KeyItem[] {
  const out: KeyItem[] = []
  for (const n of g.nodes ?? []) {
    if (!n.domainMeta || typeof n.id !== 'string') continue
    for (const r of n.domainMeta.businessRules ?? []) {
      out.push({ kind: `${n.id} businessRule`, text: normalizeText(r) })
    }
    for (const e of n.domainMeta.entities ?? []) {
      const name = typeof e === 'string' ? e : (e.name ?? '')
      if (name) out.push({ kind: `${n.id} entity`, text: normalizeText(name) })
    }
  }
  return out.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.text, b.text))
}

interface RtmLike {
  requirements?: Array<{ id?: string; text?: string }>
  functions?: Array<{ id?: string; name?: string; entryPoint?: unknown }>
  testScenarios?: Array<{ id?: string }>
}

/** rtm 구조 단위 — 요구사항·기능·테스트 시나리오(종류 접두로 키 충돌 방지). */
export function extractRtmUnits(r: RtmLike): StructureUnit[] {
  const out: StructureUnit[] = []
  for (const q of r.requirements ?? []) {
    if (typeof q.id !== 'string') continue
    out.push({ key: `req:${q.id}`, filledFields: normalizeText(q.text ?? '') !== '' ? ['text'] : [] })
  }
  for (const f of r.functions ?? []) {
    if (typeof f.id !== 'string') continue
    const filled: string[] = []
    if (normalizeText(f.name ?? '') !== '') filled.push('name')
    if (f.entryPoint !== undefined && f.entryPoint !== null) filled.push('entryPoint')
    out.push({ key: `fn:${f.id}`, filledFields: filled.sort(cmp) })
  }
  for (const t of r.testScenarios ?? []) {
    if (typeof t.id !== 'string') continue
    out.push({ key: `ts:${t.id}`, filledFields: [] })
  }
  return out.sort((a, b) => cmp(a.key, b.key))
}

/** rtm 핵심 항목 — 요구사항 텍스트 + 기능 이름(id 는 구조 지표가 이미 본다). */
export function extractRtmKeyItems(r: RtmLike): KeyItem[] {
  const out: KeyItem[] = []
  for (const q of r.requirements ?? []) {
    if (typeof q.id === 'string' && normalizeText(q.text ?? '') !== '') {
      out.push({ kind: `req:${q.id}`, text: normalizeText(q.text!) })
    }
  }
  for (const f of r.functions ?? []) {
    if (typeof f.id === 'string' && normalizeText(f.name ?? '') !== '') {
      out.push({ kind: `fn:${f.id}`, text: normalizeText(f.name!) })
    }
  }
  return out.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.text, b.text))
}

export interface StructureScore {
  total: number
  matched: number
  rate: number | null
  /** 골든에 있는데 후보에 없거나 필수 필드 미충족(상한 20, 정렬). */
  missingSamples: Array<{ key: string; reason: string }>
}

/** 골든 단위별: 후보에 같은 key 존재 + 골든이 채운 필드를 후보도 전부 채웠으면 일치. */
export function scoreStructure(golden: StructureUnit[], candidate: StructureUnit[]): StructureScore {
  const byKey = new Map(candidate.map((u) => [u.key, u]))
  let matched = 0
  const missing: Array<{ key: string; reason: string }> = []
  for (const g of golden) {
    const c = byKey.get(g.key)
    const lost = c ? g.filledFields.filter((f) => !c.filledFields.includes(f)) : g.filledFields
    if (c && lost.length === 0) {
      matched++
    } else if (missing.length < INVALID_SAMPLE_CAP) {
      missing.push({ key: g.key, reason: c ? `골든이 채운 필드 소실(${lost.join(',')})` : '후보에 없음' })
    }
  }
  return {
    total: golden.length,
    matched,
    rate: rate(matched, golden.length),
    missingSamples: missing.sort((a, b) => cmp(a.key, b.key)),
  }
}

export interface RecallScore {
  total: number
  found: number
  rate: number | null
  missingSamples: Array<{ kind: string; text: string }>
}

/** 후보 JSON 의 모든 문자열 값을 정규화해 수집(재귀) — JSON 이스케이프 인공물 배제. */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(normalizeText(value))
    return
  }
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const x of value) collectStrings(x, out)
    return
  }
  for (const k of Object.keys(value as Record<string, unknown>)) {
    collectStrings((value as Record<string, unknown>)[k], out)
  }
}

/**
 * 골든 핵심 항목이 후보의 문자열 값 어딘가에 포함되는가 — 누락 검출.
 * JSON.stringify 직렬화 텍스트가 아니라 **원시 문자열 값** 대조 — 따옴표/역슬래시가
 * 이스케이프돼 정당한 항목이 누락으로 오판되는 것을 막는다(자기 채점 100% 보장).
 */
export function scoreRecall(goldenItems: KeyItem[], candidate: unknown): RecallScore {
  const strings: string[] = []
  collectStrings(candidate, strings)
  let found = 0
  const missing: Array<{ kind: string; text: string }> = []
  for (const item of goldenItems) {
    if (item.text !== '' && strings.some((s) => s.includes(item.text))) {
      found++
    } else if (missing.length < INVALID_SAMPLE_CAP) {
      missing.push({ kind: item.kind, text: item.text.slice(0, 120) })
    }
  }
  return {
    total: goldenItems.length,
    found,
    rate: rate(found, goldenItems.length),
    missingSamples: missing.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.text, b.text)),
  }
}

// ── ⑤ 종합 ──────────────────────────────────────────────────────────────────

export type GoldenArtifactKind = 'domain-graph' | 'rtm'

export interface ArtifactScore {
  kind: GoldenArtifactKind
  structure: StructureScore
  citations: CitationScore
  recall: RecallScore
}

/** 산출물 1종 채점 — 구조·재현율은 골든 대비, 근거 유효율은 후보 단독(기계 검증). */
export function scoreGoldenArtifact(
  kind: GoldenArtifactKind,
  golden: unknown,
  candidate: unknown,
  projectRoot: string,
): ArtifactScore {
  const [gUnits, cUnits, gItems] =
    kind === 'domain-graph'
      ? [
          extractDomainGraphUnits(golden as DomainGraphLike),
          extractDomainGraphUnits(candidate as DomainGraphLike),
          extractDomainGraphKeyItems(golden as DomainGraphLike),
        ]
      : [
          extractRtmUnits(golden as RtmLike),
          extractRtmUnits(candidate as RtmLike),
          extractRtmKeyItems(golden as RtmLike),
        ]
  return {
    kind,
    structure: scoreStructure(gUnits, cUnits),
    citations: scoreCitations(collectCitations(candidate), projectRoot),
    recall: scoreRecall(gItems, candidate),
  }
}
