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
  // pmpl-proto(P6) 디자인: 라벨 + 5px 녹색(status-ok) 바 + %. ✓/⚠ 카운트는 시각
  // 소음이라 툴팁으로 이동(정보 보존). 50% 미만은 검토 신호로 amber 유지(정직성).
  return (
    <div
      className="flex items-center gap-2 text-text-muted"
      style={{ fontSize: 11 }}
      title={`${t.grounding.rate} ${clamped}% — ✓${grounded}${review > 0 ? ` · ⚠${review}` : ""}`}
    >
      <span className="shrink-0">{t.grounding.rate}</span>
      <div
        className="flex-1 rounded-full bg-elevated overflow-hidden"
        style={{ minWidth: 48, height: 5 }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: low ? "var(--color-status-warn)" : "var(--color-status-ok)",
          }}
        />
      </div>
      <span className="text-text-secondary tabular-nums shrink-0" style={{ fontSize: 11 }}>
        {clamped}%
      </span>
    </div>
  );
}
