import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { useDashboardStore } from "../../store";
import ApproverDialog from "./ApproverDialog";
import { RtmContext } from "./context";
import type { RtmCtx } from "./context";
import FunctionDrawer from "./FunctionDrawer";
import FunctionView from "./FunctionView";
import { IntakeModal, IntakeStepPanel, IntakeStepper } from "./IntakePanel";
import RequirementDrawer from "./RequirementDrawer";
import RequirementView from "./RequirementView";
import ScenarioDrawer from "./ScenarioDrawer";
import ScenarioView from "./ScenarioView";
import StatusView from "./StatusView";
import { useChange } from "./useChange";
import { useIntake } from "./useIntake";
import {
  APPROVER_LS_KEY, BAD, CIRCLED, OK, WARN,
} from "./types";
import type {
  CellKey, CustomField, FnOverride, FunctionRow, ReqOverride, Requirement, RtmModel, RtmTab,
  Signoff, TestRef, TestResult, TestScenario,
} from "./types";

/**
 * 요구사항 추적표(RTM) v2 — 셸. 설계: docs/ktds/RTM_TAB_DESIGN.md / W5: RTM_TEST_SCENARIO_DESIGN.md.
 *
 * 탭 4개: ① 기능 기준(도메인 그리드) ② 요청 기준(요청 REQ → 요구사항 → AC, supersede·NFR)
 * ③ 시험 시나리오(W5 단위테스트 시나리오 — 초안 편집·확정) ④ 커버리지 현황(커버리지·갭).
 * 생성물 rtm.json 불변, 사람 입력은 rtm-overrides.json 오버레이(기능=최상위 fnId, 요구=_requirements,
 * 시나리오=_scenarios, 사용자 필드 정의=_fields).
 * 검증 스파인 입력: 기능 셀 확정(POST /rtm-override) · 요구 시험결과/검수/lifecycle(POST /rtm-req-override)
 * · 시나리오 확정(POST /rtm-scenario-override) · 필드 정의(POST /rtm-field, R7).
 *
 * 상태·콜백은 전부 이 셸이 소유하고 RtmContext 로 내려보낸다 — 뷰/드로어는 rtm/ 의
 * 모듈 레벨 컴포넌트(감사 gap4/8: 본문 내부 정의로 인한 remount·포커스 유실 해소).
 */
