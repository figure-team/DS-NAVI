import { useEffect, useRef, useState } from "react";

/**
 * 정보 팝오버(ⓘ) — 범용. 라벨:값 행 묶음을 ⓘ 버튼 뒤로 접었다가 클릭하면 펼친다.
 * 각 메뉴가 "이 화면 데이터의 출처·등급·건수" 같은 메타 정보를 헤더/TopBar 에 얹을 때 재사용.
 * (2026-07-15, 데이터 맵 SchemaMetaInfo 에서 추출 — 명칭 확정 "정보 팝오버".)
 *
 * 배치: 부모 기준 position:absolute(top:100%) 별개 레이어라 펼쳐도 주변 레이아웃을 밀지 않는다.
 * 닫힘: 바깥 클릭 · Esc. 글리프는 경고(⚠)와 겹치지 않게 ⓘ.
 * 행별 hint 를 주면 값 옆 작은 ? 에 native title(마우스 호버 설명)이 붙는다.
 */

export interface InfoRow {
  label: string;
  value: string;
  /** 값 옆 ? 에 붙는 호버 설명(native title). */
  hint?: string;
  /** 있으면 값이 클릭 가능한 링크가 되어 이걸 호출한다(예: 건수 → 모달). */
  onClick?: () => void;
}

function Row({ label, value, hint, onClick }: InfoRow) {
  return (
    <div className="flex items-baseline" style={{ gap: 8 }}>
      <span className="text-text-muted shrink-0" style={{ fontSize: 11, width: 64 }}>
        {label}
      </span>
      <span className="text-text-secondary" style={{ fontSize: 11.5, lineHeight: 1.5, minWidth: 0 }}>
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="text-accent hover:underline cursor-pointer bg-transparent border-0"
            style={{ font: "inherit", fontSize: 11.5, lineHeight: 1.5, padding: 0 }}
          >
            {value}
          </button>
        ) : (
          value
        )}
        {hint && (
          <span
            title={hint}
            aria-label={hint}
            role="img"
            className="items-center justify-center rounded-full border border-border-subtle text-text-muted cursor-help"
            style={{
              width: 13,
              height: 13,
              fontSize: 9,
              lineHeight: 1,
              marginLeft: 4,
              display: "inline-flex",
              verticalAlign: "middle",
            }}
          >
            ?
          </span>
        )}
      </span>
    </div>
  );
}

export default function InfoPopover({
  rows,
  title = "정보",
  ariaLabel,
  width = 210,
}: {
  rows: InfoRow[];
  /** ⓘ 버튼 title(호버) — 기본 "정보". */
  title?: string;
  /** ⓘ 버튼 aria-label — 기본은 title. */
  ariaLabel?: string;
  /** 팝오버 폭(px). */
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // 바깥 클릭·Esc 로 닫기 — 떠 있는 레이어라 재클릭 말고도 빠져나갈 길을 둔다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="inline-flex" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel ?? title}
        title={title}
        className="rounded-full border border-border-subtle bg-panel text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer flex items-center justify-center"
        style={{ font: "inherit", fontSize: 11.5, width: 20, height: 20, lineHeight: 1 }}
      >
        ⓘ
      </button>
      {open && (
        <div
          className="rounded-lg border border-border-medium bg-surface shadow-xl flex flex-col"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            padding: "10px 12px",
            width,
            gap: 5,
            zIndex: 30,
          }}
        >
          {rows.map((r) => (
            <Row key={r.label} {...r} />
          ))}
        </div>
      )}
    </span>
  );
}
