import { useI18n } from "../contexts/I18nContext";

/**
 * 도메인 근거율 바 — domainMeta.groundedPct + GROUNDED/NEEDS_REVIEW 카운트.
 * 도메인 카드 헤더(접힘 상태에서도)에서 신뢰도를 한눈에 보여준다(설계 §4).
 * 근거율이 높을수록 accent, 낮으면(<50) amber 로 색을 바꿔 검토 필요 신호를 준다.
 */
export interface GroundedBarProps {
  /** 0–100 (검증항목 GROUNDED 비율). */
  pct: number;
  /** GROUNDED 항목 수. */
  grounded: number;
  /** NEEDS_REVIEW 항목 수. */
  review: number;
}

export default function GroundedBar({ pct, grounded, review }: GroundedBarProps) {
  const { t } = useI18n();
  const clamped = Math.max(0, Math.min(100, pct));
  const low = clamped < 50;
  return (
    <div className="flex items-center gap-2" title={`${t.grounding.rate} ${clamped}%`}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">
        {t.grounding.rate}
      </span>
      <div className="flex-1 min-w-[48px] h-1.5 rounded-full bg-elevated overflow-hidden">
        <div
          className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-accent"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-medium text-text-secondary tabular-nums shrink-0">{clamped}%</span>
      <span className="text-[11px] text-text-muted shrink-0 tabular-nums" aria-hidden>
        <span className="text-accent">✓{grounded}</span>
        {review > 0 && <span className="ml-1 text-amber-500">⚠{review}</span>}
      </span>
    </div>
  );
}
