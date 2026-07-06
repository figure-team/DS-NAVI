import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, ConfBadge, Ev, PageHead, ProtoTabs } from "./proto/Proto";
import type { BadgeTone, ConfKind } from "./proto/Proto";

/**
 * 데이터 맵(pg-data) — db-schema.json / crud-matrix.json 을 인터랙티브 화면으로 승격한다.
 * 프로토(docs/ktds/front-redesign/pmpl-proto.html §pg-data) 구조·문구·위계를 재현하되
 * 숫자·행은 전부 실데이터 바인딩(프로토 목업 하드코딩 금지). 근거(file:line)를 함께 노출한다.
 *
 * 데이터: dev/데모 정적 GET ${BASE_URL}db-schema.json · crud-matrix.json (토큰 게이트).
 * 부재 시 화면/탭 단위로 정직한 안내 카드를 낸다(침묵 누락 금지).
 */

/* ── db-schema.json 서브셋 ── */
interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default: string | null;
  comment: string | null;
  line: number;
}
interface DbForeignKey {
  columns: string[];
  refColumns: string[];
  refTable: string;
  line: number;
}
interface DbRow {
  line: number;
  values: Record<string, string>;
}
interface DbTable {
  name: string;
  line: number;
  isCodeTable: boolean;
  comment: string | null;
  columns: DbColumn[];
  primaryKey: string[] | null;
  foreignKeys: DbForeignKey[] | null;
  checks: unknown[] | null;
  uniques: unknown[] | null;
  indexes: unknown[] | null;
  relPath: string | null;
  rowCount: number;
  rows: DbRow[];
}
interface DbSchema {
  tier: string;
  sqlFileCount: number;
  gitCommit?: string;
  tables: DbTable[];
  unresolved?: Array<{ reason: string; ref: string }>;
}

/* ── crud-matrix.json 서브셋 ── */
interface CrudEvidence {
  file: string;
  line: number;
}
interface CrudRow {
  cells: string[];
  confidence: string;
  evidence: CrudEvidence[];
}
interface CrudMatrix {
  heading?: string;
  prose?: string;
  columns: string[];
  rows: CrudRow[];
}

type TabKey = "tables" | "crud" | "code";

/** CRUD 셀 문자 → 배지 톤(C 생성 / R 조회 / U 수정 / D 삭제 / ○ 접근확인). */
const CELL_TONE: Record<string, BadgeTone> = { C: "ok", R: "info", U: "warn", D: "err", "○": "mut" };
/** 행 단위 신뢰도 → ConfBadge 종류. */
const CONF_KIND: Record<string, ConfKind> = {
  CONFIRMED: "fix",
  CONFIRMED_AI: "ai",
  INFERRED: "est",
  UNVERIFIED: "chk",
};

const baseName = (p: string): string => p.split("/").pop() ?? p;
/** 컬럼이 PK인가 — 컬럼 플래그 또는 테이블 primaryKey 배열 멤버십(스캐너에 따라 한쪽만 채워짐). */
const isPk = (t: DbTable, c: DbColumn): boolean => c.primaryKey || (t.primaryKey?.includes(c.name) ?? false);
const len = (a: unknown[] | null | undefined): number => (Array.isArray(a) ? a.length : 0);

