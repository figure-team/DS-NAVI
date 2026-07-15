/**
 * intake-bundle — 인테이크 ①식별에 먹일 **유계 요약 근거 번들**.
 *  - v1(P3): 도메인·데이터·추적표 3축.
 *  - **v2(P4): + 화면·정책 축 + pre-cite**(본 개정).
 *
 * 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §4(6축 인벤토리) · §4.1(빈 산출물 오독) · §6.2(패턴 재사용)
 * · §9 P3·P4 · §10(결정사항).
 *
 * ★ 왜 이 모듈이 필요한가: ①식별은 `rtm.json` 하나만 보고 설계를 지어낸다(§1.1). 분석 산출물을
 *   **통째 주입하는 건 불가능**하다(domain-graph 543 KB, screens 574 KB; eGov·mmobile 규모면 수십 배).
 *
 * ★ 재사용 패턴(신규 발명 아님):
 *  - **유계 요약** — `/understand-map` 의 `group-input`(`scripts/understand-map.mjs:272-301`):
 *    전량 대신 `fileCount` 카운트 + `sampleFiles.slice(0, SAMPLE_FILES_MAX)` + 결정론 정렬 +
 *    **디스크 경유**. 계약은 `skills/understand-map/SKILL.md:82` — *"전 소스를 읽지 않는다 —
 *    이 요약이 판단 입력의 전부"*.
 *  - **정직한 생략** — charCap 초과분을 조용히 버리지 않고 `omitted[]` 로 보고
 *    (`skills/understand-map/SKILL.md:126` 의 `slice=null`+`sliceOmitted[]` 와 같은 철학).
 *  - **evidenceRate·항목수 동봉**(§4.1) — jpetstore `policy-authz.md`/`policy-validation.md` 는
 *    **행 0건**인데(Stripes 미스캔) 그대로 주면 LLM 이 "권한 통제 없음"으로 **오독**한다.
 *    v1 은 정책축이 없지만 **같은 원칙을 3축 전부에 적용**한다 — "없음"과 "못 봄"을 구분시킨다.
 *
 * ★ 이 모듈은 **순수**하다(IO 없음, `Date.now()` 없음). 파일 읽기·쓰기·exit 은 `scripts/rtm-intake.mjs`
 *   경계에 둔다. 재현성 계약: **같은 입력 → 같은 바이트**(정렬 고정, 비결정 값 배제).
 *
 * ══ P4(v2) 개정 요지 ════════════════════════════════════════════════════════
 *
 * ★ **pre-cite**(§6.2) — 이 개정의 핵심. 계약은 `domain-map/fill-fanout.ts:5-11` 의
 *   *"인용 생산을 LLM 에서 제거"* 다: 결정론 추출한 **검증-통과-보장 인용**을 번들에 동봉하고
 *   LLM 은 **verbatim 복사만** 한다. eGov 1,255흐름 근거율 100% 의 원인이며, 인테이크의
 *   `evidence: 0` 문제(§1.2)에 정확히 대응한다. v2 는 신규 스캔을 **하지 않는다** — 화면·도메인·
 *   추적표 산출물이 이미 `{file, line, snippet}` 을 갖고 있어(실측) **결정론 리프트로 충분**하다.
 *   fill-fanout 의 `extractPreCite`(파일 재스캔)는 스니펫이 **없을 때** 필요한 것이라 여기선 불요.
 *
 * ★ **예산 정책 재설계**(이 개정의 최대 난점) — 근거와 함께 남긴다:
 *
 *   [문제] 3축만으로 이미 59,457/60,000 이고 account claims 가 55→24 로 트림됐다(실측).
 *          화면·정책을 그냥 얹으면 pre-cite 페이로드가 통째로 날아간다.
 *
 *   [왜 총예산을 안 올렸나] `DEFAULT_BUNDLE_CHAR_CAP=60,000` 은 `fill-fanout.ts:56`
 *          `DEFAULT_CHUNK_CHAR_CAP` 에서 빌려온 값이고, 그 독스트링은 이를 **"에이전트 1회
 *          컨텍스트 유계"**로 규정한다. 번들의 소비자(①식별 호스트)는 **아직 배선 전(P5)**이라
 *          실측 프롬프트 한도가 **저장소 어디에도 없다**. 근거 없이 올리지 말라는 제약(§7 C10 —
 *          "실측 후 판단")에 따라 **60,000 을 유지**한다. P5 가 호스트를 배선해 실측하면
 *          그때 근거를 갖고 조정할 자리다.
 *
 *   [무엇을 고쳤나] 예산 **크기**가 아니라 **배분 구조**가 진짜 결함이었다. v1 은 전역 캡 하나 +
 *          단일 우선순위 트리머라 **생존이 "가치"가 아니라 "트리머 순서"로 결정**된다:
 *          트리머는 claims 를 **전부** 비운 다음에야 다음 항목으로 넘어간다. 여기에 화면·정책을
 *          같은 리스트로 얹으면 어느 한 축이 **완전히 고갈된 뒤에야** 다음 축이 양보한다
 *          (= 과제가 경고한 "pre-cite 가 통째로 날아간다"의 기계적 원인).
 *          → **축별 예산 배분**(`AXIS_BUDGET`: 최소 보장 floor + 잔여 가중 비례)으로 바꿔
 *          **"모든 축이 자기 pre-cite 코어를 지킨다"를 구조로 보장**한다.
 *          미사용 배분은 풀로 환원돼 **축소 모드(화면·정책 부재)에선 v1 과 같은 배분**이 된다.
 *
 *   [그 외] claims/businessFlows 는 v1 에서 **원시 `unknown[]`** 이라 `status:"ok"` 같은 잡음까지
 *          실렸다 → **투영**(pre-cite 손실 0)으로 예산을 정직하게 회수한다. 투영은 관련도
 *          랭킹(아래)의 전제이기도 하다 — 랭킹하려면 `text` 를 타입으로 알아야 한다.
 *
 *   [팬아웃은?] §6.2 가 팬아웃을 **"규모 초과 시"**로 한정한다. jpetstore 는 위 조치로 60,000 에
 *          들어온다(실측). eGov·mmobile 규모에서 축별 floor 조차 못 채우면 그때가 팬아웃
 *          (`{map,screens,policy}-fill-fanout.workflow.js` 하네스) 승격 지점이다.
 *
 * ★ **트림은 역순**(v1 이 확립, 되돌리지 말 것) — items 는 관련도 내림차순이라 정순으로 털면
 *   1순위 도메인이 먼저 빈털터리가 된다(실측 사고: account claims 55→0 인데 order 는 생존).
 *   v2 는 이 원칙을 **축 안(claims 관련도 랭킹)** 과 **축 사이(floor)** 양쪽으로 넓힌 것이다.
 */
import { natCmp } from './validate.js'

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 도메인별 대표 파일 표본 상한 — `group-input`(understand-map.mjs:277) 과 동일 값·동일 의미. */
export const SAMPLE_FILES_MAX = 8

/** 번들 전체 문자 예산. `domain-map/fill-fanout.ts:56` `DEFAULT_CHUNK_CHAR_CAP` 과 동일 값. */
export const DEFAULT_BUNDLE_CHAR_CAP = 60_000

/** 축별 항목 상한(사전 캡). charCap 은 그 뒤에 걸리는 2차 방어선이다. */
export const AXIS_CAPS = {
  entities: 20,
  businessRules: 20,
  businessFlows: 5,
  claims: 40,
  tables: 15,
  crudRows: 20,
  functions: 25,
  /** P4: 화면 축. 실측 — 관련 화면 4장 전량이면 106,556자라 예산을 통째로 먹는다. */
  screens: 4,
  /** P4: 화면당 annotation. 실측 signonForm 16건이라 전량이 들어온다. */
  annotationsPerScreen: 40,
  /**
   * P4: 정책서 수. 도메인 정책서 + **전역 정책서 전량**을 담을 만큼 넉넉해야 한다 —
   * 행 0건 전역 정책서는 §4.1 오독 차단의 핵심 신호인데 캡에 밀려 빠지면 그 장치가 죽는다
   * (실측 jpetstore: 정책서 10종 중 도메인 6 + 전역 4).
   */
  policyDocs: 10,
  /** P4: 정책서당 절. 실측 구조가 §0~§8 로 9개다. */
  policySections: 9,
  /** P4: 절당 표 행. */
  policyRowsPerSection: 12,
} as const

/**
 * P4 **축별 예산 배분** — `floor`(최소 보장) + `weight`(잔여 비례 배분 가중치).
 *
 * ★ 왜 필요한가: 전역 캡 하나 + 단일 우선순위 트리머면 **트리머 순서가 생존을 결정**한다
 *   (어느 축이 완전히 고갈된 뒤에야 다음 축이 양보). floor 는 **"모든 축이 자기 pre-cite 코어를
 *   지킨다"를 구조로 보장**한다 — 이게 v2 의 핵심 안전장치다.
 *
 * ★ floor 값의 근거(전부 jpetstore 실측):
 *  - `screens` 11,000 — signonForm 1장(ann 16건)이 투영 후 ~11K. **1장은 통째로 지킨다**:
 *    "카카오로 로그인" 버튼을 어디에 넣을지가 `selector`·`bbox` 에 있고(§4) 잘린 ann 은
 *    그 자리를 못 가리킨다.
 *  - `domain` 12,000 — account claims 상위 ~15건(pre-cite 페이로드의 본체).
 *  - `policy` 8,000 — 이 축은 **두 가지**를 동시에 실어야 한다: ① policy-domain-account 의
 *    §8 미결 + §4 정책규칙 ≈ 4.8K(카카오 설계의 핵심 쟁점) ② 전역 정책서 **스텁 6건 ≈ 1.5K**
 *    (§4.1 오독 차단 — 행 0건인 policy-authz·policy-validation 의 존재를 알리는 값싼 신호).
 *    처음엔 5,000 으로 뒀다가 **실측에서 ①이 통째로 밀려나** 교정했다(스텁만 남고 미결이 사라짐).
 *    floor 는 축의 **목적**을 감당해야 의미가 있다.
 *  - `rtm` 6,000 — account 기능행(entryPoint/implementation 근거 = 시드 도출의 입력, §6.3).
 *  - `schema` 4,500 / `crud` 1,500 — SIGNON·ACCOUNT·PROFILE + "로그인 처리" 행.
 *
 * ★ weight: pre-cite 밀도가 높고 요청 특정성이 큰 축(domain·screens)에 잔여를 더 준다.
 * ★ 합 = 40,000 < 60,000 — 나머지는 **수요 기반 비례 배분**이라 축이 없으면(축소 모드) 그 몫이
 *   풀로 환원된다(= v1 과 같은 배분으로 자연 수렴).
 */
export const AXIS_BUDGET = {
  domain: { floor: 12_000, weight: 3 },
  schema: { floor: 4_500, weight: 1 },
  crud: { floor: 1_500, weight: 1 },
  rtm: { floor: 6_000, weight: 2 },
  screens: { floor: 11_000, weight: 3 },
  policy: { floor: 8_000, weight: 2 },
} as const

export type AxisBudgetKey = keyof typeof AXIS_BUDGET

/** 필터가 아무것도 못 고를 때의 폴백 상한(§7 C7 — "상위 N + 정직한 생략 보고"). */
export const FALLBACK_TOP_N = {
  domains: 5,
  tables: 10,
  crudRows: 10,
  functions: 10,
  /** P4: 화면은 폴백해도 비싸다(1장 ~11K) — 상위 1장만. */
  screens: 1,
  policyDocs: 1,
} as const

/**
 * 정책서 **절 우선순위 — 토큰 매치가 아니라 "절의 종류"로 정한다.**
 *
 * ★ 이 결정의 근거는 실측이다: 카카오 설계의 **핵심 쟁점**인 policy-domain-account §8 미결
 *   *"SIGNON.PASSWORD 는 varchar(25) 평문 컬럼이며 … 해시/솔트 처리 로직은 발견되지 않음"* 은
 *   요청 토큰(`로그인`·`카카오`)을 **하나도 포함하지 않는다**(실측 확인). 토큰으로 절을 고르면
 *   **바로 그 미결이 탈락한다** — 설계서 §1.2 가 "(누락) password 처리 미설계"로 지적한 그 실패의
 *   재발이다. 그래서 종류 우선순위가 1차 기준이고 토큰은 동순위 안에서만 가산점으로 쓴다.
 *
 * ★ 순위의 논리: 요구사항 설계에 직접 쓰이는 절이 위다. **미결이 최상위**인 이유 — 미결은
 *   "이미 아는 모르는 것"이라 신규 설계가 **반드시 건드리는** 지점이다(평문 password 를 모른 채
 *   OAuth 자동가입을 설계하면 틀린다). 반대로 §0 문서정보·개정이력은 `《 》` 자리표시자
 *   투성이 보일러플레이트라 최하위.
 */
