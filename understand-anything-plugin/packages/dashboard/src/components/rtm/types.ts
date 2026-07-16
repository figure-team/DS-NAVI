/**
 * 요구사항 추적표(RTM) — 타입·상수·순수 헬퍼.
 * 설계: docs/ktds/RTM_TAB_DESIGN.md / W5: RTM_TEST_SCENARIO_DESIGN.md / P4·P6: RTM_STEP_FLOW_DESIGN.md.
 */
export type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
export type TestResult = "PASS" | "FAIL" | "NA" | "UNTESTED";
export type AcKind = "branch" | "precondition" | "postcondition" | "exception" | "rule";
export type RtmTab = "function" | "requirement" | "scenario" | "session" | "status";

export interface Evidence { file: string; line: number | null }
export interface TraceCell { value: string; confidence: Confidence; evidence: Evidence[] }
export interface TestRef { caseId: string; result: TestResult; defectId: string | null }
export interface AC { id: string; text: string; kind: AcKind; fnIds: string[]; confidence: Confidence; tests: TestRef[] }
export interface FnRule { reqId: string; acId: string; text: string; kind: AcKind; confidence: Confidence }
export interface FunctionRow {
  id: string; featureId: string; name: string; domainId: string; domainName: string;
  entryPoint: TraceCell; implementation: TraceCell; data: TraceCell; test: TraceCell;
  origin: "AS_IS" | "TO_BE"; state: "IMPLEMENTED" | "PARTIAL" | "PLANNED" | "CHANGED" | "ORPHANED";
  requirementHistory: string[]; nfrTags: string[]; rules: FnRule[]; deliverableRefs: { docId: string; anchor?: string }[];
  custom?: Record<string, string>;
}
/** W5 단위테스트 시나리오(결정론 생성 초안 — 확정은 _scenarios 오버레이). */
export interface TestScenario {
  id: string; fnId: string; reqId: string | null; acId: string | null;
  kind: "normal" | "exception" | "boundary";
  title: string; given: string; when: string; then: string;
  confidence: Confidence; evidence: Evidence[]; notes: string[];
}
/** R7 사용자 정의 필드 정의(_fields). */
export interface CustomField { id: string; label: string }
export interface DomainGroup { id: string; name: string; functionCount: number }
export interface Changeset { added: string[]; modified: string[]; removed: string[]; revived: string[] }
export interface Signoff { approved: boolean; by: string | null; at: string | null }
export interface Requirement {
  id: string; text: string; type: "functional" | "nonfunctional"; nfrCategory: string | null; nfrScope: string[];
  priority: "HIGH" | "MEDIUM" | "LOW"; lifecycle: string; status: "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
  supersedes: string | null; supersededBy: string | null; dependsOn: string[];
  source: { kind: string; raw: string; requester?: string; targetRelease?: string; section?: string; doc?: string; requestedAt?: string } | null;
  changeReq: { crNo: string | null; reason: string | null; approver: string | null; effort: string | null } | null;
  signoff: Signoff | null; acceptanceCriteria: AC[]; changeset: Changeset;
}
export interface Coverage {
  requirements: { total: number; implemented: number; verified: number; signedOff: number; byLifecycle: Record<string, number> };
  functions: { total: number; implemented: number; planned: number; orphaned: number; confirmed: number };
  tests: { total: number; pass: number; fail: number; untested: number };
  scenarios?: { total: number; confirmed: number; byKind: { normal: number; exception: number; boundary: number } };
  gaps: { unimplemented: string[]; orphanCode: string[]; unverified: string[] };
  byRequirement: Record<string, { targetsTotal: number; targetsBuilt: number; acsTotal: number; acsPassed: number }>;
}
export interface Diagnostic { level: "error" | "warn"; code: string; message: string; ref?: string }
export interface RtmModel {
  schemaVersion: number; gitCommit: string | null; domains: DomainGroup[]; functions: FunctionRow[];
  requirements: Requirement[]; testScenarios?: TestScenario[]; customFields?: CustomField[];
  coverage?: Coverage; diagnostics?: Diagnostic[];
}
export interface FnOverride { editedCells: Record<string, string>; approver: string; at: string }
export interface ReqOverride { lifecycle?: string; signoff?: Signoff | null; tests?: Record<string, { result: TestResult; defectId: string | null }>; approver?: string; at?: string }

export const APPROVER_LS_KEY = "ktds.approver";
export const GOLD = "var(--color-accent)";
// P5: 시맨틱 상태 토큰(모드별 값은 테마 엔진 MODE_EXTRAS).
export const OK = "var(--color-status-ok)", BAD = "var(--color-status-error)", WARN = "var(--color-status-warn)",
  NFR = "var(--color-status-info)", FAINT = "var(--color-border-medium)", GOLD_DIM = "var(--color-accent-dim)";

// pmpl-proto .conf 톤 — 근거확보=녹색 / 근거확보(추정)=청록 / 추정=주황 / 확인 필요=적색.
// 라벨은 components/confidence.ts 결정(자동판정 신뢰도는 사람 '확정'과 구분).
export const CONF: Record<Confidence, { label: string; color: string }> = {
  CONFIRMED: { label: "근거확보", color: OK },
  CONFIRMED_AI: { label: "근거확보(추정)", color: "var(--color-conf-ai)" },
  INFERRED: { label: "추정", color: WARN },
  UNVERIFIED: { label: "확인 필요", color: BAD },
};
/** 기계 판정 명시 — INFERRED 는 정적 분석 자동 판정(사람 확정 아님)임을 툴팁으로 알린다. */
export const CONF_TITLE: Partial<Record<Confidence, string>> = {
  CONFIRMED_AI: "AI 분석 판정 — 사람 확정 아님",
  INFERRED: "정적 분석 자동 판정 — 사람 확정 아님",
  UNVERIFIED: "근거 없음 — 확인 필요",
};
export const STATE_LABEL: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: "✅ 구현", PARTIAL: "🔁 부분", PLANNED: "⚠ 미구현", CHANGED: "~ 변경", ORPHANED: "🚫 고아",
};
export const STATE_COLOR: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: OK, PARTIAL: WARN, PLANNED: "var(--color-text-muted)", CHANGED: WARN, ORPHANED: BAD,
};
export const VERB: Record<keyof Changeset, { sym: string; label: string; color: string }> = {
  revived: { sym: "=", label: "부활", color: GOLD },
  added: { sym: "+", label: "신규", color: OK },
  modified: { sym: "~", label: "변경", color: WARN },
  removed: { sym: "−", label: "삭제", color: BAD },
};
export const AC_KIND: Record<AcKind, { label: string; color: string }> = {
  branch: { label: "분기", color: "#c8b76a" }, precondition: { label: "선행", color: NFR },
  postcondition: { label: "후행", color: OK }, exception: { label: "예외", color: "#d28fb0" }, rule: { label: "규칙", color: "var(--color-text-muted)" },
};
export const TS_KIND: Record<TestScenario["kind"], { label: string; color: string }> = {
  normal: { label: "정상", color: "var(--color-status-ok)" },
  exception: { label: "예외", color: "#d28fb0" },
  boundary: { label: "경계", color: "var(--color-status-warn)" },
};
export const TEST_RES: Record<TestResult, { label: string; color: string }> = {
  PASS: { label: "PASS", color: OK }, FAIL: { label: "FAIL", color: BAD }, NA: { label: "N/A", color: "var(--color-text-muted)" }, UNTESTED: { label: "미실행", color: "var(--color-text-muted)" },
};
export const LIFECYCLE_ORDER = ["RECEIVED", "ANALYZING", "DESIGNING", "DEVELOPING", "TESTING", "DONE", "HOLD", "REJECTED"];
export const LIFECYCLE_LABEL: Record<string, string> = { RECEIVED: "접수", ANALYZING: "분석", DESIGNING: "설계", DEVELOPING: "개발중", TESTING: "시험", DONE: "완료", HOLD: "보류", REJECTED: "반려" };
export const PRIORITY: Record<string, { label: string; color: string; bg: string }> = {
  HIGH: { label: "HIGH", color: "#e0a0a0", bg: "rgba(207,138,134,.13)" }, MEDIUM: { label: "MED", color: WARN, bg: "rgba(216,162,94,.12)" }, LOW: { label: "LOW", color: "var(--color-text-muted)", bg: "var(--color-elevated)" },
};
export const NFR_CAT: Record<string, string> = { performance: "성능", security: "보안", availability: "가용성", scalability: "확장성", usability: "사용성", maintainability: "유지보수성", compliance: "규정준수", other: "기타" };

export type CellKey = "entryPoint" | "implementation" | "data" | "test";
export const COLS: Array<{ key: CellKey; label: string }> = [
  { key: "entryPoint", label: "진입점" }, { key: "implementation", label: "구현" }, { key: "data", label: "데이터(CRUD)" }, { key: "test", label: "테스트" },
];
export const verbOf = (r: Requirement, fnId: string): keyof Changeset | null =>
  r.changeset.revived.includes(fnId) ? "revived" : r.changeset.added.includes(fnId) ? "added" : r.changeset.modified.includes(fnId) ? "modified" : r.changeset.removed.includes(fnId) ? "removed" : null;

