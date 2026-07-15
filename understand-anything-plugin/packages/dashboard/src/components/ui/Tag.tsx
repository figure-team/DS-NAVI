import type { ReactNode } from "react";

/**
 * 공용 정적 메타 태그(비토글) — 구 TablesTab Chip + QualityView Chip 통일(2026-07-15).
 * 캐논: rounded-md · border-subtle · bg-elevated · text-secondary · 11.5px. 상태 없음(표시 전용).
 */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center whitespace-nowrap rounded-md border border-border-subtle bg-elevated text-text-secondary"
      style={{ fontSize: 11.5, padding: "2px 8px" }}
    >
      {children}
    </span>
  );
}
