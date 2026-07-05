/**
 * W6 주간/월간 실적 요약 — 기간(git 범위) 작업 실적·변경 모듈·RTM/문서 진척의
 * 결정론 집계(work-summary.json). 설계: WORK_SUMMARY_DESIGN.md.
 *
 * 기간 해석(§3.1) — 벽시계 금지(엔진은 Date.now()/무인자 new Date() 를 호출하지 않는다):
 *  - weeks N: 앵커 = HEAD 커밋의 committer date. 윈도 = 반개구간 (anchor−N×7일, anchor].
 *  - month YYYY-MM: [당월 1일 00:00Z, 익월 1일 00:00Z) 반개구간.
 *  - range A..B: git rev-list 집합 그대로(날짜 무관 — 수집기에 revRange 로 전달됨).
 * 같은 HEAD 면 언제 실행해도 같은 결과 — meta 에 해석 결과를 박제한다.
 *
 * RTM/문서 진척(§3.4) — 시점 합계(coverage.confirmed)는 윈도 내 전환 수를 주지
 * 못한다. 타임스탬프가 있는 원장(rtm-overrides.json 의 audit[], .spec/docs/*.state.json
 * 의 audit[])만이 근거다. 전환 수 = 엔티티별 **최초** 확정 이벤트가 윈도 안인 수
 * (재확정 중복 집계 방지). 원장 부재는 null — 0(이벤트 없음)과 구분해 [미확인] 표기.
 * 주의: 원장은 git 이력이 아니라 작업트리의 현재 상태 — 과거 스냅샷 복원은 안 한다.
 *
 * 날조 0(수용 기준): 이 모듈 산출은 전부 수집 사실의 재배열이다 — 사람 말 요약도
 * 문서 빌더가 이 수치를 고정 문형에 끼우는 결정론 조립(LLM 산문 불개입).
 */
import { z } from 'zod'
import type { ProgramInventory } from '../program-inventory/index.js'
import { cmp } from '../utils/cmp.js'
import type { WorkLogCommit, WorkLogResult } from './collect.js'

export { collectWorkLog } from './collect.js'
export type { WorkLogCommit, WorkLogFile, WorkLogResult } from './collect.js'

/** `.spec/map/` 실적 요약 파일명. */
export const WORK_SUMMARY_FILENAME = 'work-summary.json'

/** 확정 이벤트 어휘 — 기록처(대시보드 dev 서버)의 audit event 문자열과 일치해야 한다. */
export const CONFIRM_EVENTS: ReadonlySet<string> = new Set(['CONFIRMED', 'CONFIRMED_NO_EDIT'])
const EDIT_EVENT = 'EDITED'

// ── 기간 스펙/해석 ──────────────────────────────────────────────────────────

export type RangeSpec =
  | { mode: 'weeks'; weeks: number }
  | { mode: 'month'; month: string } // YYYY-MM
  | { mode: 'range'; range: string } // git revspec A..B

export const ResolvedRangeSchema = z.object({
  mode: z.enum(['weeks', 'month', 'range']),
  /** 사용자 인자 원문(재현 근거). */
  rawArg: z.string(),
  /** weeks: 개구간 하한(미포함) / month: 폐구간 하한(포함) / range: null. */
  fromIso: z.string().nullable(),
  /** weeks: 폐구간 상한(포함) / month: 개구간 상한(미포함) / range: null. */
  toIso: z.string().nullable(),
  /** weeks 앵커 커밋(HEAD) — month/range 는 null. */
  anchorSha: z.string().nullable(),
})
export type ResolvedRange = z.infer<typeof ResolvedRangeSchema>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 기간 해석. weeks 는 HEAD committer date 앵커가 필요 — git 불가 시 fromIso/toIso
 * null(윈도 미해석, 진척 집계도 null 로 degrade).
 */
