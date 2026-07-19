import { useEffect, useRef, useState } from "react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

// ktds: 변경·영향 "자연어 영향 탐색" 진행 인디케이터 + 완료 토스트. 헤더에 항상 마운트되어
// 모달을 닫거나 다른 탭을 봐도 job 상태를 추적한다(전역 store.impactJob 구독).
// - running 동안 GET /impact-status 폴링
// - 페이즈 A(candidates) done → 모달 자동 오픈(후보 확정 단계) + 준비 토스트
// - 페이즈 B(analyze) done → impact-overlay.json 재로드 + 완료 토스트
// - running → failed 전이 시 실패 토스트
export default function ImpactJobIndicator() {
  const status = useDashboardStore((s) => s.impactJob.status);
  const phase = useDashboardStore((s) => s.impactJob.phase);
  const pollImpactStatus = useDashboardStore((s) => s.pollImpactStatus);
  const reloadImpactOverlay = useDashboardStore((s) => s.reloadImpactOverlay);
  const openImpactModal = useDashboardStore((s) => s.openImpactModal);
  const { t } = useI18n();

  const prev = useRef(status);
  const [toast, setToast] = useState<{ kind: "done" | "failed"; msg: string } | null>(null);

  // 마운트 시 1회 상태 동기화(페이지 새로고침 중 서버에서 job이 돌고 있을 수 있음).
  useEffect(() => {
    void pollImpactStatus();
  }, [pollImpactStatus]);

  // running 동안 2.5s 간격 폴링.
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => void pollImpactStatus(), 2500);
    return () => clearInterval(id);
  }, [status, pollImpactStatus]);

  // 상태 전이 후처리 — 페이즈에 따라 갈린다.
  useEffect(() => {
    if (prev.current === "running" && status === "done") {
      if (phase === "candidates") {
        // 페이즈 A 완료 = 시드 후보 준비 — 오버레이는 아직 없다. 확정 단계로 이끈다.
        openImpactModal();
        setToast({ kind: "done", msg: t.impactAnalyze.toastCandidates });
      } else {
        void reloadImpactOverlay();
        setToast({ kind: "done", msg: t.impactAnalyze.toastDone });
      }
    } else if (prev.current === "running" && status === "failed") {
      setToast({ kind: "failed", msg: t.impactAnalyze.toastFailed });
    }
    prev.current = status;
  }, [status, phase, reloadImpactOverlay, openImpactModal, t]);

  // 토스트 자동 사라짐.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      {status === "running" && (
        <button
          onClick={openImpactModal}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30"
          title={t.impactAnalyze.runningHint}
        >
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="hidden sm:inline">{t.impactAnalyze.running}</span>
        </button>
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[120] px-4 py-3 rounded-lg shadow-2xl text-sm border max-w-sm ${
            toast.kind === "done"
              ? "bg-emerald-900/80 border-emerald-600 text-emerald-100"
              : "bg-red-900/80 border-red-600 text-red-100"
          }`}
          role="status"
          onClick={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