export const POLICY_SECTION_PRIORITY: { rank: number; pattern: RegExp }[] = [
  { rank: 0, pattern: /미결/ },
  { rank: 1, pattern: /정책\s*규칙|의사결정/ },
  { rank: 2, pattern: /예외|엣지/ },
  { rank: 3, pattern: /상태값/ },
  { rank: 4, pattern: /처리\s*흐름|의사코드/ },
  { rank: 5, pattern: /검증\s*시나리오/ },
  { rank: 6, pattern: /용어\s*정의/ },
  { rank: 7, pattern: /개요/ },
  { rank: 9, pattern: /문서\s*정보|개정\s*이력/ },
]
/** 우선순위 표에 없는 절의 기본 순위(보일러플레이트보다는 위). */
const POLICY_SECTION_DEFAULT_RANK = 8

/**
 * 요청 원문의 **의도 동사·범용어** — 이것만 남으면 모든 항목에 매치돼 필터가 무의미해진다.
 * 도메인 명사(로그인·계정·주문…)는 **넣지 않는다** — 그게 판별력의 원천이다.
 */
const STOPWORDS = new Set([
  '기능', '추가', '변경', '수정', '삭제', '개선', '신규', '구현', '적용', '지원',
  '개발', '요청', '반영', '필요', '해줘', '해주세요', '하기', '관련', '대해', '부분',
  'add', 'new', 'feature', 'change', 'update', 'remove', 'delete', 'support',
  'implement', 'please', 'the', 'for', 'and', 'with', 'into', 'to', 'of', 'on',
  'in', 'from', 'by', 'as', 'at', 'is', 'be',
])

// ── 입력 타입(원시 JSON 방어적 판독) ─────────────────────────────────────────

/** `domain-graph.json` 노드 — 실측 키(`nodes[].{id,name,type,tags,filePath,summary,domainMeta}`). */
export interface DomainGraphNode {
  id?: unknown
  name?: unknown
  type?: unknown
  tags?: unknown
  filePath?: unknown
  summary?: unknown
  domainMeta?: {
    entities?: unknown
    businessRules?: unknown
    businessFlows?: unknown
    ktdsClaims?: unknown
    groundedCount?: unknown
    groundedPct?: unknown
    reviewCount?: unknown
  }
}

/**
 * 정책서 원문 1건 — 마크다운은 **파싱 전 원문 그대로** 넘긴다(파싱은 순수 함수라 여기 산다).
 * IO 경계(`scripts/rtm-intake.mjs`)는 읽어서 넘기기만 한다.
 */
export interface IntakePolicyDoc {
  /** 프로젝트 상대 경로 — 예: `.understand-anything/doc-output/policy-domain-account.md`. */
  relPath: string
  markdown: string
}

export interface IntakeBundleSources {
  /** `.understand-anything/domain-graph.json` */
  domainGraph: unknown | null
  /** `.spec/map/db-schema.json` */
  dbSchema: unknown | null
  /** `.spec/map/crud-matrix.json` — 데이터 축의 **하위 소스**(부재는 축 부재가 아니다). */
  crudMatrix: unknown | null
  /** `.understand-anything/rtm.json` */
  rtm: unknown | null
  /**
   * P4 `.understand-anything/screens.json` — **축소 모드**(§10-1): 없어도 exit 2 가 아니다.
   * optional 인 이유: v1 호출자(P3)를 그대로 통과시킨다(하위호환).
   */
  screens?: unknown | null
  /** P4 `.understand-anything/doc-output/policy-*.md` — 축소 모드(§10-1). */
  policyDocs?: IntakePolicyDoc[] | null
}

export interface BuildIntakeInputOptions {
  /** 요청 원문(사전 필터의 입력). */
  request: string
  /** 번들 문자 예산(기본 `DEFAULT_BUNDLE_CHAR_CAP`). */
  charCap?: number
}

// ── 산출 타입 ────────────────────────────────────────────────────────────────

/** 근거율 — 분자·분모를 **함께** 싣는다. 비율만 주면 "0/0"과 "0/100"을 구분할 수 없다(§4.1). */
export interface EvidenceStat {
  /** 근거가 붙은 항목 수. */
  cited: number
  /** 전체 항목 수. 0이면 rate 는 null(무한대·0 오독 방지). */
  total: number
  /** cited/total. total=0 이면 **null** — "근거율 0" 과 "잴 것이 없음" 은 다르다. */
  rate: number | null
}

/**
 * **pre-cite 인용**(§6.2) — LLM 이 **verbatim 복사만** 하도록 실제 스니펫을 동봉한다.
 * 이게 없으면 LLM 이 인용을 지어낸다(설계서 §1.2 `evidence: 0` 의 재발).
 */
export interface IntakePreCite {
  file: string
  line: number | null
  /** 실파일에서 결정론 추출된 원문. **null 이면 정직하게 null**(지어내지 말라는 신호). */
  snippet: string | null
}

/**
 * 도메인 claim **투영** — v1 은 원시 `unknown` 을 실어 `citations[].status:"ok"` 같은 잡음까지
 * 예산을 먹었다. ①식별이 실제로 쓰는 것만 남긴다(pre-cite 손실 0).
 * `verdict` 는 남긴다 — 근거↔신뢰도 불변식의 신호라 떼면 안 된다.
 */
export interface IntakeBundleClaim {
  kind: string | null
  ref: string | null
  text: string
  verdict: string | null
  citations: IntakePreCite[]
  /** 관련도 랭킹에 쓰인 매치 토큰(감사용 — 왜 이 claim 이 살아남았나). */
  matchedTokens: string[]
}

export interface IntakeBundleDomain {
  id: string
  name: string
  summary: string | null
  /** 이 도메인에 속한 flow/step 노드 수(전량 대신 카운트 — group-input 패턴). */
  fileCount: number
  /** 대표 파일 `slice(0, SAMPLE_FILES_MAX)`, 결정론 정렬(group-input 패턴). */
  sampleFiles: string[]
  counts: { flows: number; steps: number; entities: number; businessRules: number; businessFlows: number; claims: number }
  groundedPct: number | null
  entities: string[]
  businessRules: string[]
  businessFlows: unknown[]
  /** 관련도 **내림차순** — 트림은 꼬리(=덜 관련된 claim)부터 턴다. */
  claims: IntakeBundleClaim[]
  /** 이 도메인이 뽑힌 이유 — 매치된 요청 토큰(폴백이면 빈 배열). */
  matchedTokens: string[]
}

export interface IntakeBundleTable {
  name: string
  relPath: string | null
  line: number | null
  primaryKey: string[]
  columns: { name: string; type: string | null; nullable: boolean | null; primaryKey: boolean; line: number | null }[]
  foreignKeys: unknown[]
  /** 시드 데이터 행은 **싣지 않는다**(스키마가 아니다). 개수만 보고. */
  rowCount: number
  /** 이 테이블이 뽑힌 이유. */
  selectedBy: ('token' | 'crud')[]
}

export interface IntakeBundleCrudRow {
  feature: string
  /** 비어있지 않은 셀만 — `{ table, ops }`. 13열 전량 대신 실제 접근만 싣는다. */
  cells: { table: string; ops: string }[]
  confidence: string
  evidence: { file: string; line: number | null }[]
  matchedTokens: string[]
}

export interface IntakeBundleFunction {
  id: string
  name: string
  domainId: string | null
  domainName: string | null
  entryPoint: { value: string; confidence: string; evidence: { file: string; line: number | null }[] }
  implementation: { value: string; confidence: string; evidence: { file: string; line: number | null }[] }
  origin: string | null
  state: string | null
  /** `token`=요청 원문 매치, `domain`=선정된 도메인 소속으로 딸려온 것. 감사 가능하게 남긴다. */
  selectedBy: 'token' | 'domain'
}

// ── P4 화면 축 ───────────────────────────────────────────────────────────────

/**
 * 화면 annotation — **DOM 삽입 지점**이 여기 있다. `selector`·`bbox` 가 "카카오로 로그인 버튼을
 * 어디에 넣나"를 확정한다(§4: "최상. SignonForm.jsp 의 DOM·selector·bbox → 버튼 삽입 지점 확정").
 */
export interface IntakeBundleAnnotation {
  no: number | null
  label: string | null
  eventType: string | null
  /** DOM 선택자 — 예: `#MenuContent > a:nth-of-type(1)`(실측). */
  selector: string | null
  /** 화면상 좌표·크기(캡처 기준). 버튼 삽입 위치 판단용이라 **떼지 않는다**. */
  bbox: { x: number | null; y: number | null; width: number | null; height: number | null } | null
  description: string | null
  /** `mechanical` 중 **값이 있는 것만**(원본은 null 필드 8개라 그대로 실으면 예산 낭비). */
  mechanical: Record<string, string | boolean | number> | null
  /** 핸들러 — `evidence` 가 곧 **pre-cite**(실측상 snippet 이 이미 들어있다). */
  handler: { target: string | null; confidence: string | null; evidence: IntakePreCite[] } | null
}

export interface IntakeBundleScreen {
  id: string
  jspFile: string | null
  title: string | null
  domain: string | null
  url: string | null
  summary: { text: string | null; confidence: string | null } | null
  /** 전체 annotation 수(트림 전) — 실린 수(`annotations.length`)와 다를 수 있다(§4.1 정직 보고). */
  annotationCount: number
  annotations: IntakeBundleAnnotation[]
  /** `token`=요청 원문 매치, `domain`=선정 도메인 소속으로 딸려온 것. */
  selectedBy: ('token' | 'domain')[]
  matchedTokens: string[]
}

// ── P4 정책 축 ───────────────────────────────────────────────────────────────

/** 정책서 표의 한 행 — `근거` 열이 pre-cite 다(`file:line` 문자열이라 파싱해 싣는다). */
export interface IntakeBundlePolicyRow {
  /** 표의 셀 전량(헤더는 절에 있다). */
  cells: string[]
  /** `신뢰도` 열 — `[확정]`·`[추정]`·`[확인 필요]`. */
  confidence: string | null
  /** `근거` 열에서 뽑은 인용. */
  evidence: IntakePreCite[]
}

export interface IntakeBundlePolicySection {
  heading: string
  /** `POLICY_SECTION_PRIORITY` 순위 — **왜 이 절이 살아남았나**의 감사 근거. */
  rank: number
  /** 표 헤더 열 이름. */
  columns: string[]
  /** 절의 **전체** 데이터 행 수(트림 전). §4.1 — 0이면 "없음"이 아니라 "못 봄"일 수 있다. */
  rowCount: number
  rows: IntakeBundlePolicyRow[]
  matchedTokens: string[]
}

export interface IntakeBundlePolicyDoc {
  docId: string
  title: string | null
  relPath: string
  /** frontmatter `sourceCommit` — 실측상 도메인 정책서는 **null**(P0b 미완, §9 P0b). */
  sourceCommit: string | null
  /**
   * frontmatter 가 **선언한** evidenceRate. 측정치(`evidence`)와 **따로** 싣는다 —
   * §4.1 의 policy-authz.md 는 선언값 0 이면서 **행이 0건**이다. 둘을 뭉개면
   * "근거율 0"(=근거 없음)으로 오독된다. 선언 0 + 행수 0 = **"못 봄"**.
   */
  declaredEvidenceRate: number | null
  /** 문서 전체 데이터 행 수(트림 전). **0이면 스캐너가 못 본 것**(§4.1). */
  rowCount: number
  sections: IntakeBundlePolicySection[]
  /** `domain`=선정 도메인 조인, `token`=요청 토큰 매치, `shared`=전역 정책서(행 0건 오독 차단용). */
  selectedBy: ('token' | 'domain' | 'shared')[]
  matchedTokens: string[]
  /** 이 문서가 §4.1 의 "빈 산출물"인가 — 행 0건. LLM 에게 명시적으로 알린다. */
  emptyArtifact: boolean
  /** 측정 근거율(행 기준). rowCount=0 이면 rate=null. */
  evidence: EvidenceStat
}

export interface IntakeAxis<T> {
  /** 이 축의 소스가 있었나. **false 는 "없음"이 아니라 "못 봄"이다**(§4.1). */
  present: boolean
  /** 소스 경로(프로젝트 상대) — 없으면 무엇을 못 읽었는지 알린다. */
  source: string
  /** 소스가 스탬프한 커밋(없으면 null — §5.2 의 스탬프 누수 이력 때문에 실측값을 그대로 싣는다). */
  gitCommit: string | null
  /** 후보 전체 수(필터 이전). */
  total: number
  /** 번들에 실린 수. */
  selected: number
  /** 필터가 골랐으나 캡 때문에 빠진 수. */
  omittedCount: number
  items: T[]
  reason: string | null
}

