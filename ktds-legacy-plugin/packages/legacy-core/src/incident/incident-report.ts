/**
 * DS-APM 장애 RCA 리포트 파서 + 시드 판정 — 순수 결정론(IO 없음).
 *
 * 계약: docs/ktds/INCIDENT_DROP_CONTRACT.md (실물 예시 `2026-06-23_rca_checkout.md` 실측 고정).
 * 형식 = YAML frontmatter(runId/service/createdAt/confidence/baselineCommit) +
 * 한국어 h2 섹션(근본 원인[필수]/수정 제안/한계). file:line 근거는 산문 인라인이라
 * 여기서 결정론 추출한다. IO(드롭 폴더·census 로드)는 scripts/incident.mjs 가 담당.
 */

/** 수용 게이트 통과에 필요한 본문 섹션(h2 정확일치). */
export const INCIDENT_SECTION_ROOT_CAUSE = '근본 원인'
export const INCIDENT_SECTION_FIX = '수정 제안'
export const INCIDENT_SECTION_LIMITS = '한계'

export interface IncidentFrontmatter {
  runId: string
  service: string
  createdAt: string | null
  /** high|medium|low — 그 외/누락은 low 클램프(ds-apm rcaresult.go:89-98 과 동일 규칙). */
  confidence: 'high' | 'medium' | 'low'
  baselineCommit: string | null
}

/** 본문에서 추출한 file:line 후보(산문 인라인 표기 그대로). */
export interface IncidentFileRef {
  /** 표기된 경로 텍스트(레포 상대경로 또는 basename 축약). */
  path: string
  line: number
  /** 추출 출처 섹션. */
  section: typeof INCIDENT_SECTION_ROOT_CAUSE | typeof INCIDENT_SECTION_FIX
}

