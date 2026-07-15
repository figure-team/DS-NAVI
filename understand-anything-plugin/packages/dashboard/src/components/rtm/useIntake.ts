import { useCallback, useEffect, useRef, useState } from "react";

import { CIRCLED, STEP_DOC_KIND } from "./types";
import type { RtmSession, SessionDoc } from "./types";
import type { ModelChoice } from "../ModelSelect";

interface Identified { requirements?: { id: string; category: string; name: string; priority?: string; derivedFrom?: string | null }[]; questions?: string[]; request?: { id: string; name: string } }

/**
 * P4 단계 인테이크(가이드 5단계) 상태·진행 — RtmView 본문에서 기계적 이동.
 * 계약(불가침): startIntake/advance/confirmStep/saveDoc/discardSession, 3초 폴링,
 * 마운트 복구(?sid= 딥링크 우선), producedStep>=5 면 추적표 재로드(loadModel).
 */
export function useIntake({ accessToken, tokenQ, loadModel, setToast }: {
  accessToken: string | null;
  tokenQ: string;
  loadModel: () => void;
  setToast: (t: { kind: "done" | "failed"; msg: string } | null) => void;
}) {
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeQuery, setIntakeQuery] = useState("");
  const [targetStep, setTargetStep] = useState(5);
  const [intakeModel, setIntakeModel] = useState<ModelChoice>(""); // "" = 세션 모델(기본)
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [sid, setSid] = useState<string | null>(null);
  const [session, setSession] = useState<RtmSession | null>(null);
  const [sessionDocs, setSessionDocs] = useState<SessionDoc[]>([]);
  const [stepBusy, setStepBusy] = useState(false);
  const [viewStep, setViewStep] = useState<number | null>(null); // null = 산출 최전선(producedStep) 따라감
  // 미리보기/편집
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewMd, setPreviewMd] = useState<string>("");
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [editingDoc, setEditingDoc] = useState(false);
  const [draftDoc, setDraftDoc] = useState("");
  const loadSeq = useRef(0); // 세션 조회 순번 — 늦게 온 응답이 최신 선택을 덮어쓰지 않게(W2).

  const startIntake = useCallback(async () => {
    const q = intakeQuery.trim();
    if (!q) return;
    if (!accessToken) { setIntakeError("읽기전용(라이브 서버 없음) — 인테이크는 dev 서버가 필요합니다."); return; }
    setIntakeError(null);
    try {
      const res = await fetch(`/rtm-intake?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intakeModel ? { request: q, targetStep, model: intakeModel } : { request: q, targetStep }) });
      const d = (await res.json().catch(() => null)) as { job?: { sid?: string }; session?: RtmSession; error?: string } | null;
      if (res.status === 202 && d?.session) {
        setSid(d.session.sid); setSession(d.session); setIntakeStatus("running");
        setIntakeOpen(false); setIntakeQuery(""); setPreviewName(null); setIdentified(null);
      } else { setIntakeError(d?.error ?? `HTTP ${res.status}`); }
    } catch (e) { setIntakeError(String(e)); }
  }, [intakeQuery, targetStep, intakeModel, accessToken]);

  // start..target 진행(다음 단계 / ⑤까지). 컨펌 게이트 미통과면 409 토스트.
  const advance = useCallback(async (toStep: number) => {
    if (!sid || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intakeModel ? { sid, targetStep: toStep, model: intakeModel } : { sid, targetStep: toStep }) });
      const d = (await res.json().catch(() => null)) as { session?: RtmSession; error?: string } | null;
      if (res.status === 202 && d?.session) { setSession(d.session); setIntakeStatus("running"); setPreviewName(null); }
      else setToast({ kind: "failed", msg: d?.error ?? `진행 실패: HTTP ${res.status}` });
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, accessToken, intakeModel, setToast]);

  const confirmStep = useCallback(async (step: number) => {
    if (!sid || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake-confirm?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, step }) });
      const d = (await res.json().catch(() => null)) as { session?: RtmSession; error?: string } | null;
      if (res.ok && d?.session) setSession(d.session);
      else setToast({ kind: "failed", msg: d?.error ?? `컨펌 실패: HTTP ${res.status}` });
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, accessToken, setToast]);

  const saveDoc = useCallback(async () => {
    if (!sid || !previewName || !accessToken) return;
    setStepBusy(true);
    try {
      const res = await fetch(`/rtm-intake-doc?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, name: previewName, content: draftDoc }) });
      if (res.ok) { setPreviewMd(draftDoc); setEditingDoc(false); }
      else { const d = (await res.json().catch(() => null)) as { error?: string } | null; setToast({ kind: "failed", msg: d?.error ?? `저장 실패: HTTP ${res.status}` }); }
    } catch (e) { setToast({ kind: "failed", msg: String(e) }); } finally { setStepBusy(false); }
  }, [sid, previewName, draftDoc, accessToken, setToast]);

  const discardSession = useCallback(async () => {
    if (!sid || !accessToken) { setSession(null); setSid(null); return; }
    try { await fetch(`/rtm-intake-discard?token=${encodeURIComponent(accessToken)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid }) }); } catch { /* */ }
    setSession(null); setSid(null); setSessionDocs([]); setPreviewName(null); setIdentified(null); setIntakeStatus("idle");
  }, [sid, accessToken]);

  /**
   * W4: "닫기" — 선택 해제만. discardSession 과 달리 **서버 호출이 없다** — 세션은 원장에 그대로
   * 남고 나중에 다시 선택해 이어갈 수 있다. RtmView 의 URL→상태 effect 가 `?sid=` 소실(닫기 클릭 ·
   * 뒤로가기 둘 다)을 감지하면 이 함수로 로컬 상태만 지운다.
   */
  const clearSession = useCallback(() => {
    setSession(null); setSid(null); setSessionDocs([]); setPreviewName(null); setIdentified(null);
    setEditingDoc(false); setViewStep(null); setIntakeStatus("idle");
  }, []);

  /**
   * 세션 1건을 서버에서 읽어 현재 세션으로 앉힌다. sid=null 이면 서버의 현재 세션(마운트 복구).
   * W2: 원장에서 고른 세션으로 갈아타는 경로이자, 종전 마운트 복구의 본체다 — 두 경로가 같은
   * 응답 계약(job/session/docs)을 쓰므로 하나로 합쳤다. 폐기 세션도 원장에서 열람은 되어야 하나
   * 마운트 복구는 종전대로 건너뛴다(explicit=false 일 때만).
   */
  const loadSession = useCallback(async (target: string | null, explicit: boolean): Promise<boolean> => {
    const seq = ++loadSeq.current;
    try {
      const r = await fetch(`/rtm-intake-status${tokenQ}${target ? `&sid=${encodeURIComponent(target)}` : ""}`);
      const data = (await r.json()) as { job?: { status?: string; sid?: string | null }; session?: RtmSession | null; docs?: SessionDoc[] };
      // 원장에서 빠르게 두 세션을 연달아 고르면 먼저 띄운 요청이 나중에 도착할 수 있다 — 늦게 온
      // 응답이 최신 선택을 덮어쓰지 않도록 순번으로 폐기한다.
      if (seq !== loadSeq.current) return false;
      if (!data.session) return false;
      if (!explicit && data.session.discarded) return false;
      setSid(data.session.sid);
      setSession(data.session);
      setSessionDocs(data.docs ?? []);
      setPreviewName(null);
      setIdentified(null);
      setEditingDoc(false);
      const running = data.job?.status === "running" && data.job?.sid === data.session.sid;
      setIntakeStatus(running ? "running" : "idle");
      return true;
    } catch {
      return false; // 복구/전환 실패 무시 — 현재 세션 유지
    }
  }, [tokenQ]);

  /** W2: `?sid=` 라우팅 키 → 세션 전환. URL→상태 effect(RtmView)가 호출한다. */
  const selectSession = useCallback((target: string) => { void loadSession(target, true); }, [loadSession]);

  // 마운트 시 진행 중 세션 복구 — 새로고침/다른 탭에서도 단계 진행을 이어 본다.
  // ?sid= 딥링크는 종전대로 우선하되(FRONT_REDESIGN_DESIGN.md:290), 이제 그 경로는 RtmView 의
  // URL→상태 effect 가 selectSession 으로 처리한다(N2) — 여기서 또 조회하면 중복 왕복이 된다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sid")) return;
    void loadSession(null, false);
  }, [loadSession]);

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
  }, [intakeStatus, sid, tokenQ, loadModel, setToast]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.producedStep, viewStep, intakeStatus, sessionDocs]);
  // 새 단계가 산출되면 표시를 최전선으로 되돌린다.
  useEffect(() => { setViewStep(null); }, [session?.producedStep]);

  return {
    intakeOpen, setIntakeOpen, intakeQuery, setIntakeQuery, targetStep, setTargetStep,
    intakeModel, setIntakeModel,
    intakeStatus, intakeError, setIntakeError, sid, session, sessionDocs, stepBusy, viewStep, setViewStep,
    previewName, previewMd, identified, editingDoc, setEditingDoc, draftDoc, setDraftDoc,
    startIntake, advance, confirmStep, saveDoc, discardSession, clearSession, loadPreview, selectSession,
  };
}