export function resolveRange(
  spec: RangeSpec,
  head: { sha: string; dateIso: string } | null,
): ResolvedRange {
  if (spec.mode === 'range') {
    return { mode: 'range', rawArg: spec.range, fromIso: null, toIso: null, anchorSha: null }
  }
  if (spec.mode === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(spec.month)
    if (!m) throw new Error(`잘못된 월 형식(YYYY-MM 필요): ${spec.month}`)
    const year = Number(m[1])
    const month = Number(m[2])
    if (month < 1 || month > 12) throw new Error(`잘못된 월: ${spec.month}`)
    const fromMs = Date.UTC(year, month - 1, 1)
    const toMs = Date.UTC(year, month, 1)
    return {
      mode: 'month',
      rawArg: spec.month,
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
      anchorSha: null,
    }
  }
  if (!Number.isInteger(spec.weeks) || spec.weeks < 1) {
    throw new Error(`잘못된 주 수(1 이상 정수 필요): ${spec.weeks}`)
  }
  if (head === null) {
    return { mode: 'weeks', rawArg: String(spec.weeks), fromIso: null, toIso: null, anchorSha: null }
  }
  const toMs = Date.parse(head.dateIso)
  if (Number.isNaN(toMs)) {
    return { mode: 'weeks', rawArg: String(spec.weeks), fromIso: null, toIso: null, anchorSha: head.sha }
  }
  return {
    mode: 'weeks',
    rawArg: String(spec.weeks),
    fromIso: new Date(toMs - spec.weeks * WEEK_MS).toISOString(),
    toIso: new Date(toMs).toISOString(),
    anchorSha: head.sha,
  }
}

/**
 * ISO 시각이 윈도 안인가. weeks=(from,to], month=[from,to) — 반개구간 방향이 다른
 * 이유: weeks 는 앵커(HEAD 커밋)를 반드시 포함해야 하고, month 는 달력 경계라
 * 하한 포함이 자연스럽다. range 모드는 **시각 윈도가 없다**(rev-list 집합이 곧
 * 멤버십) — 원장(RTM/문서) 진척은 시각 축이라 교차 불가, null 로 degrade 해
 * [미확인] 표기한다(커밋 집합으로 시각 범위를 지어내지 않는다 — 날조 금지).
 * 윈도 미해석(fromIso/toIso null)도 null — 호출자가 집계 자체를 null 로 degrade.
 */
export function makeWindow(range: ResolvedRange): ((iso: string) => boolean) | null {
  if (range.mode === 'range') return null
  if (range.fromIso === null || range.toIso === null) return null
  const fromMs = Date.parse(range.fromIso)
  const toMs = Date.parse(range.toIso)
  if (range.mode === 'weeks') {
    return (iso) => {
      const t = Date.parse(iso)
      return !Number.isNaN(t) && t > fromMs && t <= toMs
    }
  }
  return (iso) => {
    const t = Date.parse(iso)
    return !Number.isNaN(t) && t >= fromMs && t < toMs
  }
}

// ── 산출물 스키마 ────────────────────────────────────────────────────────────

export const WorkCommitSchema = z.object({
  sha: z.string(),
  dateIso: z.string(),
  author: z.string(),
  subject: z.string(),
  isMerge: z.boolean(),
  files: z.array(
    z.object({
      path: z.string(),
      added: z.number().int().nonnegative(),
      deleted: z.number().int().nonnegative(),
    }),
  ),
})

export const WorkModuleSchema = z.object({
  key: z.string(),
  /** program-inventory = 도메인 조인(근거 보유), dir = 최상위 디렉터리 폴백([추정]). */
  source: z.enum(['program-inventory', 'dir']),
  commits: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  linesChanged: z.number().int().nonnegative(),
})
export type WorkModule = z.infer<typeof WorkModuleSchema>

export const RtmProgressSchema = z.object({
  /** 윈도 내 최초 확정 엔티티 수(추정→확정 전환). */
  functionsConfirmed: z.number().int().nonnegative(),
  scenariosConfirmed: z.number().int().nonnegative(),
  requirementsConfirmed: z.number().int().nonnegative(),
  /** 윈도 내 이벤트 총수(재확정 포함) — 전환 수와 구분. */
  confirmEvents: z.number().int().nonnegative(),
  editEvents: z.number().int().nonnegative(),
  /** audit[] 없는 구원장 엔티티 — at 필드로 폴백 집계(표면화). */
  auditlessEntities: z.number().int().nonnegative(),
  /** at 파싱 실패 이벤트 수 — 드롭하지 않고 표면화(침묵 누락 금지). */
  unparsableAt: z.number().int().nonnegative(),
})
export type RtmProgress = z.infer<typeof RtmProgressSchema>

