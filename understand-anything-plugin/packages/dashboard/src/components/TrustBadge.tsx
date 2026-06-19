import { useI18n } from "../contexts/I18nContext";
import VerdictBadge from "./VerdictBadge";

/**
 * 신뢰 배지 (P3) — 설계 §3 단일 규칙: 노드에 사용자 오버레이(편집/확정)가 있으면
 * `확정(approver)`(축2: 사람 확정, 별도 레이어), 없으면 기계 confidence/verdict(축1)로
 * 폴백한다. 사람 확정은 confidence 값이 아니라 approver + audit 책임 기록이다.
 */
export default function TrustBadge({
  confirmedBy,
  verdict,
  className = "",
}: {
  /** 오버레이가 있을 때의 확정자(approver). 있으면 이 배지가 기계 verdict 를 대체. */
  confirmedBy?: string | null;
  /** 폴백 — 오버레이 없을 때 표시할 기계 검증 결과. */
  verdict?: "GROUNDED" | "NEEDS_REVIEW" | null;
  className?: string;
}) {
  const { t } = useI18n();
  if (confirmedBy) {
    return (
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-accent ${className}`}
        style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)" }}
        title={t.flowView.userEditedNote}
      >
        ✓ {t.flowView.confirmed}({confirmedBy})
      </span>
    );
  }
  if (verdict) return <VerdictBadge verdict={verdict} className={className} />;
  return null;
}
