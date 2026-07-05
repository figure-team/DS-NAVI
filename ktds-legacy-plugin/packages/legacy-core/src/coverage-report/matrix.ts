/**
 * W9 언어 커버리지 매트릭스 — 스캐너 지원 수준의 **단일 진실 소스**.
 *
 * `docs/ktds/COVERAGE_MATRIX.md` 는 이 선언에서 생성되고(손편집 금지, drift 는 CI 가
 * 잡는다), 실측 검증(scripts/qa-coverage-matrix.mjs)이 "none 주장인데 산출물 존재"
 * 모순을 두 타깃(jpetstore·eGov cop)에서 자동 검출한다 — 설계:
 * docs/ktds/COVERAGE_MATRIX_DESIGN.md.
 *
 * degrade 정의:
 *   - full    : 그 언어의 일반 코드에서 동작(남는 한계는 note 에 명기)
 *   - partial : 특정 관용구/프레임워크/파일 관례만(범위를 note 에 명기)
 *   - none    : 산출물에 절대 나타나지 않아야 함(실측 검증 대상) — 명시 없는 언어의 기본값
 *
 * 정직성: 분석 유관 소스 언어(ANALYSIS_RELEVANT_LANGS)인데 핵심 구조분석
 * (CORE_CAPABILITIES 전부 none)이 안 되는 파일은 coverage.json `langSupport` 로
 * "미지원 N건 [미확인]" 계상된다 — files.byLang 숫자에 묻히는 침묵 누락 금지.
 */
import type { CensusReport } from '../domain-map/types.js'

export type CoverageTier = 'full' | 'partial' | 'none'

export interface LangCoverage {
  tier: CoverageTier
  /** 근거/범위/한계 요약(문서 표에 그대로 노출). */
  note: string
}

/** 스캔 기능 키 — .spec/map 산출물과 1:1 대응(검증 스크립트가 이 키로 대조). */
export type CapabilityKey =
  | 'routes'
  | 'batch'
  | 'edges'
  | 'method-calls'
  | 'interfaces'
  | 'jpa'
  | 'db-schema'
  | 'complexity'

export interface CapabilityCoverage {
  key: CapabilityKey
  label: string
  /** 명시되지 않은 언어는 none. */
  byLang: Record<string, LangCoverage>
  /** 언어 축으로 못 싣는 예외 관례(검증 스크립트의 면제 규칙과 짝). */
  exceptions?: string
}

/**
 * 지원 수준 선언 — 변경 시 반드시:
 *  1) 해당 스캐너의 실코드 근거 확인, 2) `qa-coverage-matrix.mjs --write` 로 문서 재생성,
 *  3) 두 타깃 실측 검증 통과.
 */
export const COVERAGE_MATRIX: CapabilityCoverage[] = [
  {
    key: 'routes',
    label: '진입점(라우트)',
    byLang: {
      java: { tier: 'full', note: 'Spring(@RequestMapping 계열·composed·상수 해석)·Stripes' },
      xml: { tier: 'partial', note: 'web.xml 서블릿 매핑만' },
      jsp: { tier: 'partial', note: '페이지 파일 = 진입점(URL 관례)' },
      typescript: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
      tsx: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
      javascript: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
    },
  },
  {
    key: 'batch',
    label: '배치 진입점',
    byLang: {
      java: { tier: 'full', note: '@Scheduled·main()·Quartz Java API·Executor·Timer' },
      xml: { tier: 'partial', note: 'Quartz CronTrigger·task:scheduled·spring-batch 잡' },
      sh: { tier: 'partial', note: 'java 실행 라인 탐지' },
      bat: { tier: 'partial', note: 'java 실행 라인 탐지' },
      cmd: { tier: 'partial', note: 'java 실행 라인 탐지' },
    },
    exceptions: 'crontab 은 확장자 무관 경로 관례(crontab*/cron.d/)로 탐지 — 언어 행 없음',
  },
  {
    key: 'edges',
    label: '구조 의존(엣지)',
    byLang: {
      java: { tier: 'full', note: 'import·injection·field-type·ctor-param·extends/implements·impl' },
      xml: { tier: 'partial', note: '*Mapper.xml namespace ↔ 매퍼 인터페이스(MyBatis)' },
    },
  },
  {
    key: 'method-calls',
    label: '메서드 호출 그래프',
    byLang: {
      java: { tier: 'full', note: '8-receiver 해소(field/param/local/self/super/static/return-type/external)' },
    },
  },
  {
    key: 'interfaces',
    label: '대외 인터페이스',
    byLang: {
      java: { tier: 'full', note: '클라이언트 카탈로그(HTTP/WS/MQ/파일/소켓/메일)+config seam' },
      xml: { tier: 'partial', note: 'db-link 신호만' },
      sql: { tier: 'partial', note: 'db-link 신호만' },
      properties: { tier: 'partial', note: '${…} endpoint 플레이스홀더 해석 보조(항목 생산 없음)' },
    },
  },
  {
    key: 'jpa',
    label: 'JPA/Spring Data',
    byLang: {
      java: { tier: 'full', note: '@Entity 계열·JpaRepository·파생쿼리·@Query(3-Tier 신뢰)' },
    },
  },
  {
    key: 'db-schema',
    label: 'DB 스키마',
    byLang: {
      sql: { tier: 'full', note: 'CREATE TABLE DDL·COMMENT·dataload INSERT' },
      java: { tier: 'partial', note: '라이브 DB 연결 신호(정적 탐지) 보조' },
      xml: { tier: 'partial', note: '라이브 DB 연결 신호 보조' },
      properties: { tier: 'partial', note: '라이브 DB 연결 신호 보조' },
    },
  },
  {
    key: 'complexity',
    label: '복잡도(위험 리포트)',
    byLang: {
      java: { tier: 'full', note: 'AST 결정 포인트 근사(McCabe) — 비 java 는 미측정 null + [미확인] 노트' },
    },
  },
]