/** 축별 예산 배분 실적 — **왜 이만큼만 실렸나**를 감사 가능하게 남긴다(조용한 누락 금지). */
export interface AxisBudgetReport {
  /** 요구량(트림 전 직렬화 크기). */
  demand: number
  /** 배분량(floor + 잔여 비례). */
  allocated: number
  /** 실사용량(트림 후). */
  used: number
  floor: number
}

export interface IntakeInputBundle {
  /** v1=P3(3축) · **v2=P4(+화면·정책·pre-cite)**. */
  schemaVersion: 2
  request: { raw: string; tokens: string[] }
  filter: {
    /** `token`=요청 토큰으로 좁힘, `fallback`=못 좁혀 상위 N(§7 C7), `mixed`=축마다 다름. */
    mode: 'token' | 'fallback' | 'mixed'
    /** 축별 폴백 사유(정직한 보고). */
    fallbacks: string[]
  }
  minimalSet: { ok: boolean; missing: string[] }
  /**
   * **축소 모드**(§10-1) — 최소집합(도메인·데이터·추적표)이 아닌 축(화면·정책)의 부재는
   * **exit 2 가 아니다**. 대신 "없으면 생략하되 **그 사실을 번들에 명시**"한다.
   * 여기 실린 축에 의존하는 결론은 P5 가 `[추정]` 으로 강등한다.
   */
  reducedMode: { active: boolean; omittedAxes: string[]; note: string | null }
  commits: {
    domainGraph: string | null
    dbSchema: string | null
    crudMatrix: string | null
    rtm: string | null
    screens: string | null
    policy: string | null
    /** 축 커밋이 전부 같은가. **불일치는 차단하지 않는다**(§10-2) — 사실만 싣는다. */
    consistent: boolean
    /** 낡은 축 서술(강등 규칙 적용은 P5 소관 — 여기선 사실 기술만). */
    note: string | null
  }
  axes: {
    domain: IntakeAxis<IntakeBundleDomain> & { evidence: EvidenceStat }
    data: {
      schema: IntakeAxis<IntakeBundleTable> & { evidence: EvidenceStat }
      crud: IntakeAxis<IntakeBundleCrudRow> & { evidence: EvidenceStat }
    }
    rtm: IntakeAxis<IntakeBundleFunction> & { evidence: EvidenceStat }
    /** P4 화면 축(축소 모드 — 부재 시 present:false). */
    screens: IntakeAxis<IntakeBundleScreen> & { evidence: EvidenceStat }
    /** P4 정책 축(축소 모드 — 부재 시 present:false). */
    policy: IntakeAxis<IntakeBundlePolicyDoc> & { evidence: EvidenceStat }
  }
  /** charCap 으로 잘려나간 것 — **조용한 누락 금지**(§6.2 정직한 생략). */
  omitted: string[]
  charCap: { limit: number; exceeded: boolean }
  /** P4 축별 예산 배분 실적 — 예산 정책이 **감사 가능**해야 조용한 누락이 안 생긴다. */
  budget: Record<AxisBudgetKey, AxisBudgetReport>
  warnings: string[]
}

// ── 판독 헬퍼(원시 JSON 방어) ────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function strList(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string')
}
function evidenceList(v: unknown): { file: string; line: number | null }[] {
  return arr(v)
    .map((e) => {
      const o = obj(e)
      const file = str(o.file) ?? str(o.filePath)
      if (!file) return null
      return { file, line: num(o.line) }
    })
    .filter((e): e is { file: string; line: number | null } => e !== null)
}

/**
 * **pre-cite 리프트**(§6.2) — 산출물의 근거를 `{file, line, snippet}` 로 옮긴다.
 *
 * ★ 왜 파일을 다시 안 읽나: `fill-fanout.ts` 의 `extractPreCite` 는 스니펫이 **없는** 앵커에서
 *   실파일을 훑어 만들어내지만, 여기 소스들은 이미 스니펫을 갖고 있다(실측: screens.json
 *   `handler.evidence[].snippet`, domain-graph `citations[].snippet`). 결정론 리프트로 충분하고,
 *   재스캔은 IO 를 이 순수 모듈에 끌어들일 뿐이다.
 * ★ 스니펫이 없으면 **null 로 정직하게** 싣는다 — 지어내지 말라는 신호(빈 문자열은 금지:
 *   "인용했는데 내용 없음"으로 오독된다).
 */
function preCiteList(v: unknown): IntakePreCite[] {
  return arr(v)
    .map((e) => {
      const o = obj(e)
      const file = str(o.file) ?? str(o.filePath)
      if (!file) return null
      return { file, line: num(o.line), snippet: str(o.snippet) }
    })
    .filter((e): e is IntakePreCite => e !== null)
}

/**
 * 정책서 `근거` 열 → pre-cite. 실측 형식: `` `path/A.java:30-34`, `path/B.xml:52-77,122-130` ``.
 * 범위(`30-34`)·복수(`52,122`)는 **시작 줄**만 취한다(인용 앵커라 시작이면 충분).
 * 스니펫은 정책서가 안 갖고 있다 → `null`(정직 — 지어내지 말라는 신호).
 */