export default function RtmView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);
  // demo 모드: 정적 파일을 base(`/demo/`) 아래에서 읽고, 쓰기(편집·인테이크)는 비활성.
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL; // "/demo/" (demo) | "/" (라이브 서버)
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken) && !DEMO_MODE;

  // 인테이크 세션(?sid=)·요구 상세(?req=)에 더해 탭(?view=)·기능(?fn=)·시나리오(?ts=)도
  // URL로 미러(gap1) — 새로고침·딥링크 복원.
  const [searchParams, setSearchParams] = useSearchParams();
  const [model, setModel] = useState<RtmModel | null>(null);
  const [fnOv, setFnOv] = useState<Record<string, FnOverride>>({});
  const [reqOv, setReqOv] = useState<Record<string, ReqOverride>>({});
  // W5/R7: 시나리오 오버레이(_scenarios) · 사용자 필드 정의(_fields — 라이브 원본).
  const [scOv, setScOv] = useState<Record<string, FnOverride>>({});
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldsLive, setFieldsLive] = useState(false); // 오버레이 로드 성공 = _fields 가 진실.
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<RtmTab>("function");
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
  const [toast, setToast] = useState<{ kind: "done" | "failed"; msg: string } | null>(null);
  // gap9: window.prompt 대체 — 확정자 인라인 다이얼로그의 pending resolve.
  const [approverAsk, setApproverAsk] = useState<{ resolve: (v: string | null) => void } | null>(null);

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

  // 단계 인테이크(P4) · 변경관리(P6) — 상태·폴링·복구는 훅으로 이동(기계적 이동, 계약 불변).
  const intake = useIntake({ accessToken, tokenQ, loadModel, setToast });
  const { sid } = intake;
  const { changeReqId, changeRunning, startChange } = useChange({ accessToken, tokenQ, loadModel, setToast });

  // URL(?view=&req=&fn=&ts=) → 상태 — 딥링크·뒤로가기 복원. ?req= 는 기존 계약 그대로
  // 요청 기준 탭을 강제한다(검증 딥링크).
  useEffect(() => {
    const v = searchParams.get("view");
    if ((v === "function" || v === "requirement" || v === "scenario" || v === "status") && v !== view) setView(v);
    const req = searchParams.get("req");
    if (req && req !== selReq) {
      setView("requirement");
      setSelFn(null);
      setSelReq(req);
    } else if (!req && selReq) {
      setSelReq(null);
    }
    const fn = searchParams.get("fn");
    if (fn && fn !== selFn) setSelFn(fn);
    else if (!fn && selFn) setSelFn(null);
    const ts = searchParams.get("ts");
    if (ts && ts !== selTs) setSelTs(ts);
    else if (!ts && selTs) setSelTs(null);
    // 선택 상태는 미러 effect가 관리 — 여기서는 URL 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 상태(view·selFn·selReq·selTs·sid) → URL 미러(replace, 히스토리 오염 없음).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view !== "function") next.set("view", view);
        else next.delete("view");
        if (selFn) next.set("fn", selFn);
        else next.delete("fn");
        if (selReq) next.set("req", selReq);
        else next.delete("req");
        if (selTs) next.set("ts", selTs);
        else next.delete("ts");
        if (sid) next.set("sid", sid);
        else next.delete("sid");
        return next;
      },
      { replace: true },
    );
  }, [view, selFn, selReq, selTs, sid, setSearchParams]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);

  // 확정자 결정 — store → localStorage → 인라인 다이얼로그(gap9: window.prompt 대체, 취소=null).
  const resolveApprover = useCallback((): Promise<string | null> => {
    const fromStore = approverHandle?.trim();
    if (fromStore) return Promise.resolve(fromStore);
    const fromLs = typeof localStorage !== "undefined" ? localStorage.getItem(APPROVER_LS_KEY)?.trim() : undefined;
    if (fromLs) { setApproverHandle(fromLs); return Promise.resolve(fromLs); }
    return new Promise((resolve) => {
      setApproverAsk((prev) => { prev?.resolve(null); return { resolve }; });
    });
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
    const approver = await resolveApprover();
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
    const approver = await resolveApprover();
    if (!approver) return;
    try {
      const res = await fetch(`/rtm-field?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, id, label, approver }) });
      const data = (await res.json().catch(() => null)) as { _fields?: Record<string, { label?: string }>; error?: string } | null;
      if (!res.ok || !data?._fields) { setToast({ kind: "failed", msg: `필드 저장 실패: ${data?.error ?? res.status}` }); return; }
      setFields(Object.entries(data._fields).map(([fid, v]) => ({ id: fid, label: v?.label ?? fid })).sort((a, b) => (a.id < b.id ? -1 : 1)));
      setFieldsLive(true);
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); }
  }, [accessToken, resolveApprover]);

  // gap9: 라벨은 인라인 입력(FunctionView AddFieldButton)에서 받는다 — window.prompt 대체.
  const addField = useCallback((label: string) => {
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
    const approver = await resolveApprover();
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
    const approver = await resolveApprover();
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
  const intakePanelOpen = !!intake.session && !intake.session.discarded && intake.intakeStatus !== "running" && intake.session.producedStep >= 1;

  const ctx: RtmCtx = {
    model, cov, diags, errCount, canWrite, fnOv, reqOv, scOv,
    view, setView, selFn, setSelFn, selReq, setSelReq, selTs, setSelTs,
    selectedFn, selectedReq, selectedTs,
    expandedReqs, setExpandedReqs, expandedRequests, setExpandedRequests, openFunction,
    editing, setEditing, draft, setDraft, saving, saveError, beginEdit, onConfirm,
    tsEditing, setTsEditing, tsDraft, setTsDraft, tsSaving, tsSaveError, setTsSaveError, confirmScenario,
    postReq, postField, addField, resolveApprover,
    effCell, isEdited, isConfirmed, effLifecycle, effSignoff, effTest, fnById, reqById,
    scenarios, effTs, tsConfirmed, tsConfirmedCount, effFields, effCustom,
    changeReqId, changeRunning, startChange,
    intakeOpen: intake.intakeOpen, setIntakeOpen: intake.setIntakeOpen,
    intakeQuery: intake.intakeQuery, setIntakeQuery: intake.setIntakeQuery,
    targetStep: intake.targetStep, setTargetStep: intake.setTargetStep,
    intakeStatus: intake.intakeStatus, intakeError: intake.intakeError, startIntake: intake.startIntake,
    session: intake.session, sessionDocs: intake.sessionDocs, stepBusy: intake.stepBusy,
    viewStep: intake.viewStep, setViewStep: intake.setViewStep,
    advance: intake.advance, confirmStep: intake.confirmStep, saveDoc: intake.saveDoc,
    discardSession: intake.discardSession,
    previewName: intake.previewName, previewMd: intake.previewMd, loadPreview: intake.loadPreview,
    identified: intake.identified, editingDoc: intake.editingDoc, setEditingDoc: intake.setEditingDoc,
    draftDoc: intake.draftDoc, setDraftDoc: intake.setDraftDoc,
    setToast,
  };

  // pmpl-proto .tabs — 하단 보더 탭 + count 보조 표기. gap10: 라벨 축 통일(기준/현황).
  const tabBtn = (k: RtmTab, label: string, count?: number) => (
    <button type="button" onClick={() => { setView(k); setSelFn(null); setSelReq(null); setSelTs(null); setTsEditing(false); }}
      className={`transition-colors cursor-pointer ${view === k ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
      style={{ padding: "8px 14px", fontSize: 13.5, fontWeight: view === k ? 650 : 550, border: "none", background: "none", borderBottom: `2px solid ${view === k ? "var(--color-accent)" : "transparent"}`, marginBottom: -1 }}>
      {label}
      {count != null && <span className="text-text-muted tabular-nums" style={{ fontSize: 11, marginLeft: 4 }}>{count}</span>}
    </button>
  );

  return (
    <RtmContext.Provider value={ctx}>
      <div className="flex-1 min-h-0 flex flex-col bg-root overflow-hidden relative">
        {/* 헤더 — pmpl-proto page-head: h1 + RTM 배지 + 우측 액션(xlsx · 새 요청) */}
        <div className="flex items-end gap-3.5 shrink-0 flex-wrap" style={{ padding: "20px 24px 0" }}>
          <h1 className="font-heading text-text-primary font-bold" style={{ fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.3px" }}>요구사항 추적표</h1>
          <span className="self-center inline-flex items-center whitespace-nowrap font-bold" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: "var(--color-status-info)", background: "color-mix(in srgb, var(--color-status-info) 12%, transparent)" }}>RTM</span>
          <span className="ml-auto flex items-center gap-2">
            {intake.intakeStatus === "running" && (
              <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: WARN }} title="요구사항 단계 생성 진행 중">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                {CIRCLED[Math.min(intake.session?.producedStep ?? 0, 4)]} 단계 생성 중…
              </span>
            )}
            {canWrite && (
              <a
                href={`/doc-xlsx?token=${encodeURIComponent(accessToken ?? "")}&docId=rtm`}
                download="rtm.xlsx"
                className="rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
                style={{ padding: "7px 14px", fontSize: 13, textDecoration: "none" }}
                title="RTM xlsx(문서정보·요구/기능 원장·커버리지 현황) — understand-docs 실행 시점 스냅샷. 행단위 확정 오버레이는 미반영(md/탭이 진실)."
              >
                xlsx 다운로드
              </a>
            )}
            <button type="button" onClick={() => { intake.setIntakeOpen(true); intake.setIntakeError(null); intake.setTargetStep(5); }} disabled={intake.intakeStatus === "running"}
              className="rounded-lg border border-accent bg-panel text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 font-semibold cursor-pointer" style={{ padding: "7px 14px", fontSize: 13 }}
              title="자연어로 새 요구사항을 요청 → 가이드 5단계로 분해·문서화(전부 [추정])">＋ 새 요청</button>
          </span>
        </div>

        {/* P4: 단계 진행 스테퍼 */}
        <IntakeStepper />

        {/* 진단 배너 (#7) — pmpl-proto .banner(좌측 3px 상태 보더) */}
        {diags.length > 0 && (
          <button type="button" onClick={() => setView("status")} className="flex items-center gap-2.5 text-left bg-panel hover:bg-elevated transition-colors cursor-pointer"
            style={{ margin: "12px 24px 0", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-border-subtle)", borderLeft: `3px solid ${errCount > 0 ? BAD : WARN}` }}>
            <span className="inline-flex items-center whitespace-nowrap font-bold" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: errCount > 0 ? BAD : WARN, background: `color-mix(in srgb, ${errCount > 0 ? BAD : WARN} 12%, transparent)` }}>무결성 {diags.length}건</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--color-text-primary)" }}>진단:</span>
            <span className="text-text-muted" style={{ fontSize: 13 }}>{diags[0].message}{diags.length > 1 ? ` 외 ${diags.length - 1}건` : ""}{errCount > 0 ? ` (error ${errCount})` : ""} — 커버리지 현황 탭에서 확인</span>
            <span className="text-text-muted ml-auto" style={{ fontSize: 11 }}>›</span>
          </button>
        )}

        {/* pmpl-proto .tabs — 기준(기능/요청)·시험 시나리오·커버리지 현황 (count 병기) */}
        <div className="shrink-0 flex border-b border-border-subtle" style={{ margin: "10px 24px 0", gap: 2 }}>
          {tabBtn("function", "기능 기준", model?.functions.length)}
          {tabBtn("requirement", "요청 기준", model?.requirements.length)}
          {tabBtn("scenario", "시험 시나리오", model?.testScenarios?.length)}
          {tabBtn("status", "커버리지 현황")}
        </div>

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
        {intake.intakeOpen && <IntakeModal />}

        {/* gap9: 확정자 인라인 입력(window.prompt 대체) */}
        {approverAsk && (
          <ApproverDialog
            onSubmit={(name) => {
              try { localStorage.setItem(APPROVER_LS_KEY, name); } catch { /* */ }
              setApproverHandle(name);
              approverAsk.resolve(name);
              setApproverAsk(null);
            }}
            onCancel={() => { approverAsk.resolve(null); setApproverAsk(null); }}
          />
        )}

        {/* gap6: 하드코딩 다크색 → 상태 토큰 color-mix (배너 패턴과 동일 계열) */}
        {toast && (
          <div
            className="fixed bottom-5 right-5 z-[120] rounded-lg shadow-2xl border max-w-sm"
            style={{
              padding: "12px 16px", fontSize: 13,
              background: `color-mix(in srgb, ${toast.kind === "done" ? OK : BAD} 14%, var(--color-panel))`,
              borderColor: `color-mix(in srgb, ${toast.kind === "done" ? OK : BAD} 45%, transparent)`,
              color: "var(--color-text-primary)",
            }}
            role="status"
            onClick={() => setToast(null)}
          >{toast.msg}</div>
        )}
      </div>
    </RtmContext.Provider>
  );
}
