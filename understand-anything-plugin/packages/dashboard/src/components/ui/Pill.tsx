import type { ReactNode } from "react";

/**
 * 공용 토글/상태 필 — 구 FlowListView FilterChip + PolicyView Chip 통일(2026-07-15).
 * 캐논: rounded-full · border-subtle · active 시 accent 9% 틴트 + accent 글자.
 * onClick 있으면 button(aria-pressed), 없으면 span(시각 전용).
 * rtm/shared 의 색상 Pill/confChip(판정 배지 계열)은 별개 — 여기서 다루지 않는다.
 */
export function Pill({
  children,
  active,
  muted,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  /** 흐릿하게(0.7) */
  muted?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const style = {
    fontSize: 12,
    fontWeight: active ? 650 : 500,
    padding: "3px 10px",
    lineHeight: 1.5,
    borderRadius: 999,
    border: "1px solid var(--color-border-subtle)",
    color: active ? "var(--color-accent)" : "var(--color-text-muted)",
    background: active
      ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
      : "var(--color-panel)",
    opacity: muted ? 0.7 : 1,
  } as const;
  const cls = "inline-flex items-center whitespace-nowrap transition-colors";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} title={title} className={`${cls} cursor-pointer`} style={style}>
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={cls} style={style}>
      {children}
    </span>
  );
}