/** 트리·상세 등 여러 곳에서 쓰는 테이블 표시명(대문자 관례 유지). */
function TableTree({
  tables,
  selected,
  onSelect,
}: {
  tables: DbTable[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const biz = tables.filter((t) => !t.isCodeTable);
  const code = tables.filter((t) => t.isCodeTable);
  const groups: Array<{ label: string; items: DbTable[] }> = [];
  if (biz.length > 0) groups.push({ label: `업무 테이블 (${biz.length})`, items: biz });
  if (code.length > 0) groups.push({ label: `코드성 테이블 (${code.length})`, items: code });

  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="fold">{g.label}</div>
          {g.items.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelect(t.name)}
              title={t.name}
              className={`doc ${t.name === selected ? "on" : ""}`}
            >
              <span className="truncate font-mono" style={{ minWidth: 0 }}>
                {t.name}
              </span>
              <span className="st" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {t.isCodeTable && <Badge tone="info">코드성</Badge>}
                <span className="text-text-muted tabular-nums" style={{ fontSize: 11 }}>
                  {t.columns.length}c
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
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

function TableDetail({
  table,
  tier,
  onSeeCrud,
}: {
  table: DbTable;
  tier: string;
  onSeeCrud: () => void;
}) {
  const rows = table.rowCount || table.rows.length;
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
        <b className="font-mono text-text-primary" style={{ fontSize: 15 }}>
          {table.name}
        </b>
        <Badge tone="ok">Tier {tier.toUpperCase()}</Badge>
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
              <tr key={c.name}>
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

function CrudTab({ crud }: { crud: CrudMatrix }) {
  const tableCols = crud.columns.slice(1);
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "14px 16px" }}>
      {crud.prose && (
        <p className="text-text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
          {crud.prose}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="proto-tbl" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>{crud.columns[0] ?? "기능"} ＼ 테이블</th>
              {tableCols.map((t) => (
                <th key={t} className="font-mono">
                  {t}
                </th>
              ))}
              <th>신뢰도</th>
              <th>근거</th>
            </tr>
          </thead>
          <tbody>
            {crud.rows.map((row, ri) => {
              const kind = CONF_KIND[row.confidence] ?? "est";
              const evTitle = row.evidence.map((e) => `${e.file}:${e.line}`).join("\n");
              return (
                <tr key={`${row.cells[0] ?? ri}`}>
                  <td>
                    <b className="text-text-primary">{row.cells[0]}</b>
                  </td>
                  {tableCols.map((t, ci) => {
                    const v = row.cells[ci + 1] ?? "";
                    if (!v) {
                      return (
                        <td key={t} className="text-text-muted">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={t}>
                        <span className="inline-flex gap-1 flex-wrap">
                          {[...v].map((ch, i) => (
                            <Badge key={i} tone={CELL_TONE[ch] ?? "mut"}>
                              {ch}
                            </Badge>
                          ))}
                        </span>
                      </td>
                    );
                  })}
                  <td>
                    <ConfBadge kind={kind} title={row.confidence} />
                  </td>
                  <td>
                    {row.evidence.length > 0 ? (
                      <Ev style={{ cursor: "help" }}>
                        <span title={evTitle}>근거 {row.evidence.length}건</span>
                      </Ev>
                    ) : (
                      <span className="text-text-muted" style={{ fontSize: 11 }}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center flex-wrap text-text-muted"
        style={{ gap: 14, fontSize: 12, padding: "12px 4px 0" }}
      >
        <span>
          <Badge tone="ok">C</Badge> 생성
        </span>
        <span>
          <Badge tone="info">R</Badge> 조회
        </span>
        <span>
          <Badge tone="warn">U</Badge> 수정
        </span>
        <span>
          <Badge tone="err">D</Badge> 삭제
        </span>
        <span>· 행 단위 신뢰도·근거(file:line)는 각 행 우측에서 확인</span>
        <span>
          · {crud.rows.length}흐름 × {tableCols.length}테이블
        </span>
      </div>
    </div>
  );
}

function CodeTable({ table }: { table: DbTable }) {
  const rows = table.rows.slice(0, 5);
  const cols = table.columns.map((c) => c.name);
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
        <b className="font-mono text-text-primary" style={{ fontSize: 14 }}>
          {table.name}
        </b>
        <Badge tone="info">행 {table.rowCount || table.rows.length} 실측</Badge>
      </div>
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
      {rows.length > 0 && table.relPath && (
        <div style={{ marginTop: 8 }}>
          <Ev>
            데이터 파일 {baseName(table.relPath)} line {rows[0].line}
          </Ev>
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

export default function DataMapView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [schemaErr, setSchemaErr] = useState<string | null>(null);
  const [crud, setCrud] = useState<CrudMatrix | null>(null);
  const [crudErr, setCrudErr] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("tables");
  const [selName, setSelName] = useState<string | null>(null);
  const [unresolvedOpen, setUnresolvedOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${dataBase}db-schema.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: DbSchema) => {
        if (!alive) return;
        if (Array.isArray(data?.tables)) {
          setSchema(data);
          setSelName((cur) => cur ?? data.tables[0]?.name ?? null);
        } else {
          setSchemaErr("db-schema.json 형식 오류");
        }
      })
      .catch((e) => alive && setSchemaErr(String(e instanceof Error ? e.message : e)));

    fetch(`${dataBase}crud-matrix.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: CrudMatrix) => {
        if (!alive) return;
        if (Array.isArray(data?.columns) && Array.isArray(data?.rows)) setCrud(data);
        else setCrudErr("crud-matrix.json 형식 오류");
      })
      .catch((e) => alive && setCrudErr(String(e instanceof Error ? e.message : e)));

    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  const selected = useMemo(
    () => schema?.tables.find((t) => t.name === selName) ?? schema?.tables[0] ?? null,
    [schema, selName],
  );

  const codeTables = useMemo(() => {
    if (!schema) return [];
    const flagged = schema.tables.filter((t) => t.isCodeTable);
    return flagged.length > 0 ? flagged : schema.tables.filter((t) => t.rows.length > 0);
  }, [schema]);
  const codeIsFallback = Boolean(schema && !schema.tables.some((t) => t.isCodeTable));

  // db-schema 자체가 없으면 화면 전체를 안내(테이블·코드 탭이 모두 이것에 의존).
  const schemaMissing = !schema && schemaErr != null;

  const meta = schema
    ? `db-schema.json · Tier ${schema.tier?.toUpperCase() ?? "?"} · 테이블 ${schema.tables.length} · SQL ${schema.sqlFileCount ?? "?"}파일`
    : undefined;

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "tables", label: "테이블", count: schema?.tables.length },
    { key: "crud", label: "CRUD 매트릭스", count: crud?.rows.length },
    { key: "code", label: "코드 테이블", count: codeTables.length || undefined },
  ];

  const unresolved = schema?.unresolved ?? [];

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="데이터 맵"
        meta={meta}
        actions={
          <>
            <Link
              to="/deliverables/si-테이블정의서"
              className="rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
              style={{ padding: "7px 14px", fontSize: 13, textDecoration: "none", display: "inline-block" }}
            >
              테이블 정의서 md
            </Link>
            <button
              type="button"
              disabled
              title="후속 예정"
              className="rounded-lg border border-border-medium bg-panel text-text-secondary font-semibold disabled:opacity-50 disabled:cursor-default"
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              xlsx
            </button>
          </>
        }
      />

      {schemaMissing ? (
        <EmptyCard>
          <b className="text-text-primary">db-schema.json 없음</b>
          <br />
          데이터 맵은 정적 분석 산출물 <code>db-schema.json</code> 에 의존합니다. understand-map 스캔을 먼저 실행하면
          테이블·컬럼·PK/FK·코드성 행 데이터가 생성됩니다.
          <br />
          <span style={{ fontSize: 12 }}>({schemaErr})</span>
        </EmptyCard>
      ) : (
        <>
          {/* unresolved — 침묵 누락 금지: 접이식으로 상단 표면화 */}
          {unresolved.length > 0 && (
            <div
              className="rounded-lg border border-border-subtle bg-panel"
              style={{ borderLeft: "3px solid var(--color-status-warn)", padding: "8px 14px", marginBottom: 14 }}
            >
              <button
                type="button"
                onClick={() => setUnresolvedOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-0"
                style={{ font: "inherit" }}
              >
                <span style={{ fontSize: 9, width: 10 }}>{unresolvedOpen ? "▾" : "▸"}</span>
                <span className="text-text-primary" style={{ fontSize: 13, fontWeight: 650 }}>
                  미해결 항목 {unresolved.length}건
                </span>
                <span className="text-text-muted" style={{ fontSize: 12 }}>
                  — 스캔 중 결정되지 않은 신호(정합 확인 필요)
                </span>
              </button>
              {unresolvedOpen && (
                <ul style={{ margin: "8px 0 4px", paddingLeft: 24 }}>
                  {unresolved.map((u, i) => (
                    <li key={i} className="text-text-secondary" style={{ fontSize: 12.5, marginBottom: 3 }}>
                      {u.reason} <Ev>{u.ref}</Ev>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ProtoTabs tabs={tabs} active={tab} onChange={setTab} />

          {tab === "tables" &&
            (schema && schema.tables.length > 0 ? (
              <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
                <TableTree tables={schema.tables} selected={selected?.name ?? null} onSelect={setSelName} />
                {selected ? (
                  <TableDetail table={selected} tier={schema.tier} onSeeCrud={() => setTab("crud")} />
                ) : (
                  <EmptyCard>좌측에서 테이블을 선택하세요.</EmptyCard>
                )}
              </div>
            ) : (
              <EmptyCard>테이블이 없습니다.</EmptyCard>
            ))}

          {tab === "crud" &&
            (crud ? (
              <CrudTab crud={crud} />
            ) : (
              <EmptyCard>
                <b className="text-text-primary">crud-matrix.json 없음</b>
                <br />
                기능 흐름 × 테이블 CRUD 매트릭스는 understand-map 스캔에서 생성됩니다.
                {crudErr && (
                  <>
                    <br />
                    <span style={{ fontSize: 12 }}>({crudErr})</span>
                  </>
                )}
              </EmptyCard>
            ))}

          {tab === "code" &&
            (codeTables.length > 0 ? (
              <>
                {codeIsFallback && (
                  <p className="text-text-muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
                    코드성 판정 신호 없음 — 행 데이터가 실측된 테이블을 표시합니다.
                  </p>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14 }}>
                  {codeTables.map((t) => (
                    <CodeTable key={t.name} table={t} />
                  ))}
                </div>
              </>
            ) : (
              <EmptyCard>코드성 테이블도, 행 데이터가 실측된 테이블도 없습니다.</EmptyCard>
            ))}
        </>
      )}
    </div>
  );
}
