import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { ModelSelect, type ModelChoice } from "./ModelSelect";

// ktds: 구조 탭 "영향도 분석" 자연어 입력 모달. 제출 시 store.startImpactAnalysis 가
// POST /impact-analyze → 서버가 claude -p "/understand-impact <query>" 실행. job 상태는
// 전역 스토어(impactJob)에 있으므로 제출 후 모달을 닫아도 진행 상황은 헤더 인디케이터가 추적.
export default function ImpactAnalysisModal() {
  const close = useDashboardStore((s) => s.closeImpactModal);
  const startImpactAnalysis = useDashboardStore((s) => s.startImpactAnalysis);
  const running = useDashboardStore((s) => s.impactJob.status === "running");
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [model, setModel] = useState<ModelChoice>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const submit = useCallback(async () => {
    const q = query.trim();
    if (!q || submitting || running) return;
    setSubmitting(true);
    setError(null);
    const result = await startImpactAnalysis(q, model || undefined);
    setSubmitting(false);
    if (result.ok) {
      close();
      return;
    }
    setError(
      result.error === "no-write-server"
        ? t.impactAnalyze.errNoServer
        : (result.error ?? t.impactAnalyze.errGeneric),
    );
  }, [query, model, submitting, running, startImpactAnalysis, close, t]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="glass-heavy rounded-xl shadow-2xl w-full max-w-xl mx-4"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">
            {t.impactAnalyze.title}
          </h2>
          <button
            onClick={close}
            className="text-text-muted hover:text-text-primary transition-colors"
            aria-label={t.impactAnalyze.cancel}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-text-secondary">{t.impactAnalyze.description}</p>
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
            }}
            placeholder={t.impactAnalyze.placeholder}
            rows={4}
            disabled={running}
            className="w-full resize-y rounded-lg bg-elevated border border-border-medium px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
          {running && (
            <p className="text-xs text-amber-400">{t.impactAnalyze.alreadyRunning}</p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <ModelSelect
            value={model}
            onChange={setModel}
            disabled={running || submitting}
            sessionDefaultLabel={t.impactAnalyze.modelDefault}
            ariaLabel={t.impactAnalyze.modelAria}
            className="mr-auto rounded-lg bg-elevated border border-border-medium text-sm text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50"
            style={{ padding: "5px 8px" }}
          />
          <button
            onClick={close}
            className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {t.impactAnalyze.cancel}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!query.trim() || submitting || running}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? t.impactAnalyze.submitting : t.impactAnalyze.run}
          </button>
        </div>
      </div>
    </div>
  );
}
