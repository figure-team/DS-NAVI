/**
 * 요구사항 추적표(RTM) — 타입·상수·순수 헬퍼.
 * 설계: docs/ktds/RTM_TAB_DESIGN.md / W5: RTM_TEST_SCENARIO_DESIGN.md / P4·P6: RTM_STEP_FLOW_DESIGN.md.
 */
export type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
export type TestResult = "PASS" | "FAIL" | "NA" | "UNTESTED";
export type AcKind = "branch" | "precondition" | "postcondition" | "exception" | "rule";
export type RtmTab = "function" | "requirement" | "scenario" | "status";

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
export const STEP_DEFS: { n: number; label: string }[] = [
  { n: 1, label: "식별" }, { n: 2, label: "목록표" }, { n: 3, label: "정의서" }, { n: 4, label: "명세서" }, { n: 5, label: "RTM" },
];
export const CIRCLED = ["①", "②", "③", "④", "⑤"];
/** 표시용 frontmatter 제거(메타는 배지로, 본문엔 불필요). */
export const stripFrontmatter = (md: string) => md.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
export const STEP_DOC_KIND: Record<number, string> = { 2: "list", 3: "definition", 4: "spec" };

export function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }
