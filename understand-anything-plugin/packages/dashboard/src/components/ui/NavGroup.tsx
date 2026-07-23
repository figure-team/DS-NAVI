import type { ReactNode } from "react";

/**
 * 좌측 내비(proto-tree) 그룹 헤더 — 단일 기준은 화면설계서(ScreenSpecView)의 도메인 그룹.
 * 요구·변경 그룹 메뉴(작업요청·변경영향·장애분석)가 이 컴포넌트를 공유해 헤더 폰트·색·펼침이
 * 화면설계서와 픽셀 단위로 같아진다(중복 마크업 드리프트 차단, 2026-07-22 사용자 지시).
 *
 * 마크업은 ScreenSpecView 의 그룹 헤더에서 그대로 추출했다:
 *  - 쉐브런 ▸ (열리면 90° 회전, fontSize 9)
 *  - 라벨 fontSize 12.5 · fontWeight 650 · text-primary
 *  - 카운트 알약 배지 (bg-elevated · rounded-full · text-muted)
 *  - 호버 시 bg-elevated · rounded-[7px] 행
 *  - 자식은 좌측 가이드선(borderLeft)으로 들여써 그룹 소속을 붙여 보인다.
 */
export default function NavGroup({
  label,
  count,
  open,
  onToggle,
  disabled,
  title,
  right,
  children,
}: {
  label: ReactNode;
  /** 우측 알약 배지 내용(건수 등). null 이면 배지 생략. */
  count?: ReactNode;
  open: boolean;
  onToggle?: () => void;
  /** 토글 비활성(예: 검색 중 강제 펼침) — 커서·클릭을 죽인다. */
  disabled?: boolean;
  title?: string;
  /** 카운트 오른쪽 액션 슬롯(예: 새로고침). */
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div style={{ marginTop: 2 }}>
      <div className="flex items-center rounded-[7px] hover:bg-elevated" style={{ gap: 7 }}>
        <button
          type="button"
          onClick={disabled ? undefined : onToggle}
          disabled={disabled}
          aria-expanded={open}
          title={title}
          className="flex items-center text-left bg-transparent border-0"
          style={{ padding: "6px 8px", gap: 7, fontFamily: "inherit", flex: "1 1 auto", minWidth: 0, cursor: disabled ? "default" : "pointer" }}
        >
          <span
            className="inline-flex justify-center text-text-muted"
            style={{
              fontSize: 9,
              width: 10,
              flex: "none",
              transition: "transform 0.12s ease",
              transform: open ? "rotate(90deg)" : "none",
            }}
          >
            ▸
          </span>
          <span className="truncate text-text-primary" style={{ fontSize: 12.5, fontWeight: 650 }}>
            {label}
          </span>
          {count != null && (
            <span
              className="tabular-nums text-text-muted bg-elevated rounded-full"
              style={{ marginLeft: "auto", flex: "none", fontSize: 10.5, fontWeight: 600, padding: "1px 7px" }}
            >
              {count}
            </span>
          )}
        </button>
        {right && <span style={{ flex: "none", paddingRight: 6 }}>{right}</span>}
      </div>
      {open && (
        <div
          style={{
            margin: "2px 0 6px 12px",
            paddingLeft: 6,
            borderLeft: "1px solid var(--color-border-subtle)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
