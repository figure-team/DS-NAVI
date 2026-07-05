import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDashboardStore } from "../store";
import TrustBadge from "./TrustBadge";

/**
 * 요구사항 추적표(RTM) v2 뷰 — 설계: docs/ktds/RTM_TAB_DESIGN.md / W5: RTM_TEST_SCENARIO_DESIGN.md.
 *
 * 탭 4개: ① 기능 기준(도메인 그리드) ② 요청 기준(요청 REQ → 요구사항 → AC, supersede·NFR)
 * ③ 시험(W5 단위테스트 시나리오 — 초안 편집·확정) ④ 현황(커버리지·갭).
 * 생성물 rtm.json 불변, 사람 입력은 rtm-overrides.json 오버레이(기능=최상위 fnId, 요구=_requirements,
 * 시나리오=_scenarios, 사용자 필드 정의=_fields).
 * 검증 스파인 입력: 기능 셀 확정(POST /rtm-override) · 요구 시험결과/검수/lifecycle(POST /rtm-req-override)
 * · 시나리오 확정(POST /rtm-scenario-override) · 필드 정의(POST /rtm-field, R7).
 */
type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
type TestResult = "PASS" | "FAIL" | "NA" | "UNTESTED";
type AcKind = "branch" | "precondition" | "postcondition" | "exception" | "rule";

interface Evidence { file: string; line: number | null }
interface TraceCell { value: string; confidence: Confidence; evidence: Evidence[] }
interface TestRef { caseId: string; result: TestResult; defectId: string | null }
interface AC { id: string; text: string; kind: AcKind; fnIds: string[]; confidence: Confidence; tests: TestRef[] }
interface FnRule { reqId: string; acId: string; text: string; kind: AcKind; confidence: Confidence }
interface FunctionRow {
  id: string; featureId: string; name: string; domainId: string; domainName: string;
  entryPoint: TraceCell; implementation: TraceCell; data: TraceCell; test: TraceCell;
  origin: "AS_IS" | "TO_BE"; state: "IMPLEMENTED" | "PARTIAL" | "PLANNED" | "CHANGED" | "ORPHANED";
  requirementHistory: string[]; nfrTags: string[]; rules: FnRule[]; deliverableRefs: { docId: string; anchor?: string }[];
  custom?: Record<string, string>;
}
/** W5 단위테스트 시나리오(결정론 생성 초안 — 확정은 _scenarios 오버레이). */
interface TestScenario {
  id: string; fnId: string; reqId: string | null; acId: string | null;
  kind: "normal" | "exception" | "boundary";
  title: string; given: string; when: string; then: string;
  confidence: Confidence; evidence: Evidence[]; notes: string[];
}
/** R7 사용자 정의 필드 정의(_fields). */
interface CustomField { id: string; label: string }
interface DomainGroup { id: string; name: string; functionCount: number }
interface Changeset { added: string[]; modified: string[]; removed: string[]; revived: string[] }
interface Signoff { approved: boolean; by: string | null; at: string | null }
interface Requirement {
  id: string; text: string; type: "functional" | "nonfunctional"; nfrCategory: string | null; nfrScope: string[];
  priority: "HIGH" | "MEDIUM" | "LOW"; lifecycle: string; status: "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
  supersedes: string | null; supersededBy: string | null; dependsOn: string[];
  source: { kind: string; raw: string; requester?: string; targetRelease?: string; section?: string; doc?: string; requestedAt?: string } | null;
  changeReq: { crNo: string | null; reason: string | null; approver: string | null; effort: string | null } | null;
  signoff: Signoff | null; acceptanceCriteria: AC[]; changeset: Changeset;
}
interface Coverage {
  requirements: { total: number; implemented: number; verified: number; signedOff: number; byLifecycle: Record<string, number> };
  functions: { total: number; implemented: number; planned: number; orphaned: number; confirmed: number };
  tests: { total: number; pass: number; fail: number; untested: number };
  scenarios?: { total: number; confirmed: number; byKind: { normal: number; exception: number; boundary: number } };
  gaps: { unimplemented: string[]; orphanCode: string[]; unverified: string[] };
  byRequirement: Record<string, { targetsTotal: number; targetsBuilt: number; acsTotal: number; acsPassed: number }>;
}
interface Diagnostic { level: "error" | "warn"; code: string; message: string; ref?: string }
interface RtmModel {
  schemaVersion: number; gitCommit: string | null; domains: DomainGroup[]; functions: FunctionRow[];
  requirements: Requirement[]; testScenarios?: TestScenario[]; customFields?: CustomField[];
  coverage?: Coverage; diagnostics?: Diagnostic[];
}
interface FnOverride { editedCells: Record<string, string>; approver: string; at: string }
interface ReqOverride { lifecycle?: string; signoff?: Signoff | null; tests?: Record<string, { result: TestResult; defectId: string | null }>; approver?: string; at?: string }

const APPROVER_LS_KEY = "ktds.approver";
const GOLD = "var(--color-accent)";
// P5: 시맨틱 상태 토큰(모드별 값은 테마 엔진 MODE_EXTRAS).
const OK = "var(--color-status-ok)", BAD = "var(--color-status-error)", WARN = "var(--color-status-warn)",
  NFR = "var(--color-status-info)", FAINT = "var(--color-border-medium)", GOLD_DIM = "var(--color-accent-dim)";

const CONF: Record<Confidence, { label: string; color: string }> = {
  CONFIRMED: { label: "확정", color: "var(--color-text-muted)" },
  CONFIRMED_AI: { label: "확정·AI", color: "var(--color-text-muted)" },
  INFERRED: { label: "추정", color: WARN },
  UNVERIFIED: { label: "확인필요", color: BAD },
};
const STATE_LABEL: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: "✅ 구현", PARTIAL: "🔁 부분", PLANNED: "⚠ 미구현", CHANGED: "~ 변경", ORPHANED: "🚫 고아",
};
const STATE_COLOR: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: OK, PARTIAL: WARN, PLANNED: "var(--color-text-muted)", CHANGED: WARN, ORPHANED: BAD,
};
const VERB: Record<keyof Changeset, { sym: string; label: string; color: string }> = {
  revived: { sym: "=", label: "부활", color: GOLD },
  added: { sym: "+", label: "신규", color: OK },
  modified: { sym: "~", label: "변경", color: WARN },
  removed: { sym: "−", label: "삭제", color: BAD },
};
const AC_KIND: Record<AcKind, { label: string; color: string }> = {
  branch: { label: "분기", color: "#c8b76a" }, precondition: { label: "선행", color: NFR },
  postcondition: { label: "후행", color: OK }, exception: { label: "예외", color: "#d28fb0" }, rule: { label: "규칙", color: "var(--color-text-muted)" },
};
const TS_KIND: Record<TestScenario["kind"], { label: string; color: string }> = {
  normal: { label: "정상", color: "var(--color-status-ok)" },
  exception: { label: "예외", color: "#d28fb0" },
  boundary: { label: "경계", color: "var(--color-status-warn)" },
};
const TEST_RES: Record<TestResult, { label: string; color: string }> = {
  PASS: { label: "PASS", color: OK }, FAIL: { label: "FAIL", color: BAD }, NA: { label: "N/A", color: "var(--color-text-muted)" }, UNTESTED: { label: "미실행", color: "var(--color-text-muted)" },
};
const LIFECYCLE_ORDER = ["RECEIVED", "ANALYZING", "DESIGNING", "DEVELOPING", "TESTING", "DONE", "HOLD", "REJECTED"];
const LIFECYCLE_LABEL: Record<string, string> = { RECEIVED: "접수", ANALYZING: "분석", DESIGNING: "설계", DEVELOPING: "개발중", TESTING: "시험", DONE: "완료", HOLD: "보류", REJECTED: "반려" };
const PRIORITY: Record<string, { label: string; color: string; bg: string }> = {
  HIGH: { label: "HIGH", color: "#e0a0a0", bg: "rgba(207,138,134,.13)" }, MEDIUM: { label: "MED", color: WARN, bg: "rgba(216,162,94,.12)" }, LOW: { label: "LOW", color: "var(--color-text-muted)", bg: "var(--color-elevated)" },
};
const NFR_CAT: Record<string, string> = { performance: "성능", security: "보안", availability: "가용성", scalability: "확장성", usability: "사용성", maintainability: "유지보수성", compliance: "규정준수", other: "기타" };

type CellKey = "entryPoint" | "implementation" | "data" | "test";
const COLS: Array<{ key: CellKey; label: string }> = [
  { key: "entryPoint", label: "진입점" }, { key: "implementation", label: "구현" }, { key: "data", label: "데이터(CRUD)" }, { key: "test", label: "테스트" },
];
const evidenceTitle = (c: TraceCell) => (c.evidence.length === 0 ? undefined : c.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join("\n"));
const verbOf = (r: Requirement, fnId: string): keyof Changeset | null =>
  r.changeset.revived.includes(fnId) ? "revived" : r.changeset.added.includes(fnId) ? "added" : r.changeset.modified.includes(fnId) ? "modified" : r.changeset.removed.includes(fnId) ? "removed" : null;

const BORDER = "1px solid var(--color-border-subtle)";

const REQ_RE = /^REQ-\d+/;
/** 요구사항이 속한 요청(REQ)ID 도출 — source.section(REQ-) → 자기 id 가 REQ- → 그 외 미분류. */
const requestIdOf = (r: Requirement): string => {
  const sec = r.source?.section;
  if (sec && REQ_RE.test(sec)) return sec;
  if (REQ_RE.test(r.id)) return r.id;
  return "(미분류)";
};
const UNGROUPED = "(미분류)";

// ── P4: 단계 인테이크(가이드 5단계) ───────────────────────────────────────────
interface RtmSession {
  sid: string; request: string; producedStep: number; confirmedStep: number;
  targetStep: number; discarded: boolean; steps: Record<string, { status: string }>;
}
interface SessionDoc { name: string; kind: string }
const STEP_DEFS: { n: number; label: string }[] = [
  { n: 1, label: "식별" }, { n: 2, label: "목록표" }, { n: 3, label: "정의서" }, { n: 4, label: "명세서" }, { n: 5, label: "RTM" },
];
const CIRCLED = ["①", "②", "③", "④", "⑤"];
/** 표시용 frontmatter 제거(메타는 배지로, 본문엔 불필요). */
const stripFrontmatter = (md: string) => md.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
/** 다크 테마 마크다운 컴포넌트(GFM 표 포함) — DocsView 와 동일 패턴(태그별 타이핑). */
const MD = {
  h1: (p: ComponentPropsWithoutRef<"h1">) => <h1 style={{ fontSize: 17, color: "var(--color-text-primary)", margin: "2px 0 12px", fontFamily: "var(--font-heading)" }} {...p} />,
  h2: (p: ComponentPropsWithoutRef<"h2">) => <h2 style={{ fontSize: 14, color: "var(--color-accent)", margin: "18px 0 9px", paddingBottom: 4, borderBottom: "1px solid var(--color-border-subtle)" }} {...p} />,
  h3: (p: ComponentPropsWithoutRef<"h3">) => <h3 style={{ fontSize: 12.5, color: "var(--color-text-primary)", margin: "13px 0 7px" }} {...p} />,
  h4: (p: ComponentPropsWithoutRef<"h4">) => <h4 style={{ fontSize: 12, color: "var(--color-text-primary)", margin: "11px 0 6px" }} {...p} />,
  p: (p: ComponentPropsWithoutRef<"p">) => <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "7px 0" }} {...p} />,
  ul: (p: ComponentPropsWithoutRef<"ul">) => <ul style={{ margin: "7px 0", paddingLeft: 18, listStyle: "disc" }} {...p} />,
  ol: (p: ComponentPropsWithoutRef<"ol">) => <ol style={{ margin: "7px 0", paddingLeft: 18, listStyle: "decimal" }} {...p} />,
  li: (p: ComponentPropsWithoutRef<"li">) => <li style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "2px 0" }} {...p} />,
  table: (p: ComponentPropsWithoutRef<"table">) => <div style={{ overflowX: "auto", margin: "8px 0" }}><table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }} {...p} /></div>,
  th: (p: ComponentPropsWithoutRef<"th">) => <th style={{ border: BORDER, padding: "5px 9px", background: "var(--color-elevated)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap" }} {...p} />,
  td: (p: ComponentPropsWithoutRef<"td">) => <td style={{ border: BORDER, padding: "5px 9px", color: "var(--color-text-secondary)", verticalAlign: "top" }} {...p} />,
  code: (p: ComponentPropsWithoutRef<"code">) => <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-elevated)", padding: "1px 4px", borderRadius: 4 }} {...p} />,
  blockquote: (p: ComponentPropsWithoutRef<"blockquote">) => <blockquote style={{ borderLeft: `2px solid ${WARN}`, margin: "8px 0", padding: "2px 0 2px 11px", color: "var(--color-text-muted)", fontSize: 12 }} {...p} />,
  a: (p: ComponentPropsWithoutRef<"a">) => <a style={{ color: "var(--color-accent)" }} {...p} />,
};
const STEP_DOC_KIND: Record<number, string> = { 2: "list", 3: "definition", 4: "spec" };

