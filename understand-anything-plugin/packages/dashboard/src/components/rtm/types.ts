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

// ── P4: 단계 인테이크(가이드 5단계) ───────────────────────────────────────────
export interface RtmSession {
  sid: string; request: string; producedStep: number; confirmedStep: number;
  targetStep: number; discarded: boolean; steps: Record<string, { status: string }>;
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
/** GET /rtm-intake-doc?name=identified.json 응답 본문. */
export interface Identified {
  request?: { id: string; name: string };
  requirements?: IntakeRequirement[];
  questions?: string[];
}
/**
 * 정책 축 → 문서 뷰어 링크. `/policy` 에는 문서 단위 딥링크 파라미터가 없고(탭 `?tab=cat|dom|rec`
 * 뿐), 정책서 본문은 `/deliverables/:docId` 가 연다 — PolicyView 자신이 그렇게 링크한다
 * (PolicyView.tsx:473). doc-list 의 docId 는 확장자 없는 파일명이다(vite.config.ts `docOutputIds`).
 */
export const policyDocId = (doc: string): string => doc.replace(/\.md$/, "");

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
 * 미완 세션은 **대기가 아니라 중단됨**이고(큐가 없다), 완료는 ⑤ RTM 반영뿐이다(IntakePanel ps===5).
 */
export const sessionStateOf = (s: SessionRow): "discarded" | "running" | "done" | "stopped" =>
  s.discarded ? "discarded" : s.running ? "running" : s.producedStep >= 5 ? "done" : "stopped";
export const SESSION_STATE: Record<ReturnType<typeof sessionStateOf>, { label: string; tone: "ok" | "warn" | "mut"; title: string }> = {
  running: { label: "진행 중", tone: "warn", title: "지금 실행 중 — 동시 실행은 전역 1건뿐입니다." },
  done: { label: "완료", tone: "ok", title: "⑤ RTM 반영까지 완료 — 요청 기준 탭에서 결과를 봅니다." },
  stopped: { label: "중단됨", tone: "mut", title: "실행 중이 아닙니다 — 대기열이 아니라 멈춘 상태입니다(동시 실행 1건). 선택해 이어서 진행하세요." },
  discarded: { label: "폐기", tone: "mut", title: "폐기된 세션 — 산출물은 디스크에 남아 있으나 진행할 수 없습니다." },
};
/** ISO → "MM-DD HH:mm"(로컬) — 원장 목록용 축약(ChangeImpactView fmtTime 과 동형). */
export const fmtSessionTime = (iso: string): string =>
  iso ? new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
export const STEP_DEFS: { n: number; label: string }[] = [
  { n: 1, label: "식별" }, { n: 2, label: "목록표" }, { n: 3, label: "정의서" }, { n: 4, label: "명세서" }, { n: 5, label: "RTM" },
];
export const CIRCLED = ["①", "②", "③", "④", "⑤"];
/** 표시용 frontmatter 제거(메타는 배지로, 본문엔 불필요). */
export const stripFrontmatter = (md: string) => md.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
export const STEP_DOC_KIND: Record<number, string> = { 2: "list", 3: "definition", 4: "spec" };

export function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }
