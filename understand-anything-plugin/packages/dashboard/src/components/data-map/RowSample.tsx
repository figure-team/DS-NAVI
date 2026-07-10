import { Ev } from "../proto/Proto";
import { baseName } from "./types";
import type { DbTable } from "./types";

/**
 * dataload 실측 행 샘플(최대 max행) — 코드 탭 카드·테이블 상세에서 공용.
 * showEvidence=false 면 하단 근거 표기를 생략(테이블 탭은 카드 헤더 우측에 클릭형 근거를 둔다).
 */
export default function RowSample({
  table,
  max = 5,
  showEvidence = true,
}: {
  table: DbTable;
  max?: number;
  showEvidence?: boolean;
}) {
  const rows = table.rows.slice(0, max);
  const cols = table.columns.map((c) => c.name);
  if (rows.length === 0) return null;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="proto-tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line}>
                {cols.map((c) => (
                  <td key={c} className="font-mono">
                    {r.values[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showEvidence && table.relPath && (
        <div style={{ marginTop: 8 }}>
          <Ev>
            데이터 파일 {baseName(table.relPath)} line {rows[0].line}
            {table.rowCount > rows.length && ` · 총 ${table.rowCount}행 중 ${rows.length}행 표시`}
          </Ev>
        </div>
      )}
    </>
  );
}