export const DocProgressSchema = z.object({
  submitted: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  /** 윈도 내 APPROVED 이벤트가 있는 docId(ASC). */
  approvedDocs: z.array(z.string()),
  unparsableAt: z.number().int().nonnegative(),
})
export type DocProgress = z.infer<typeof DocProgressSchema>

export const WorkSummaryReportSchema = z.object({
  schemaVersion: z.literal(1),
  /** 결정론 앵커 — 수집 시점 HEAD. null = git 불가. */
  gitCommit: z.string().nullable(),
  range: ResolvedRangeSchema,
  /** 윈도 내 커밋만(dateIso DESC, sha ASC). */
  commits: z.array(WorkCommitSchema),
  totals: z.object({
    commits: z.number().int().nonnegative(),
    mergeCommits: z.number().int().nonnegative(),
    authors: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
  }),
  /** linesChanged DESC, key ASC. */
  modules: z.array(WorkModuleSchema),
  /** null = 원장 없음 또는 윈도 미해석([미확인] — 0 과 구분). */
  rtmProgress: RtmProgressSchema.nullable(),
  docProgress: DocProgressSchema.nullable(),
  meta: z.object({
    gitAvailable: z.boolean(),
    /** shallow 는 gitAvailable=false 의 사유 구분(잘린 이력 ≠ git 부재). */
    gitStatus: z.enum(['ok', 'no-git', 'shallow']),
    prefix: z.string(),
    moduleSource: z.enum(['program-inventory', 'dir']),
  }),
})
export type WorkSummaryReport = z.infer<typeof WorkSummaryReportSchema>

// ── 원장 스캔 ────────────────────────────────────────────────────────────────

interface LedgerEntity {
  at?: unknown
  audit?: unknown
}

/** audit 이벤트 배열을 방어적으로 정규화(zod 미경유 원장 — 손상 항목은 카운트로 표면화). */
function auditEvents(entity: LedgerEntity): Array<{ event: string; at: string }> {
  if (!Array.isArray(entity.audit)) return []
  const out: Array<{ event: string; at: string }> = []
  for (const e of entity.audit) {
    if (e !== null && typeof e === 'object' && typeof (e as { event?: unknown }).event === 'string') {
      const at = (e as { at?: unknown }).at
      out.push({ event: (e as { event: string }).event, at: typeof at === 'string' ? at : '' })
    }
  }
  return out
}

/**
 * 원장 섹션(엔티티 id → override) 하나의 전환/이벤트 집계.
 * 전환 = 최초 확정 이벤트 at ∈ 윈도. audit 이 빈 구원장 엔티티는 at 필드로 폴백
 * (auditless 로 표면화 — 최초/재확정 구분 불가한 한계를 수치로 드러낸다).
 */
function scanSection(
  section: Record<string, LedgerEntity>,
  inWindow: (iso: string) => boolean,
): { converted: number; confirmEvents: number; editEvents: number; auditless: number; unparsable: number } {
  let converted = 0
  let confirmEvents = 0
  let editEvents = 0
  let auditless = 0
  let unparsable = 0
  for (const key of Object.keys(section)) {
    const entity = section[key]
    if (entity === null || typeof entity !== 'object') continue
    const events = auditEvents(entity)
    if (events.length === 0) {
      auditless += 1
      const at = typeof entity.at === 'string' ? entity.at : ''
      if (Number.isNaN(Date.parse(at))) unparsable += 1
      else if (inWindow(at)) {
        converted += 1
        confirmEvents += 1
      }
      continue
    }
    let firstConfirm: string | null = null
    for (const e of events) {
      if (Number.isNaN(Date.parse(e.at))) {
        unparsable += 1
        continue
      }
      if (CONFIRM_EVENTS.has(e.event)) {
        if (firstConfirm === null || Date.parse(e.at) < Date.parse(firstConfirm)) firstConfirm = e.at
        if (inWindow(e.at)) confirmEvents += 1
      } else if (e.event === EDIT_EVENT && inWindow(e.at)) {
        editEvents += 1
      }
    }
    if (firstConfirm !== null && inWindow(firstConfirm)) converted += 1
  }
  return { converted, confirmEvents, editEvents, auditless, unparsable }
}