export default function RtmView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);
  // demo 모드: 정적 파일을 base(`/demo/`) 아래에서 읽고, 쓰기(편집·인테이크)는 비활성.
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL; // "/demo/" (demo) | "/" (라이브 서버)
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken) && !DEMO_MODE;

  // P5 잔여 해소: 인테이크 세션(?sid=)·요구 상세(?req=)를 URL로 — 새로고침·딥링크 복원.
  const [searchParams, setSearchParams] = useSearchParams();
  const [model, setModel] = useState<RtmModel | null>(null);
  const [fnOv, setFnOv] = useState<Record<string, FnOverride>>({});
  const [reqOv, setReqOv] = useState<Record<string, ReqOverride>>({});
  // W5/R7: 시나리오 오버레이(_scenarios) · 사용자 필드 정의(_fields — 라이브 원본).
  const [scOv, setScOv] = useState<Record<string, FnOverride>>({});
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldsLive, setFieldsLive] = useState(false); // 오버레이 로드 성공 = _fields 가 진실.
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"function" | "requirement" | "scenario" | "status">("function");
  const [selFn, setSelFn] = useState<string | null>(null);
  const [selReq, setSelReq] = useState<string | null>(null);
  const [selTs, setSelTs] = useState<string | null>(null);
  const [tsEditing, setTsEditing] = useState(false);
  const [tsDraft, setTsDraft] = useState<Record<string, string>>({});
  const [tsSaving, setTsSaving] = useState(false);
  const [tsSaveError, setTsSaveError] = useState<string | null>(null);
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadModel = useCallback(() => {
    setError(null);
    fetch(`${dataBase}rtm.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: RtmModel) => { if (Array.isArray(data?.functions)) setModel(data); else setError("rtm.json 형식 오류"); })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
    // 404/미존재는 null — "빈 오버레이(라이브)"와 구분해 _fields 폴백이 살아있게(리뷰 R2).
    fetch(`${dataBase}rtm-overrides.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const raw = data as Record<string, unknown>;
          const reqs = (raw._requirements && typeof raw._requirements === "object" ? raw._requirements : {}) as Record<string, ReqOverride>;
          const scs = (raw._scenarios && typeof raw._scenarios === "object" ? raw._scenarios : {}) as Record<string, FnOverride>;
          const fns: Record<string, FnOverride> = {};
          for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) fns[k] = v as FnOverride;
          setFnOv(fns); setReqOv(reqs); setScOv(scs);
          // R7: _fields = 필드 정의의 라이브 원본(rtm.json customFields 는 생성 시점 스냅샷).
          const fd = (raw._fields && typeof raw._fields === "object" ? raw._fields : {}) as Record<string, { label?: string }>;
          setFields(Object.entries(fd).map(([id, v]) => ({ id, label: v?.label ?? id })).sort((a, b) => (a.id < b.id ? -1 : 1)));
          setFieldsLive(true);
        }
      })
      .catch(() => {});
  }, [tokenQ, dataBase]);
  useEffect(() => { loadModel(); }, [loadModel]);

  // 단계 인테이크(P4) ------------------------------------------------------
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeQuery, setIntakeQuery] = useState("");
  const [targetStep, setTargetStep] = useState(5);
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "done" | "failed"; msg: string } | null>(null);
  const [sid, setSid] = useState<string | null>(null);
  const [session, setSession] = useState<RtmSession | null>(null);
  const [sessionDocs, setSessionDocs] = useState<SessionDoc[]>([]);
  const [stepBusy, setStepBusy] = useState(false);
  const [viewStep, setViewStep] = useState<number | null>(null); // null = 산출 최전선(producedStep) 따라감
  // 미리보기/편집
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewMd, setPreviewMd] = useState<string>("");
  const [identified, setIdentified] = useState<{ requirements?: { id: string; category: string; name: string; priority?: string; derivedFrom?: string | null }[]; questions?: string[]; request?: { id: string; name: string } } | null>(null);
  const [editingDoc, setEditingDoc] = useState(false);
  const [draftDoc, setDraftDoc] = useState("");

  // ── P6: 변경관리(절차 B) — 요청(REQ) 철회 ──
  const [changeReqId, setChangeReqId] = useState<string | null>(null); // 진행 중 대상 REQ
  const [changeRunning, setChangeRunning] = useState(false);

  const startIntake = useCallback(async () => {
    const q = intakeQuery.trim();
    if (!q) return;
    if (!accessToken) { setIntakeError("읽기전용(라이브 서버 없음) — 인테이크는 dev 서버가 필요합니다."); return; }
    setIntakeError(null);
    try {
      const res = await fetch(`/rtm-intake?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: q, targetStep }) });
      const d = (await res.json().catch(() => null)) as { job?: { sid?: string }; session?: RtmSession; error?: string } | null;
      if (res.status === 202 && d?.session) {
        setSid(d.session.sid); setSession(d.session); setIntakeStatus("running");
        setIntakeOpen(false); setIntakeQuery(""); setPreviewName(null); setIdentified(null);
      } else { setIntakeError(d?.error ?? `HTTP ${res.status}`); }
    } catch (e) { setIntakeError(String(e)); }
  }, [intakeQuery, targetStep, accessToken]);

  // start..target 진행(다음 단계 / ⑤까지). 컨펌 게이트 미통과면 409 토스트.
  const advance = useCallback(async (toStep: number) => {
    if (!sid || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, targetStep: toStep }) });
      const d = (await res.json().catch(() => null)) as { session?: RtmSession; error?: string } | null;
      if (res.status === 202 && d?.session) { setSession(d.session); setIntakeStatus("running"); setPreviewName(null); }
      else setToast({ kind: "failed", msg: d?.error ?? `진행 실패: HTTP ${res.status}` });
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, accessToken]);

  const confirmStep = useCallback(async (step: number) => {
    if (!sid || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake-confirm?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, step }) });
      const d = (await res.json().catch(() => null)) as { session?: RtmSession; error?: string } | null;
      if (res.ok && d?.session) setSession(d.session);
      else setToast({ kind: "failed", msg: d?.error ?? `컨펌 실패: HTTP ${res.status}` });
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, accessToken]);

  const saveDoc = useCallback(async () => {
    if (!sid || !previewName || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake-doc?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, name: previewName, content: draftDoc }) });
      if (res.ok) { setPreviewMd(draftDoc); setEditingDoc(false); }
      else { const d = (await res.json().catch(() => null)) as { error?: string } | null; setToast({ kind: "failed", msg: d?.error ?? `저장 실패: HTTP ${res.status}` }); }
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, previewName, draftDoc, accessToken]);

  const discardSession = useCallback(async () => {
    if (!sid || !accessToken) { setSession(null); setSid(null); return; }
    try { await fetch(`/rtm-intake-discard?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid }) }); } catch { /* */ }
    setSession(null); setSid(null); setSessionDocs([]); setPreviewName(null); setIdentified(null); setIntakeStatus("idle");
  }, [sid, accessToken]);

  // URL(?req=) → 요구 상세 패널 — 딥링크·뒤로가기 복원.
  useEffect(() => {
    const req = searchParams.get("req");
    if (req && req !== selReq) {
      setView("requirement");
      setSelFn(null);
      setSelReq(req);
    } else if (!req && selReq) {
      setSelReq(null);
    }
    // selReq는 미러 effect가 관리 — 여기서는 URL 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 상태(selReq·sid) → URL 미러(replace, 히스토리 오염 없음).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selReq) next.set("req", selReq);
        else next.delete("req");
        if (sid) next.set("sid", sid);
        else next.delete("sid");
        return next;
      },
      { replace: true },
    );
  }, [selReq, sid, setSearchParams]);

  // 마운트 시 진행 중 세션 복구 — 새로고침/다른 탭에서도 단계 진행을 이어 본다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // URL의 ?sid=가 있으면 그 세션을 명시 복원(딥링크), 없으면 서버의 현재 세션.
        const urlSid = new URLSearchParams(window.location.search).get("sid");
        const r = await fetch(
          `/rtm-intake-status${tokenQ}${urlSid ? `&sid=${encodeURIComponent(urlSid)}` : ""}`,
        );
        const data = (await r.json()) as { job?: { status?: string; sid?: string | null }; session?: RtmSession | null; docs?: SessionDoc[] };
        if (cancelled || !data.session || data.session.discarded) return;
        setSid(data.session.sid);
        setSession(data.session);
        setSessionDocs(data.docs ?? []);
        if (data.job?.status === "running" && data.job?.sid === data.session.sid) setIntakeStatus("running");
      } catch { /* 복구 실패 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [tokenQ]);

  // 폴링 — 실행 중이면 세션·문서 갱신. done 이면 멈추고, ⑤ 산출이면 추적표 재로드.
  useEffect(() => {
    if (intakeStatus !== "running" || !sid) return;
    const poll = async () => {
      try {
        const r = await fetch(`/rtm-intake-status${tokenQ}&sid=${encodeURIComponent(sid)}`);
        const data = (await r.json()) as { job?: { status?: string }; session?: RtmSession | null; docs?: SessionDoc[] };
        if (data.session) setSession(data.session);
        if (data.docs) setSessionDocs(data.docs);
        const st = data.job?.status;
        if (st === "done") {
          setIntakeStatus("done");
          const ps = data.session?.producedStep ?? 0;
          if (ps >= 5) { setToast({ kind: "done", msg: "⑤ RTM 반영 완료 — 추적표를 갱신했습니다." }); loadModel(); }
          else setToast({ kind: "done", msg: `${CIRCLED[ps - 1] ?? ""} 단계 산출 완료 — 검토 후 컨펌하세요.` });
        } else if (st === "failed") {
          setIntakeStatus("failed"); setToast({ kind: "failed", msg: "단계 실행 실패 — 서버 로그를 확인하세요." });
        }
      } catch { /* keep polling */ }
    };
    void poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [intakeStatus, sid, tokenQ, loadModel]);

  // 변경관리(절차 B) — 요청(REQ) 철회 시작. claude -p §C 가 CR 문서 생성·폐기표시·재bake 까지 수행한다.
  const startChange = useCallback(async (reqId: string) => {
    if (!accessToken) { setToast({ kind: "failed", msg: "읽기전용(라이브 서버 없음) — 변경요청은 dev 서버가 필요합니다." }); return; }
    if (changeRunning) return;
    const ok = window.confirm(
      `요청 ${reqId} 을(를) 철회합니다.\n\n· 하위 요구사항이 동반 폐기(상태=폐기)됩니다.\n· 변경관리 문서(과업내용변경요청서·변경영향분석서)가 생성됩니다.\n· 삭제가 아니라 이력 보존입니다 — 추적표가 재생성됩니다.\n\n진행할까요?`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/rtm-change?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetReq: reqId, kind: "withdraw" }) });
      const d = (await res.json().catch(() => null)) as { job?: unknown; error?: string } | null;
      if (res.status === 202) { setChangeReqId(reqId); setChangeRunning(true); setToast({ kind: "done", msg: `${reqId} 철회 진행 중 — CR 문서 생성·추적표 재생성 중입니다.` }); }
      else setToast({ kind: "failed", msg: d?.error ?? `변경요청 실패: HTTP ${res.status}` });
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); }
  }, [accessToken, changeRunning]);

  // 마운트 시 진행 중 변경관리 job 복구(새로고침 후에도 진행 상태를 잇는다).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/rtm-change-status${tokenQ}`);
        const data = (await r.json()) as { job?: { status?: string; targetReq?: string | null } };
        if (cancelled) return;
        if (data.job?.status === "running") { setChangeReqId(data.job.targetReq ?? null); setChangeRunning(true); }
      } catch { /* 복구 실패 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [tokenQ]);

  // 변경관리 폴링 — 완료되면 추적표 재로드(폐기 반영·기능 원복), 실패면 토스트.
  useEffect(() => {
    if (!changeRunning) return;
    const poll = async () => {
      try {
        const r = await fetch(`/rtm-change-status${tokenQ}`);
        const data = (await r.json()) as { job?: { status?: string } };
        const st = data.job?.status;
        if (st === "done") { setChangeRunning(false); setToast({ kind: "done", msg: `${changeReqId ?? "요청"} 철회 완료 — 추적표·CR 문서를 갱신했습니다.` }); loadModel(); }
        else if (st === "failed") { setChangeRunning(false); setToast({ kind: "failed", msg: "변경요청 실패 — 서버 로그를 확인하세요." }); }
      } catch { /* keep polling */ }
    };
    void poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [changeRunning, tokenQ, changeReqId, loadModel]);

  // 미리보기 로더 — 현재 산출 단계(producedStep)의 문서/식별결과를 불러온다.
  const loadPreview = useCallback(async (name: string) => {
    if (!sid) return;
    setEditingDoc(false);
    try {
      const r = await fetch(`/rtm-intake-doc${tokenQ}&sid=${encodeURIComponent(sid)}&name=${encodeURIComponent(name)}`);
      const d = (await r.json().catch(() => null)) as { content?: string } | null;
      setPreviewName(name); setPreviewMd(d?.content ?? "");
    } catch { /* */ }
  }, [sid, tokenQ]);

  const loadIdentified = useCallback(async () => {
    if (!sid) return;
    try {
      const r = await fetch(`/rtm-intake-doc${tokenQ}&sid=${encodeURIComponent(sid)}&name=identified.json`);
      const d = (await r.json().catch(() => null)) as { content?: string } | null;
      if (d?.content) { try { setIdentified(JSON.parse(d.content)); } catch { setIdentified(null); } }
    } catch { /* */ }
  }, [sid, tokenQ]);

  // 표시 단계(viewStep 우선, 없으면 산출 최전선) 산출물 자동 미리보기.
  useEffect(() => {
    if (!session || intakeStatus === "running") return;
    const ps = viewStep ?? session.producedStep;
    if (ps === 1) { void loadIdentified(); setPreviewName(null); }
    else if (ps >= 2 && ps <= 4) {
      const kind = STEP_DOC_KIND[ps];
      const doc = sessionDocs.find((d) => d.kind === kind);
      if (doc && doc.name !== previewName) void loadPreview(doc.name);
    }
  }, [session?.producedStep, viewStep, intakeStatus, sessionDocs]);
  // 새 단계가 산출되면 표시를 최전선으로 되돌린다.
  useEffect(() => { setViewStep(null); }, [session?.producedStep]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);

  const resolveApprover = useCallback((): string | null => {
    const fromStore = approverHandle?.trim();
    if (fromStore) return fromStore;
    const fromLs = typeof localStorage !== "undefined" ? localStorage.getItem(APPROVER_LS_KEY)?.trim() : undefined;
    if (fromLs) { setApproverHandle(fromLs); return fromLs; }
    const entered = typeof window !== "undefined" ? window.prompt("확정자(이름/핸들)를 입력하세요:")?.trim() : "";
    if (entered) { try { localStorage.setItem(APPROVER_LS_KEY, entered); } catch { /* */ } setApproverHandle(entered); return entered; }
    return null;
  }, [approverHandle, setApproverHandle]);

  // 병합 helpers -----------------------------------------------------------
  const effCell = (f: FunctionRow, key: CellKey | "name"): string => {
    const e = fnOv[f.id]?.editedCells?.[key];
    return typeof e === "string" ? e : key === "name" ? f.name : f[key].value;
  };
  const isEdited = (f: FunctionRow, key: string) => typeof fnOv[f.id]?.editedCells?.[key] === "string";
  const isConfirmed = (f: FunctionRow) => Boolean(fnOv[f.id]);
  const effLifecycle = (r: Requirement) => reqOv[r.id]?.lifecycle ?? r.lifecycle;
  const effSignoff = (r: Requirement): Signoff | null => (reqOv[r.id] && "signoff" in reqOv[r.id] ? reqOv[r.id].signoff ?? null : r.signoff);
  const effTest = (r: Requirement, acId: string, t: TestRef): TestResult => reqOv[r.id]?.tests?.[`${acId}::${t.caseId}`]?.result ?? t.result;
  const fnById = (id: string) => model?.functions.find((f) => f.id === id);
  const reqById = (id: string) => model?.requirements.find((r) => r.id === id);
  const selectedFn = model?.functions.find((f) => f.id === selFn) ?? null;
  const selectedReq = model?.requirements.find((r) => r.id === selReq) ?? null;
  // W5: 시나리오 병합 helpers — 오버레이(_scenarios) 존재 = 확정.
  const scenarios = model?.testScenarios ?? [];
  const selectedTs = scenarios.find((s) => s.id === selTs) ?? null;
  const effTs = (s: TestScenario, key: "title" | "given" | "when" | "then"): string => {
    const e = scOv[s.id]?.editedCells?.[key];
    return typeof e === "string" ? e : s[key];
  };
  const tsConfirmed = (s: TestScenario) => s.confidence === "CONFIRMED" || Boolean(scOv[s.id]);
  const tsConfirmedCount = scenarios.filter(tsConfirmed).length;
  // R7: 유효 필드 — 라이브(_fields) 우선, 정적(demo)에선 rtm.json 스냅샷 폴백.
  const effFields: CustomField[] = fieldsLive ? fields : (model?.customFields ?? []);
  const effCustom = (f: FunctionRow, fieldId: string): string => {
    const e = fnOv[f.id]?.editedCells?.[fieldId];
    return typeof e === "string" ? e : f.custom?.[fieldId] ?? "";
  };

  // W5: 시나리오 확정(POST /rtm-scenario-override) — 기능 확정과 동형.
  // 확정은 항상 그 시점 G/W/T **전체 스냅샷**을 박제한다(리뷰 R1 — 부분/빈 editedCells 면
  // 재생성 시 [확정] 배지를 단 채 본문이 조용히 바뀐다). edited 로 무편집 검토를 audit 구분(C3).
  const confirmScenario = useCallback(async (fromEdit: boolean) => {
    if (!selectedTs || !accessToken) return;
    const approver = resolveApprover();
    if (!approver) return;
    const editedCells: Record<string, string> = {};
    let edited = false;
    for (const key of ["title", "given", "when", "then"] as const) {
      const next = fromEdit && tsDraft[key] !== undefined ? tsDraft[key] : effTs(selectedTs, key);
      editedCells[key] = next;
      if (next !== selectedTs[key]) edited = true;
    }
    setTsSaving(true); setTsSaveError(null);
    try {
      const res = await fetch(`/rtm-scenario-override?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tsId: selectedTs.id, editedCells, approver, edited }) });
      const data = (await res.json().catch(() => null)) as (FnOverride & { error?: string }) | null;
      if (!res.ok || !data) { setTsSaveError(data?.error ?? `HTTP ${res.status}`); return; }
      setScOv((p) => ({ ...p, [selectedTs.id]: { editedCells: data.editedCells, approver: data.approver, at: data.at } }));
      setTsEditing(false);
    } catch (e) { setTsSaveError(String(e)); } finally { setTsSaving(false); }
  }, [selectedTs, accessToken, tsDraft, resolveApprover]);

  // R7: 필드 정의 추가/삭제(POST /rtm-field) — 삭제는 정의만(값 비파괴 보존).
  const postField = useCallback(async (op: "add" | "remove", id: string, label?: string) => {
    if (!accessToken) { setToast({ kind: "failed", msg: "읽기전용 — 필드 편집은 dev 서버가 필요합니다." }); return; }
    const approver = resolveApprover();
    if (!approver) return;
    try {
      const res = await fetch(`/rtm-field?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, id, label, approver }) });
      const data = (await res.json().catch(() => null)) as { _fields?: Record<string, { label?: string }>; error?: string } | null;
      if (!res.ok || !data?._fields) { setToast({ kind: "failed", msg: `필드 저장 실패: ${data?.error ?? res.status}` }); return; }
      setFields(Object.entries(data._fields).map(([fid, v]) => ({ id: fid, label: v?.label ?? fid })).sort((a, b) => (a.id < b.id ? -1 : 1)));
      setFieldsLive(true);
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); }
  }, [accessToken, resolveApprover]);

  const addField = useCallback(() => {
    const label = typeof window !== "undefined" ? window.prompt("추가할 필드 이름(예: 담당자, 릴리스):")?.trim() : "";
    if (!label) return;
    // id = 라벨 파생 결정론 슬러그(리뷰 C4) — 같은 라벨 재등록 = 같은 id → 삭제 후
    // 재추가 시 기존 값 복원이 실제로 동작한다(타임스탬프 id 면 복원 계약이 깨짐).
    // ascii 는 슬러그, 한글 등은 djb2 해시 hex(결정론).
    const ascii = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    let id: string;
    if (ascii.length >= 2) id = `custom:${ascii}`;
    else {
      let h = 5381;
      for (let i = 0; i < label.length; i++) h = ((h * 33) ^ label.charCodeAt(i)) >>> 0;
      id = `custom:h${h.toString(16)}`;
    }
    if (effFields.some((f) => f.id === id)) { setToast({ kind: "failed", msg: `같은 필드가 이미 있습니다: ${label}` }); return; }
    void postField("add", id, label);
  }, [postField, effFields]);

  const openFunction = useCallback((id: string) => { setView("function"); setSelReq(null); setSelFn(id); setEditing(false); setSaveError(null); }, []);

  const beginEdit = useCallback(() => {
    if (!selectedFn) return;
    const base: Record<string, string> = { name: effCell(selectedFn, "name"), entryPoint: effCell(selectedFn, "entryPoint"), implementation: effCell(selectedFn, "implementation"), data: effCell(selectedFn, "data"), test: effCell(selectedFn, "test") };
    for (const cf of effFields) base[cf.id] = effCustom(selectedFn, cf.id); // R7 값 편집.
    setDraft(base);
    setEditing(true); setSaveError(null);
  }, [selectedFn, fnOv, effFields]);

  const onConfirm = useCallback(async (fromEdit: boolean) => {
    if (!selectedFn || !accessToken) return;
    const approver = resolveApprover();
    if (!approver) return;
    const editedCells: Record<string, string> = {};
    if (fromEdit) {
      for (const key of ["name", "entryPoint", "implementation", "data", "test"] as const) {
        const original = key === "name" ? selectedFn.name : selectedFn[key].value;
        if (draft[key] !== undefined && draft[key] !== original) editedCells[key] = draft[key];
      }
      for (const cf of effFields) { // R7: 원본 = rtm.json custom 스냅샷.
        const original = selectedFn.custom?.[cf.id] ?? "";
        if (draft[cf.id] !== undefined && draft[cf.id] !== original) editedCells[cf.id] = draft[cf.id];
      }
    }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/rtm-override?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fnId: selectedFn.id, editedCells, approver }) });
      const data = (await res.json().catch(() => null)) as (FnOverride & { error?: string }) | null;
      if (!res.ok || !data) { setSaveError(data?.error ?? `HTTP ${res.status}`); return; }
      setFnOv((p) => ({ ...p, [selectedFn.id]: { editedCells: data.editedCells, approver: data.approver, at: data.at } }));
      setEditing(false);
    } catch (e) { setSaveError(String(e)); } finally { setSaving(false); }
  }, [selectedFn, accessToken, draft, resolveApprover]);

  // 요구사항 검증 입력 (POST /rtm-req-override) -------------------------------
  const postReq = useCallback(async (reqId: string, payload: { lifecycle?: string; signoff?: Signoff | null; tests?: Record<string, { result: TestResult; defectId: string | null }> }) => {
    if (!accessToken) { setToast({ kind: "failed", msg: "읽기전용 — 검증 입력은 dev 서버가 필요합니다." }); return; }
    const approver = resolveApprover();
    if (!approver) return;
    try {
      const res = await fetch(`/rtm-req-override?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reqId, ...payload, approver }) });
      const data = (await res.json().catch(() => null)) as (ReqOverride & { error?: string }) | null;
      if (!res.ok || !data) { setToast({ kind: "failed", msg: `저장 실패: ${data?.error ?? res.status}` }); return; }
      setReqOv((p) => ({ ...p, [reqId]: { ...p[reqId], ...(payload.lifecycle !== undefined ? { lifecycle: payload.lifecycle } : {}), ...(payload.signoff !== undefined ? { signoff: payload.signoff } : {}), tests: { ...(p[reqId]?.tests ?? {}), ...(payload.tests ?? {}) } } }));
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); }
  }, [accessToken, resolveApprover]);

  const cov = model?.coverage;
  const diags = model?.diagnostics ?? [];
  const errCount = diags.filter((d) => d.level === "error").length;
  const intakePanelOpen = !!session && !session.discarded && intakeStatus !== "running" && session.producedStep >= 1;

  // ── 렌더 조각 ──────────────────────────────────────────────────────────
  const tabBtn = (k: typeof view, label: string) => (
    <button type="button" onClick={() => { setView(k); setSelFn(null); setSelReq(null); setSelTs(null); setTsEditing(false); }}
      className={`rounded-md transition-colors ${view === k ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"}`}
      style={{ padding: "5px 14px", fontSize: 12, fontWeight: view === k ? 600 : 500 }}>{label}</button>
  );
  const Tile = ({ lbl, n, d, pct, bar }: { lbl: string; n: number | string; d?: string; pct?: number; bar?: string }) => (
    <div style={{ flex: 1, background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 13, padding: "13px 15px" }}>
      <div className="text-text-muted" style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 7 }}>{lbl}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "var(--color-text-primary)", lineHeight: 1 }}>{n}{d && <span className="text-text-muted" style={{ fontSize: 13, fontFamily: "var(--font-body)" }}>{d}</span>}</div>
      {pct !== undefined && <div style={{ height: 5, borderRadius: 3, background: "var(--color-elevated)", overflow: "hidden", marginTop: 9 }}><i style={{ display: "block", height: "100%", width: `${pct}%`, background: bar }} /></div>}
    </div>
  );
  const confChip = (label: string, color: string) => <span style={{ marginLeft: 6, fontSize: 9, fontFamily: "var(--font-mono)", color }}>[{label}]</span>;

  // 추적 셀 (그리드)
  const TraceTd = ({ f, c }: { f: FunctionRow; c: { key: CellKey; label: string } }) => {
    const cell = f[c.key]; const edited = isEdited(f, c.key);
    const v = effCell(f, c.key); const proposed = v.startsWith("(제안)") || (f.origin === "TO_BE" && v.length > 0);
    const chip = edited ? { label: "확정", color: GOLD } : CONF[cell.confidence];
    return (
      <td title={evidenceTitle(cell)} style={{ borderBottom: BORDER, padding: "11px 12px", verticalAlign: "top" }}>
        <span style={{ fontSize: 12.5, color: proposed ? "var(--color-text-muted)" : "var(--color-text-secondary)", fontStyle: proposed ? "italic" : "normal" }}>{v.length > 0 ? v : <span style={{ color: FAINT }}>—</span>}</span>
        {confChip(chip.label, chip.color)}
      </td>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-root overflow-hidden relative">
      {/* 헤더 */}
      <div className="flex items-center gap-4 shrink-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 19, color: "var(--color-text-primary)" }}>요구사항 추적표</span>
        <span className="text-accent" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".16em", border: "1px solid var(--color-border-subtle)", borderRadius: 5, padding: "3px 6px" }}>RTM</span>
        <div className="flex items-center gap-1 ml-1 rounded-lg" style={{ background: "var(--color-panel)", border: BORDER, padding: 3 }}>
          {tabBtn("function", "기능 기준")}{tabBtn("requirement", "요청 기준")}{tabBtn("scenario", "시험")}{tabBtn("status", "현황")}
        </div>
        <span className="ml-auto flex items-center gap-3">
          {intakeStatus === "running" && (
            <span className="flex items-center gap-1.5 text-amber-400" style={{ fontSize: 11 }} title="요구사항 단계 생성 진행 중">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              {CIRCLED[Math.min(session?.producedStep ?? 0, 4)]} 단계 생성 중…
            </span>
          )}
          {canWrite && (
            <a
              href={`/doc-xlsx?token=${encodeURIComponent(accessToken ?? "")}&docId=rtm`}
              download="rtm.xlsx"
              className="rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              style={{ padding: "6px 14px", fontSize: 12 }}
              title="RTM xlsx(문서정보·요구/기능 원장·커버리지 현황) — understand-docs 실행 시점 스냅샷. 행단위 확정 오버레이는 미반영(md/탭이 진실)."
            >
              xlsx 다운로드
            </a>
          )}
          <button type="button" onClick={() => { setIntakeOpen(true); setIntakeError(null); setTargetStep(5); }} disabled={intakeStatus === "running"}
            className="rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40" style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600 }}
            title="자연어로 새 요구사항을 요청 → 가이드 5단계로 분해·문서화(전부 [추정])">＋ 새 요청</button>
        </span>
      </div>

      {/* P4: 단계 진행 스테퍼 */}
      <IntakeStepper />

      {/* 진단 배너 (#7) */}
      {diags.length > 0 && (
        <button type="button" onClick={() => setView("status")} className="flex items-center gap-3 text-left hover:bg-elevated/30 transition-colors"
          style={{ margin: "12px 24px 0", padding: "9px 14px", borderRadius: 9, background: errCount > 0 ? "rgba(207,138,134,.08)" : "rgba(216,162,94,.08)", border: `1px solid ${errCount > 0 ? "rgba(207,138,134,.28)" : "rgba(216,162,94,.28)"}` }}>
          <span style={{ color: errCount > 0 ? BAD : WARN, fontSize: 13 }}>⚠</span>
          <span className="text-text-secondary" style={{ fontSize: 12 }}><b style={{ color: errCount > 0 ? BAD : WARN }}>무결성 진단 {diags.length}건</b>{errCount > 0 ? ` (error ${errCount})` : ""} — {diags[0].message}{diags.length > 1 ? ` 외 ${diags.length - 1}건` : ""}</span>
          <span className="text-text-muted ml-auto" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>현황 탭에서 보기 ›</span>
        </button>
      )}

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: 24, paddingBottom: (selectedFn || selectedReq || selectedTs) ? "50vh" : intakePanelOpen ? "55vh" : 24, maxWidth: 1340, width: "100%", margin: "0 auto" }}>
        {error ? (
          <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 520 }}>요구사항 추적표를 불러오지 못했습니다 ({error}).<br /><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>understand-rtm</code> 을 먼저 실행하세요.</div>
        ) : !model ? (
          <div className="text-text-muted" style={{ fontSize: 13 }}>불러오는 중…</div>
        ) : view === "function" ? (
          <FunctionView />
        ) : view === "requirement" ? (
          <RequirementView />
        ) : view === "scenario" ? (
          <ScenarioView />
        ) : (
          <StatusView />
        )}
      </div>

      {selectedFn && view === "function" && model && <FunctionDrawer />}
      {selectedReq && view === "requirement" && model && <RequirementDrawer />}
      {selectedTs && view === "scenario" && model && <ScenarioDrawer />}

      {/* P4: 단계 산출 미리보기/컨펌 패널 */}
      {intakePanelOpen && <IntakeStepPanel />}

      {/* 인테이크 모달 */}
      {intakeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setIntakeOpen(false); }}>
          <div role="dialog" aria-modal="true" className="glass-heavy rounded-xl shadow-2xl w-full max-w-xl mx-4">
            <div className="flex items-center justify-between border-b border-border-subtle" style={{ padding: "14px 20px" }}>
              <h2 className="text-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>요구사항 요청</h2>
              <button onClick={() => setIntakeOpen(false)} className="text-text-muted hover:text-text-primary" style={{ fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>고객 요청을 자연어로 입력하세요. 요청(REQ)을 요구사항(SFR/SIR/DAR/SER…)으로 분해해 가이드 5단계로 문서화합니다.<span className="text-text-muted"> 결과는 전부 <code style={{ fontFamily: "var(--font-mono)" }}>[추정]</code> — 단계마다 검토·컨펌하세요.</span></p>
              <textarea value={intakeQuery} onChange={(e) => setIntakeQuery(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void startIntake(); }} placeholder="예) 네이버 로그인 추가해주세요." rows={3} autoFocus className="w-full resize-y rounded-lg bg-elevated border border-border-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" style={{ fontSize: 13, padding: "8px 11px" }} />
              <div style={{ marginTop: 14 }}>
                <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 7 }}>어디까지 진행할까요? <span style={{ color: "var(--color-text-secondary)" }}>(선택 단계까지 한 번에 생성 후 멈춤)</span></div>
                <div className="flex items-center gap-1.5">
                  {STEP_DEFS.map((s, i) => (
                    <button key={s.n} type="button" onClick={() => setTargetStep(s.n)}
                      className="flex-1 rounded-lg transition-colors" style={{ padding: "7px 4px", border: targetStep === s.n ? `1px solid ${GOLD}` : BORDER, background: targetStep === s.n ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent" }}>
                      <div style={{ fontSize: 13, color: targetStep === s.n ? GOLD : "var(--color-text-secondary)" }}>{CIRCLED[i]}</div>
                      <div style={{ fontSize: 10, color: targetStep === s.n ? GOLD : "var(--color-text-muted)", marginTop: 2 }}>{s.label}</div>
                    </button>
                  ))}
                </div>
                <div className="text-text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>{targetStep === 5 ? "⑤ RTM까지 — 추적표에 바로 반영(한 방에 완료)." : `${CIRCLED[targetStep - 1]} ${STEP_DEFS[targetStep - 1].label}까지 생성 후 검토 대기.`}</div>
              </div>
              {intakeError && <p className="text-red-400" style={{ fontSize: 11.5, marginTop: 8 }}>{intakeError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle" style={{ padding: "12px 20px" }}>
              <button onClick={() => setIntakeOpen(false)} className="rounded-lg text-text-secondary hover:text-text-primary" style={{ padding: "6px 12px", fontSize: 13 }}>취소</button>
              <button onClick={() => void startIntake()} disabled={!intakeQuery.trim()} className="rounded-lg font-medium bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40" style={{ padding: "6px 16px", fontSize: 13 }}>실행 ▸</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[120] rounded-lg shadow-2xl border max-w-sm ${toast.kind === "done" ? "bg-emerald-900/80 border-emerald-600 text-emerald-100" : "bg-red-900/80 border-red-600 text-red-100"}`} style={{ padding: "12px 16px", fontSize: 13 }} role="status" onClick={() => setToast(null)}>{toast.msg}</div>
      )}
    </div>
  );

  // ── P4: 단계 진행 스테퍼 ──
  function IntakeStepper() {
    if (!session || session.discarded) return null;
    const running = intakeStatus === "running";
    return (
      <div className="flex items-center gap-1 shrink-0 bg-panel/60 border-b border-border-subtle" style={{ padding: "8px 24px" }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginRight: 6 }}>요청 분해</span>
        {STEP_DEFS.map((s, i) => {
          const st = session.steps[String(s.n)]?.status ?? "pending";
          const isRunningStep = running && s.n === session.producedStep + 1;
          const color = st === "confirmed" ? GOLD : st === "produced" ? OK : st === "failed" ? BAD : isRunningStep ? WARN : FAINT;
          const clickable = st !== "pending";
          const active = (viewStep ?? session.producedStep) === s.n;
          return (
            <span key={s.n} className="flex items-center">
              {i > 0 && <span style={{ width: 14, height: 1, background: "var(--color-border-subtle)", margin: "0 2px" }} />}
              <button type="button" disabled={!clickable} onClick={() => setViewStep(s.n)} className="flex items-center gap-1.5 rounded-md transition-colors" title={clickable ? `${s.label} 보기` : undefined}
                style={{ padding: "3px 8px", border: `1px solid ${active ? color : `${color}40`}`, background: active ? `${color}26` : `${color}14`, opacity: clickable || isRunningStep ? 1 : 0.5, cursor: clickable ? "pointer" : "default" }}>
                <span style={{ color, fontSize: 12 }}>{CIRCLED[i]}</span>
                <span style={{ fontSize: 11, color: st === "pending" ? FAINT : "var(--color-text-secondary)" }}>{s.label}</span>
                {st === "confirmed" && <span style={{ color: GOLD, fontSize: 10 }}>✓</span>}
                {isRunningStep && <span className="animate-pulse" style={{ color: WARN, fontSize: 11 }}>…</span>}
              </button>
            </span>
          );
        })}
        <button type="button" onClick={() => void discardSession()} disabled={running} className="ml-auto text-text-muted hover:text-text-primary disabled:opacity-40" style={{ fontSize: 11 }} title="이 세션 닫기">닫기 ×</button>
      </div>
    );
  }

  // ── P4: 단계 산출 미리보기/컨펌 패널(하단 드로어) ──
  function IntakeStepPanel() {
    if (!session) return null;
    const frontier = session.producedStep;
    if (frontier < 1) return null;
    const ps = viewStep ?? frontier; // 표시 단계(스테퍼에서 고른 단계)
    const isFrontier = ps === frontier;
    const confirmed = session.confirmedStep >= ps;
    const canAdvance = isFrontier && session.confirmedStep >= frontier && frontier < 5;
    const isDoc = ps >= 2 && ps <= 4;
    return (
      <div className="fixed left-0 right-0 bottom-0 z-[90] bg-panel border-t border-border-medium shadow-2xl" style={{ height: "52vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-3 shrink-0 border-b border-border-subtle" style={{ padding: "10px 22px" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--color-text-primary)" }}>{CIRCLED[ps - 1]} {STEP_DEFS[ps - 1].label}</span>
          {confirmed ? <span style={{ fontSize: 11, color: GOLD }}>✓ 컨펌됨</span> : <span style={{ fontSize: 11, color: WARN }}>검토 필요</span>}
          {!isFrontier && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>· 이전 단계 보기</span>}
          <span className="ml-auto flex items-center gap-2">
            {isDoc && previewName && !editingDoc && <button type="button" onClick={() => { setDraftDoc(previewMd); setEditingDoc(true); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 12px", fontSize: 12 }}>편집</button>}
            {isDoc && editingDoc && <>
              <button type="button" onClick={() => setEditingDoc(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>취소</button>
              <button type="button" onClick={() => void saveDoc()} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 12px", fontSize: 12 }}>{stepBusy ? "저장 중…" : "저장"}</button>
            </>}
            {isFrontier && !confirmed && !editingDoc && <button type="button" onClick={() => void confirmStep(frontier)} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12, fontWeight: 600 }}>✓ 컨펌</button>}
            {canAdvance && <button type="button" onClick={() => void advance(frontier + 1)} disabled={stepBusy} className="rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>다음 단계 ▸</button>}
            {canAdvance && frontier < 4 && <button type="button" onClick={() => void advance(5)} disabled={stepBusy} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent disabled:opacity-50" style={{ padding: "5px 11px", fontSize: 12 }}>⑤까지 ▸</button>}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" style={{ padding: "14px 22px" }}>
          {ps === 1 ? <IdentifiedView />
            : ps === 5 ? <div className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>⑤ RTM 반영 완료 — <b style={{ color: "var(--color-text-primary)" }}>요청 기준</b> 탭에서 분해된 요청·요구사항과 추적 결과를 확인하세요. <span className="text-text-muted">생성된 문서는 세션 폴더(rtm-intake)에 보존됩니다.</span></div>
            : editingDoc ? <textarea value={draftDoc} onChange={(e) => setDraftDoc(e.target.value)} spellCheck={false} className="w-full h-full resize-none rounded-lg bg-elevated border border-border-medium text-text-primary focus:outline-none focus:border-accent" style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55, padding: "10px 12px" }} />
            : ps === 4 ? <SpecTabs />
            : <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{stripFrontmatter(previewMd)}</ReactMarkdown>}
        </div>
      </div>
    );
  }

  function SpecTabs() {
    const specs = sessionDocs.filter((d) => d.kind === "spec");
    if (specs.length === 0) return <div className="text-text-muted" style={{ fontSize: 12 }}>명세서를 불러오는 중…</div>;
    return (
      <>
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 12 }}>
          {specs.map((d) => (
            <button key={d.name} type="button" onClick={() => void loadPreview(d.name)} className="rounded-md transition-colors" style={{ padding: "3px 10px", fontSize: 11, fontFamily: "var(--font-mono)", border: previewName === d.name ? `1px solid ${GOLD}` : BORDER, color: previewName === d.name ? GOLD : "var(--color-text-secondary)", background: previewName === d.name ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent" }}>
              {d.name.replace(/^요구사항명세서_/, "").replace(/\.md$/, "")}
            </button>
          ))}
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{stripFrontmatter(previewMd)}</ReactMarkdown>
      </>
    );
  }

  function IdentifiedView() {
    if (!identified) return <div className="text-text-muted" style={{ fontSize: 12 }}>식별 결과를 불러오는 중…</div>;
    const reqs = identified.requirements ?? [];
    const qs = identified.questions ?? [];
    return (
      <div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 12 }}>요청 <b style={{ color: GOLD, fontFamily: "var(--font-mono)" }}>{identified.request?.id}</b> {identified.request?.name} → 요구사항 <b style={{ color: "var(--color-text-primary)" }}>{reqs.length}</b>건으로 분해</div>
        <div className="flex flex-col gap-1.5">
          {reqs.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 rounded-md" style={{ padding: "7px 11px", background: "var(--color-elevated)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: GOLD }}>{r.id}</span>
              <span style={{ fontSize: 9, color: "var(--color-text-muted)", border: BORDER, borderRadius: 4, padding: "1px 5px" }}>{r.category}</span>
              <span style={{ fontSize: 12.5, color: "var(--color-text-primary)" }}>{r.name}</span>
              {r.derivedFrom && <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>←{r.derivedFrom}</span>}
              {r.priority && <span className="ml-auto" style={{ fontSize: 10, color: PRIORITY[r.priority]?.color ?? WARN }}>{PRIORITY[r.priority]?.label ?? r.priority}</span>}
            </div>
          ))}
        </div>
        {qs.length > 0 && (
          <div style={{ marginTop: 16, borderTop: BORDER, paddingTop: 12 }}>
            <div style={{ fontSize: 11.5, color: BAD, marginBottom: 6, fontWeight: 600 }}>[확인필요] — 다음 단계 전에 검토하세요</div>
            {qs.map((q, i) => <div key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "2px 0", lineHeight: 1.5 }}>· {q}</div>)}
          </div>
        )}
      </div>
    );
  }

  // ── 뷰① 기능 기준 ──
  function FunctionView() {
    if (!model) return null;
    return (
      <>
        {cov && (
          <div className="flex gap-2.5" style={{ marginBottom: 22 }}>
            <Tile lbl="요구사항 구현" n={cov.requirements.implemented} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.implemented, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
            <Tile lbl="요구사항 검증" n={cov.requirements.verified} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.verified, cov.requirements.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
            <Tile lbl="고객 검수" n={cov.requirements.signedOff} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.signedOff, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
            <Tile lbl="검증 공백" n={cov.gaps.unverified.length} d=" 기능" pct={cov.functions.total ? pct(cov.gaps.unverified.length, cov.functions.total) : 0} bar={`linear-gradient(90deg,#9c6360,${BAD})`} />
          </div>
        )}
        {model.functions.length === 0 ? <div className="text-text-muted" style={{ fontSize: 13 }}>기능이 없습니다.</div> : model.domains.map((domain) => {
          const rows = model.functions.filter((f) => f.domainId === domain.id);
          if (rows.length === 0) return null;
          const confirmedN = rows.filter(isConfirmed).length;
          const isNew = domain.id.startsWith("to-be:");
          return (
            <section key={domain.id} style={{ marginBottom: 26 }}>
              <div className="flex items-center gap-3" style={{ padding: "0 4px 11px" }}>
                <span style={{ color: isNew ? OK : GOLD, fontSize: 11 }}>{isNew ? "✦" : "◆"}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--color-text-primary)" }}>{domain.name}</span>
                <span className="text-faint" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: FAINT }}>{domain.id.replace(/^(domain:|to-be:)/, "")}{isNew ? " · 신규" : ""}</span>
                <span className="text-text-muted ml-auto" style={{ fontSize: 11.5 }}>기능 {domain.functionCount} · 확정 {confirmedN}/{rows.length}</span>
              </div>
              <div style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 880 }}>
                    <thead><tr>
                      {["기능", ...COLS.map((c) => c.label)].map((h) => <th key={h} style={{ padding: "10px 12px", borderBottom: BORDER, background: "var(--color-elevated)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>)}
                      {/* R7: 사용자 정의 필드 열 — 헤더 × 로 정의 삭제(값 비파괴 보존). */}
                      {effFields.map((cf) => (
                        <th key={cf.id} style={{ padding: "10px 12px", borderBottom: BORDER, background: "var(--color-elevated)", color: NFR, textAlign: "left", whiteSpace: "nowrap", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>
                          {cf.label}
                          {canWrite && <button type="button" title="필드 삭제(값은 보존 — 재등록 시 복원)" onClick={(e) => { e.stopPropagation(); if (window.confirm(`'${cf.label}' 필드를 삭제할까요? (행 값은 보존)`)) void postField("remove", cf.id); }} className="text-text-muted hover:text-red-400" style={{ marginLeft: 5, fontSize: 10, border: "none", background: "none", cursor: "pointer" }}>×</button>}
                        </th>
                      ))}
                      <th style={{ padding: "10px 12px", borderBottom: BORDER, background: "var(--color-elevated)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>
                        상태
                        {canWrite && <button type="button" title="사용자 정의 필드 추가(전 기능 공통 열, R7)" onClick={(e) => { e.stopPropagation(); addField(); }} className="text-text-muted hover:text-accent" style={{ marginLeft: 7, fontSize: 10.5, border: BORDER, borderRadius: 4, background: "none", cursor: "pointer", padding: "1px 6px" }}>＋필드</button>}
                      </th>
                    </tr></thead>
                    <tbody>{rows.map((f) => (
                      <tr key={f.id} onClick={() => openFunction(f.id)} style={{ cursor: "pointer", background: f.id === selFn ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : undefined, boxShadow: isConfirmed(f) ? `inset 2px 0 0 ${GOLD}` : undefined }} className="hover:bg-accent/[0.045]">
                        <td style={{ borderBottom: BORDER, padding: "11px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <div><span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{f.featureId}</span>{f.requirementHistory.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: GOLD_DIM, marginLeft: 6 }}>◷{f.requirementHistory[f.requirementHistory.length - 1]}{f.rules.length > 0 ? ` · 규칙 ${f.rules.length}` : ""}</span>}</div>
                          <div style={{ marginTop: 3 }}><span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{effCell(f, "name")}</span>
                            {f.nfrTags.map((t) => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8.5, fontFamily: "var(--font-mono)", color: NFR, background: "rgba(120,160,190,.12)", border: "1px solid rgba(120,160,190,.25)", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>⚡{t}</span>)}</div>
                        </td>
                        {COLS.map((c) => <TraceTd key={c.key} f={f} c={c} />)}
                        {effFields.map((cf) => {
                          const v = effCustom(f, cf.id);
                          return <td key={cf.id} style={{ borderBottom: BORDER, padding: "11px 12px", verticalAlign: "top" }}><span style={{ fontSize: 12.5, color: v ? "var(--color-text-secondary)" : FAINT }}>{v || "—"}</span></td>;
                        })}
                        <td style={{ borderBottom: BORDER, padding: "11px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>{isConfirmed(f) ? <TrustBadge confirmedBy={fnOv[f.id].approver} /> : <Pill label={STATE_LABEL[f.state]} color={STATE_COLOR[f.state]} />}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })}
      </>
    );
  }

  // ── 뷰② 요청 기준 (요청 REQ → 요구사항 SFR… → AC) ──
  function RequirementView() {
    if (!model) return null;
    if (model.requirements.length === 0) return <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>등록된 요청이 없습니다. <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>＋ 새 요청</code> 으로 자연어 요청을 분해·문서화하거나 rtm-requirements.json 으로 작성합니다.</div>;
    // 요청(REQ)별 그룹핑 — 한 요청이 여러 요구사항으로 분해된다.
    const groups = new Map<string, Requirement[]>();
    for (const r of model.requirements) {
      const rid = requestIdOf(r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid)!.push(r);
    }
    const reqIds = [...groups.keys()].sort((a, b) =>
      a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    );
    return <>{reqIds.map((rid) => <RequestCard key={rid} reqId={rid} members={groups.get(rid)!} />)}</>;
  }

  function RequestCard({ reqId, members }: { reqId: string; members: Requirement[] }) {
    const open = expandedRequests.has(reqId);
    const ungrouped = reqId === UNGROUPED;
    const selfReq = members.find((m) => m.id === reqId); // 요청-레벨 단일 요구사항(레거시 REQ-001 류)
    const title = ungrouped ? "분류되지 않은 요구사항" : selfReq ? selfReq.text : members.find((m) => m.source?.raw)?.source?.raw ?? "";
    const live = members.filter((m) => m.status === "ACTIVE");
    const deadN = members.length - live.length;
    const allDead = live.length === 0;
    const ordered = [...live, ...members.filter((m) => m.status !== "ACTIVE")];
    const running = changeRunning && changeReqId === reqId;
    const canWithdraw = !ungrouped && live.length > 0; // 유효 요구가 남은 정식 요청만 철회 가능
    const catCount = live.reduce((acc, r) => { const c = r.id.match(/^[A-Z]+/)?.[0] ?? "?"; acc[c] = (acc[c] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    return (
      <section style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 14, marginBottom: 14, overflow: "hidden", opacity: allDead ? 0.7 : 1 }}>
        <div className="flex items-center gap-3" style={{ padding: "15px 20px", cursor: "pointer" }} onClick={() => setExpandedRequests((p) => { const n = new Set(p); if (n.has(reqId)) n.delete(reqId); else n.add(reqId); return n; })}>
          <span style={{ color: "var(--color-text-muted)", fontSize: 10, width: 11, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
          {ungrouped ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: FAINT }}>{UNGROUPED}</span>
            : <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: allDead ? FAINT : GOLD, border: `1px solid ${allDead ? FAINT : GOLD}55`, borderRadius: 5, padding: "2px 8px", textDecoration: allDead ? "line-through" : "none" }}>{reqId}</span>}
          <span style={{ fontSize: 14.5, color: allDead ? "var(--color-text-secondary)" : "var(--color-text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 600 }}>{title}</span>
          <span className="ml-auto flex items-center gap-3 text-text-muted" style={{ fontSize: 11.5 }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{Object.entries(catCount).map(([c, n]) => `${c} ${n}`).join(" · ") || "—"}</span>
            <span>요구사항 {members.length}{deadN ? ` · 폐기 ${deadN}` : ""}</span>
            {canWithdraw && <button type="button" onClick={(e) => { e.stopPropagation(); void startChange(reqId); }} disabled={running}
              className="rounded-md border transition-colors disabled:opacity-60"
              style={{ padding: "3px 10px", fontSize: 11, borderColor: running ? FAINT : `${BAD}66`, color: running ? "var(--color-text-muted)" : BAD }}
              title="이 요청을 철회 — 하위 요구사항 동반 폐기 + 변경관리 문서(CR) 생성(삭제 아님, 이력 보존)">
              {running ? "철회 중…" : "변경요청"}</button>}
          </span>
        </div>
        {open && <div style={{ padding: "2px 14px 12px", borderTop: BORDER }}>
          {ordered.map((m) => <ReqCard key={m.id} r={m} dead={m.status !== "ACTIVE"} nested />)}
        </div>}
      </section>
    );
  }

  function ReqCard({ r, dead, nested }: { r: Requirement; dead?: boolean; nested?: boolean }) {
    if (!model) return null;
    const open = expandedReqs.has(r.id);
    const counts = (["removed", "modified", "added", "revived"] as Array<keyof Changeset>).filter((k) => r.changeset[k].length > 0);
    const targets = [...new Set([...r.changeset.added, ...r.changeset.modified, ...r.changeset.revived, ...r.changeset.removed])];
    const so = effSignoff(r);
    return (
      <section style={{ background: nested ? "var(--color-surface)" : "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: nested ? 11 : 14, marginTop: nested ? 10 : 0, marginBottom: nested ? 0 : 14, overflow: "hidden", opacity: dead ? 0.68 : 1 }}>
        <div className="flex items-center gap-3" style={{ padding: "14px 20px", cursor: "pointer" }} onClick={() => setExpandedReqs((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: dead ? "none" : r.type === "nonfunctional" ? NFR : GOLD, border: dead ? `1.5px solid ${FAINT}` : "none", boxShadow: dead ? "none" : `0 0 0 4px ${r.type === "nonfunctional" ? "color-mix(in srgb, var(--color-status-info) 14%, transparent)" : "color-mix(in srgb, var(--color-accent) 14%, transparent)"}` }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)", textDecoration: dead ? "line-through" : "none" }}>{r.id}</span>
          <span style={{ fontSize: 15, color: dead ? "var(--color-text-secondary)" : "var(--color-text-primary)", fontWeight: 500 }}>{r.text}</span>
          {dead ? <Pill label={r.status === "WITHDRAWN" ? (r.changeReq?.crNo ? `폐기 ${r.changeReq.crNo}` : "폐기(철회)") : "폐기"} color="var(--color-text-muted)" bg="rgba(255,255,255,.04)" />
            : r.type === "nonfunctional" ? <Pill label={`⚡ 비기능 · ${NFR_CAT[r.nfrCategory ?? "other"] ?? "기타"}`} color={NFR} bg="rgba(120,160,190,.12)" />
              : <><Pill label="● 현행" color={GOLD} bg="color-mix(in srgb, var(--color-accent) 12%, transparent)" />{r.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: PRIORITY[r.priority].color, background: PRIORITY[r.priority].bg }}>{PRIORITY[r.priority].label}</span>}</>}
          {r.supersedes && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: GOLD_DIM }}>⟵ {r.supersedes} 대체</span>}
          {dead && r.supersededBy && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: GOLD_DIM }}>⟶ {r.supersededBy} 이 대체</span>}
          <span className="ml-auto flex items-center gap-2">
            {!dead && r.type === "functional" && <span className="flex gap-2 text-text-muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
              {r.source?.requester && <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>👤 {r.source.requester}</span>}
              {r.changeReq?.crNo && <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>{r.changeReq.crNo}{r.changeReq.effort ? ` · ${r.changeReq.effort}` : ""}</span>}
              <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>{LIFECYCLE_LABEL[effLifecycle(r)] ?? effLifecycle(r)}</span>
              {so?.approved && <span style={{ color: GOLD }}>✓검수</span>}
            </span>}
            {r.type === "nonfunctional" && r.nfrScope.length > 0 && <span className="text-text-muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>횡단: {r.nfrScope.map((id) => fnById(id)?.name ?? id).join(" · ")}</span>}
            <span className="flex gap-2" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{counts.map((k) => <span key={k} style={{ color: VERB[k].color }}>{VERB[k].sym}{r.changeset[k].length}</span>)}</span>
            {!dead && <button type="button" onClick={(e) => { e.stopPropagation(); setSelFn(null); setSelReq(r.id); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors" style={{ padding: "3px 10px", fontSize: 11 }}>검증</button>}
          </span>
        </div>
        {open && (
          <div style={{ padding: "4px 20px 16px", borderTop: BORDER }}>
            {r.source?.raw && <div className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: "8px 0 6px" }}>본문: {r.source.raw}</div>}
            {r.acceptanceCriteria.length > 0 && <AcMatrix r={r} targets={r.changeset.added.concat(r.changeset.modified, r.changeset.revived)} />}
            {/* AC 유무와 무관하게 영향 기능을 항상 클릭 목록으로(정방향 연결 가시화). */}
            <div style={{ marginTop: r.acceptanceCriteria.length > 0 ? 12 : 6 }}>
              <div className="text-text-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px 2px" }}>영향 기능{targets.length > 0 ? ` (${targets.length})` : ""}</div>
              {targets.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>연결된 기능 없음.</div> : targets.map((id) => {
                const v = verbOf(r, id); const f = fnById(id);
                return <button key={id} type="button" onClick={() => openFunction(id)} className="flex items-center gap-2.5 w-full text-left rounded-md hover:bg-elevated/50 transition-colors" style={{ padding: "6px 8px" }}>
                  {v && <><span style={{ color: VERB[v].color, fontFamily: "var(--font-mono)", fontSize: 13, width: 15, textAlign: "center", fontWeight: 600 }}>{VERB[v].sym}</span><span className="text-text-muted" style={{ fontSize: 11, width: 34 }}>{VERB[v].label}</span></>}
                  <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{f ? <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f.featureId}</span>{effCell(f, "name")}</> : id}</span>
                  {f && <span className="ml-auto text-text-muted" style={{ fontSize: 10.5 }}>{STATE_LABEL[f.state]}</span>}
                </button>;
              })}
            </div>
          </div>
        )}
      </section>
    );
  }

  function AcMatrix({ r, targets }: { r: Requirement; targets: string[] }) {
    const cols = [...new Set(targets)];
    return (
      <div style={{ marginTop: 10, border: BORDER, borderRadius: 11, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: `2.6fr .8fr ${cols.map(() => "1fr").join(" ")} .9fr`, background: "var(--color-elevated)", padding: "9px 14px", alignItems: "center" }}>
          {["인수조건 (AC)", "유형", ...cols.map((id) => fnById(id)?.name ?? id), "시험"].map((h, i) => <span key={i} className="text-text-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600, textAlign: i === 0 ? "left" : "center" }}>{h}</span>)}
        </div>
        {r.acceptanceCriteria.map((ac) => {
          const t0 = ac.tests[0]; const res = t0 ? effTest(r, ac.id, t0) : "UNTESTED";
          return (
            <div key={ac.id} style={{ display: "grid", gridTemplateColumns: `2.6fr .8fr ${cols.map(() => "1fr").join(" ")} .9fr`, padding: "10px 14px", borderTop: BORDER, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{ac.id}</span>{ac.text}</span>
              <span style={{ justifySelf: "center", fontSize: 9.5, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: AC_KIND[ac.kind].color, background: "color-mix(in srgb,currentColor 14%,transparent)" }}>{AC_KIND[ac.kind].label}</span>
              {cols.map((id) => <span key={id} style={{ justifySelf: "center", color: ac.fnIds.includes(id) ? GOLD : FAINT, fontSize: ac.fnIds.includes(id) ? 13 : 11 }}>{ac.fnIds.includes(id) ? "●" : "·"}</span>)}
              <span style={{ justifySelf: "center", fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TEST_RES[res].color, background: res === "PASS" ? "rgba(127,174,138,.14)" : "var(--color-elevated)" }}>{TEST_RES[res].label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ── 뷰③ 시험(W5) — 단위테스트 시나리오 초안(결정론 생성) 검토·편집·확정 ──
  function ScenarioView() {
    if (!model) return null;
    if (scenarios.length === 0) return <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>테스트 시나리오가 없습니다. <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>understand-rtm</code> 을 재실행하면 기능 행별 정상/예외/경계 초안이 생성됩니다(전부 [추정]).</div>;
    const byFn = new Map<string, TestScenario[]>();
    for (const s of scenarios) { if (!byFn.has(s.fnId)) byFn.set(s.fnId, []); byFn.get(s.fnId)!.push(s); }
    const sc = cov?.scenarios;
    return (
      <>
        <div className="flex gap-2.5" style={{ marginBottom: 22 }}>
          <Tile lbl="시나리오" n={sc?.total ?? scenarios.length} />
          <Tile lbl="확정" n={tsConfirmedCount} d={`/${scenarios.length}`} pct={pct(tsConfirmedCount, scenarios.length)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
          <Tile lbl="정상 / 예외 / 경계" n={`${sc?.byKind.normal ?? 0} / ${sc?.byKind.exception ?? 0} / ${sc?.byKind.boundary ?? 0}`} />
          <Tile lbl="보강 필요" n={scenarios.filter((s) => s.notes.length > 0).length} d=" 건" />
        </div>
        <div className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 16, maxWidth: 760 }}>
          기능 행의 코드 근거(진입점·데이터·인수조건)에서 <b>결정론 생성한 초안</b>입니다 — 전부 [추정]. 행을 눌러 Given/When/Then 을 검토·편집·확정하세요(확정은 재생성에도 유지). 시험 <b>수행 결과</b>는 요청 기준 탭의 인수조건 시험결과에 기록합니다.
        </div>
        {model.functions.map((f) => {
          const list = byFn.get(f.id) ?? [];
          if (list.length === 0) return null;
          const confirmedN = list.filter(tsConfirmed).length;
          return (
            <section key={f.id} style={{ marginBottom: 18 }}>
              <div className="flex items-center gap-3" style={{ padding: "0 4px 9px" }}>
                <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{f.featureId}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, color: "var(--color-text-primary)" }}>{effCell(f, "name")}</span>
                <span className="text-text-muted" style={{ fontSize: 11 }}>{f.domainName}</span>
                <span className="text-text-muted ml-auto" style={{ fontSize: 11 }}>확정 {confirmedN}/{list.length}</span>
              </div>
              <div style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 900 }}>
                    <thead><tr>{["ID", "구분", "제목", "Given", "When", "Then", "상태"].map((h) => <th key={h} style={{ padding: "9px 12px", borderBottom: BORDER, background: "var(--color-elevated)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                    <tbody>{list.map((s) => (
                      <tr key={s.id} onClick={() => { setSelTs(s.id); setTsEditing(false); setTsSaveError(null); }} style={{ cursor: "pointer", background: s.id === selTs ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : undefined, boxShadow: tsConfirmed(s) ? `inset 2px 0 0 ${GOLD}` : undefined }} className="hover:bg-accent/[0.045]">
                        <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-text-muted)", verticalAlign: "top" }}>{s.id.replace(/^TS-/, "")}{s.acId && <div style={{ color: GOLD_DIM, fontSize: 9.5 }}>{s.reqId}·{s.acId}</div>}</td>
                        <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TS_KIND[s.kind].color, background: "color-mix(in srgb,currentColor 13%,transparent)" }}>{TS_KIND[s.kind].label}</span></td>
                        <td style={{ borderBottom: BORDER, padding: "9px 12px", verticalAlign: "top", color: "var(--color-text-primary)", fontSize: 12.5, fontWeight: 500 }}>{effTs(s, "title")}{s.notes.length > 0 && <span title={s.notes.join("\n")} style={{ marginLeft: 5, color: WARN, fontSize: 10 }}>⚠</span>}</td>
                        {(["given", "when", "then"] as const).map((k) => <td key={k} style={{ borderBottom: BORDER, padding: "9px 12px", verticalAlign: "top", color: "var(--color-text-secondary)", fontSize: 12, maxWidth: 240 }}>{effTs(s, k)}</td>)}
                        <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>{tsConfirmed(s) ? <TrustBadge confirmedBy={scOv[s.id]?.approver ?? "확정"} /> : confChip("추정", WARN)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })}
      </>
    );
  }

  // ── 시나리오 드로어 — G/W/T 검토·편집·확정(기능 드로어와 동형) ──
  function ScenarioDrawer() {
    const s = selectedTs!;
    const fn = fnById(s.fnId);
    const confirmed = tsConfirmed(s);
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "44vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
        <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
          <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{s.id}</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TS_KIND[s.kind].color, background: "color-mix(in srgb,currentColor 13%,transparent)" }}>{TS_KIND[s.kind].label}</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: "var(--color-text-primary)" }}>{effTs(s, "title")}</span>
          {confirmed ? <TrustBadge confirmedBy={scOv[s.id]?.approver ?? "확정"} /> : <Pill label="초안 [추정]" color={WARN} />}
          <span className="ml-auto flex items-center gap-2">
            {tsSaveError && <span className="text-amber-400" style={{ fontSize: 11 }}>저장 실패: {tsSaveError}</span>}
            {!canWrite ? <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span> : tsEditing ? (
              <><button type="button" onClick={() => setTsEditing(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 13px", fontSize: 12 }}>취소</button>
                <button type="button" onClick={() => void confirmScenario(true)} disabled={tsSaving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>{tsSaving ? "저장 중…" : "저장 + 확정"}</button></>
            ) : (
              <>{!confirmed && <button type="button" onClick={() => void confirmScenario(false)} disabled={tsSaving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>✓ 확정</button>}
                <button type="button" onClick={() => { setTsDraft({ title: effTs(s, "title"), given: effTs(s, "given"), when: effTs(s, "when"), then: effTs(s, "then") }); setTsEditing(true); setTsSaveError(null); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 13px", fontSize: 12 }}>편집</button></>
            )}
            <button type="button" onClick={() => { setSelTs(null); setTsEditing(false); }} className="text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
          </span>
        </div>
        <div style={{ padding: "16px 24px" }}>
          <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 12 }}>
            대상 기능: <button type="button" onClick={() => openFunction(s.fnId)} className="text-text-secondary hover:text-accent" style={{ fontSize: 11.5 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 4 }}>{fn?.featureId}</span>{fn ? effCell(fn, "name") : s.fnId}</button>
            {s.reqId && <span style={{ marginLeft: 10 }}>연관: <span style={{ fontFamily: "var(--font-mono)", color: GOLD_DIM }}>{s.reqId}{s.acId ? ` · ${s.acId}` : ""}</span></span>}
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>
            {(["title", "given", "when", "then"] as const).map((key) => (
              <tr key={key}><td style={{ padding: "8px 12px 8px 0", color: "var(--color-text-muted)", whiteSpace: "nowrap", verticalAlign: "top", width: 70, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{key === "title" ? "제목" : key}</td>
                <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                  {tsEditing ? <textarea value={tsDraft[key] ?? ""} onChange={(e) => setTsDraft((d) => ({ ...d, [key]: e.target.value }))} rows={key === "title" ? 1 : 2} className="w-full resize-y bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} />
                    : <span className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{effTs(s, key)}</span>}
                </td></tr>
            ))}
          </tbody></table>
          {s.evidence.length > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginTop: 8 }}>근거: {s.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join(", ")}</div>}
          {s.notes.length > 0 && <div style={{ marginTop: 8 }}>{s.notes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: WARN }}>⚠ {n}</div>)}</div>}
        </div>
      </div>
    );
  }

  // ── 뷰④ 현황 ──
  function StatusView() {
    if (!model) return null;
    if (!cov) return <div className="text-text-muted" style={{ fontSize: 13 }}>커버리지 데이터가 없습니다(rtm.json v2 재생성 필요).</div>;
    const Gap = ({ title, color, ids, render }: { title: string; color: string; ids: string[]; render: (id: string) => React.ReactNode }) => (
      <div style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 13, overflow: "hidden" }}>
        <h3 className="flex items-center gap-2" style={{ fontSize: 12, padding: "12px 16px", borderBottom: BORDER, color }}>{title}<span className="ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{ids.length}</span></h3>
        {ids.length === 0 ? <div className="text-text-muted" style={{ padding: "12px 16px", fontSize: 12 }}>없음 ✓</div> : ids.map((id) => <div key={id} style={{ padding: "9px 16px", borderBottom: BORDER, fontSize: 12.5, color: "var(--color-text-secondary)" }}>{render(id)}</div>)}
      </div>
    );
    return (
      <>
        <div className="text-accent" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>커버리지</div>
        <div className="flex gap-2.5" style={{ marginBottom: 14 }}>
          <Tile lbl="요구사항" n={cov.requirements.total} />
          <Tile lbl="구현" n={cov.requirements.implemented} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.implemented, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
          <Tile lbl="검증" n={cov.requirements.verified} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.verified, cov.requirements.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
          <Tile lbl="검수" n={cov.requirements.signedOff} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.signedOff, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
          <Tile lbl="시험 통과" n={cov.tests.pass} d={`/${cov.tests.total}`} pct={pct(cov.tests.pass, cov.tests.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
        </div>
        <div style={{ color: BAD, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>갭 리포트 — 빈칸 = 위험</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          <Gap title="🚫 고아 코드" color={BAD} ids={cov.gaps.orphanCode} render={(id) => { const f = fnById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f?.featureId ?? id}</span>{f?.name ?? id} — 현행 요구 없음</>; }} />
          <Gap title="⚠ 미구현 요구" color={WARN} ids={cov.gaps.unimplemented} render={(id) => { const r = reqById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{id}</span>{r?.text ?? id}{r?.type === "nonfunctional" ? "(성능)" : ""}</>; }} />
          <Gap title="◔ 미검증 기능" color="var(--color-text-muted)" ids={cov.gaps.unverified} render={(id) => { const f = fnById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f?.featureId ?? id}</span>{f?.name ?? id}</>; }} />
        </div>
        {diags.length > 0 && (
          <>
            <div style={{ color: errCount > 0 ? BAD : WARN, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", margin: "24px 0 12px" }}>무결성 진단</div>
            <div style={{ background: "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: 13, overflow: "hidden" }}>
              {diags.map((d, i) => <div key={i} className="flex items-center gap-3" style={{ padding: "9px 16px", borderBottom: i < diags.length - 1 ? BORDER : "none", fontSize: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: d.level === "error" ? BAD : WARN, border: `1px solid ${d.level === "error" ? "rgba(207,138,134,.3)" : "rgba(216,162,94,.3)"}`, borderRadius: 4, padding: "1px 6px" }}>{d.level}</span>
                <span className="text-text-secondary">{d.message}</span>{d.ref && <span className="text-text-muted ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{d.ref}</span>}
              </div>)}
            </div>
          </>
        )}
      </>
    );
  }

  // ── 기능 드로어 ──
  function FunctionDrawer() {
    const f = selectedFn!;
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "48vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
        <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
          <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{f.featureId}</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "var(--color-text-primary)" }}>{effCell(f, "name")}</span>
          {isConfirmed(f) ? <TrustBadge confirmedBy={fnOv[f.id].approver} /> : <Pill label={STATE_LABEL[f.state]} color={STATE_COLOR[f.state]} />}
          <span className="ml-auto flex items-center gap-2">
            {saveError && <span className="text-amber-400" style={{ fontSize: 11 }}>저장 실패: {saveError}</span>}
            {!canWrite ? <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span> : editing ? (
              <><button type="button" onClick={() => setEditing(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 13px", fontSize: 12 }}>취소</button>
                <button type="button" onClick={() => onConfirm(true)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>{saving ? "저장 중…" : "저장 + 확정"}</button></>
            ) : (
              <>{!isConfirmed(f) && <button type="button" onClick={() => onConfirm(false)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>✓ 확정</button>}
                <button type="button" onClick={beginEdit} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 13px", fontSize: 12 }}>편집</button></>
            )}
            <button type="button" onClick={() => { setSelFn(null); setEditing(false); }} className="text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
          <div style={{ padding: "18px 24px", borderRight: BORDER }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>
              {([{ key: "name" as const, label: "기능명" }, ...COLS] as Array<{ key: CellKey | "name"; label: string }>).map(({ key, label }) => {
                const cell = key === "name" ? null : f[key];
                return <tr key={key}><td style={{ padding: "9px 12px 9px 0", color: "var(--color-text-muted)", whiteSpace: "nowrap", verticalAlign: "top", width: 88, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</td>
                  <td style={{ padding: "9px 0", verticalAlign: "top" }}>
                    {editing ? <input value={draft[key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="w-full bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} /> : (
                      <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{effCell(f, key).length > 0 ? effCell(f, key) : <span style={{ color: FAINT }}>—</span>}{cell && confChip(isEdited(f, key) ? "확정" : CONF[cell.confidence].label, isEdited(f, key) ? GOLD : CONF[cell.confidence].color)}</span>
                    )}
                    {!editing && cell && cell.evidence.length > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginTop: 3 }}>근거: {cell.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join(", ")}</div>}
                  </td></tr>;
              })}
              {/* R7: 사용자 정의 필드 값 — 편집·확정 경로는 기존 셀과 동일(custom:* 키). */}
              {effFields.map((cf) => (
                <tr key={cf.id}><td style={{ padding: "9px 12px 9px 0", color: NFR, whiteSpace: "nowrap", verticalAlign: "top", width: 88, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{cf.label}</td>
                  <td style={{ padding: "9px 0", verticalAlign: "top" }}>
                    {editing ? <input value={draft[cf.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [cf.id]: e.target.value }))} className="w-full bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} />
                      : <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{effCustom(f, cf.id) || <span style={{ color: FAINT }}>—</span>}</span>}
                  </td></tr>
              ))}
            </tbody></table>
            {/* W5: 이 기능의 시험 시나리오 요약 — 시험 탭으로 연결. */}
            {scenarios.some((s) => s.fnId === f.id) && (
              <button type="button" onClick={() => { setView("scenario"); setSelFn(null); setSelTs(null); }} className="flex items-center gap-2 rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors" style={{ marginTop: 12, padding: "6px 12px", fontSize: 11.5 }}>
                🧪 시험 시나리오 {scenarios.filter((s) => s.fnId === f.id).length}건
                <span className="text-text-muted">(확정 {scenarios.filter((s) => s.fnId === f.id && tsConfirmed(s)).length})</span>
                <span className="text-text-muted">— 시험 탭에서 검토 ›</span>
              </button>
            )}
          </div>
          <div style={{ padding: "18px 24px", overflow: "auto" }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: GOLD_DIM, marginBottom: 12 }}>📋 업무 규칙 — 이 기능이 충족할 조건</div>
            {f.rules.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5, marginBottom: 16 }}>관련 업무규칙 없음.</div> : f.rules.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5" style={{ padding: "7px 0", borderBottom: BORDER }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: GOLD_DIM, whiteSpace: "nowrap" }}>{r.reqId}·{r.acId}</span>
                <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}><span style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", padding: "1px 6px", borderRadius: 5, color: AC_KIND[r.kind].color, background: "color-mix(in srgb,currentColor 14%,transparent)", marginRight: 6 }}>{AC_KIND[r.kind].label}</span>{r.text}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: GOLD_DIM, margin: "18px 0 10px" }}>📜 요청별 이력</div>
            {f.requirementHistory.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>관련 요구사항 없음 (AS-IS).</div> : [...f.requirementHistory].reverse().map((reqId, i) => {
              const r = reqById(reqId); if (!r) return null; const v = verbOf(r, f.id); const head = i === 0;
              return <button key={reqId} type="button" onClick={() => { setView("requirement"); setSelFn(null); setExpandedReqs((p) => new Set(p).add(reqId)); }} className="flex items-center gap-2 w-full text-left rounded-md hover:bg-elevated/50" style={{ padding: "5px 6px" }}>
                <span style={{ color: head ? GOLD : "var(--color-text-muted)", fontSize: 11 }}>{head ? "●" : "│"}</span>
                <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{r.id}</span>
                {v && <span style={{ color: VERB[v].color, fontSize: 11 }}>{VERB[v].sym} {VERB[v].label}</span>}
                <span className="text-text-secondary" style={{ fontSize: 12 }}>{r.text}</span>
                <span className="ml-auto text-text-muted" style={{ fontSize: 10.5 }}>{r.status !== "ACTIVE" ? "폐기" : head ? "현행" : ""}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── 요구사항 검증 드로어 ──
  function RequirementDrawer() {
    const r = selectedReq!;
    const so = effSignoff(r);
    const lc = effLifecycle(r);
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "50vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
        <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
          <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.id}</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "var(--color-text-primary)" }}>{r.text}</span>
          <Pill label="● 현행" color={GOLD} bg="color-mix(in srgb, var(--color-accent) 12%, transparent)" />
          {r.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: PRIORITY[r.priority].color, background: PRIORITY[r.priority].bg }}>{PRIORITY[r.priority].label}</span>}
          {!canWrite && <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span>}
          <button type="button" onClick={() => setSelReq(null)} className="ml-auto text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
          <div style={{ padding: "18px 24px", borderRight: BORDER }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: GOLD_DIM, marginBottom: 12 }}>🧪 인수조건 시험 결과 — 사람 기록</div>
            {r.acceptanceCriteria.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>인수조건이 없습니다.</div> : r.acceptanceCriteria.map((ac) => {
              const t0 = ac.tests[0];
              const res = t0 ? effTest(r, ac.id, t0) : "UNTESTED";
              return <div key={ac.id} className="flex items-center gap-2.5" style={{ padding: "9px 0", borderBottom: BORDER }}>
                <span className="flex-1 text-text-secondary" style={{ fontSize: 12 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 5 }}>{ac.id}</span>{ac.text}{!t0 && <span className="text-text-muted" style={{ fontSize: 10, marginLeft: 6 }}>(케이스 미정)</span>}</span>
                {t0 && <div className="flex rounded-lg overflow-hidden" style={{ border: BORDER }}>
                  {(["PASS", "FAIL", "NA"] as TestResult[]).map((rr) => <button key={rr} type="button" disabled={!canWrite} onClick={() => postReq(r.id, { tests: { [`${ac.id}::${t0.caseId}`]: { result: rr, defectId: null } } })}
                    style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", padding: "4px 9px", border: "none", borderRight: BORDER, cursor: canWrite ? "pointer" : "default", background: res === rr ? (rr === "PASS" ? "rgba(127,174,138,.16)" : rr === "FAIL" ? "rgba(207,138,134,.16)" : "var(--color-elevated)") : "transparent", color: res === rr ? (rr === "PASS" ? OK : rr === "FAIL" ? BAD : "var(--color-text-secondary)") : "var(--color-text-muted)" }}>{rr === "NA" ? "N/A" : rr}</button>)}
                </div>}
              </div>;
            })}
          </div>
          <div style={{ padding: "18px 24px" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>진행 상태 (lifecycle)</div>
              <select value={lc} disabled={!canWrite} onChange={(e) => postReq(r.id, { lifecycle: e.target.value })} className="w-full bg-elevated text-text-primary rounded-lg border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "8px 11px" }}>
                {LIFECYCLE_ORDER.map((l) => <option key={l} value={l}>{LIFECYCLE_LABEL[l]}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>고객 검수 (signoff)</div>
              <div className="flex items-center gap-2.5" style={{ background: "color-mix(in srgb, var(--color-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)", borderRadius: 10, padding: "11px 14px" }}>
                <span style={{ color: so?.approved ? GOLD : "var(--color-text-muted)", fontSize: 12 }}>{so?.approved ? `✓ 검수 완료${so.by ? ` (${so.by})` : ""}` : "아직 검수 전"}</span>
                {canWrite && <button type="button" onClick={() => postReq(r.id, { signoff: so?.approved ? null : { approved: true, by: resolveApprover(), at: new Date().toISOString() } })} className="ml-auto rounded-lg" style={{ fontSize: 11.5, fontWeight: 600, color: GOLD, border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", padding: "6px 13px" }}>{so?.approved ? "검수 취소" : "고객 검수 승인"}</button>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>메타</div>
              <div className="flex flex-wrap gap-3" style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 8, padding: "9px 12px", fontSize: 12 }}>
                <span className="text-text-muted">우선순위 <b style={{ color: PRIORITY[r.priority]?.color }}>{PRIORITY[r.priority]?.label}</b></span>
                {r.source?.requester && <span className="text-text-muted">요청자 <b className="text-text-secondary">{r.source.requester}</b></span>}
                {r.changeReq?.crNo && <span className="text-text-muted">변경 <b className="text-text-secondary">{r.changeReq.crNo}</b></span>}
                {r.source?.targetRelease && <span className="text-text-muted">릴리스 <b className="text-text-secondary">{r.source.targetRelease}</b></span>}
                {r.dependsOn.length > 0 && <span className="text-text-muted">선행 <b className="text-text-secondary">{r.dependsOn.join(", ")}</b></span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }
function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "inline-flex", width: "max-content", color, background: bg ?? "color-mix(in srgb,currentColor 10%,transparent)", boxShadow: `inset 0 0 0 1px color-mix(in srgb,${color} 22%,transparent)` }}>{label}</span>;
}