/**
 * 분석 유관 소스 언어 — census 에 등장하면 "구조분석 대상일 것으로 기대되는" 언어.
 * 여기 있는데 핵심 기능이 전부 none 이면 미지원으로 **센다**(침묵 누락 금지).
 * 문서/설정/마크업(md·html·css·json·yaml 등)은 대상 아님.
 * (미지 확장자는 census 가 확장자 자체를 lang 으로 쓴다 — pc/pks/pkb/cbl 등 레거시
 * 확장자를 여기 등재해 두면 등장 즉시 미지원으로 표면화된다.)
 */
export const ANALYSIS_RELEVANT_LANGS: ReadonlySet<string> = new Set([
  'java',
  'xml',
  'jsp',
  'sql',
  'typescript',
  'tsx',
  'javascript',
  'kotlin',
  'python',
  'sh',
  'bat',
  'cmd',
  'groovy',
  'scala',
  'cs',
  'c',
  'cpp',
  'go',
  'rb',
  'php',
  // 레거시 SI 단골 — Pro*C / PL/SQL 패키지 / COBOL
  'pc',
  'pks',
  'pkb',
  'cbl',
  'cob',
])

/** 핵심 구조분석 기능 — 전부 none 인 언어의 파일이 "핵심 미지원" 카운트 대상. */
export const CORE_CAPABILITIES: readonly CapabilityKey[] = ['routes', 'edges', 'complexity']

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** (capability, lang) tier 조회 — 명시 없으면 none. */
export function tierOf(capability: CapabilityKey, lang: string): CoverageTier {
  const cap = COVERAGE_MATRIX.find((c) => c.key === capability)
  return cap?.byLang[lang]?.tier ?? 'none'
}

/** tier 서열(요약용): full > partial > none. */
const TIER_RANK: Record<CoverageTier, number> = { full: 2, partial: 1, none: 0 }

/** 언어의 핵심(CORE_CAPABILITIES) 요약 tier — 최고 tier. */
export function coreTierOf(lang: string): CoverageTier {
  let best: CoverageTier = 'none'
  for (const cap of CORE_CAPABILITIES) {
    const t = tierOf(cap, lang)
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
  }
  return best
}

/** 언어의 전 기능 통틀어 최고 tier — none 이면 "어떤 스캐너도 안 덮는" 언어. */
export function bestTierOf(lang: string): CoverageTier {
  let best: CoverageTier = 'none'
  for (const c of COVERAGE_MATRIX) {
    const t = c.byLang[lang]?.tier ?? 'none'
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
  }
  return best
}

export interface LangSupportRow {
  lang: string
  files: number
  /** 전 기능 통틀어 최고 tier — none = 완전 미지원(헤드라인 카운트 대상). */
  best: CoverageTier
  /** 핵심 구조분석(routes·edges·complexity) 요약 tier — 행 상세용(예: sql 은 best=full 이지만 core=none). */
  core: CoverageTier
  capabilities: Array<{ key: CapabilityKey; tier: CoverageTier }>
}

export interface LangSupport {
  /**
   * **어떤 기능도 덮지 않는**(best=none) 분석 유관 언어 파일 총수 — 진짜 침묵 사각.
   * (sql 처럼 구조분석은 없어도 db-schema 가 덮는 언어는 여기 안 센다 — 실측에서
   *  sql/cmd 오보로 드러난 초기 정의(core 기준)를 정정.)
   */
  unsupportedFiles: number
  /** census 에 존재하는 분석 유관 언어만(lang 정렬). */
  byLang: LangSupportRow[]
}

/** census × 매트릭스 → 언어 지원 현황(결정론: lang 정렬). */
export function computeLangSupport(census: CensusReport): LangSupport {
  const counts = new Map<string, number>()
  for (const f of census.files) {
    if (!ANALYSIS_RELEVANT_LANGS.has(f.lang)) continue
    counts.set(f.lang, (counts.get(f.lang) ?? 0) + 1)
  }
  const byLang: LangSupportRow[] = [...counts.entries()]
    .map(([lang, files]) => ({
      lang,
      files,
      best: bestTierOf(lang),
      core: coreTierOf(lang),
      capabilities: COVERAGE_MATRIX.map((c) => ({ key: c.key, tier: tierOf(c.key, lang) })),
    }))
    .sort((a, b) => cmp(a.lang, b.lang))
  const unsupportedFiles = byLang
    .filter((r) => r.best === 'none')
    .reduce((n, r) => n + r.files, 0)
  return { unsupportedFiles, byLang }
}

const TIER_MARK: Record<CoverageTier, string> = { full: '●', partial: '◐', none: '—' }

/**
 * 사람용 매트릭스 문서(`docs/ktds/COVERAGE_MATRIX.md`) 렌더 — 결정론.
 * 갱신: `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write`.
 */
export function renderCoverageMatrixMd(): string {
  // 표 열 = 매트릭스에 한 번이라도 명시된 언어(정렬) — none 뿐인 언어는 열로 싣지 않는다
  // (분석 유관 미등재 언어의 "전부 —" 행 폭발 방지; 그들은 langSupport 로 계상).
  const langs = [
    ...new Set(COVERAGE_MATRIX.flatMap((c) => Object.keys(c.byLang))),
  ].sort(cmp)
  const L: string[] = [
    '# 언어 커버리지 매트릭스 (W9)',
    '',
    '> **생성물 — 손편집 금지.** 단일 소스는 `legacy-core/src/coverage-report/matrix.ts` 이며,',
    '> 이 문서는 `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write` 로 재생성한다.',
    '> drift(선언≠문서)는 CI(coverage-matrix.test.ts)와 검증 스크립트가 잡는다.',
    '',
    '## degrade 정의',
    '',
    '- ● full — 그 언어의 일반 코드에서 동작(남는 한계는 비고에 명기)',
    '- ◐ partial — 특정 관용구/프레임워크/파일 관례만(범위를 비고에 명기)',
    '- — none — 산출물에 절대 나타나지 않아야 함(두 타깃 실측 검증 대상). 표에 없는 언어의 기본값',
    '',
    '미지원 표면화: 분석 유관 소스 언어(kotlin·python·Pro*C(pc)·PL/SQL(pks/pkb)·COBOL(cbl) 등)가',
    '감지됐는데 **어떤 기능도 덮지 않으면** 침묵 누락 대신 coverage.json',
    '`langSupport.unsupportedFiles` 로 "미지원 N건 [미확인]" 이 계상되고 스캔 출력·커버리지',
    '리포트에 경고가 뜬다. (구조분석(routes·edges·complexity) 요약은 행별 `core` tier 로 노출 —',
    '예: sql 은 db-schema 로 덮이므로 미지원이 아니지만 core=none.)',
    '',
    '## 기능 × 언어',
    '',
    `| 기능 | ${langs.join(' | ')} |`,
    `|---|${langs.map(() => '---').join('|')}|`,
    ...COVERAGE_MATRIX.map(
      (c) =>
        `| ${c.label} | ${langs.map((l) => TIER_MARK[c.byLang[l]?.tier ?? 'none']).join(' | ')} |`,
    ),
    '',
    '## 비고(범위·한계 근거)',
    '',
    ...COVERAGE_MATRIX.flatMap((c) => [
      `### ${c.label} (\`${c.key}\`)`,
      '',
      ...Object.entries(c.byLang)
        .sort((a, b) => cmp(a[0], b[0]))
        .map(([lang, v]) => `- ${lang}: ${TIER_MARK[v.tier]} ${v.tier} — ${v.note}`),
      ...(c.exceptions ? [`- (예외) ${c.exceptions}`] : []),
      '',
    ]),
  ]
  return L.join('\n')
}