export const BORDER = "1px solid var(--color-border-subtle)";

const REQ_RE = /^REQ-\d+/;
/** 요구사항이 속한 요청(REQ)ID 도출 — source.section(REQ-) → 자기 id 가 REQ- → 그 외 미분류. */
export const requestIdOf = (r: Requirement): string => {
  const sec = r.source?.section;
  if (sec && REQ_RE.test(sec)) return sec;
  if (REQ_RE.test(r.id)) return r.id;
  return "(미분류)";
};
export const UNGROUPED = "(미분류)";

// ── P4: 단계 인테이크(6단계 — 가이드 5단계 + ②영향분석) ───────────────────────
export interface RtmSession {
  /** 단계 체계 버전. 없음(undefined) = 구 5단계 세션 — 서버가 읽을 때 6단계로 마이그레이션한다
   *  (server/rtm-sessions.ts `migrateRtmSession`). 프론트에 도달하는 세션은 항상 마이그레이션 후다. */
  schemaVersion?: number;
  sid: string; request: string; producedStep: number; confirmedStep: number;
  targetStep: number; discarded: boolean;
  /** stale = 이전 단계 편집 뒤 재생성 안 된 산출(2026-07-17) — 서버 RtmSession.steps 주석 참조. */
  steps: Record<string, { status: string; stale?: boolean }>;
  /** 첫 실행 모델(null/부재=세션 기본) — 진행·개정은 서버가 이 값으로 이어간다(2026-07-16). */
  model?: string | null;
}
export interface SessionDoc { name: string; kind: string }

// ── P9: identified.json 근거 6축(프론트 사본) ────────────────────────────────
/**
 * 스키마 원본은 `ktds-legacy-plugin/packages/legacy-core/src/rtm/intake-types.ts`(P2).
 * legacy-core 는 대시보드의 의존이 아니므로 **필요한 필드만 재선언**한다 — 아래 `SessionRow`
 * (server/ 사본)·`ChangeImpactView` 의 `HistoryEntry`(impact-history 사본)와 같은 관례다.
 * 소비처가 읽기만 하므로 생산자 default 가 채우는 필드도 전부 optional 로 둔다(구 산출 방어).
 */
export interface IntakeEvidence extends Evidence { snippet?: string }
/** 화면 축 — screens.json 의 (screenId, annotationNo) 조인 키. annotationNo=null 은 화면 전체. */
export interface IntakeScreenRef { screenId: string; annotationNo?: number | null; note?: string }
/** 정책 축 — doc-output 의 `policy-*.md` 절/규칙 행. ruleId=null 은 절 전체. */
export interface IntakePolicyRef { doc: string; section?: string; ruleId?: string | null; note?: string }
export interface IntakeAC {
  id: string; text: string; kind?: AcKind; confidence?: Confidence; fnIds?: string[];
  /**
   * ★ 3상태다 — `undefined`=근거를 기록하지 않는 스키마 시대의 산출(**못 봄**) / `[]`=찾았는데
   * 없음(**없음**) / `[…]`=근거 있음. intake-types.ts `CitationField` 주석이 이 계약의 원본이고,
   * 화면도 이 셋을 서로 다르게 그려야 한다(RTM_IMPACT_GATE_DESIGN.md §4.1 "없음 vs 못 봄").
   */
  evidence?: IntakeEvidence[];
  screenRefs?: IntakeScreenRef[];
  policyRefs?: IntakePolicyRef[];
}
export interface IntakeChangeset extends Partial<Changeset> { evidence?: IntakeEvidence[] }
export interface IntakeRequirement {
  id: string; category: string; name: string; priority?: string; derivedFrom?: string | null;
  acceptanceCriteria?: IntakeAC[]; changeset?: IntakeChangeset;
  screenRefs?: IntakeScreenRef[]; policyRefs?: IntakePolicyRef[];
}
// ── A1 질문(RTM_INTAKE_ANSWER_DESIGN.md §3.1) ────────────────────────────────
export type IntakeQuestionAxis =
  | "screen" | "policy" | "domain" | "data" | "code" | "rtm" | "general";
/**
 * ① `[확인필요]` 질문 1건. legacy-core `intake-types.ts` `IntakeQuestionSchema` 의 화면쪽 짝이다.
 * **타입을 복제하는 이유**: 대시보드는 legacy-core 를 import 하지 않는다(별 패키지 · 브라우저 번들).
 * 계약이 갈리지 않게 필드는 저쪽 스키마를 단일 원본으로 보고 따라간다.
 */
export interface IntakeQuestion {
  id: string;
  text: string;
  targetReqId?: string | null;
  axis?: IntakeQuestionAxis | null;
  /** null/부재 = 미답. 미답이 컨펌을 막지는 않는다(설계 D2). */
  answer?: string | null;
  answeredAt?: string | null;
}

/** GET /rtm-intake-doc?name=identified.json 응답 본문. */
export interface Identified {
  request?: { id: string; name: string };
  requirements?: IntakeRequirement[];
  /**
   * 구형(문자열)·신형(객체) **혼재**이고 객체도 **필드가 빠져 있을 수 있다**(`Partial`) — 프론트는
   * identified.json 을 **날것으로** 읽으므로(useIntake `loadIdentified` 가 JSON.parse) legacy-core 의
   * 정규화·검증을 못 거친다. 여기를 `IntakeQuestion[]` 로 적으면 **타입이 거짓말**을 한다(디스크엔
   * id 없는 객체가 실재하고, 그래서 정규화기가 id 를 합성한다). 화면은 `normalizeQuestions` 를 거친다.
   */
  questions?: Array<string | Partial<IntakeQuestion>>;
}

/** 질문 축 라벨 — 화면 배지. 근거 번들 6축 어휘 + general(축에 안 걸리는 요청 자체의 모호함). */
export const QUESTION_AXIS: Record<IntakeQuestionAxis, string> = {
  screen: "화면",
  policy: "정책",
  domain: "도메인",
  data: "데이터",
  code: "코드영향",
  rtm: "추적표",
  general: "요청",
};

// ── A2: 답변 원장(GET /rtm-intake-doc?name=qa-history.json · 설계 §3.2) ───────
/** 문답 1건 — 질문 원문을 함께 실어 "그때 뭘 묻고 답했나"가 개정에 흔들리지 않는다. */
export interface QaEntry { qid: string; question: string; answer: string }
/** 답변 제출 1회(여러 질문 일괄) = revision 1건. */
export interface QaRevision { rev: number; answeredAt: string; qas: QaEntry[] }
/**
 * 답변의 **영속 진실원본**. identified.json 의 `questions[].answer` 는 개정이 성공해야 채워지므로,
 * 화면은 이 원장으로 "제출했으나 아직 반영 안 된 답"을 안다(개정 실패·새로고침에도 안 사라진다).
 */
export interface QaHistory { revisions?: QaRevision[] }

/** 원장에서 qid → 최신 답변을 뽑는다(같은 질문에 여러 번 답했으면 마지막이 이긴다). */
export function latestAnswers(h: QaHistory | null): Map<string, QaEntry> {
  const out = new Map<string, QaEntry>();
  for (const rev of h?.revisions ?? []) {
    for (const qa of rev?.qas ?? []) if (qa?.qid) out.set(qa.qid, qa);
  }
  return out;
}

/**
 * 구형 문자열 질문 → 객체 정규화. legacy-core `QuestionsField` preprocess 와 **같은 규칙**
 * (인덱스 기반 `Q-N` 합성, 이미 있는 id 는 보존)이라 서버가 굳힌 id 와 화면이 보는 id 가 일치한다.
 * 둘이 갈리면 답변 POST 의 `qid` 가 엉뚱한 질문에 붙는다 — 그래서 규칙을 베낀다(§3.1 주석 참조).
 *
 * **`null` 을 돌려주는 경우 = 질문을 못 읽음**(`questions` 가 배열이 아님 — 손상). `[]` 와 갈라야
 * 한다: `[]` 에는 "모호함 없음 → 인터뷰 블록 숨기고 통과"라는 **의미가 있어서**(§6), 손상을 `[]` 로
 * 뭉개면 **"질문 없음"으로 위장**한다(불변식 "없음 vs 못 봄"). 프론트는 identified.json 을 날것으로
 * 읽어 legacy-core 검증을 못 거치므로 방어선이 여기뿐이다.
 */
