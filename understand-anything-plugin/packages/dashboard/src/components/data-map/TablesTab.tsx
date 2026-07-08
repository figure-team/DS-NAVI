import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { Badge, Ev } from "../proto/Proto";
import RowSample from "./RowSample";
import { baseName, isPk, len } from "./types";
import type { DbColumn, DbSchema, DbTable } from "./types";

/**
 * 테이블 탭(개편 ②) — 검색(테이블명·comment·컬럼명·컬럼 comment) + 무의존 가상화
 * (content-visibility) + URL 단일 소스(?table=&q=) + 상세 행 데이터 섹션 + 코드성 사유 툴팁.
 */

interface TableMatch {
  table: DbTable;
  nameHit: boolean;
  colHits: string[];
}

/** 검색 매칭 — 빈 질의는 전건 nameHit. 컬럼만 매치되면 colHits 로 보조 라벨·하이라이트. */
function matchTables(tables: DbTable[], query: string): TableMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return tables.map((t) => ({ table: t, nameHit: true, colHits: [] }));
  const out: TableMatch[] = [];
  for (const t of tables) {
    const nameHit = t.name.toLowerCase().includes(q) || (t.comment ?? "").toLowerCase().includes(q);
    const colHits = t.columns
      .filter((c) => c.name.toLowerCase().includes(q) || (c.comment ?? "").toLowerCase().includes(q))
      .map((c) => c.name);
    if (nameHit || colHits.length > 0) out.push({ table: t, nameHit, colHits });
  }
  return out;
}

/** 하단 카운트 칩(FK/UNIQUE/CHECK/INDEX/행). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="border border-border-subtle text-text-muted rounded-md whitespace-nowrap"
      style={{ fontSize: 11.5, padding: "3px 9px" }}
    >
      {children}
    </span>
  );
}

function TableTree({
  matches,
  selected,
  onSelect,
}: {
  matches: TableMatch[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const biz = matches.filter((m) => !m.table.isCodeTable);
  const code = matches.filter((m) => m.table.isCodeTable);
  const groups: Array<{ label: string; items: TableMatch[] }> = [];
  if (biz.length > 0) groups.push({ label: `업무 테이블 (${biz.length})`, items: biz });
  if (code.length > 0) groups.push({ label: `코드성 테이블 (${code.length})`, items: code });

  // 무의존 가상화 — 항목별 content-visibility 로 오프스크린 렌더 비용 상수화(수천 테이블 대응).
  const itemStyle: React.CSSProperties = { contentVisibility: "auto", containIntrinsicBlockSize: "34px" };

  return (
    <div
      className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree"
      style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}
    >
      {groups.map((g) => (
        <div key={g.label}>
          <div className="fold">{g.label}</div>
          {g.items.map(({ table: t, nameHit, colHits }) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelect(t.name)}
              title={t.name}
              className={`doc ${t.name === selected ? "on" : ""}`}
              style={itemStyle}
            >
              <span className="min-w-0" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span className="truncate font-mono" style={{ maxWidth: "100%" }}>
                  {t.name}
                </span>
                {!nameHit && colHits.length > 0 && (
                  <span className="text-text-muted truncate" style={{ fontSize: 10.5, maxWidth: "100%" }}>
                    컬럼: {colHits[0]}
                    {colHits.length > 1 && ` 외 ${colHits.length - 1}`}
                  </span>
                )}
              </span>
              <span className="st" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {t.isCodeTable && (
                  <Badge tone="info" title={t.codeTableReason ?? undefined}>
                    코드성
                  </Badge>
                )}
                <span className="text-text-muted tabular-nums" style={{ fontSize: 11 }}>
                  {t.columns.length}c
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
      {matches.length === 0 && (
        <div className="text-text-muted" style={{ padding: "14px 8px", fontSize: 12.5 }}>
          검색 결과 없음
        </div>
      )}
    </div>
  );
}

function TableDetail({
  table,
  tier,
  highlightCols,
  onSeeCrud,
}: {
  table: DbTable;
  tier: string;
  highlightCols: Set<string>;
  onSeeCrud: () => void;
}) {
  const rows = table.rowCount || table.rows.length;
  const hl = (c: DbColumn): React.CSSProperties | undefined =>
    highlightCols.has(c.name)
      ? { background: "color-mix(in srgb, var(--color-status-info) 8%, transparent)" }
      : undefined;
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
        <b className="font-mono text-text-primary" style={{ fontSize: 15 }}>
          {table.name}
        </b>
        <Badge tone="ok">Tier {tier.toUpperCase()}</Badge>
        {table.isCodeTable && (
          <Badge tone="info" title={table.codeTableReason ?? undefined}>
            코드성{table.codeTableReason ? ` · ${table.codeTableReason}` : ""}
          </Badge>
        )}
        {table.comment && (
          <span className="text-text-muted" style={{ fontSize: 12 }}>
            {table.comment}
          </span>
        )}
        <div className="flex-1" />
        {table.relPath && (
          <Ev>
            {baseName(table.relPath)}:{table.line}
          </Ev>
        )}
      </div>

      <div className="overflow-x-auto" style={{ marginTop: 10 }}>
        <table className="proto-tbl">
          <thead>
            <tr>
              <th>컬럼</th>
              <th>타입</th>
              <th>NULL</th>
              <th>키</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <tr key={c.name} style={hl(c)}>
                <td className="font-mono">{c.name}</td>
                <td className="font-mono">{c.type}</td>
                <td className="text-text-muted">{c.nullable ? "NULL" : "NOT NULL"}</td>
                <td>
                  {isPk(table, c) ? (
                    <Badge tone="info">PK</Badge>
                  ) : c.unique ? (
                    <Badge tone="info">UNIQUE</Badge>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td>{c.comment ?? <span className="text-text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
        <Chip>FK {len(table.foreignKeys)}</Chip>
        <Chip>UNIQUE {len(table.uniques)}</Chip>
        <Chip>CHECK {len(table.checks)}</Chip>
        <Chip>INDEX {len(table.indexes)}</Chip>
        {rows > 0 && <Chip>행 데이터 {rows}행 실측</Chip>}
      </div>

      {table.rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="text-text-primary" style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 6 }}>
            행 데이터 샘플
          </div>
          <RowSample table={table} />
        </div>
      )}

      <div className="text-text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        사용처:{" "}
        <button
          type="button"
          onClick={onSeeCrud}
          className="cursor-pointer bg-transparent border-0 font-inherit"
          style={{ color: "var(--color-status-info)", padding: 0, font: "inherit" }}
        >
          CRUD 매트릭스에서 보기
        </button>{" "}
        ·{" "}
        <Link to="/structure" style={{ color: "var(--color-status-info)" }}>
          구조 그래프
        </Link>
      </div>
    </div>
  );
}

/** 정직한 부재/오류 안내 카드. */
function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
      style={{ padding: "28px 26px", fontSize: 13, lineHeight: 1.7 }}
    >
      {children}
    </div>
  );
}

