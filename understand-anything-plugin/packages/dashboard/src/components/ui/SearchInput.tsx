import type { CSSProperties } from "react";

/**
 * 공용 검색 입력 — 메뉴별로 흩어져 있던 13종 `<input type="search">` 통일(2026-07-15).
 * 캐논: rounded-lg · border-medium · bg-panel · 6px12px · 12.5px · focus 시 accent 보더.
 * onChange 는 값만 넘긴다(각 호출부의 searchParams/state 로직은 래퍼에 남는다).
 */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  width,
  icon,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
  /** number=고정 px · "full"=w-full · 미지정=auto */
  width?: number | "full";
  /** 좌측 돋보기 아이콘 */
  icon?: boolean;
  /** marginBottom 등 레이아웃 보정 */
  style?: CSSProperties;
}) {
  const input = (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className={`${width === "full" ? "w-full " : ""}rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-colors`}
      style={{
        fontSize: 12.5,
        padding: icon ? "6px 12px 6px 30px" : "6px 12px",
        ...(typeof width === "number" ? { width } : null),
        ...(icon ? null : style),
      }}
    />
  );
  if (!icon) return input;
  // 아이콘형 — 상대 컨테이너 안에 절대배치 돋보기.
  return (
    <div className="relative" style={{ ...(width === "full" ? { width: "100%" } : null), ...style }}>
      <svg
        aria-hidden
        className="absolute text-text-muted pointer-events-none"
        style={{ left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14 }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      {input}
    </div>
  );
}
