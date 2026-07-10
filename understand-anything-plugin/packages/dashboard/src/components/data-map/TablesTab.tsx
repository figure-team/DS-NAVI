import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { useDashboardStore } from "../../store";
import { Badge } from "../proto/Proto";
import RowSample, { ROW_SAMPLE_MAX } from "./RowSample";
import { baseName, isPk, len } from "./types";
import type { DbColumn, DbSchema, DbTable } from "./types";

/**
 * 테이블 탭(개편 ②) — 검색(테이블명·comment·컬럼명·컬럼 comment) + 무의존 가상화
 * (content-visibility) + URL 단일 소스(?table=&q=) + 상세 행 데이터 섹션 + 코드성 사유 툴팁.
 * 컬럼 표는 colgroup 고정 폭(테이블 간 셀 폭 통일), FK 배지는 참조 테이블로 이동,
 * 근거(file:line)는 클릭 시 코드 뷰어.
 */

/** 클릭 가능한 근거(file:line) — 코드 뷰어 오픈. CrudTab 근거 popover 와 동일 경로. */
function EvLink({ relPath, line }: { relPath: string; line: number }) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  return (
    <button
      type="button"
      onClick={() => openCodeViewerAt(relPath, line)}
      title={`${relPath}:${line} — 코드 뷰어로 열기`}
      className="cursor-pointer bg-transparent border-0 text-text-muted hover:text-[var(--color-status-info)] hover:underline"
      style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: 0 }}
    >
      {baseName(relPath)}:{line}
    </button>
  );
}

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

/**
 * 테이블 상세 카드(컬럼 표 + 행 샘플) — 테이블 탭 본문·ERD 탭 사이드 패널 공용.
 * fixedColumns: 테이블 탭은 true(테이블 간 셀 폭 통일), ERD 사이드 패널은 false
 * (좁은 패널이라 해당 테이블 데이터에 맞춰 내용 맞춤 폭).
 */
export function TableDetail({
  table,
  tier,
  highlightCols,
  knownTables,
  onSelectTable,
  fixedColumns = true,
}: {
  table: DbTable;
  tier: string;
  highlightCols: Set<string>;
  /** 소문자 테이블명 → 실제 테이블명 — FK 참조 대상 존재 확인·이동용. */
  knownTables: Map<string, string>;
  onSelectTable: (name: string) => void;
  fixedColumns?: boolean;
}) {
  const rows = table.rowCount || table.rows.length;
  const hl = (c: DbColumn): React.CSSProperties | undefined =>
    highlightCols.has(c.name)
      ? { background: "color-mix(in srgb, var(--color-status-info) 8%, transparent)" }
      : undefined;
  // 컬럼명(소문자) → FK 참조 테이블 — 키 셀 FK 배지·참조 테이블 이동.
  const fkByCol = useMemo(() => {
    const m = new Map<string, string>();
    for (const fk of table.foreignKeys ?? [])
      for (const col of fk.columns) if (!m.has(col.toLowerCase())) m.set(col.toLowerCase(), fk.refTable);
    return m;
  }, [table]);

  const keyCell = (c: DbColumn) => {
    const badges: React.ReactNode[] = [];
    if (isPk(table, c)) badges.push(<Badge key="pk" tone="info">PK</Badge>);
    else if (c.unique) badges.push(<Badge key="uq" tone="info">UNIQUE</Badge>);
    const refTable = fkByCol.get(c.name.toLowerCase());
    if (refTable) {
      const target = knownTables.get(refTable.toLowerCase());
      badges.push(
        target ? (
          <button
            key="fk"
            type="button"
            onClick={() => onSelectTable(target)}
            title={`${refTable} 테이블로 이동`}
            className="cursor-pointer bg-transparent border-0 hover:underline"
            style={{ padding: 0 }}
          >
            <Badge tone="warn">FK → {refTable}</Badge>
          </button>
        ) : (
          <Badge key="fk" tone="warn" title={`참조 테이블 ${refTable} — 스키마에 없음`}>
            FK → {refTable}
          </Badge>
        ),
      );
    }
    if (badges.length === 0) return <span className="text-text-muted">—</span>;
    return <span className="inline-flex items-center flex-wrap" style={{ gap: 4 }}>{badges}</span>;
  };

  return (
    <div className="min-w-0 grid" style={{ gap: 14 }}>
      {/* min-w-0 — grid item 기본 min-width:auto 가 표 자연폭만큼 카드를 키우는 것 방지(표는 카드 안에서 가로 스크롤) */}
      <div className="min-w-0 rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
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
          {table.relPath && <EvLink relPath={table.relPath} line={table.line} />}
        </div>

        <div className="overflow-x-auto" style={{ marginTop: 10 }}>
          {/* colgroup 고정 폭 — 어떤 테이블을 선택해도 셀 폭이 동일(내용 기반 자동 폭 금지) */}
          <table className="proto-tbl" style={fixedColumns ? { tableLayout: "fixed", minWidth: 640 } : undefined}>
            {fixedColumns && (
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: 96 }} />
                <col style={{ width: "20%" }} />
                <col />
              </colgroup>
            )}
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
                  <td className="font-mono truncate" title={c.name}>
                    {c.name}
                  </td>
                  <td className="font-mono truncate" title={c.type}>
                    {c.type}
                  </td>
                  <td className="text-text-muted whitespace-nowrap">{c.nullable ? "NULL" : "NOT NULL"}</td>
                  <td>{keyCell(c)}</td>
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

      </div>

      {/* 행 데이터 샘플 — 테이블 표와 분리된 별도 카드, 근거는 표 카드와 동일하게 우측 상단 */}
      {table.rows.length > 0 && (
        <div className="min-w-0 rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
          <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 10 }}>
            <b className="text-text-primary" style={{ fontSize: 13 }}>
              행 데이터 샘플
            </b>
            {table.rowCount > Math.min(table.rows.length, ROW_SAMPLE_MAX) && (
              <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                총 {table.rowCount}행 중 {Math.min(table.rows.length, ROW_SAMPLE_MAX)}행 표시
              </span>
            )}
            <div className="flex-1" />
            {table.relPath && <EvLink relPath={table.relPath} line={table.rows[0].line} />}
          </div>
          <RowSample table={table} showEvidence={false} />
        </div>
      )}
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
  const knownTables = useMemo(
    () => new Map(schema.tables.map((t) => [t.name.toLowerCase(), t.name])),
    [schema.tables],
  );

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
          knownTables={knownTables}
          onSelectTable={(name) =>
            setSearchParams((prev) => {
              prev.set("table", name);
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
