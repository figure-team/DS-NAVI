import { Badge, Ev } from "../proto/Proto";
import RowSample from "./RowSample";
import type { DbTable } from "./types";

/**
 * 코드 테이블 탭(개편 ⑤) — 코드값 일람(실측 행 카드). auto-fit 그리드로 1개일 때
 * 빈 열 없이 전폭, 다수면 자동 다열. 판정 사유(개편 ④)를 카드에 표기.
 */

function CodeTableCard({ table }: { table: DbTable }) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
        <b className="font-mono text-text-primary" style={{ fontSize: 14 }}>
          {table.name}
        </b>
        <Badge tone="info">행 {table.rowCount || table.rows.length} 실측</Badge>
      </div>
      {table.codeTableReason && (
        <div style={{ marginBottom: 8 }}>
          <Ev>판정: {table.codeTableReason}</Ev>
        </div>
      )}
      {/* 코드값 일람이 탭의 존재 이유 — 요약 상한(ROW_SAMPLE_MAX) 없이 실측 저장분 전부 표시. */}
      <RowSample table={table} max={table.rows.length} />
    </div>
  );
}

export default function CodeTab({
  codeTables,
  codeIsFallback,
}: {
  codeTables: DbTable[];
  codeIsFallback: boolean;
}) {
  if (codeTables.length === 0) {
    return (
      <div
        className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
        style={{ padding: "28px 26px", fontSize: 13, lineHeight: 1.7 }}
      >
        코드성 테이블도, 행 데이터가 실측된 테이블도 없습니다.
      </div>
    );
  }
  return (
    <>
      {codeIsFallback && (
        <p className="text-text-muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
          코드성 판정 신호 없음 — 행 데이터가 실측된 테이블을 표시합니다.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        {codeTables.map((t) => (
          <CodeTableCard key={t.name} table={t} />
        ))}
      </div>
    </>
  );
}