export function normalizeQuestions(qs: Identified["questions"]): IntakeQuestion[] | null {
  if (qs === undefined || qs === null) return []; // 부재 = 질문 없음(정직한 empty)
  if (!Array.isArray(qs)) return null; // 있는데 모양이 틀림 = 못 읽음
  return qs.map((q, i) => {
    const id = `Q-${i + 1}`;
    if (typeof q === "string") return { id, text: q, answer: null, answeredAt: null };
    return { ...q, id: q?.id ? q.id : id, text: q?.text ?? "" };
  });
}
/**
 * 정책 축 → 문서 뷰어 링크. `/policy` 에는 문서 단위 딥링크 파라미터가 없고(탭 `?tab=cat|dom|rec`
 * 뿐), 정책서 본문은 `/deliverables/:docId` 가 연다 — PolicyView 자신이 그렇게 링크한다
 * (PolicyView.tsx:473). doc-list 의 docId 는 확장자 없는 파일명이다(vite.config.ts `docOutputIds`).
 */
export const policyDocId = (doc: string): string => doc.replace(/\.md$/, "");

// ── W5: ① 코드영향 검증 인라인 (RTM_INTAKE_WORKSPACE_DESIGN.md §2.3) ─────────
/**
 * `<session>/impact-run.json` — ①의 코드영향 검증 **포인터**(P6, rtm-intake.mjs:703-722).
 * 산출 본체가 아니다: 결과는 `impact-history/<jobId>/impact.json` 스냅샷에 있고 원장에도
 * `rootSlot:false` · `query=요청 원문`으로 기록된다. 루트 슬롯(`.spec/map/impact.json`)은
 * 건드리지 않는다 — §2.3 "한 번 돌리고 두 곳에서 본다"(워크스페이스 ① 인라인 · `/change` 원장).
 * 스키마 원본은 legacy-core(대시보드 의존 아님)라 여기서도 **필요한 필드만 재선언**한다.
 */
export interface ImpactRun {
  jobId: string; requestId: string; query: string; gitCommit: string | null;
  /** 시드 범위 — 현재는 `entryPoint` 고정(rtm-seeds.ts 주석: implementation 은 시드 폭발). */
  seedScope: string;
  seeds: { relPath: string; origin: string; confidence: string }[];
  /** fnId → 그 flow 가 기여한 시드 파일. 시드의 출처(어느 기능이 끌어왔나)를 보이는 축. */
  bySource: { fnId: string; relPaths: string[] }[];
  /** 정직한 생략(§6.2) — 조용히 떨구지 않고 화면에도 그대로 옮긴다. */
  skippedToBe: string[]; unknownFnIds: string[]; ungroundedFnIds: string[];
}
export interface ImpactCitation { filePath: string; line: number }
/** citation=null 은 경로 병합 등으로 근거 라인을 못 짚은 정상 상태(ChangeImpactView:43). */
export interface ImpactFileRef { relPath: string; minDepth?: number; citation?: ImpactCitation | null }
/** GET /impact-history-item?id=&name=impact.json 중 인라인이 쓰는 필드만(`ImpactData` 사본). */
export interface ImpactSnapshot {
  upstream?: {
    files?: ImpactFileRef[];
    api?: { id: string; filePath: string; line: number; handler?: string; confidence?: string }[];
    flows?: { flowId: string; domainId: string; confidence?: string }[];
    domains?: { domainId: string; key: string; name: string; confidence?: string }[];
    persistence?: { mappers?: { namespace: string; relPath: string; citation?: ImpactCitation | null }[] };
  };
  downstream?: { files?: ImpactFileRef[] };
}

/** 신규(TO-BE) 기능 id 접두 — 아직 파일이 없어 시드가 못 된다(legacy-core rtm-seeds.ts:47). */
export const TO_BE_FN_PREFIX = "to-be:";
/**
 * 포인터 부재의 두 원인을 가른다 — `code-impact` 는 **시드가 0이면 impact-run.json 을 쓰지 않고
 * 종료**한다(rtm-intake.mjs:645-650). 그래서 파일 부재만으로는 "아직 안 돌렸다"와 "돌릴 게 없다"가
 * 구별되지 않는다. `changeset.modified` 로 되짚으면 갈린다(resolveFlowSeeds 와 같은 규칙:
 * `to-be:` 는 파일이 없어 제외 — rtm-seeds.ts:85).
 *
 * 둘을 "영향 없음" 한 문구로 뭉치면 **미실행이 "영향 없음"으로 위장**한다 — §4.1 "없음 vs 못 봄"이
 * 경고한 바로 그 오독이고, ②는 컨펌 직전 판단 자리라 대가가 크다.
 */
export const impactAbsenceOf = (identified: Identified | null): "notRun" | "notApplicable" => {
  const modified = (identified?.requirements ?? []).flatMap((r) => r.changeset?.modified ?? []);
  return modified.some((id) => !id.startsWith(TO_BE_FN_PREFIX)) ? "notRun" : "notApplicable";
};

/**
 * W2: GET /rtm-intake-sessions 원장 행 — server/rtm-sessions.ts 의 `RtmSessionSummary` 프론트 사본.
 * server/ 는 Node 전용(fs/path)이라 src/ 에서 import 하지 않는다 — ChangeImpactView 의 `HistoryEntry`
 * (impact-history 응답)와 동일 관례. 설계: RTM_INTAKE_WORKSPACE_DESIGN.md §3(N1).
 * `running` 은 목록 전체에서 최대 1건만 true — 전역 뮤텍스라 큐가 없다(§4 C1).
 */
export interface SessionRow {
  sid: string; request: string; createdAt: string;
  producedStep: number; confirmedStep: number; targetStep: number;
  discarded: boolean; running: boolean;
}
/**
 * 원장 행의 상태 — C1 을 오해시키지 않는 것이 이 함수의 존재 이유다. 동시 실행이 전역 1개이므로
 * 미완 세션은 **대기가 아니라 중단됨**이고(큐가 없다), 완료는 ⑥ RTM 반영뿐이다(IntakePanel ps===6).
 */
export const sessionStateOf = (s: SessionRow): "discarded" | "running" | "done" | "stopped" =>
  s.discarded ? "discarded" : s.running ? "running" : s.producedStep >= 6 ? "done" : "stopped";
export const SESSION_STATE: Record<ReturnType<typeof sessionStateOf>, { label: string; tone: "ok" | "warn" | "mut"; title: string }> = {
  running: { label: "진행 중", tone: "warn", title: "지금 실행 중 — 동시 실행은 전역 1건뿐입니다." },
  done: { label: "완료", tone: "ok", title: "⑥ RTM 반영까지 완료 — 요청 기준 탭에서 결과를 봅니다." },
  stopped: { label: "중단됨", tone: "mut", title: "실행 중이 아닙니다 — 대기열이 아니라 멈춘 상태입니다(동시 실행 1건). 선택해 이어서 진행하세요." },
  discarded: { label: "폐기", tone: "mut", title: "폐기된 세션 — 산출물은 디스크에 남아 있으나 진행할 수 없습니다." },
};
/** ISO → "MM-DD HH:mm"(로컬) — 원장 목록용 축약(ChangeImpactView fmtTime 과 동형). */
export const fmtSessionTime = (iso: string): string =>
  iso ? new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
/**
 * 6단계(2026-07-16 사용자 결정) — ②영향분석이 ① 안에서 나와 독립 단계가 됐다.
 *
 * 왜 6번째가 아니라 ②인가: 단계 게이트의 존재 이유는 "깊은 작업 전에 얕은 범위를 사용자가 먼저
 * 확정"(RTM_STEP_FLOW_DESIGN.md §2)인데 종전 ①이 가장 깊은 작업(impact 엔진 BFS)을 품고 있었다.
 * 영향분석은 ①의 changeset.modified 를 입력으로 쓰고 ③④⑤ 문서가 그 위에 쓰이므로 자리는 ①과 ③
 * 사이다. RTM_IMPACT_GATE_DESIGN.md §6.5 가 "외부 가이드 5단계에 앵커돼 있다"는 이유로 6단계화를
 * 반려했으나, 그 가이드를 실제로 읽어 보니 ①은 **고객 인터뷰로 모호함 제거**(담당 "PM·PL")이고
 * 가이드 전체에 "영향"·"impact" 언급이 **0건**이었다 — 반려 근거가 사실과 반대였다(§6.5 개정 참조).
 */
export const STEP_DEFS: { n: number; label: string }[] = [
  { n: 1, label: "식별" }, { n: 2, label: "영향분석" }, { n: 3, label: "목록표" },
  { n: 4, label: "정의서" }, { n: 5, label: "명세서" }, { n: 6, label: "RTM" },
];
export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
/** 표시용 frontmatter 제거(메타는 배지로, 본문엔 불필요). */
export const stripFrontmatter = (md: string) => md.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
/** 문서(.md) 산출 단계 → 종류. ①은 identified.json · ②는 impact-run.json · ⑥은 rtm.json 이라 없다. */
export const STEP_DOC_KIND: Record<number, string> = { 3: "list", 4: "definition", 5: "spec" };

export function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }
