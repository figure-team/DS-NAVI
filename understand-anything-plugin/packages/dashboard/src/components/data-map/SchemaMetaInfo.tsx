import { useEffect, useRef, useState } from "react";

import type { DbSchema } from "./types";

/**
 * 헤더 meta 정보(산출물·Tier·테이블 수·SQL 파일 수)를 ⓘ 버튼 뒤로 접는다.
 * 헤더에는 [미해결/참고] 칩만 남기고 나머지 서술은 눌러서 꺼내 보는 것으로 전환(2026-07-15).
 *
 * 업무 흐름도 범례(BusinessFlowView LegendPanel) 패턴을 따르되, 그쪽은 React Flow
 * <Panel> 이 절대 배치라 캔버스를 안 밀지만 헤더에는 그런 컨테이너가 없다. 그래서
 * position:absolute 를 직접 걸어 별개 레이어로 띄운다 — 펼쳐도 탭·본문이 밀리지 않는다.
 *
 * 글리프는 ! 가 아니라 ⓘ — 경고(⚠ 미해결 칩)와 뜻이 겹치지 않게, 그리고 인용된
 * 범례 버튼과 같은 어휘를 쓰려고.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline" style={{ gap: 8 }}>
      <span className="text-text-muted shrink-0" style={{ fontSize: 11, width: 58 }}>
        {label}
      </span>
      <span className="text-text-secondary" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

export default function SchemaMetaInfo({ schema }: { schema: DbSchema }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // 바깥 클릭·Esc 로 닫기 — 헤더에 떠 있는 레이어라 재클릭 말고도 빠져나갈 길을 둔다.
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

  const rows: Array<{ label: string; value: string }> = [
    { label: "산출물", value: "db-schema.json" },
    { label: "Tier", value: schema.tier?.toUpperCase() ?? "?" },
    { label: "테이블", value: `${schema.tables.length.toLocaleString("ko-KR")}개` },
    {
      label: "SQL 파일",
      value: schema.sqlFileCount != null ? `${schema.sqlFileCount.toLocaleString("ko-KR")}개` : "?",
    },
  ];

  return (
    <span ref={wrapRef} className="inline-flex" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="스캔 정보 — 산출물·Tier·테이블 수·SQL 파일 수"
        title="스캔 정보"
        className="rounded-full border border-border-subtle bg-panel text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer flex items-center justify-center"
        style={{ font: "inherit", fontSize: 11.5, width: 20, height: 20, lineHeight: 1 }}
      >
        ⓘ
      </button>
      {open && (
        // 별개 레이어 — absolute 라 펼쳐도 아래 탭·본문 레이아웃에 영향 없음.
        <div
          className="rounded-lg border border-border-medium bg-surface shadow-xl flex flex-col"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            padding: "10px 12px",
            width: 210,
            gap: 5,
            zIndex: 30,
          }}
        >
          {rows.map((r) => (
            <Row key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}
    </span>
  );
}
