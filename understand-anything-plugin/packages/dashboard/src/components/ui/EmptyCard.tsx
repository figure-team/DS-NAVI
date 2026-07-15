import type { ReactNode } from "react";

/**
 * 공용 빈 상태/안내 카드 — 메뉴별로 3중복이던 EmptyCard + PolicyView NoticeCard 통일(2026-07-15).
 * base: rounded-[10px] border-subtle bg-panel card-shadow.
 * - title 없음: 본문만(text-muted 13/1.7), 좌측 정렬 — 구 EmptyCard.
 * - title 있음: 제목(text-primary 14/650) + 본문(text-muted 13/1.6) — 구 NoticeCard(center 기본).
 */
export default function EmptyCard({
  children,
  title,
  center,
}: {
  children?: ReactNode;
  title?: ReactNode;
  center?: boolean;
}) {
  const centered = center ?? title != null; // 제목형은 기본 가운데 정렬(구 NoticeCard 관례)
  return (
    <div
      className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
      style={{
        padding: "28px 26px",
        fontSize: 13,
        lineHeight: title ? 1.6 : 1.7,
        textAlign: centered ? "center" : "left",
      }}
    >
      {title && (
        <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 650, marginBottom: children ? 6 : 0 }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