/** rtm-overrides.json(파싱된 객체) → 윈도 내 RTM 진척. 원장 형식이 아니면 0 집계. */
export function scanRtmProgress(
  rawOverlay: unknown,
  inWindow: (iso: string) => boolean,
): RtmProgress {
  const overlay =
    rawOverlay !== null && typeof rawOverlay === 'object'
      ? (rawOverlay as Record<string, unknown>)
      : {}
  const sectionOf = (v: unknown): Record<string, LedgerEntity> =>
    v !== null && typeof v === 'object' ? (v as Record<string, LedgerEntity>) : {}
  // 최상위 fnId 키(예약 섹션 _* 제외) = 기능 행 오버레이.
  const fnSection: Record<string, LedgerEntity> = {}
  for (const key of Object.keys(overlay)) {
    if (key.startsWith('_')) continue
    fnSection[key] = overlay[key] as LedgerEntity
  }
  const fn = scanSection(fnSection, inWindow)
  const sc = scanSection(sectionOf(overlay['_scenarios']), inWindow)
  const rq = scanSection(sectionOf(overlay['_requirements']), inWindow)
  return RtmProgressSchema.parse({
    functionsConfirmed: fn.converted,
    scenariosConfirmed: sc.converted,
    requirementsConfirmed: rq.converted,
    confirmEvents: fn.confirmEvents + sc.confirmEvents + rq.confirmEvents,
    editEvents: fn.editEvents + sc.editEvents + rq.editEvents,
    auditlessEntities: fn.auditless + sc.auditless + rq.auditless,
    unparsableAt: fn.unparsable + sc.unparsable + rq.unparsable,
  })
}

/** .spec/docs/*.state.json 목록 → 윈도 내 문서 진척(SUBMITTED/APPROVED/RETURNED). */
export function scanDocProgress(
  states: Array<{ docId: string; raw: unknown }>,
  inWindow: (iso: string) => boolean,
): DocProgress {
  let submitted = 0
  let approved = 0
  let returned = 0
  let unparsable = 0
  const approvedDocs = new Set<string>()
  for (const s of states) {
    for (const e of auditEvents(
      s.raw !== null && typeof s.raw === 'object' ? (s.raw as LedgerEntity) : {},
    )) {
      if (Number.isNaN(Date.parse(e.at))) {
        unparsable += 1
        continue
      }
      if (!inWindow(e.at)) continue
      if (e.event === 'SUBMITTED') submitted += 1
      else if (e.event === 'APPROVED') {
        approved += 1
        approvedDocs.add(s.docId)
      } else if (e.event === 'RETURNED') returned += 1
    }
  }
  return DocProgressSchema.parse({
    submitted,
    approved,
    returned,
    approvedDocs: [...approvedDocs].sort(cmp),
    unparsableAt: unparsable,
  })
}

// ── 리포트 조립 ─────────────────────────────────────────────────────────────

export interface WorkSummaryInputs {
  spec: RangeSpec
  /** collectWorkLog 산출(주입식) — 픽스처 테스트는 고정 주입. */
  collected: WorkLogResult
  /** 모듈 귀속용(W3) — null 이면 최상위 디렉터리 버킷 폴백. */
  programInventory: ProgramInventory | null
  /** rtm-overrides.json 파싱 결과 — null = 원장 파일 없음(0 과 구분). */
  rtmOverlay: unknown | null
  /** .spec/docs/*.state.json — null = 디렉터리 없음. */
  docStates: Array<{ docId: string; raw: unknown }> | null
}