function parsePolicyEvidence(cell: string): IntakePreCite[] {
  const out: IntakePreCite[] = []
  for (const m of cell.matchAll(/`([^`]+)`/g)) {
    const ref = m[1].trim()
    const lm = /^(.*?):(\d+)(?:[-,]\d+)*$/.exec(ref)
    if (lm) out.push({ file: lm[1], line: parseInt(lm[2], 10), snippet: null })
    else if (ref.length > 0 && !ref.includes(' ')) out.push({ file: ref, line: null, snippet: null })
  }
  return out
}

// ── 사전 필터(결정론, LLM 없음) ──────────────────────────────────────────────

/**
 * 요청 원문 → 판별 토큰. 소문자화 → 비단어 분리 → 1글자·불용어 제거.
 *
 * 한국어는 교착어라 형태소 분석 없이 어절만 자르면 "로그인을"이 "로그인"과 안 맞는다.
 * 그래서 매칭은 **부분문자열 포함**(`matchTokens`)으로 한다 — 토큰이 후보 텍스트에 들어있으면 매치.
 * 형태소 분석기를 붙이지 않는 이유: 결정론·무의존성이 LLM 금지 제약보다 앞선다.
 */
export function tokenizeRequest(request: string): string[] {
  const raw = request
    .toLowerCase()
    .split(/[^0-9a-z가-힣_]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  return [...new Set(raw)].sort(natCmp)
}

/** 후보 텍스트에 포함된 토큰 목록(정렬 고정). */
function matchTokens(tokens: string[], haystack: string): string[] {
  const hay = haystack.toLowerCase()
  return tokens.filter((t) => hay.includes(t))
}

/**
 * 매치 **구체성** — 매치된 토큰이 후보 이름에서 차지하는 비중. 토큰 수가 같을 때의 순위 결정용.
 *
 * 예: "로그인" 1토큰이 `로그인 처리`(3/6=0.5) 와 `계정 기본 진입(로그인 폼)`(3/15=0.2) 양쪽에
 * 맞는다. 앞의 것이 더 정확히 그 기능을 가리키므로 먼저 와야 한다 — 캡에 잘릴 때 덜 관련된
 * 쪽이 먼저 빠진다. **이름 haystack 에만 쓴다**(도메인처럼 집계 텍스트에 쓰면 작은 도메인이
 * 부당하게 유리해진다).
 */
function matchCoverage(matched: string[], name: string): number {
  if (name.length === 0) return 0
  return matched.reduce((n, t) => n + t.length, 0) / name.length
}

// ── 최소집합 게이트(§10-1) ───────────────────────────────────────────────────

/** 최소집합 = **도메인 · 데이터 · 추적표**(§10-1 사용자 결정). 하나라도 없으면 fail-closed. */
export function checkMinimalSet(sources: IntakeBundleSources): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (sources.domainGraph === null) missing.push('도메인: .understand-anything/domain-graph.json (생성: /understand-map)')
  if (sources.dbSchema === null) missing.push('데이터: .spec/map/db-schema.json (생성: /understand-map)')
  if (sources.rtm === null) missing.push('추적표: .understand-anything/rtm.json (생성: /understand-rtm)')
  return { ok: missing.length === 0, missing }
}

// ── 축별 조립 ────────────────────────────────────────────────────────────────

interface DomainScope {
  key: string
  node: DomainGraphNode
  flows: DomainGraphNode[]
  steps: DomainGraphNode[]
}

/** tags[0] 로 도메인 귀속을 잡는다 — 실측상 domain/flow/step 전 노드가 단일 태그를 갖는다. */
function groupDomainScopes(graph: unknown): { scopes: DomainScope[]; total: number } {
  // 원시 JSON 이라 null·숫자 등 쓰레기 원소가 섞일 수 있다 — 죽지 말고 건너뛴다.
  const nodes = arr(obj(graph).nodes).filter((n): n is DomainGraphNode => n !== null && typeof n === 'object' && !Array.isArray(n))
  const byKey = new Map<string, DomainScope>()
  for (const n of nodes) {
    const key = strList(n.tags)[0]
    if (!key) continue
    let s = byKey.get(key)
    if (!s) {
      s = { key, node: {}, flows: [], steps: [] }
      byKey.set(key, s)
    }
    if (n.type === 'domain') s.node = n
    else if (n.type === 'flow') s.flows.push(n)
    else if (n.type === 'step') s.steps.push(n)
  }
  const scopes = [...byKey.values()].filter((s) => str(s.node.id) !== null).sort((a, b) => natCmp(a.key, b.key))
  return { scopes, total: scopes.length }
}

/** 도메인 매칭용 건초더미 — 도메인 자체 텍스트 + 소속 flow/step 의 이름·요약·경로. */
function domainHaystack(s: DomainScope): string {
  const meta = obj(s.node.domainMeta)
  const parts: string[] = [
    str(s.node.name) ?? '',
    str(s.node.summary) ?? '',
    s.key,
    ...strList(meta.entities),
    ...strList(meta.businessRules),
  ]
  for (const n of [...s.flows, ...s.steps]) {
    parts.push(str(n.name) ?? '', str(n.summary) ?? '', str(n.filePath) ?? '')
  }
  return parts.join('\n')
}

function buildDomainAxis(
  graph: unknown | null,
  tokens: string[],
): {
  axis: IntakeAxis<IntakeBundleDomain> & { evidence: EvidenceStat }
  selectedKeys: Set<string>
  fallback: string | null
} {
  const empty: IntakeAxis<IntakeBundleDomain> & { evidence: EvidenceStat } = {
    present: false,
    source: '.understand-anything/domain-graph.json',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    reason: '소스 없음 — 도메인 축을 못 봤습니다("도메인이 없다"가 아닙니다).',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (graph === null) return { axis: empty, selectedKeys: new Set(), fallback: null }

  const g = obj(graph)
  const gitCommit = str(obj(g.ktdsMap).generatedFromCommit) ?? str(obj(g.project).gitCommitHash)
  const { scopes, total } = groupDomainScopes(graph)

  let picked = scopes
    .map((s) => ({ s, matched: matchTokens(tokens, domainHaystack(s)) }))
    .filter((x) => x.matched.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    // §7 C7 — 못 좁혔으면 조용히 비우지 않는다. 상위 N + 생략 보고.
    fallback = `요청 토큰(${tokens.join(', ') || '없음'})이 어느 도메인과도 안 맞았습니다 — 상위 ${FALLBACK_TOP_N.domains}개로 폴백(전체 ${total}개).`
    picked = scopes.slice(0, FALLBACK_TOP_N.domains).map((s) => ({ s, matched: [] }))
  }
  // 결정론 정렬: 매치 토큰 수 내림차순 → key 오름차순.
  picked.sort((a, b) => b.matched.length - a.matched.length || natCmp(a.s.key, b.s.key))

  let cited = 0
  let claimsTotal = 0
  const items: IntakeBundleDomain[] = picked.map(({ s, matched }) => {
    const meta = obj(s.node.domainMeta)
    const claims = arr(meta.ktdsClaims)
    claimsTotal += claims.length
    for (const c of claims) {
      if (arr(obj(c).citations).length > 0) cited += 1
    }
    // ★ claim **관련도 랭킹**(P4) — v1 은 소스 순서로 slice 해서 트림이 "덜 관련된 것"이 아니라
    //   "뒤에 있던 것"을 버렸다. 요청 토큰 매치 수 → 원래 순서(안정)로 정렬해 꼬리부터 털면
    //   요청과 가장 가까운 근거가 끝까지 남는다(축 안에서의 역순 트림 = v1 원칙의 확장).
    const rankedClaims: IntakeBundleClaim[] = claims
      .map((c, i) => {
        const o = obj(c)
        const text = str(o.text) ?? ''
        return { i, m: matchTokens(tokens, text), o, text }
      })
      .sort((a, b) => b.m.length - a.m.length || a.i - b.i)
      .map(({ o, text, m }) => ({
        kind: str(o.kind),
        ref: str(o.ref),
        text,
        verdict: str(o.verdict),
        // pre-cite — 이게 번들의 존재 이유다(§6.2 "인용 생산을 LLM 에서 제거").
        citations: preCiteList(o.citations),
        matchedTokens: m,
      }))
    // 파일 귀속은 **step 노드의 filePath** — domain 노드는 filePath 가 없다(실측).
    const files = [...new Set([...s.steps, ...s.flows].map((n) => str(n.filePath)).filter((f): f is string => f !== null))].sort(natCmp)
    return {
      id: str(s.node.id) ?? s.key,
      name: str(s.node.name) ?? s.key,
      summary: str(s.node.summary),
      fileCount: files.length,
      sampleFiles: files.slice(0, SAMPLE_FILES_MAX),
      counts: {
        flows: s.flows.length,
        steps: s.steps.length,
        entities: strList(meta.entities).length,
        businessRules: strList(meta.businessRules).length,
        businessFlows: arr(meta.businessFlows).length,
        claims: claims.length,
      },
      groundedPct: num(meta.groundedPct),
      entities: strList(meta.entities).slice(0, AXIS_CAPS.entities),
      businessRules: strList(meta.businessRules).slice(0, AXIS_CAPS.businessRules),
      businessFlows: arr(meta.businessFlows).slice(0, AXIS_CAPS.businessFlows),
      claims: rankedClaims.slice(0, AXIS_CAPS.claims),
      matchedTokens: matched,
    }
  })

  return {
    axis: {
      present: true,
      source: '.understand-anything/domain-graph.json',
      gitCommit,
      total,
      selected: items.length,
      omittedCount: total - items.length,
      items,
      reason: fallback,
      evidence: { cited, total: claimsTotal, rate: claimsTotal === 0 ? null : cited / claimsTotal },
    },
    selectedKeys: new Set(picked.map((x) => x.s.key)),
    fallback,
  }
}

/** CRUD 행 — `columns[0]`="기능", `cells[0]`=기능명, `cells[i]`↔`columns[i]`(실측 구조). */
function buildCrudAxis(
  matrix: unknown | null,
  tokens: string[],
): { axis: IntakeAxis<IntakeBundleCrudRow> & { evidence: EvidenceStat }; touchedTables: Map<string, number>; fallback: string | null } {
  const empty: IntakeAxis<IntakeBundleCrudRow> & { evidence: EvidenceStat } = {
    present: false,
    source: '.spec/map/crud-matrix.json',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    reason: 'CRUD 매트릭스 없음 — 기능↔테이블 접근을 못 봤습니다("접근이 없다"가 아닙니다).',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (matrix === null) return { axis: empty, touchedTables: new Map(), fallback: null }

  const m = obj(matrix)
  const columns = strList(m.columns)
  const rows = arr(m.rows)
  let picked = rows
    .map((r) => {
      const o = obj(r)
      const cells = strList(o.cells)
      return { o, cells, feature: cells[0] ?? '', matched: matchTokens(tokens, cells[0] ?? '') }
    })
    .filter((x) => x.feature.length > 0 && x.matched.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    fallback = `요청 토큰이 어느 CRUD 기능행과도 안 맞았습니다 — 상위 ${FALLBACK_TOP_N.crudRows}행으로 폴백(전체 ${rows.length}행).`
    picked = rows
      .map((r) => {
        const o = obj(r)
        const cells = strList(o.cells)
        return { o, cells, feature: cells[0] ?? '', matched: [] as string[] }
      })
      .filter((x) => x.feature.length > 0)
      .sort((a, b) => natCmp(a.feature, b.feature))
      .slice(0, FALLBACK_TOP_N.crudRows)
  }
  // 결정론 정렬: 토큰 수 → 구체성 → 기능명. (구체성: "로그인 처리" 가 "계정 기본 진입(로그인 폼)" 보다 앞.)
  picked.sort(
    (a, b) =>
      b.matched.length - a.matched.length ||
      matchCoverage(b.matched, b.feature) - matchCoverage(a.matched, a.feature) ||
      natCmp(a.feature, b.feature),
  )
  const capped = picked.slice(0, AXIS_CAPS.crudRows)

  // ★ table → **가장 관련도 높은 crud 행의 순위**. Set 이 아니라 Map 인 이유: 스키마 축이
  //   이 순위로 정렬해야 트림이 **덜 관련된 테이블부터** 버린다(실측 사고: 이름순 정렬이라
  //   역순 트림이 SIGNON — 카카오 로그인의 핵심 테이블 — 을 제일 먼저 버렸다).
  const touchedTables = new Map<string, number>()
  let cited = 0
  const items: IntakeBundleCrudRow[] = capped.map(({ o, cells, feature, matched }, rowRank) => {
    const nonEmpty: { table: string; ops: string }[] = []
    for (let i = 1; i < columns.length; i++) {
      const ops = cells[i]
      if (ops && ops.length > 0) {
        nonEmpty.push({ table: columns[i], ops })
        if (!touchedTables.has(columns[i])) touchedTables.set(columns[i], rowRank)
      }
    }
    const evidence = evidenceList(o.evidence)
    if (evidence.length > 0) cited += 1
    return { feature, cells: nonEmpty, confidence: str(o.confidence) ?? 'UNVERIFIED', evidence, matchedTokens: matched }
  })

  return {
    axis: {
      present: true,
      source: '.spec/map/crud-matrix.json',
      gitCommit: str(m.gitCommit),
      total: rows.length,
      selected: items.length,
      omittedCount: picked.length - capped.length,
      items,
      reason: fallback,
      evidence: { cited, total: items.length, rate: items.length === 0 ? null : cited / items.length },
    },
    touchedTables,
    fallback,
  }
}

/**
 * 테이블명이 **선정된 도메인·정책의 근거 텍스트**에 몇 번 나오나 — 스키마 축의 관련도 신호.
 *
 * ★ 왜 필요한가(실측): "카카오 로그인" 의 CRUD 행 `로그인 처리` 는 **5개 테이블을 한꺼번에**
 *   건드린다(ACCOUNT·BANNERDATA·PRODUCT·PROFILE·SIGNON 전부 R). 그래서 CRUD 순위로는
 *   서로를 구분할 수 없고, 이름순 tiebreak 이면 알파벳 끝인 **SIGNON 이 제일 먼저 트림된다** —
 *   하필 평문 password 를 쥔, 이 설계의 **핵심 테이블**이다.
 *   언급 횟수는 이 교착을 근거로 푼다(실측: SIGNON 7 · ACCOUNT 4 · PROFILE 2 · BANNERDATA 1 · PRODUCT 0).
 *   결정론 유지 — LLM 없이 이미 번들에 실린 텍스트만 센다(축간 조인).
 */
function countMentions(name: string, haystack: string): number {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (haystack.match(new RegExp(`\\b${esc}\\b`, 'gi')) ?? []).length
}

function buildSchemaAxis(
  dbSchema: unknown | null,
  tokens: string[],
  touchedTables: Map<string, number>,
  /** 선정 도메인·정책의 근거 텍스트(관련도 신호) — 비어 있어도 동작한다(순위가 CRUD·이름으로 폴백). */
  mentionText: string,
): { axis: IntakeAxis<IntakeBundleTable> & { evidence: EvidenceStat }; fallback: string | null } {
  const empty: IntakeAxis<IntakeBundleTable> & { evidence: EvidenceStat } = {
    present: false,
    source: '.spec/map/db-schema.json',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    reason: '소스 없음 — 스키마 축을 못 봤습니다("테이블이 없다"가 아닙니다).',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (dbSchema === null) return { axis: empty, fallback: null }

  const d = obj(dbSchema)
  const tables = arr(d.tables)
  // 선정: ① 요청 원문이 테이블명을 직접 부름 ② 선정된 CRUD 행이 접근하는 테이블(결정론 조인).
  let picked = tables
    .map((t) => {
      const o = obj(t)
      const name = str(o.name) ?? ''
      const byToken = matchTokens(tokens, name).length > 0
      const crudRank = touchedTables.get(name)
      const selectedBy: ('token' | 'crud')[] = []
      if (byToken) selectedBy.push('token')
      if (crudRank !== undefined) selectedBy.push('crud')
      return { o, name, selectedBy, crudRank: crudRank ?? Number.MAX_SAFE_INTEGER, mentions: countMentions(name, mentionText) }
    })
    .filter((x) => x.name.length > 0 && x.selectedBy.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    fallback = `요청 토큰·CRUD 조인 어느 쪽으로도 테이블을 못 좁혔습니다 — 상위 ${FALLBACK_TOP_N.tables}개로 폴백(전체 ${tables.length}개).`
    picked = tables
      .map((t) => {
        const o = obj(t)
        const name = str(o.name) ?? ''
        return { o, name, selectedBy: [] as ('token' | 'crud')[], crudRank: Number.MAX_SAFE_INTEGER, mentions: countMentions(name, mentionText) }
      })
      .filter((x) => x.name.length > 0)
      .sort((a, b) => natCmp(a.name, b.name))
      .slice(0, FALLBACK_TOP_N.tables)
  }
  // ★ **관련도 정렬**(이름순 아님) — 트림이 꼬리부터 도는데 이름순이면 `SIGNON` 같은 핵심
  //   테이블이 알파벳 끝이라는 이유로 제일 먼저 죽는다(실측 사고). 순위:
  //   ① 요청이 테이블명을 직접 부름 → ② 도메인·정책 근거 텍스트의 **언급 횟수**(같은 CRUD 행이
  //   5개 테이블을 한꺼번에 건드려 ③ 이 교착일 때 이게 푼다) → ③ CRUD 행 순위 → ④ 이름(tiebreak).
  picked.sort(
    (a, b) =>
      Number(b.selectedBy.includes('token')) - Number(a.selectedBy.includes('token')) ||
      b.mentions - a.mentions ||
      a.crudRank - b.crudRank ||
      natCmp(a.name, b.name),
  )
  const capped = picked.slice(0, AXIS_CAPS.tables)

  let cited = 0
  let colTotal = 0
  const items: IntakeBundleTable[] = capped.map(({ o, name, selectedBy }) => {
    const columns = arr(o.columns).map((c) => {
      const co = obj(c)
      const line = num(co.line)
      colTotal += 1
      if (line !== null) cited += 1
      return {
        name: str(co.name) ?? '',
        type: str(co.type),
        nullable: typeof co.nullable === 'boolean' ? co.nullable : null,
        primaryKey: co.primaryKey === true,
        line,
      }
    })
    return {
      name,
      relPath: str(o.relPath),
      line: num(o.line),
      primaryKey: strList(o.primaryKey),
      columns,
      foreignKeys: arr(o.foreignKeys),
      // 시드 데이터(rows)는 스키마가 아니다 — 개수만 싣는다(번들 예산 절약 + 오도 방지).
      rowCount: num(o.rowCount) ?? arr(o.rows).length,
      selectedBy,
    }
  })

  return {
    axis: {
      present: true,
      source: '.spec/map/db-schema.json',
      gitCommit: str(d.gitCommit),
      total: tables.length,
      selected: items.length,
      omittedCount: picked.length - capped.length,
      items,
      reason: fallback,
      evidence: { cited, total: colTotal, rate: colTotal === 0 ? null : cited / colTotal },
    },
    fallback,
  }
}

// ── P4 화면 축 ───────────────────────────────────────────────────────────────

/** `mechanical` 의 **값 있는 필드만** — 원본은 null 8개 중 1~2개만 차 있다(실측). */
function compactMechanical(v: unknown): Record<string, string | boolean | number> | null {
  const o = obj(v)
  const out: Record<string, string | boolean | number> = {}
  for (const k of Object.keys(o).sort(natCmp)) {
    const val = o[k]
    if (val === null || val === undefined) continue
    if (val === false) continue // required:false 등 — 기본값이라 정보가 없다.
    if (typeof val === 'string' && val.length === 0) continue
    if (typeof val === 'string' || typeof val === 'boolean' || typeof val === 'number') out[k] = val
  }
  return Object.keys(out).length > 0 ? out : null
}

function projectAnnotation(a: unknown): IntakeBundleAnnotation {
  const o = obj(a)
  const h = obj(o.handler)
  const bb = obj(o.bbox)
  const hasBbox = ['x', 'y', 'width', 'height'].some((k) => num(bb[k]) !== null)
  return {
    no: num(o.no),
    label: str(o.label),
    eventType: str(o.eventType),
    selector: str(o.selector),
    bbox: hasBbox ? { x: num(bb.x), y: num(bb.y), width: num(bb.width), height: num(bb.height) } : null,
    description: str(o.description),
    mechanical: compactMechanical(o.mechanical),
    handler:
      Object.keys(h).length > 0
        ? { target: str(h.target), confidence: str(h.confidence), evidence: preCiteList(h.evidence) }
        : null,
  }
}

/** 화면 매칭용 건초더미 — 화면 자체 + annotation 의 라벨·설명·핸들러 타깃. */
function screenHaystack(o: Record<string, unknown>): string {
  const parts = [str(o.id) ?? '', str(o.jspFile) ?? '', str(o.title) ?? '', str(o.url) ?? '', str(obj(o.summary).text) ?? '']
  for (const a of arr(o.annotations)) {
    const ao = obj(a)
    parts.push(str(ao.label) ?? '', str(ao.description) ?? '', str(obj(ao.handler).target) ?? '')
  }
  return parts.join('\n')
}

/**
 * 화면 축(P4) — `screens.json` 을 **읽기만** 한다(§8 스코프 밖: 캡처 재생성·설계서 편집 금지).
 *
 * 선정: ① 요청 토큰 매치 ② **선정 도메인 조인**(`screens[].domain` ∈ 선정 도메인 키 — 결정론).
 * 도메인 폴백 시 조인을 끊는 이유는 crud→schema 와 동일하다(폴백 세탁 방지).
 */
/**
 * annotation **관련도 순위** — DOM 순서로 자르면 안 된다.
 *
 * ★ 실측 사고: `SignonForm.jsp` 의 ann 16건 중 **0~10번이 공통 헤더**(장바구니·검색·카탈로그
 *   카테고리 링크)이고 화면 **자기 콘텐츠인 `username`·`password`·`Login` 은 11~13번**이다.
 *   DOM 순서로 상위 8건만 남기면 **로그인 폼 자체가 통째로 빠지고 남의 도메인 내비만 남는다** —
 *   "카카오로 로그인 버튼을 어디에 넣나"(§4)에 답할 수 없게 된다.
 *
 * 순위(작을수록 먼저):
 *  0. 요청 토큰 매치 — 예: `Login` 의 설명 *"입력한 아이디/비밀번호로 **로그인**한다"*.
 *  1. **화면 자기 액션에 속한 컨트롤** — `mechanical.formAction`(또는 `href`)이 화면 자신의
 *     action 을 가리킨다. 실측: `username`·`password`·`Login` 은 전부
 *     `formAction=/jpetstore/actions/Account.action` 이고 화면 url 은 `actions/Account.action?signonForm=`
 *     이다. 반면 헤더 검색창(`fish`·`Search`)은 `Catalog.action` 이라 여기서 갈린다.
 *     ※ **도메인 파일집합으로 조인하면 안 된다**(실측 사고): account 도메인의 파일에는
 *       `CatalogService.java` 가 정당하게 들어있다(로그인 시 MyList 로딩). 그걸로 조인하면
 *       **카탈로그 내비 전부가 승격**돼 로그인 폼을 밀어낸다. 액션 기준이 정확하다.
 *  2. **그 밖의 폼 입력 요소**(`inputType` 있음) — 남의 액션이어도 내비 링크보다는 콘텐츠에 가깝다.
 *  3. 나머지 — 남의 액션으로 가는 공통 내비. 제일 먼저 양보한다.
 */
function annotationRank(a: IntakeBundleAnnotation, tokens: string[], ownAction: string | null): { rank: number; matched: string[] } {
  const matched = matchTokens(tokens, [a.label ?? '', a.description ?? '', a.handler?.target ?? ''].join('\n'))
  if (matched.length > 0) return { rank: 0, matched }
  const target = a.mechanical?.formAction ?? a.mechanical?.href
  if (ownAction !== null && typeof target === 'string' && target.split('?')[0].endsWith(`/${ownAction}`)) {
    return { rank: 1, matched }
  }
  if (a.mechanical !== null && a.mechanical.inputType !== undefined) return { rank: 2, matched }
  return { rank: 3, matched }
}

/**
 * 화면 url → 자기 action 파일명. `actions/Account.action?signonForm=` → `Account.action`.
 * annotation 이 "이 화면 자기 폼인가"를 판정하는 기준(위 `annotationRank` rank 1).
 */
function screenActionBase(url: string | null): string | null {
  if (url === null) return null
  const seg = url.split('?')[0].split('/').filter((p) => p.length > 0).pop()
  return seg !== undefined && seg.includes('.') ? seg : null
}

function buildScreensAxis(
  screens: unknown | null,
  tokens: string[],
  selectedDomainKeys: Set<string>,
): { axis: IntakeAxis<IntakeBundleScreen> & { evidence: EvidenceStat }; fallback: string | null } {
  const empty: IntakeAxis<IntakeBundleScreen> & { evidence: EvidenceStat } = {
    present: false,
    source: '.understand-anything/screens.json',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    // ★ 축소 모드(§10-1) — 부재는 exit 2 가 아니다. 다만 **생략 사실을 명시**한다.
    reason: '소스 없음 — 화면 축을 못 봤습니다("화면이 없다"가 아닙니다). 화면에 의존하는 결론은 [추정]입니다.',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (screens === null) return { axis: empty, fallback: null }

  const s = obj(screens)
  const all = arr(s.screens)
  let picked = all
    .map((sc) => {
      const o = obj(sc)
      const id = str(o.id) ?? ''
      const matched = matchTokens(tokens, screenHaystack(o))
      const domain = str(o.domain)
      const byDomain = domain !== null && selectedDomainKeys.has(domain)
      const selectedBy: ('token' | 'domain')[] = []
      if (matched.length > 0) selectedBy.push('token')
      if (byDomain) selectedBy.push('domain')
      return { o, id, matched, selectedBy, title: str(o.title) ?? '' }
    })
    .filter((x) => x.id.length > 0 && x.selectedBy.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    fallback = `요청 토큰·도메인 어느 쪽으로도 화면을 못 좁혔습니다 — 상위 ${FALLBACK_TOP_N.screens}장으로 폴백(전체 ${all.length}장).`
    picked = all
      .map((sc) => {
        const o = obj(sc)
        return { o, id: str(o.id) ?? '', matched: [] as string[], selectedBy: [] as ('token' | 'domain')[], title: str(o.title) ?? '' }
      })
      .filter((x) => x.id.length > 0)
      .sort((a, b) => natCmp(a.id, b.id))
      .slice(0, FALLBACK_TOP_N.screens)
  }
  // 결정론 정렬: 토큰 매치 수 → 제목 구체성 → id. 트림은 이 **역순**으로 턴다.
  picked.sort(
    (a, b) =>
      b.matched.length - a.matched.length ||
      matchCoverage(b.matched, b.title) - matchCoverage(a.matched, a.title) ||
      natCmp(a.id, b.id),
  )
  const capped = picked.slice(0, AXIS_CAPS.screens)

  let cited = 0
  let annTotal = 0
  const items: IntakeBundleScreen[] = capped.map(({ o, id, matched, selectedBy }) => {
    const anns = arr(o.annotations)
    const projected = anns.map(projectAnnotation)
    for (const a of projected) {
      annTotal += 1
      if (a.handler !== null && a.handler.evidence.length > 0) cited += 1
    }
    // ★ 관련도 순위로 재정렬 — 트림이 꼬리부터 도니 공통 내비가 먼저 빠지고 로그인 폼이 남는다.
    //   동순위는 원래 DOM 순서 유지(안정 정렬 = 결정론, 화면상 순서도 보존).
    const ownAction = screenActionBase(str(o.url))
    const ranked = projected
      .map((a, i) => ({ a, i, ...annotationRank(a, tokens, ownAction) }))
      .sort((x, y) => x.rank - y.rank || y.matched.length - x.matched.length || x.i - y.i)
      .map((x) => x.a)
    const sum = obj(o.summary)
    return {
      id,
      jspFile: str(o.jspFile),
      title: str(o.title),
      domain: str(o.domain),
      url: str(o.url),
      summary: Object.keys(sum).length > 0 ? { text: str(sum.text), confidence: str(sum.confidence) } : null,
      annotationCount: anns.length,
      annotations: ranked.slice(0, AXIS_CAPS.annotationsPerScreen),
      selectedBy,
      matchedTokens: matched,
    }
  })

  return {
    axis: {
      present: true,
      source: '.understand-anything/screens.json',
      gitCommit: str(s.gitCommit),
      total: all.length,
      selected: items.length,
      omittedCount: picked.length - capped.length,
      items,
      reason: fallback,
      evidence: { cited, total: annTotal, rate: annTotal === 0 ? null : cited / annTotal },
    },
    fallback,
  }
}

// ── P4 정책 축 ───────────────────────────────────────────────────────────────

/** `--- ... ---` frontmatter 판독(YAML 파서 없이 `key: value` 만 — 실측 형식이 그렇다). */
function parseFrontmatter(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

/** 마크다운 표 행 → 셀 배열. `| a | b |` → `['a','b']`. 구분선(`| --- |`)은 호출자가 거른다. */
function splitTableRow(line: string): string[] {
  const t = line.trim()
  if (!t.startsWith('|')) return []
  return t
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}
const isTableSeparator = (cells: string[]): boolean => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c))

interface ParsedPolicySection {
  heading: string
  rank: number
  columns: string[]
  rows: string[][]
}

/** 정책서 마크다운 → 절 목록(순수 파서 — 표만 뽑는다. 산문은 예산 대비 밀도가 낮아 버린다). */
export function parsePolicyMarkdown(md: string): { frontmatter: Record<string, string>; sections: ParsedPolicySection[] } {
  const frontmatter = parseFrontmatter(md)
  const sections: ParsedPolicySection[] = []
  let cur: ParsedPolicySection | null = null
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line)
    if (h) {
      const heading = h[1].trim()
      const hit = POLICY_SECTION_PRIORITY.find((p) => p.pattern.test(heading))
      cur = { heading, rank: hit ? hit.rank : POLICY_SECTION_DEFAULT_RANK, columns: [], rows: [] }
      sections.push(cur)
      continue
    }
    if (!cur) continue
    const cells = splitTableRow(line)
    if (cells.length === 0) continue
    if (isTableSeparator(cells)) continue
    // 첫 표 행 = 헤더, 이후 = 데이터. 한 절에 표가 여럿이면 뒤 표의 헤더도 데이터로 들어오지만
    // 실측 구조상 절당 표 1개라 단순 규칙으로 충분하다(오판해도 셀 내용은 보존된다).
    if (cur.columns.length === 0) cur.columns = cells
    else cur.rows.push(cells)
  }
  return { frontmatter, sections }
}

/** 정책서 파일명 → 도메인 키. `policy-domain-account.md` → `account`(실측 규약). */
function policyDomainKey(relPath: string): string | null {
  const m = /policy-domain-(.+)\.md$/.exec(relPath)
  return m ? m[1] : null
}

/**
 * 정책 축(P4) — `doc-output/policy-*.md` 를 읽기만 한다(§8: 스캐너 개선은 별도 과제).
 *
 * ★ §4.1 **빈 산출물 오독 차단**이 이 축의 최대 함정이다. jpetstore `policy-authz.md`(702B)·
 *   `policy-validation.md`(617B)는 **데이터 행 0건**인데(Stripes `@Validate` 를 쓰는데 스캐너가
 *   `@PreAuthorize`/bean-validation 을 찾아서) 그대로 주면 LLM 이 **"권한 통제 없음"으로 오독**한다.
 *   → 전역 정책서는 **행이 0건이어도 `selectedBy:['shared']` 로 싣는다**(행 없이 통계만).
 *   "안 실림"이면 LLM 이 존재 자체를 모르고, "0건 통계와 함께 실림"이면 **"못 봤다"를 안다**.
 */
function buildPolicyAxis(
  docs: IntakePolicyDoc[] | null,
  tokens: string[],
  selectedDomainKeys: Set<string>,
): { axis: IntakeAxis<IntakeBundlePolicyDoc> & { evidence: EvidenceStat }; fallback: string | null } {
  const empty: IntakeAxis<IntakeBundlePolicyDoc> & { evidence: EvidenceStat } = {
    present: false,
    source: '.understand-anything/doc-output/policy-*.md',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    reason: '소스 없음 — 정책 축을 못 봤습니다("정책이 없다"가 아닙니다). 정책에 의존하는 결론은 [추정]입니다.',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (docs === null || docs.length === 0) return { axis: empty, fallback: null }

  const parsed = docs
    .map((d) => {
      const p = parsePolicyMarkdown(d.markdown)
      const key = policyDomainKey(d.relPath)
      const rowCount = p.sections.reduce((n, s) => n + s.rows.length, 0)
      const body = p.sections.map((s) => `${s.heading}\n${s.rows.map((r) => r.join(' ')).join('\n')}`).join('\n')
      return { d, p, key, rowCount, matched: matchTokens(tokens, body) }
    })
    .sort((a, b) => natCmp(a.d.relPath, b.d.relPath))

  let picked = parsed
    .map((x) => {
      const selectedBy: ('token' | 'domain' | 'shared')[] = []
      const byDomain = x.key !== null && selectedDomainKeys.has(x.key)
      if (x.matched.length > 0) selectedBy.push('token')
      if (byDomain) selectedBy.push('domain')
      // 전역(도메인 아닌) 정책서는 **행 0건이어도** 통계를 실어 "없음 vs 못 봄"을 구분시킨다(§4.1).
      if (x.key === null) selectedBy.push('shared')
      return { ...x, selectedBy }
    })
    .filter((x) => x.selectedBy.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    fallback = `요청 토큰·도메인 어느 쪽으로도 정책서를 못 좁혔습니다 — 상위 ${FALLBACK_TOP_N.policyDocs}건으로 폴백(전체 ${parsed.length}건).`
    picked = parsed.slice(0, FALLBACK_TOP_N.policyDocs).map((x) => ({ ...x, selectedBy: [] as ('token' | 'domain' | 'shared')[] }))
  }
  // 정렬: 도메인 조인 > 토큰 > shared. 트림은 역순이라 shared(행 0건 통계)가 먼저 빠진다.
  const docRank = (sel: ('token' | 'domain' | 'shared')[]): number =>
    sel.includes('domain') ? 0 : sel.includes('token') ? 1 : 2
  picked.sort((a, b) => docRank(a.selectedBy) - docRank(b.selectedBy) || b.matched.length - a.matched.length || natCmp(a.d.relPath, b.d.relPath))
  const capped = picked.slice(0, AXIS_CAPS.policyDocs)

  let cited = 0
  let rowTotal = 0
  const items: IntakeBundlePolicyDoc[] = capped.map((x) => {
    const fm = x.p.frontmatter
    // ★ 절 선정: **종류 우선순위**(rank) 우선, 토큰은 동순위 안에서만 — 근거는 상수 주석 참조
    //   (§8 미결이 요청 토큰을 하나도 안 갖는 게 실측이라 토큰 우선이면 그게 탈락한다).
    const sections = x.p.sections
      .map((s) => {
        const body = `${s.heading}\n${s.rows.map((r) => r.join(' ')).join('\n')}`
        return { s, m: matchTokens(tokens, body) }
      })
      .sort((a, b) => a.s.rank - b.s.rank || b.m.length - a.m.length || natCmp(a.s.heading, b.s.heading))
      .slice(0, AXIS_CAPS.policySections)

    let docCited = 0
    let docRows = 0
    const projected: IntakeBundlePolicySection[] = sections.map(({ s, m }) => {
      const ci = s.columns.findIndex((c) => /신뢰도/.test(c))
      const ei = s.columns.findIndex((c) => /근거/.test(c))
      const rows: IntakeBundlePolicyRow[] = s.rows.slice(0, AXIS_CAPS.policyRowsPerSection).map((cells) => {
        const evidence = ei >= 0 ? parsePolicyEvidence(cells[ei] ?? '') : []
        return { cells, confidence: ci >= 0 ? (str(cells[ci]) ?? null) : null, evidence }
      })
      for (const r of s.rows) {
        docRows += 1
        if (ei >= 0 && parsePolicyEvidence(r[ei] ?? '').length > 0) docCited += 1
      }
      return { heading: s.heading, rank: s.rank, columns: s.columns, rowCount: s.rows.length, rows, matchedTokens: m }
    })
    cited += docCited
    rowTotal += docRows
    const declared = fm.evidenceRate !== undefined ? num(parseFloat(fm.evidenceRate)) : null
    return {
      docId: fm.docId ?? x.d.relPath,
      title: str(fm.title),
      relPath: x.d.relPath,
      sourceCommit: fm.sourceCommit === 'null' ? null : (str(fm.sourceCommit) ?? null),
      declaredEvidenceRate: declared,
      rowCount: x.rowCount,
      sections: projected,
      selectedBy: x.selectedBy,
      matchedTokens: x.matched,
      // §4.1 — 행 0건은 "정책이 없다"가 아니라 "스캐너가 못 봤다"일 수 있다. 명시적 플래그.
      emptyArtifact: x.rowCount === 0,
      evidence: { cited: docCited, total: docRows, rate: docRows === 0 ? null : docCited / docRows },
    }
  })

  // 정책서의 스탬프는 문서마다 다를 수 있다 — 하나로 뭉개지 않고 **전부 같을 때만** 축 커밋으로 올린다.
  const stamps = [...new Set(items.map((i) => i.sourceCommit).filter((c): c is string => c !== null))]
  return {
    axis: {
      present: true,
      source: '.understand-anything/doc-output/policy-*.md',
      gitCommit: stamps.length === 1 ? stamps[0] : null,
      total: parsed.length,
      selected: items.length,
      omittedCount: picked.length - capped.length,
      items,
      reason: fallback,
      evidence: { cited, total: rowTotal, rate: rowTotal === 0 ? null : cited / rowTotal },
    },
    fallback,
  }
}

function buildRtmAxis(
  rtm: unknown | null,
  tokens: string[],
  selectedDomainKeys: Set<string>,
): { axis: IntakeAxis<IntakeBundleFunction> & { evidence: EvidenceStat }; fallback: string | null } {
  const empty: IntakeAxis<IntakeBundleFunction> & { evidence: EvidenceStat } = {
    present: false,
    source: '.understand-anything/rtm.json',
    gitCommit: null,
    total: 0,
    selected: 0,
    omittedCount: 0,
    items: [],
    reason: '소스 없음 — 추적표 축을 못 봤습니다("기능이 없다"가 아닙니다).',
    evidence: { cited: 0, total: 0, rate: null },
  }
  if (rtm === null) return { axis: empty, fallback: null }

  const r = obj(rtm)
  const fns = arr(r.functions)
  const domainIds = new Set([...selectedDomainKeys].flatMap((k) => [`domain:${k}`, `to-be:${k}`]))
  let picked = fns
    .map((f) => {
      const o = obj(f)
      const id = str(o.id) ?? ''
      const name = str(o.name) ?? ''
      const domainId = str(o.domainId)
      const matched = matchTokens(tokens, `${id}\n${name}`)
      // 도메인 확장: 선정된 도메인의 기존 기능은 "이미 있는 것"의 인벤토리다 — ①이 발명을
      // 피하려면 이게 보여야 한다(RTM_TAB_DESIGN.md:145 "현재 도메인/기능 인벤토리").
      const byDomain = domainId !== null && domainIds.has(domainId)
      if (matched.length === 0 && !byDomain) return null
      return { o, id, name, domainId, matched, selectedBy: (matched.length > 0 ? 'token' : 'domain') as 'token' | 'domain' }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.id.length > 0)
  let fallback: string | null = null
  if (picked.length === 0) {
    fallback = `요청 토큰·도메인 어느 쪽으로도 기능을 못 좁혔습니다 — 상위 ${FALLBACK_TOP_N.functions}개로 폴백(전체 ${fns.length}건).`
    picked = fns
      .map((f) => {
        const o = obj(f)
        return { o, id: str(o.id) ?? '', name: str(o.name) ?? '', domainId: str(o.domainId), matched: [] as string[], selectedBy: 'domain' as const }
      })
      .filter((x) => x.id.length > 0)
      .sort((a, b) => natCmp(a.id, b.id))
      .slice(0, FALLBACK_TOP_N.functions)
  }
  // token 매치를 앞에(캡에 잘릴 때 덜 관련된 domain 확장분이 먼저 빠지도록) → 구체성 → id.
  picked.sort(
    (a, b) =>
      (a.selectedBy === b.selectedBy ? 0 : a.selectedBy === 'token' ? -1 : 1) ||
      b.matched.length - a.matched.length ||
      matchCoverage(b.matched, b.name) - matchCoverage(a.matched, a.name) ||
      natCmp(a.id, b.id),
  )
  const capped = picked.slice(0, AXIS_CAPS.functions)

  let cited = 0
  let cellTotal = 0
  const cell = (v: unknown) => {
    const o = obj(v)
    const evidence = evidenceList(o.evidence)
    cellTotal += 1
    if (evidence.length > 0) cited += 1
    return { value: str(o.value) ?? '', confidence: str(o.confidence) ?? 'UNVERIFIED', evidence }
  }
  const items: IntakeBundleFunction[] = capped.map(({ o, id, name, domainId, selectedBy }) => ({
    id,
    name,
    domainId,
    domainName: str(o.domainName),
    entryPoint: cell(o.entryPoint),
    implementation: cell(o.implementation),
    origin: str(o.origin),
    state: str(o.state),
    selectedBy,
  }))

  return {
    axis: {
      present: true,
      source: '.understand-anything/rtm.json',
      gitCommit: str(r.gitCommit),
      total: fns.length,
      selected: items.length,
      omittedCount: picked.length - capped.length,
      items,
      reason: fallback,
      evidence: { cited, total: cellTotal, rate: cellTotal === 0 ? null : cited / cellTotal },
    },
    fallback,
  }
}

// ── charCap 트림(정직한 생략) ────────────────────────────────────────────────

/**
 * 번들의 정규 직렬화 — **디스크에 쓰는 형태**. charCap 은 이 형태를 잰다.
 *
 * ★ 측정과 기록이 어긋나면 캡은 장식이 된다: compact 로 재고 pretty 로 쓰면 실제 파일이 예산의
 *   ~1.75배가 되는데(실측 59,834 → 105,018) LLM 이 읽는 건 **파일 쪽**이다. 그래서 CLI 도
 *   반드시 이 함수로 써야 한다(measure == write).
 */
export function serializeIntakeBundle(bundle: IntakeInputBundle): string {
  return JSON.stringify(bundle, null, 2) + '\n'
}

/**
 * 축 항목이 **실제 번들 안에서** 차지하는 문자 수 — 배분·트림의 공통 단위.
 *
 * ★ 들여쓰기 깊이 보정이 **필수**다: `JSON.stringify(items, null, 2)` 는 배열을 최상위로 재지만
 *   번들 안에서 그 배열은 `axes.domain.items` 처럼 **몇 단계 더 깊이** 놓여 줄마다 들여쓰기가
 *   더 붙는다. 이 보정을 빼면 축 기여도를 과소평가하고, 그 차이가 봉투로 잘못 계상돼
 *   **전 축이 굶는다**(실측 사고: 번들 24,094/60,000 · 스키마 0/13 — 축별 배분이 통째로 무의미해짐).
 *   측정==기록 계약(`serializeIntakeBundle`)을 배분 계산에서도 지키는 셈이다.
 */
function axisSize(items: unknown[], extraDepth: number): number {
  const s = JSON.stringify(items, null, 2)
  const lines = s.split('\n').length
  return s.length + lines * 2 * extraDepth
}

/**
 * 각 축 `items` 배열의 번들 내 중첩 깊이(최상위 직렬화 대비 **추가** 깊이).
 * 예: `bundle.axes.domain.items` → axes(1)·domain(2)·items(3) = 3.
 *     `bundle.axes.data.schema.items` → axes(1)·data(2)·schema(3)·items(4) = 4.
 */
const AXIS_DEPTH: Record<AxisBudgetKey, number> = {
  domain: 3,
  schema: 4,
  crud: 4,
  rtm: 3,
  screens: 3,
  policy: 3,
}

/**
 * **축별 예산 배분(water-fill)** — floor 를 먼저 채우고 잔여를 가중 비례로 나눈다.
 *
 * ★ 이게 P4 의 핵심 안전장치다: floor 가 없으면 "생존"이 **트리머 순서**로 결정돼 어느 한 축이
 *   완전히 고갈된 뒤에야 다음 축이 양보한다(= 화면·정책을 얹으면 pre-cite 가 통째로 날아가는
 *   기계적 원인). floor 는 **모든 축이 자기 pre-cite 코어를 지킨다**를 구조로 보장한다.
 *
 * ★ 수요가 floor 보다 작은 축(또는 부재 축)의 몫은 **풀로 환원**된다 — 그래서 축소 모드
 *   (화면·정책 없음)에선 v1 과 같은 배분으로 자연 수렴한다.
 *
 * 결정론: 키 순회 순서 고정(`AXIS_BUDGET` 선언 순), 정수 연산, 라운딩 정체 시 즉시 종료.
 */
export function allocateAxisBudget(demand: Record<AxisBudgetKey, number>, available: number): Record<AxisBudgetKey, number> {
  const keys = Object.keys(AXIS_BUDGET) as AxisBudgetKey[]
  const alloc = {} as Record<AxisBudgetKey, number>

  const floorSum = keys.reduce((n, k) => n + Math.min(demand[k], AXIS_BUDGET[k].floor), 0)
  if (floorSum > available && floorSum > 0) {
    // floor 합조차 예산을 넘는다(예산이 아주 작거나 축이 아주 많을 때) — 비례 축소.
    // 조용히 어느 축을 0 으로 만들지 않는다: 전 축이 같은 비율로 양보한다.
    for (const k of keys) alloc[k] = Math.floor((Math.min(demand[k], AXIS_BUDGET[k].floor) * available) / floorSum)
    return alloc
  }
  for (const k of keys) alloc[k] = Math.min(demand[k], AXIS_BUDGET[k].floor)

  let left = available - floorSum
  for (;;) {
    const hungry = keys.filter((k) => demand[k] > alloc[k])
    if (hungry.length === 0 || left <= 0) break
    const wSum = hungry.reduce((n, k) => n + AXIS_BUDGET[k].weight, 0)
    let given = 0
    for (const k of hungry) {
      const share = Math.floor((left * AXIS_BUDGET[k].weight) / wSum)
      const take = Math.min(share, demand[k] - alloc[k])
      alloc[k] += take
      given += take
    }
    // 라운딩 정체(share 가 전부 0) — 남은 몇 자는 포기한다. 무한 루프 방지 + 결정론.
    if (given === 0) break
    left -= given
  }
  return alloc
}

/**
 * 한 축을 배분량까지 **꼬리부터** 줄인다. items 는 관련도 내림차순이라 꼬리 = 덜 관련된 것.
 * 잘라낸 건 전부 `omitted[]` 에 적는다(조용한 누락 금지).
 */
function trimAxisTo(
  items: unknown[],
  limit: number,
  depth: number,
  omitted: string[],
  label: (i: number) => string,
  /** 항목을 통째로 버리기 전에 **안쪽부터** 줄일 수 있으면 여기서(예: 화면의 annotation). */
  shrinkLast?: (item: unknown) => string | null,
): void {
  while (items.length > 0 && axisSize(items, depth) > limit) {
    if (shrinkLast) {
      const note = shrinkLast(items[items.length - 1])
      if (note !== null) {
        omitted.push(note)
        continue
      }
    }
    omitted.push(label(items.length - 1))
    items.pop()
  }
}

/**
 * 번들이 예산을 넘으면 **꼬리부터** 잘라내되 잘라낸 걸 전부 `omitted[]` 에 적는다.
 *
 * ★ P4 에선 이게 **백스톱**이다 — 1차 방어선은 축별 배분(`allocateAxisBudget`)이고, 여기는
 *   봉투(warnings·omitted 자체 등) 증가분까지 포함한 **최종 하드 캡 보장**만 한다.
 *   v1 의 우선순위·역순 원칙은 그대로 유지한다(되돌리면 1순위 도메인 근거가 먼저 죽는다).
 *
 * 드롭 우선순위(덜 아까운 것부터) — 고정이라 결정론이다:
 *  1. `businessFlows` — 노드·엣지 그래프라 단위 부피가 제일 크고, ①식별 판단엔 rule/claim 이 더 직접적.
 *  2. `claims` — pre-cite 페이로드(§6.2)라 아깝지만 부피 2위. entities/businessRules 는 절대 안 자른다(작다).
 *  3. rtm `functions` 중 `selectedBy==='domain'` — 토큰 매치가 아닌 확장분.
 *  4. `crud rows` → 5. `tables` — 최소집합의 뼈대라 마지막.
 */
function trimToCharCap(bundle: IntakeInputBundle, charCap: number): void {
  const size = () => serializeIntakeBundle(bundle).length
  if (size() <= charCap) return

  type Trimmer = { label: () => string | null; drop: () => void }
  const trimmers: Trimmer[] = []
  // ★ 도메인은 **관련도 역순**으로 턴다 — items 는 관련도 내림차순이라 그냥 돌면 1순위 도메인이
  //   먼저 빈털터리가 되고 말순위가 온전히 남는다(실측 사고: account claims 55→0 인데 order 는 생존).
  //   덜 관련된 도메인부터 버려야 요청과 가장 가까운 도메인의 근거가 끝까지 살아남는다.
  const byRelevanceDesc = [...bundle.axes.domain.items].reverse()
  for (const d of byRelevanceDesc) {
    trimmers.push({
      label: () => (d.businessFlows.length > 0 ? `${d.id} businessFlows[${d.businessFlows.length - 1}]` : null),
      drop: () => void d.businessFlows.pop(),
    })
  }
  for (const d of byRelevanceDesc) {
    trimmers.push({
      label: () => (d.claims.length > 0 ? `${d.id} claims[${d.claims.length - 1}]` : null),
      drop: () => void d.claims.pop(),
    })
  }
  // P4: 정책 절 — 꼬리(=우선순위 최하위 절. 미결·정책규칙이 앞이라 보일러플레이트부터 빠진다).
  for (const d of [...bundle.axes.policy.items].reverse()) {
    trimmers.push({
      label: () => (d.sections.length > 0 ? `policy ${d.docId} §${d.sections[d.sections.length - 1].heading}` : null),
      drop: () => void d.sections.pop(),
    })
  }
  // P4: 정책 문서 — **행 0건 스텁은 건너뛴다**(§4.1 오독 차단 payload. trimPolicyAxis 와 같은 규칙).
  trimmers.push({
    label: () => {
      const i = bundle.axes.policy.items.map((d) => d.emptyArtifact).lastIndexOf(false)
      return i < 0 ? null : `policy ${bundle.axes.policy.items[i].docId}`
    },
    drop: () => {
      const i = bundle.axes.policy.items.map((d) => d.emptyArtifact).lastIndexOf(false)
      if (i >= 0) bundle.axes.policy.items.splice(i, 1)
    },
  })
  // P4: 화면 annotation — 꼬리부터. 화면 자체보다 먼저 얇아진다(1장이라도 남는 게 낫다).
  for (const s of [...bundle.axes.screens.items].reverse()) {
    trimmers.push({
      label: () => (s.annotations.length > 0 ? `screen ${s.id} annotations[${s.annotations.length - 1}]` : null),
      drop: () => void s.annotations.pop(),
    })
  }
  trimmers.push({
    label: () => {
      const last = bundle.axes.screens.items.at(-1)
      return last ? `screen ${last.id}` : null
    },
    drop: () => void bundle.axes.screens.items.pop(),
  })
  trimmers.push({
    label: () => {
      const i = bundle.axes.rtm.items.map((f) => f.selectedBy).lastIndexOf('domain')
      return i < 0 ? null : `rtm function ${bundle.axes.rtm.items[i].id}`
    },
    drop: () => {
      const i = bundle.axes.rtm.items.map((f) => f.selectedBy).lastIndexOf('domain')
      if (i >= 0) bundle.axes.rtm.items.splice(i, 1)
    },
  })
  trimmers.push({
    label: () => {
      const last = bundle.axes.data.crud.items.at(-1)
      return last ? `crud row ${last.feature}` : null
    },
    drop: () => void bundle.axes.data.crud.items.pop(),
  })
  trimmers.push({
    label: () => {
      const last = bundle.axes.data.schema.items.at(-1)
      return last ? `table ${last.name}` : null
    },
    drop: () => void bundle.axes.data.schema.items.pop(),
  })

  for (const t of trimmers) {
    for (;;) {
      if (size() <= charCap) {
        bundle.charCap.exceeded = false
        return
      }
      const label = t.label()
      if (label === null) break
      t.drop()
      bundle.omitted.push(label)
    }
  }
  // 전부 잘라도 예산 초과 — 조용히 통과시키지 않고 사실을 남긴다.
  bundle.charCap.exceeded = size() > charCap
}

/**
 * 정책 축 트림 — **§4.1 스텁 보호**가 일반 트리머와 다른 점이다.
 *
 * 단계:
 *  1. 절을 **문서 역순**(관련도 낮은 문서부터)으로 턴다. 절은 종류 우선순위 오름차순이라
 *     꼬리 = 보일러플레이트(§0 문서정보·개정이력)부터 빠지고 §8 미결·§4 정책규칙이 끝까지 산다.
 *  2. 그래도 넘치면 문서를 통째로 버리되 **행 0건 문서(`emptyArtifact`)는 남긴다** —
 *     그 스텁(docId·rowCount 0·evidenceRate)이 §4.1 오독 차단의 payload 이고 값이 거의 공짜다
 *     (실측: policy-authz.md 스텁 ~250자). 이걸 버리면 LLM 이 그 산출물의 **존재 자체를 모르고**
 *     "권한 통제 없음"으로 오독한다 — 바로 이 축이 막으려던 실패다.
 */
function trimPolicyAxis(bundle: IntakeInputBundle, limit: number): void {
  const items = bundle.axes.policy.items
  const over = () => axisSize(items, AXIS_DEPTH.policy) > limit
  for (const d of [...items].reverse()) {
    while (d.sections.length > 0 && over()) {
      bundle.omitted.push(`policy ${d.docId} §${d.sections[d.sections.length - 1].heading}`)
      d.sections.pop()
    }
  }
  while (over()) {
    const i = items.map((d) => d.emptyArtifact).lastIndexOf(false)
    if (i < 0) break // 남은 게 전부 §4.1 스텁 — 더 버리지 않는다(값싸고 오독 차단에 필수).
    bundle.omitted.push(`policy ${items[i].docId}`)
    items.splice(i, 1)
  }
}

/**
 * **1차 방어선 — 축별 예산 배분 적용**(P4). 배분량을 넘는 축만 자기 꼬리를 턴다.
 *
 * 봉투(request·commits·warnings…)를 실측해 빼고 나눈다 — 봉투를 무시하고 나누면 합이 캡을
 * 넘어 백스톱이 매번 돌게 되고, 그럼 축별 배분이 무의미해진다.
 */
function applyAxisBudget(bundle: IntakeInputBundle, charCap: number): Record<AxisBudgetKey, number> {
  const A = bundle.axes
  const demand: Record<AxisBudgetKey, number> = {
    domain: axisSize(A.domain.items, AXIS_DEPTH.domain),
    schema: axisSize(A.data.schema.items, AXIS_DEPTH.schema),
    crud: axisSize(A.data.crud.items, AXIS_DEPTH.crud),
    rtm: axisSize(A.rtm.items, AXIS_DEPTH.rtm),
    screens: axisSize(A.screens.items, AXIS_DEPTH.screens),
    policy: axisSize(A.policy.items, AXIS_DEPTH.policy),
  }
  // ★ 봉투(request·commits·warnings·budget…)는 **축을 비워 직접 잰다**. 전체−수요 로 빼면
  //   수요 추정 오차가 통째로 봉투에 얹혀 전 축이 굶는다(실측 사고 — axisSize 주석 참조).
  const saved = [A.domain.items, A.data.schema.items, A.data.crud.items, A.rtm.items, A.screens.items, A.policy.items]
  A.domain.items = []
  A.data.schema.items = []
  A.data.crud.items = []
  A.rtm.items = []
  A.screens.items = []
  A.policy.items = []
  const envelope = serializeIntakeBundle(bundle).length
  ;[A.domain.items, A.data.schema.items, A.data.crud.items, A.rtm.items, A.screens.items, A.policy.items] = saved as [
    IntakeBundleDomain[],
    IntakeBundleTable[],
    IntakeBundleCrudRow[],
    IntakeBundleFunction[],
    IntakeBundleScreen[],
    IntakeBundlePolicyDoc[],
  ]
  const available = Math.max(0, charCap - envelope)
  const alloc = allocateAxisBudget(demand, available)

  // ★ 도메인은 **관련도 역순**(v1 원칙) — 덜 관련된 도메인이 먼저 양보해야 1순위 도메인의
  //   pre-cite 가 끝까지 산다. 축 안에서도 claims 는 관련도 내림차순이라 꼬리부터 턴다.
  if (demand.domain > alloc.domain) {
    const rev = [...A.domain.items].reverse()
    const over = () => axisSize(A.domain.items, AXIS_DEPTH.domain) > alloc.domain
    for (const d of rev) {
      if (!over()) break
      while (d.businessFlows.length > 0 && over()) {
        bundle.omitted.push(`${d.id} businessFlows[${d.businessFlows.length - 1}]`)
        d.businessFlows.pop()
      }
    }
    for (const d of rev) {
      if (!over()) break
      // ★ 마지막 1건은 남긴다 — 1순위 도메인의 claims 를 0 으로 만들면 pre-cite 페이로드가
      //   사라져 이 번들의 존재 이유가 무너진다(v1 이 고친 사고의 재발 방지).
      while (d.claims.length > 1 && over()) {
        bundle.omitted.push(`${d.id} claims[${d.claims.length - 1}]`)
        d.claims.pop()
      }
    }
  }
  trimAxisTo(A.screens.items, alloc.screens, AXIS_DEPTH.screens, bundle.omitted, (i) => `screen ${A.screens.items[i].id}`, (item) => {
    // 화면은 통째로 버리기 전에 annotation 부터 얇게 한다 — 1장이라도 남아야 삽입 지점을 가리킨다.
    // 단 마지막 annotation 은 남긴다(ann 0 인 화면은 삽입 지점을 못 가리켜 쓸모가 없다).
    const s = item as IntakeBundleScreen
    if (s.annotations.length <= 1) return null
    const note = `screen ${s.id} annotations[${s.annotations.length - 1}]`
    s.annotations.pop()
    return note
  })
  trimPolicyAxis(bundle, alloc.policy)
  trimAxisTo(A.rtm.items, alloc.rtm, AXIS_DEPTH.rtm, bundle.omitted, (i) => `rtm function ${A.rtm.items[i].id}`)
  trimAxisTo(A.data.crud.items, alloc.crud, AXIS_DEPTH.crud, bundle.omitted, (i) => `crud row ${A.data.crud.items[i].feature}`)
  trimAxisTo(A.data.schema.items, alloc.schema, AXIS_DEPTH.schema, bundle.omitted, (i) => `table ${A.data.schema.items[i].name}`)

  for (const k of Object.keys(AXIS_BUDGET) as AxisBudgetKey[]) {
    bundle.budget[k] = { demand: demand[k], allocated: alloc[k], used: 0, floor: AXIS_BUDGET[k].floor }
  }
  return alloc
}

/** 배분 실적의 `used` 를 트림 **최종** 상태로 채운다(백스톱이 더 깎았을 수 있다). */
function resyncBudget(bundle: IntakeInputBundle): void {
  const A = bundle.axes
  bundle.budget.domain.used = axisSize(A.domain.items, AXIS_DEPTH.domain)
  bundle.budget.schema.used = axisSize(A.data.schema.items, AXIS_DEPTH.schema)
  bundle.budget.crud.used = axisSize(A.data.crud.items, AXIS_DEPTH.crud)
  bundle.budget.rtm.used = axisSize(A.rtm.items, AXIS_DEPTH.rtm)
  bundle.budget.screens.used = axisSize(A.screens.items, AXIS_DEPTH.screens)
  bundle.budget.policy.used = axisSize(A.policy.items, AXIS_DEPTH.policy)
}

/** 트림 후 축 카운터를 실제 실린 수에 맞춘다(카운터가 거짓이면 §4.1 오독 방지가 무너진다). */
function resyncCounts(bundle: IntakeInputBundle): void {
  const sync = (axis: { selected: number; omittedCount: number; total: number; items: unknown[] }) => {
    const dropped = axis.selected - axis.items.length
    if (dropped > 0) axis.omittedCount += dropped
    axis.selected = axis.items.length
  }
  sync(bundle.axes.domain)
  sync(bundle.axes.data.schema)
  sync(bundle.axes.data.crud)
  sync(bundle.axes.rtm)
  sync(bundle.axes.screens)
  sync(bundle.axes.policy)
}

// ── 진입점 ───────────────────────────────────────────────────────────────────

/**
 * 근거 번들 v2 조립(P4) — 5축(도메인·데이터·추적표·**화면·정책**)을 요청 원문으로 사전 필터해
 * 유계 요약하고, 각 근거에 **pre-cite**(실제 스니펫)를 동봉한다.
 *
 * 최소집합 검사는 **호출자가 `checkMinimalSet` 으로 먼저** 한다(fail-closed exit 2 는 CLI 경계 책임).
 * 이 함수는 소스가 없으면 해당 축을 `present:false` 로 정직하게 표시하고 계속한다 —
 * 화면·정책은 최소집합이 아니므로 **부재해도 exit 2 가 아니다**(축소 모드, §10-1).
 */
export function buildIntakeInputBundle(sources: IntakeBundleSources, options: BuildIntakeInputOptions): IntakeInputBundle {
  const charCap = options.charCap ?? DEFAULT_BUNDLE_CHAR_CAP
  const tokens = tokenizeRequest(options.request)

  const domain = buildDomainAxis(sources.domainGraph, tokens)
  const crud = buildCrudAxis(sources.crudMatrix, tokens)
  // 도메인이 폴백이면 도메인 확장/조인을 끊는다 — 폴백 도메인의 기능 전부를 "요청 관련"으로
  // 딸려보내면 rtm·화면·정책 축이 폴백을 감춘다(폴백 세탁 방지).
  const domainJoin = domain.fallback === null ? domain.selectedKeys : new Set<string>()
  const rtm = buildRtmAxis(sources.rtm, tokens, domainJoin)
  const screens = buildScreensAxis(sources.screens ?? null, tokens, domainJoin)
  const policy = buildPolicyAxis(sources.policyDocs ?? null, tokens, domainJoin)
  // ★ 스키마는 **도메인·정책 다음에** 짓는다 — 테이블 관련도(언급 횟수)가 그 두 축의 근거
  //   텍스트에서 나오기 때문이다(`countMentions` 주석의 SIGNON 사고 참조).
  const mentionText = [
    ...domain.axis.items.flatMap((d) => [...d.entities, ...d.businessRules, d.summary ?? '', ...d.claims.map((c) => c.text)]),
    ...policy.axis.items.flatMap((p) => p.sections.flatMap((s) => s.rows.map((r) => r.cells.join(' ')))),
  ].join('\n')
  // ★ CRUD 가 폴백이면 그 행들은 **요청과 무관**하다 — 거기서 나온 테이블을 "요청 관련"으로
  //   내보내면 폴백이 세탁돼 스키마 축만 근거 있는 선정인 척한다. 조인을 끊어 스키마도
  //   정직하게 폴백시킨다(§7 C7 "필터 실패 시 상위 N + 정직한 생략 보고").
  const schema = buildSchemaAxis(
    sources.dbSchema,
    tokens,
    crud.fallback === null ? crud.touchedTables : new Map<string, number>(),
    mentionText,
  )

  const commits = {
    domainGraph: domain.axis.gitCommit,
    dbSchema: schema.axis.gitCommit,
    crudMatrix: crud.axis.gitCommit,
    rtm: rtm.axis.gitCommit,
    screens: screens.axis.gitCommit,
    policy: policy.axis.gitCommit,
    consistent: true,
    note: null as string | null,
  }
  // ★ 커밋 불일치는 **차단하지 않는다**(§10-2). 사실만 싣고 강등 규칙은 P5 소관.
  const present = [
    ['도메인', commits.domainGraph],
    ['스키마', commits.dbSchema],
    ['CRUD', commits.crudMatrix],
    ['추적표', commits.rtm],
    ['화면', commits.screens],
    ['정책', commits.policy],
  ].filter(([, c]) => c !== null) as [string, string][]
  const distinct = [...new Set(present.map(([, c]) => c))]
  commits.consistent = distinct.length <= 1
  if (!commits.consistent) {
    const newest = distinct.slice().sort(natCmp).join(' vs ')
    commits.note =
      `축 커밋 ${distinct.length}종 공존(${newest}) — 차단하지 않습니다. ` +
      `축별 커밋: ${present.map(([n, c]) => `${n}=${c.slice(0, 8)}`).join(' · ')}. ` +
      `서로 다른 커밋의 축은 낡았을 수 있습니다(이 축에 의존하는 결론은 [추정]으로 다루십시오).`
  }

  const warnings: string[] = []
  if (!crud.axis.present) warnings.push('CRUD 매트릭스(.spec/map/crud-matrix.json) 없음 — 기능↔테이블 접근을 "없음"으로 읽지 마십시오. 못 본 것입니다.')
  if (commits.note) warnings.push(commits.note)
  for (const a of [domain.axis, schema.axis, crud.axis, rtm.axis, screens.axis, policy.axis]) {
    if (a.present && a.evidence.total === 0) {
      warnings.push(`${a.source}: 항목 0건 — 근거율을 잴 것이 없습니다("근거 없음"이 아닙니다).`)
    }
  }
  // ★ §4.1 빈 산출물 오독 차단 — 행 0건 정책서를 **이름을 들어** 경고한다. jpetstore 실측:
  //   policy-authz.md·policy-validation.md 가 여기 걸린다(Stripes @Validate 미스캔).
  for (const d of policy.axis.items) {
    if (d.emptyArtifact) {
      warnings.push(
        `${d.relPath}: 데이터 행 **0건**(선언 evidenceRate=${d.declaredEvidenceRate ?? 'null'}) — ` +
          `"${d.title ?? d.docId}이(가) 없다"가 **아닙니다**. 스캐너가 못 본 것입니다(§4.1). ` +
          `이 문서를 근거로 "통제 없음"류 결론을 내지 마십시오.`,
      )
    }
  }

  // ★ 축소 모드(§10-1) — 화면·정책은 최소집합이 아니다. 부재해도 진행하되 **명시**한다.
  const omittedAxes: string[] = []
  if (!screens.axis.present) omittedAxes.push('화면(.understand-anything/screens.json)')
  if (!policy.axis.present) omittedAxes.push('정책(.understand-anything/doc-output/policy-*.md)')
  const reducedMode = {
    active: omittedAxes.length > 0,
    omittedAxes,
    note:
      omittedAxes.length > 0
        ? `축소 모드(§10-1) — 최소집합(도메인·데이터·추적표)은 갖췄으나 ${omittedAxes.join(' · ')} 축이 없어 생략했습니다. ` +
          `차단하지 않습니다. 다만 **생략된 축에 의존하는 결론은 [추정]으로 강등**하십시오 — ` +
          `"화면이 없다"·"정책이 없다"가 아니라 "못 봤다"입니다.`
        : null,
  }
  if (reducedMode.note) warnings.push(reducedMode.note)

  const fallbacks = [domain.fallback, schema.fallback, crud.fallback, rtm.fallback, screens.fallback, policy.fallback].filter(
    (f): f is string => f !== null,
  )
  const activeAxes = [domain.axis, schema.axis, crud.axis, rtm.axis, screens.axis, policy.axis].filter((a) => a.present).length
  const mode: 'token' | 'fallback' | 'mixed' =
    fallbacks.length === 0 ? 'token' : fallbacks.length >= activeAxes ? 'fallback' : 'mixed'

  const bundle: IntakeInputBundle = {
    schemaVersion: 2,
    request: { raw: options.request, tokens },
    filter: { mode, fallbacks },
    minimalSet: checkMinimalSet(sources),
    reducedMode,
    commits,
    axes: {
      domain: domain.axis,
      data: { schema: schema.axis, crud: crud.axis },
      rtm: rtm.axis,
      screens: screens.axis,
      policy: policy.axis,
    },
    omitted: [],
    charCap: { limit: charCap, exceeded: false },
    budget: {} as Record<AxisBudgetKey, AxisBudgetReport>,
    warnings,
  }

  // 1차: 축별 예산 배분(모든 축이 자기 pre-cite 코어를 지킨다). 2차: 전역 캡 백스톱.
  //
  // ★ **고정점 반복**인 이유: 봉투에는 `omitted[]` 가 들어있는데 그게 **트림하면서 자란다**
  //   (실측 187건 ≈ 10K = 예산의 17%). 1회만 배분하면 봉투를 과소평가해 백스톱이 돌고,
  //   백스톱은 **전역 우선순위**라 축별 공정성을 도로 무너뜨린다(실측 사고: domain 이 배분
  //   16,435 을 받고도 8,761 로 깎임 — claims 가 백스톱 우선순위 2번이라). 재배분하면
  //   커진 봉투를 반영해 **축별 공정성을 유지한 채** 수렴한다. omitted 는 단조 증가라 수렴 보장.
  for (let round = 0; round < 4; round++) {
    applyAxisBudget(bundle, charCap)
    if (serializeIntakeBundle(bundle).length <= charCap) break
  }
  trimToCharCap(bundle, charCap)
  resyncCounts(bundle)
  resyncBudget(bundle)
  return bundle
}