export default function TablesTab({ schema }: { schema: DbSchema }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const selName = searchParams.get("table");

  const matches = useMemo(() => matchTables(schema.tables, q), [schema.tables, q]);

  // 선택은 필터와 독립(검색 중에도 기존 선택 상세 유지) — 부재 시 첫 테이블.
  const selected = useMemo(
    () => schema.tables.find((t) => t.name === selName) ?? schema.tables[0] ?? null,
    [schema.tables, selName],
  );
  const highlightCols = useMemo(() => {
    if (!selected) return new Set<string>();
    const m = matches.find((x) => x.table.name === selected.name);
    return new Set(m?.colHits ?? []);
  }, [matches, selected]);

  if (schema.tables.length === 0) return <EmptyCard>테이블이 없습니다.</EmptyCard>;

  return (
    <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
      <div className="min-w-0">
        <input
          type="search"
          value={q}
          onChange={(e) =>
            setSearchParams(
              (prev) => {
                if (e.target.value) prev.set("q", e.target.value);
                else prev.delete("q");
                return prev;
              },
              { replace: true },
            )
          }
          placeholder="테이블·컬럼 검색"
          className="w-full rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
          style={{ padding: "7px 12px", fontSize: 13, marginBottom: 10 }}
        />
        <TableTree
          matches={matches}
          selected={selected?.name ?? null}
          onSelect={(name) =>
            setSearchParams((prev) => {
              prev.set("table", name);
              return prev;
            })
          }
        />
      </div>
      {selected ? (
        <TableDetail
          table={selected}
          tier={schema.tier}
          highlightCols={highlightCols}
          onSeeCrud={() =>
            setSearchParams((prev) => {
              prev.set("tab", "crud");
              prev.set("crudTable", selected.name);
              return prev;
            })
          }
        />
      ) : (
        <EmptyCard>좌측에서 테이블을 선택하세요.</EmptyCard>
      )}
    </div>
  );
}
