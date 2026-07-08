import { useCallback, useEffect, useState } from "react";

/**
 * P6 변경관리(절차 B) — 요청(REQ) 철회. RtmView 본문에서 기계적 이동.
 * 계약(불가침): startChange 의 window.confirm 철회 경고, 3초 폴링,
 * 마운트 복구, 완료 시 loadModel() 재로드.
 */
export function useChange({ accessToken, tokenQ, loadModel, setToast }: {
  accessToken: string | null;
  tokenQ: string;
  loadModel: () => void;
  setToast: (t: { kind: "done" | "failed"; msg: string } | null) => void;
}) {
  const [changeReqId, setChangeReqId] = useState<string | null>(null); // 진행 중 대상 REQ
  const [changeRunning, setChangeRunning] = useState(false);

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
  }, [accessToken, changeRunning, setToast]);

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
  }, [changeRunning, tokenQ, changeReqId, loadModel, setToast]);

  return { changeReqId, changeRunning, startChange };
}
