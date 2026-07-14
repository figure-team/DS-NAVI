import { useI18n } from "../contexts/I18nContext";

/**
 * 검증 배지 — GROUNDED ✓(status-ok 녹색) / NEEDS_REVIEW ⚠(amber). 도메인 카드(화면1)·
 * 기능 행(화면2)·스텝 상세(화면3) 공용. 툴팁으로 상태를 노출한다. 단일소스: 노드
 * ktdsClaims 의 verdict 를 그대로 표시(삭제 아님 — 미검증은 강등 후 ⚠ 로 보존).
 * ✓ 는 accent(DS-APM 빨강)가 오류/경고로 오독돼 확인·통과 관례색(녹색)을 쓴다.
 */
export default function VerdictBadge({
  verdict,
  className = "",
}: {
  verdict: "GROUNDED" | "NEEDS_REVIEW";
  className?: string;
}) {
  const { t } = useI18n();
  const review = verdict === "NEEDS_REVIEW";
  return (
    <span
      className={`shrink-0 text-[11px] leading-5 ${review ? "text-amber-500" : ""} ${className}`}
      style={review ? undefined : { color: "var(--color-status-ok)" }}
      title={review ? t.grounding.needsReview : t.grounding.grounded}
      aria-hidden
    >
      {review ? "⚠" : "✓"}
    </span>
  );
}