/** 변경 파일 → 모듈 키 귀속(§3.3) — inventory 조인 우선, 미포함은 디렉터리 버킷. */
function moduleKeyOf(
  path: string,
  byPath: Map<string, string> | null,
): { key: string; source: WorkModule['source'] } {
  const joined = byPath?.get(path)
  if (joined !== undefined) return { key: joined, source: 'program-inventory' }
  const slash = path.indexOf('/')
  return { key: slash === -1 ? '(root)' : path.slice(0, slash), source: 'dir' }
}

function buildModules(
  commits: WorkLogCommit[],
  inventory: ProgramInventory | null,
): WorkModule[] {
  const byPath: Map<string, string> | null = inventory
    ? new Map(inventory.programs.map((p) => [p.filePath, p.domain ?? '(도메인 미지정)']))
    : null
  const acc = new Map<
    string,
    { source: WorkModule['source']; commits: Set<string>; files: Set<string>; lines: number }
  >()
  for (const c of commits) {
    for (const f of c.files) {
      const { key, source } = moduleKeyOf(f.path, byPath)
      const mapKey = `${source}\x1f${key}`
      let cur = acc.get(mapKey)
      if (!cur) {
        cur = { source, commits: new Set(), files: new Set(), lines: 0 }
        acc.set(mapKey, cur)
      }
      cur.commits.add(c.sha)
      cur.files.add(f.path)
      cur.lines += f.added + f.deleted
    }
  }
  return [...acc.entries()]
    .map(([mapKey, v]) => ({
      key: mapKey.slice(mapKey.indexOf('\x1f') + 1),
      source: v.source,
      commits: v.commits.size,
      files: v.files.size,
      linesChanged: v.lines,
    }))
    .sort((a, b) => b.linesChanged - a.linesChanged || cmp(a.key, b.key))
}

/**
 * 실적 요약 조립(파일 기록 없음 — 호출자가 writeMapArtifact). 순수 함수:
 * 모든 입력은 주입, 시계 미사용 — 동일 입력 ⇒ byte 동일 출력.
 */
export function buildWorkSummary(inputs: WorkSummaryInputs): WorkSummaryReport {
  const { spec, collected, programInventory, rtmOverlay, docStates } = inputs
  const ok = collected.kind === 'ok' ? collected : null
  const range = resolveRange(spec, ok ? { sha: ok.headSha, dateIso: ok.headDateIso } : null)
  const inWindow = makeWindow(range)

  // range 모드는 수집기가 이미 rev-list 집합으로 좁혔다(시각 필터 없음).
  const selected =
    ok === null
      ? []
      : range.mode === 'range'
        ? ok.commits
        : inWindow === null
          ? []
          : ok.commits.filter((c) => inWindow(c.dateIso))
  const commits = [...selected].sort((a, b) => {
    const ta = Date.parse(a.dateIso)
    const tb = Date.parse(b.dateIso)
    return tb - ta || cmp(a.sha, b.sha)
  })

  const fileSet = new Set<string>()
  const authorSet = new Set<string>()
  let added = 0
  let deleted = 0
  let merges = 0
  for (const c of commits) {
    authorSet.add(c.author)
    if (c.isMerge) merges += 1
    for (const f of c.files) {
      fileSet.add(f.path)
      added += f.added
      deleted += f.deleted
    }
  }

  return WorkSummaryReportSchema.parse({
    schemaVersion: 1,
    gitCommit: ok?.headSha ?? null,
    range,
    commits,
    totals: {
      commits: commits.length,
      mergeCommits: merges,
      authors: authorSet.size,
      files: fileSet.size,
      added,
      deleted,
    },
    modules: buildModules(commits, programInventory),
    // 윈도 미해석(git 불가한 weeks 모드)이면 원장이 있어도 집계 불가 — null degrade.
    rtmProgress: rtmOverlay === null || inWindow === null ? null : scanRtmProgress(rtmOverlay, inWindow),
    docProgress:
      docStates === null || inWindow === null ? null : scanDocProgress(docStates, inWindow),
    meta: {
      gitAvailable: ok !== null,
      gitStatus: collected.kind,
      prefix: ok?.prefix ?? '',
      moduleSource: programInventory ? 'program-inventory' : 'dir',
    },
  })
}