export interface ParsedIncidentReport {
  /** 수용 게이트: runId+service+근본 원인 섹션 존재. false 면 나머지 필드는 참고용. */
  parseable: boolean
  /** 게이트 불합격 사유(사람이 읽는 한국어) — parseable=true 면 빈 배열. */
  reasons: string[]
  frontmatter: IncidentFrontmatter | null
  /** 섹션 제목 → 본문 텍스트(제목 줄 제외, 트림). 없는 섹션은 키 부재. */
  sections: Record<string, string>
  /** 원장·UI 표시용 제목 = 근본 원인 첫 비어있지 않은 줄(없으면 null). */
  title: string | null
  /** 근본 원인·수정 제안에서 추출한 file:line 후보(중복 제거, 출현 순). */
  refs: IncidentFileRef[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
/**
 * 산문 인라인 file:line — `경로.확장자:줄번호`. 확장자 강제라 시각(16:44)·해시는 안 잡힌다.
 * URL(`https://…`)은 추출 후 별도 제외. 한글 경로 세그먼트 허용(드롭 폴더 관례).
 */
const FILE_LINE_RE = /([A-Za-z0-9_가-힣][A-Za-z0-9_가-힣.\-/]*\.[A-Za-z][A-Za-z0-9]{0,5}):(\d{1,6})/g

function clampConfidence(raw: string | undefined): 'high' | 'medium' | 'low' {
  const c = (raw ?? '').trim().toLowerCase()
  return c === 'high' || c === 'medium' ? c : 'low'
}

/** frontmatter 블록을 `key: value` 라인 단위로 파싱(여분 키 무시 — 전방 호환). */
function parseFrontmatter(raw: string): Record<string, string> | null {
  const m = FRONTMATTER_RE.exec(raw)
  if (!m) return null
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

/**
 * h2(`## 제목`) 단위로 본문을 자른다. 같은 제목 중복 시 첫 섹션이 정본.
 * ★ 코드펜스(``` / ~~~) 안의 `## ` 는 섹션 경계로 보지 않는다 — 근본 원인 본문의 펜스에
 * 주석/샘플로 `## foo` 가 있으면 거기서 섹션이 잘려 뒷부분 file:line 근거가 통째로 누락되기
 * 때문(fail-closed 라 조용히 시드 0). 헤딩 인식·경계 판정을 한 줄 스캔으로 통일해
 * `##\t제목`(탭/다중공백) 이 헤딩과 경계에서 다르게 해석되던 불일치도 함께 제거한다.
 */
function splitSections(raw: string): Record<string, string> {
  const body = raw.replace(FRONTMATTER_RE, '')
  const out: Record<string, string> = {}
  const H2 = /^##\s+(.+?)\s*$/
  const FENCE = /^\s*(```|~~~)/
  let curTitle: string | null = null
  let buf: string[] = []
  let inFence = false
  const flush = (): void => {
    if (curTitle !== null && !(curTitle in out)) out[curTitle] = buf.join('\n').trim()
  }
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    const m = inFence ? null : H2.exec(line)
    if (m) {
      flush()
      curTitle = m[1]
      buf = []
    } else if (curTitle !== null) {
      buf.push(line)
    }
  }
  flush()
  return out
}

/**
 * 임의 텍스트에서 file:line 후보를 추출한다(섹션 무관 — resolution.md 인용 검증 등
 * 문서 전체를 훑어야 하는 소비처용). URL 내 경로는 제외, 중복 제거·출현 순.
 */
export function extractFileLineRefs(text: string): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(FILE_LINE_RE)) {
    // URL 경로(`https://host/a.ts:3` 류) 제외 — 매치 직전 문맥에 `://` 가 붙어 있으면 스킵.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 3), m.index ?? 0)
    if (before.includes('://')) continue
    const path = m[1].replace(/^\.\//, '')
    const line = Number(m[2])
    const key = `${path}:${line}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ path, line })
  }
  return out
}

function extractRefs(sections: Record<string, string>): IncidentFileRef[] {
  const out: IncidentFileRef[] = []
  const seen = new Set<string>()
  for (const section of [INCIDENT_SECTION_ROOT_CAUSE, INCIDENT_SECTION_FIX] as const) {
    const text = sections[section]
    if (!text) continue
    for (const ref of extractFileLineRefs(text)) {
      const key = `${ref.path}:${ref.line}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...ref, section })
    }
  }
  return out
}

/**
 * 드롭 파일 원문 → 구조화 파싱 + 수용 게이트 판정.
 * 불합격이어도 throw 하지 않는다 — 호출자가 unparseable 로 원장 기록(원문 보존)한다.
 */
export function parseIncidentReport(raw: string): ParsedIncidentReport {
  const fmRaw = parseFrontmatter(raw)
  const sections = splitSections(raw)
  const reasons: string[] = []
  if (!fmRaw) reasons.push('frontmatter(---) 블록이 없습니다')
  if (fmRaw && !fmRaw.runId) reasons.push('frontmatter 에 runId 가 없습니다')
  if (fmRaw && !fmRaw.service) reasons.push('frontmatter 에 service 가 없습니다')
  if (!(INCIDENT_SECTION_ROOT_CAUSE in sections)) reasons.push('`## 근본 원인` 섹션이 없습니다')

  const parseable = reasons.length === 0
  const frontmatter: IncidentFrontmatter | null = fmRaw
    ? {
        runId: fmRaw.runId ?? '',
        service: fmRaw.service ?? '',
        createdAt: fmRaw.createdAt ?? null,
        confidence: clampConfidence(fmRaw.confidence),
        baselineCommit: fmRaw.baselineCommit ?? null,
      }
    : null
  const rootCause = sections[INCIDENT_SECTION_ROOT_CAUSE] ?? ''
  const title = rootCause.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? null
  return { parseable, reasons, frontmatter, sections, title, refs: extractRefs(sections) }
}

// ── 시드 판정 ────────────────────────────────────────────────────────────────

export type IncidentSeedVerdict = 'matched' | 'not-in-project' | 'ambiguous'

export interface IncidentSeedResolution {
  ref: IncidentFileRef
  verdict: IncidentSeedVerdict
  /** matched 일 때 census 상대경로(축약 표기는 basename 유일 매칭으로 해소). */
  relPath: string | null
  /** matched 근거: 'path'=상대경로 정확일치 · 'basename'=basename 유일. */
  via: 'path' | 'basename' | null
  /** ambiguous 일 때 동명 후보(전량 나열 — 조용한 절삭 금지). */
  candidates: string[]
}

export interface IncidentSeedResult {
  resolutions: IncidentSeedResolution[]
  /** matched 상대경로 중복 제거(출현 순) — understand-impact analyze --path 입력. */
  seeds: string[]
  /**
   * ★ 전량 not-in-project — 타 프로젝트 리포트일 수 있음(DS-APM 서비스→레포 매핑 오류를
   * 우리 쪽에서 감지하는 유일한 지점, 실물 checkout 예시가 이 케이스). 침묵 진행 금지.
   */
  allNotInProject: boolean
}

/**
 * 추출 후보를 census 실존 파일과 대조한다(fail-closed — LLM 추측 시드 없음).
 * 실물 리포트의 `수정 제안`은 basename 축약 표기를 쓴다(P1 픽스처 검증 실측) —
 * basename 이 census 에서 유일하면 해소, 다의면 ambiguous.
 */
export function resolveIncidentSeeds(refs: IncidentFileRef[], censusRelPaths: string[]): IncidentSeedResult {
  const pathSet = new Set(censusRelPaths)
  const byBasename = new Map<string, string[]>()
  for (const p of censusRelPaths) {
    const base = p.slice(p.lastIndexOf('/') + 1)
    const list = byBasename.get(base)
    if (list) list.push(p)
    else byBasename.set(base, [p])
  }

  const resolutions: IncidentSeedResolution[] = refs.map((ref) => {
    if (pathSet.has(ref.path)) return { ref, verdict: 'matched', relPath: ref.path, via: 'path', candidates: [] }
    const base = ref.path.slice(ref.path.lastIndexOf('/') + 1)
    // 축약 표기(basename 단독)만 basename 해소 대상 — 디렉터리가 붙은 오경로를
    // basename 으로 "구조"하면 타 프로젝트 리포트 감지(전량 not-in-project)가 무너진다.
    if (ref.path === base) {
      const candidates = byBasename.get(base) ?? []
      if (candidates.length === 1) {
        return { ref, verdict: 'matched', relPath: candidates[0], via: 'basename', candidates }
      }
      if (candidates.length > 1) return { ref, verdict: 'ambiguous', relPath: null, via: null, candidates }
    }
    return { ref, verdict: 'not-in-project', relPath: null, via: null, candidates: [] }
  })

  const seeds: string[] = []
  for (const r of resolutions) {
    if (r.verdict === 'matched' && r.relPath && !seeds.includes(r.relPath)) seeds.push(r.relPath)
  }
  return {
    resolutions,
    seeds,
    allNotInProject: resolutions.length > 0 && resolutions.every((r) => r.verdict === 'not-in-project'),
  }
}
