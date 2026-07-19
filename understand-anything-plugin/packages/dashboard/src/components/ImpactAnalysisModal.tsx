import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { ModelSelect, type ModelChoice } from "./ModelSelect";

// ktds: 변경·영향 "자연어 영향 탐색" 모달 — 시드 게이트 2단계.
//   1단계(질의): POST /impact-analyze → claude 가 시드 **후보**만 제안하고 멈춤(페이즈 A).
//   2단계(확정): 후보를 체크박스로 검토·확정 → POST /impact-analyze-run 이 확정 시드로만
//   analyze 실행(페이즈 B). 시드는 모델이 아니라 사용자가 정한다 — SKILL §1 의
//   "✋ 확인 게이트(생략 불가)"를 UI 로 복원한 구조.
// job 상태는 전역 스토어(impactJob)에 있으므로 모달을 닫아도 헤더 인디케이터가 추적한다.
export default function ImpactAnalysisModal() {
  const close = useDashboardStore((s) => s.closeImpactModal);
  const startImpactAnalysis = useDashboardStore((s) => s.startImpactAnalysis);
  const startImpactAnalyzeRun = useDashboardStore((s) => s.startImpactAnalyzeRun);
  const loadImpactCandidates = useDashboardStore((s) => s.loadImpactCandidates);
  const resetImpactJob = useDashboardStore((s) => s.resetImpactJob);
  const job = useDashboardStore((s) => s.impactJob);
  const candidates = useDashboardStore((s) => s.impactCandidates);
  const { t } = useI18n();

  const running = job.status === "running";
  // 후보 확정 단계 — 페이즈 A 가 끝났고 아직 페이즈 B 를 시작하지 않은 상태.
  const gateStep = job.phase === "candidates" && job.status === "done";

  const [query, setQuery] = useState("");
  const [model, setModel] = useState<ModelChoice>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualPaths, setManualPaths] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!gateStep) textareaRef.current?.focus();
  }, [gateStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // 확정 단계 진입 시 후보 로드 + 전체 선택 초기화(사용자가 빼는 방향이 기본).
  useEffect(() => {
    if (!gateStep || candidates) return;
    void loadImpactCandidates().then((r) => {
      if (!r.ok) setError(t.impactAnalyze.candidatesLoadFailed);
    });
  }, [gateStep, candidates, loadImpactCandidates, t]);
  useEffect(() => {
    if (candidates) setSelected(new Set(candidates.candidates.map((c) => c.path)));
  }, [candidates]);

  // 두 제출 경로(질의/확정)의 공통 후처리 — 성공이면 닫고, 실패면 에러 문구 매핑.
  const settleSubmit = useCallback(
    (result: { ok: boolean; error?: string }) => {
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
    },
    [close, t],
  );

  const submitQuery = useCallback(async () => {
    const q = query.trim();
    if (!q || submitting || running) return;
    setSubmitting(true);
    setError(null);
    settleSubmit(await startImpactAnalysis(q, model || undefined));
  }, [query, model, submitting, running, startImpactAnalysis, settleSubmit]);

  const chosenPaths = useMemo(
    () => [...selected, ...manualPaths.filter((p) => !selected.has(p))],
    [selected, manualPaths],
  );

  const submitRun = useCallback(async () => {
    if (chosenPaths.length === 0 || submitting || running) return;
    setSubmitting(true);
    setError(null);
    settleSubmit(await startImpactAnalyzeRun(chosenPaths, model || undefined));
  }, [chosenPaths, model, submitting, running, startImpactAnalyzeRun, settleSubmit]);

  const addManualPath = useCallback(() => {
    const p = manualInput.trim();
    if (!p) return;
    setManualPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setManualInput("");
  }, [manualInput]);

  const toggle = useCallback((p: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const newQuery = useCallback(() => {
    resetImpactJob();
    setSelected(new Set());
    setManualPaths([]);
    setError(null);
  }, [resetImpactJob]);

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
            {gateStep ? t.impactAnalyze.candidatesTitle : t.impactAnalyze.title}
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

        {gateStep ? (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-text-secondary">{t.impactAnalyze.candidatesDesc}</p>
            {(candidates?.query || job.query) && (
              <p className="text-xs text-text-muted">
                {t.impactAnalyze.candidatesFor}: {candidates?.query || job.query}
              </p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border-medium divide-y divide-border-subtle">
              {candidates && candidates.candidates.length === 0 && manualPaths.length === 0 && (
                <p className="text-xs text-text-muted px-3 py-3">
                  {t.impactAnalyze.candidatesEmpty}
                </p>
              )}
              {candidates?.candidates.map((c) => (
                <label
                  key={c.path}
                  className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-elevated"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.path)}
                    onChange={() => toggle(c.path)}
                    className="mt-0.5 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-mono text-text-primary break-all">
                      {c.path}
                      {c.line != null ? `:${c.line}` : ""}
                    </span>
                    {c.reason && (
                      <span className="block text-xs text-text-muted">{c.reason}</span>
                    )}
                  </span>
                </label>
              ))}
              {manualPaths.map((p) => (
                <label
                  key={p}
                  className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-elevated"
                >
                  <input type="checkbox" checked readOnly className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-mono text-text-primary break-all">{p}</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs text-text-muted hover:text-text-primary"
                    onClick={() => setManualPaths((prev) => prev.filter((x) => x !== p))}
                  >
                    ×
                  </button>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManualPath();
                }}
                placeholder={t.impactAnalyze.addPathPlaceholder}
                className="flex-1 rounded-lg bg-elevated border border-border-medium px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={addManualPath}
                disabled={!manualInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs text-text-secondary border border-border-medium hover:text-text-primary disabled:opacity-40"
              >
                {t.impactAnalyze.addPath}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-text-secondary">{t.impactAnalyze.description}</p>
            <p className="text-xs text-text-muted">{t.impactAnalyze.intakeHint}</p>
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submitQuery();
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
        )}

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
          {gateStep ? (
            <>
              <button
                onClick={newQuery}
                className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {t.impactAnalyze.newQuery}
              </button>
              <button
                onClick={() => void submitRun()}
                disabled={chosenPaths.length === 0 || submitting || running}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? t.impactAnalyze.submitting
                  : `${t.impactAnalyze.analyzeRun} (${chosenPaths.length})`}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={close}
                className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {t.impactAnalyze.cancel}
              </button>
              <button
                onClick={() => void submitQuery()}
                disabled={!query.trim() || submitting || running}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? t.impactAnalyze.submitting : t.impactAnalyze.run}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
