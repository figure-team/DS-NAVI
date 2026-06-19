import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

/**
 * 인용(근거) 칩 — `[파일명:라인]`. 클릭 시 코드뷰어를 그 file:line 으로 연다(openCodeViewerAt).
 * citation status(ok 외)는 amber + 툴팁으로 "미검증"을 표시하되 점프는 허용한다(사용자가
 * 주장 위치를 직접 확인 가능). allowlist 미포함 파일은 코드뷰어가 "source unavailable"로 graceful.
 */
export interface CitationChipProps {
  filePath: string;
  line: number;
  /** verify.ts CitationStatus — 'ok' 외는 미검증 표시. 없으면 ok 로 본다. */
  status?: string;
}

export default function CitationChip({ filePath, line, status }: CitationChipProps) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const { t } = useI18n();
  const base = filePath.split("/").pop() ?? filePath;
  const ok = status === undefined || status === "ok";
  const title = ok
    ? `${filePath}:${line} — ${t.grounding.viewSource}`
    : `${filePath}:${line} — ${t.grounding.unverified} (${status})`;
  return (
    <button
      type="button"
      onClick={() => openCodeViewerAt(filePath, line)}
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
        ok
          ? "border-accent/30 text-accent hover:bg-accent/10"
          : "border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
      }`}
    >
      <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.328-1.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
      </svg>
      <span className="truncate max-w-[180px]">{base}:{line}</span>
    </button>
  );
}
