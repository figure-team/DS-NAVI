import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useDashboardStore } from "../../store";
import { dataUrl } from "../../shared/api/client";
import type { CrudMatrix, DbSchema, DbTable } from "../data-map/types";
import { useEscClose } from "./shared";
import { BAD, BORDER, FAINT, OK, WARN } from "./types";
import type { AfterSchema, AfterSchemaTable } from "./types";

/**
 * ② 데이터 비포·에프터 모달 (2026-07-17 사용자 결정).
 *
 * 좌 = 비포(현행 스키마 서브셋 그대로), 우 = 에프터(같은 서브셋 + **변경 도달 표식·CRUD**).
 * 도달 테이블은 결정론 조인으로 뽑는다: 시드 기능(fnId → 추적표 기능명) × CRUD 매트릭스
 * (기능 행 → 테이블별 C/R/U/D — 매퍼 SQL 문 종류에서 판정된 산출). 서브셋에는 도달 테이블의
 * FK 1-hop 인접을 맥락으로 함께 그린다(옅게 — 도달로 오독 금지).
 *
 * 여기의 "에프터"도 창작이 아니다(FlowCompareModal 과 같은 규약): 신규 컬럼/테이블(DAR)의
 * 미래 스키마는 그리지 않고, 참인 것 — 이 변경이 현행 스키마의 어디에 닿는가 — 만 표식한다.
 */

const OPS = ["C", "R", "U", "D"] as const;
const OP_META: Record<(typeof OPS)[number], { color: string; label: string }> = {
  C: { color: OK, label: "생성 insert" },
  R: { color: "var(--color-status-info)", label: "조회 select" },
  U: { color: WARN, label: "변경 update" },
  D: { color: BAD, label: "삭제 delete" },
};

function OpBadges({ ops }: { ops: Set<string> }) {
  return (
    <span className="flex items-center" style={{ gap: 3 }}>
      {OPS.filter((o) => ops.has(o)).map((o) => (
        <span key={o} title={`${OP_META[o].label} — 시드 기능이 이 테이블에 수행하는 연산(CRUD 매트릭스)`}
          className="rounded font-bold" style={{ fontSize: 9, fontFamily: "var(--font-mono)", lineHeight: 1.5, padding: "0 4px", color: OP_META[o].color, background: `color-mix(in srgb, ${OP_META[o].color} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${OP_META[o].color} 40%, transparent)` }}>
          {o}
        </span>
      ))}
    </span>
  );
}

/** 신규 컬럼 칩 스트립 — modified 테이블의 에프터 카드 하단([추정] 어휘 = 점선 ok). */
function DraftColsStrip({ draft }: { draft: AfterSchemaTable }) {
  return (
    <div className="flex flex-wrap items-baseline" style={{ gap: 3, borderTop: `1px dashed color-mix(in srgb, ${OK} 40%, transparent)`, paddingTop: 4, marginTop: 2 }}
      title={draft.note ? `[추정] ${draft.note}` : "[추정] ②가 요구사항 근거로 제안한 컬럼 추가 — 확정 전 초안"}>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: OK, flex: "none" }}>+ 컬럼</span>
      {draft.columns.map((c) => (
        <span key={c.name} title={c.note ?? c.type ?? c.name} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: OK, border: `1px dashed color-mix(in srgb, ${OK} 55%, transparent)`, borderRadius: 4, padding: "0 4px" }}>
          {c.name}{c.type ? ` ${c.type}` : ""}
        </span>
      ))}
    </div>
  );
}

/** 신규 테이블 카드 — 에프터 전용([추정] 점선). 비포엔 없다 — 그게 구조 diff 다. */
function AddedTableCard({ draft }: { draft: AfterSchemaTable }) {
  const shown = draft.columns.slice(0, 6);
  const over = draft.columns.length - shown.length;
  return (
    <div className="rounded-lg bg-panel flex flex-col" style={{ width: 200, padding: "8px 11px", gap: 4, border: `1.5px dashed ${OK}`, boxShadow: `0 0 0 3px color-mix(in srgb, ${OK} 16%, transparent)` }}
      title={draft.note ? `[추정] ${draft.note}` : "[추정] ②가 요구사항 근거로 제안한 신규 테이블 — 확정 전 초안"}>
      <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
        <span className="truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>{draft.name}</span>
        <span className="ml-auto flex-none rounded-full font-bold" style={{ fontSize: 8.5, padding: "1px 5px", color: OK, background: `color-mix(in srgb, ${OK} 13%, transparent)`, border: `1px solid ${OK}` }}>+ 신규</span>
      </div>
      <div className="flex flex-col" style={{ gap: 1 }}>
        {shown.map((c) => (
          <span key={c.name} title={c.note ?? undefined} style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--color-text-secondary)" }}>
            {c.name}{c.type ? <span style={{ color: FAINT }}> {c.type}</span> : null}
            {draft.pk?.includes(c.name) && <span title="PK 제안" style={{ color: OK, marginLeft: 3, fontSize: 8.5 }}>PK</span>}
          </span>
        ))}
        {over > 0 && <span style={{ fontSize: 9, color: FAINT }}>외 {over}컬럼</span>}
      </div>
      {(draft.fks ?? []).length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 3 }}>
          {(draft.fks ?? []).map((fk, i) => (
            <span key={i} title={`${fk.columns.join(",")} → ${fk.refTable}${fk.refColumns ? `(${fk.refColumns.join(",")})` : ""}`}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-layer-dao)", background: "color-mix(in srgb, var(--color-layer-dao) 9%, transparent)", borderRadius: 4, padding: "0 5px" }}>
              → {fk.refTable}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 테이블 카드 — ERD 노드의 축약(이름·PK·컬럼 수·FK 참조). after 에서만 도달 링·CRUD 배지·신규 컬럼. */
function TableCard({ t, kind, ops, after, draft }: { t: DbTable; kind: "hit" | "adj"; ops?: Set<string>; after: boolean; draft?: AfterSchemaTable }) {
  const marked = after && kind === "hit";
  return (
    <div
      className="rounded-lg bg-panel flex flex-col"
      style={{
        width: 200,
        padding: "8px 11px",
        gap: 4,
        border: marked ? `1.5px solid ${WARN}` : BORDER,
        boxShadow: marked ? `0 0 0 3px color-mix(in srgb, ${WARN} 22%, transparent)` : "0 1px 2px rgba(26,27,31,.05)",
        opacity: kind === "adj" ? 0.62 : 1,
      }}
    >
      <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
        <span className="truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }} title={t.comment ?? t.name}>{t.name}</span>
        {marked && ops && <span className="ml-auto flex-none"><OpBadges ops={ops} /></span>}
        {kind === "adj" && <span className="ml-auto flex-none" title="변경 도달 테이블의 FK 인접 — 맥락용이며 도달 아님" style={{ fontSize: 8.5, color: FAINT, border: BORDER, borderRadius: 4, padding: "0 4px" }}>인접</span>}
      </div>
      <div className="text-text-muted" style={{ fontSize: 10, lineHeight: 1.5 }}>
        컬럼 {t.columns.length}
        {t.primaryKey && t.primaryKey.length > 0 && (
          <> · PK <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{t.primaryKey.join(", ")}</span></>
        )}
      </div>
      {(t.foreignKeys ?? []).length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 3 }}>
          {(t.foreignKeys ?? []).map((fk, i) => (
            <span key={i} title={`${fk.columns.join(",")} → ${fk.refTable}(${fk.refColumns.join(",")})`}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-layer-dao)", background: "color-mix(in srgb, var(--color-layer-dao) 9%, transparent)", borderRadius: 4, padding: "0 5px" }}>
              → {fk.refTable}
            </span>
          ))}
        </div>
      )}
      {after && draft && <DraftColsStrip draft={draft} />}
    </div>
  );
}

function Pane({ label, tone, children, style }: { label: string; tone: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="flex flex-col min-h-0 min-w-0" style={style}>
      <div className="shrink-0 flex items-center" style={{ gap: 7, padding: "7px 14px", borderBottom: BORDER, background: `color-mix(in srgb, ${tone} 7%, transparent)` }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: "none" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>{label}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex flex-wrap content-start" style={{ padding: 14, gap: 10 }}>{children}</div>
    </div>
  );
}

/**
 * 입력 이원화(2026-07-17, /change 재사용) — RtmContext 에 묶지 않는다:
 *  - `seedNames` — 시드 **기능명**(호출부가 fnId→이름 해석). CRUD 매트릭스 결정론 조인으로
 *    도달 테이블 + 연산(C/R/U/D)까지 표식한다. RTM ②의 경로.
 *  - `tables` — 도달 **테이블명** 직접 전달. 변경·영향 원장의 시드는 파일(relPath)이라 기능명이
 *    없어 CRUD 조인이 불가하다 — 스냅샷이 이미 계산한 테이블 카탈로그로 도달만 표식(연산 미상).
 */
export default function DataCompareModal({ seedNames, tables, afterSchema, onClose }: {
  seedNames?: string[];
  tables?: string[];
  /**
   * ②의 에프터 스키마 초안(after-schema.json 파싱본, RTM_AFTER_FLOW_DESIGN.md §4) — 있으면
   * 에프터 패널이 **신규 테이블·컬럼**([추정] 점선)까지 그려 구조 diff 가 된다. 없으면(구산출·
   * 원장 렌즈) 도달 표식만 — after-flow 와 같은 폴백 규약.
   */
  afterSchema?: AfterSchema | null;
  onClose: () => void;
}) {
  useEscClose(onClose);
  const byName = seedNames !== undefined;
  const accessToken = useDashboardStore((s) => s.accessToken);
  const addedTables = useMemo(() => afterSchema?.tables.filter((t) => t.change === "added") ?? [], [afterSchema]);
  const modByName = useMemo(
    () => new Map((afterSchema?.tables ?? []).filter((t) => t.change === "modified").map((t) => [t.name.toUpperCase(), t])),
    [afterSchema],
  );
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [crud, setCrud] = useState<CrudMatrix | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch(dataUrl("db-schema.json", accessToken)).then((r) => (r.ok ? r.json() : null)),
      fetch(dataUrl("crud-matrix.json", accessToken)).then((r) => (r.ok ? r.json() : null)),
    ]).then(([s, c]) => {
      if (cancelled) return;
      const sv = s.status === "fulfilled" ? (s.value as DbSchema | null) : null;
      const cv = c.status === "fulfilled" ? (c.value as CrudMatrix | null) : null;
      setSchema(Array.isArray(sv?.tables) ? sv : null);
      setCrud(Array.isArray(cv?.columns) && Array.isArray(cv?.rows) ? cv : null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  // 도달 테이블 판정 — 이름 경로: 시드 기능 → CRUD 행(기능명 결정론 일치) → 테이블별 연산 집합.
  // 못 찾은 시드는 정직하게 따로 센다 — 조용히 떨구면 "데이터 도달 없음"으로 위장한다.
  // 테이블 경로: 호출부가 준 카탈로그 그대로(연산 미상 → 빈 집합).
  const join = useMemo(() => {
    const ops = new Map<string, Set<string>>();
    const unmatched: string[] = [];
    if (byName) {
      if (crud) {
        for (const name of seedNames ?? []) {
          const row = crud.rows.find((r) => r.cells[0] === name);
          if (!row) { unmatched.push(name); continue; }
          row.cells.forEach((cell, i) => {
            if (i === 0 || !cell) return;
            const table = crud.columns[i];
            const set = ops.get(table) ?? new Set<string>();
            for (const ch of cell) set.add(ch);
            ops.set(table, set);
          });
        }
      }
    } else {
      for (const t of tables ?? []) ops.set(t, new Set());
    }
    return { ops, unmatched };
  }, [byName, crud, seedNames, tables]);

  // 서브셋 = 도달 테이블 + 스키마 변경 제안 테이블 + FK 1-hop 인접(맥락).
  // 전체 스키마를 다 그리면 비교점이 묻힌다. 컬럼 추가 제안 테이블은 도달이 아니어도
  // 변경 범위이므로 hit 로 승격한다(비포에도 같은 카드가 서야 diff 가 공정하다).
  const subset = useMemo(() => {
    if (!schema) return [];
    const hit = new Set(join.ops.keys());
    for (const t of schema.tables) if (modByName.has(t.name.toUpperCase())) hit.add(t.name);
    const adj = new Set<string>();
    for (const t of schema.tables) {
      for (const fk of t.foreignKeys ?? []) {
        if (hit.has(t.name) && !hit.has(fk.refTable)) adj.add(fk.refTable);
        if (hit.has(fk.refTable) && !hit.has(t.name)) adj.add(t.name);
      }
    }
    return schema.tables
      .filter((t) => hit.has(t.name) || adj.has(t.name))
      .map((t) => ({ t, kind: (hit.has(t.name) ? "hit" : "adj") as "hit" | "adj", draft: modByName.get(t.name.toUpperCase()) }));
  }, [schema, join, modByName]);

  const hitCount = subset.filter((s) => s.kind === "hit").length;
  const modCount = subset.filter((s) => s.draft).length;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="glass-heavy rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: "min(94vw, 1400px)", height: "min(88vh, 880px)" }}>
        {/* 헤더 + 범례 — 표식 어휘를 도식과 같은 줄에서 설명한다. */}
        <div className="shrink-0 flex items-center flex-wrap border-b border-border-subtle" style={{ gap: 10, padding: "12px 18px", rowGap: 6 }}>
          <h2 className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>데이터 비포 · 에프터</h2>
          <span className="text-text-muted" style={{ fontSize: 11 }}>
            도달 테이블 {hitCount}
            {afterSchema && <> · 신규 {addedTables.length} · 컬럼 추가 {modCount}</>}
            {" · "}{byName ? `시드 ${(seedNames ?? []).length}건 × CRUD 매트릭스 결정론 조인` : "원장 스냅샷의 테이블 카탈로그(연산 미상 — 시드가 파일 단위)"}
          </span>
          <span className="flex items-center flex-wrap" style={{ gap: 9, marginLeft: 6, rowGap: 4 }}>
            <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }}>
              <span aria-hidden style={{ width: 14, height: 9, borderRadius: 3, border: `1.5px solid ${WARN}`, boxShadow: `0 0 0 2px color-mix(in srgb, ${WARN} 22%, transparent)` }} />변경 도달
            </span>
            {OPS.map((o) => (
              <span key={o} className="flex items-center" style={{ gap: 3, fontSize: 10, color: "var(--color-text-secondary)" }}>
                <span className="rounded font-bold" style={{ fontSize: 8.5, fontFamily: "var(--font-mono)", padding: "0 3px", color: OP_META[o].color, background: `color-mix(in srgb, ${OP_META[o].color} 13%, transparent)` }}>{o}</span>
                {OP_META[o].label}
              </span>
            ))}
            <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }}>
              <span aria-hidden style={{ width: 14, height: 9, borderRadius: 3, border: BORDER, opacity: 0.55 }} />인접(FK) — 도달 아님
            </span>
            {afterSchema && (
              <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }} title="②가 요구사항 근거로 제안한 신규 테이블·컬럼 — 확정 전 초안">
                <span aria-hidden style={{ width: 14, height: 9, borderRadius: 3, border: `1.5px dashed ${OK}` }} />신규 테이블·컬럼 [추정]
              </span>
            )}
          </span>
          <button onClick={onClose} aria-label="닫기" className="ml-auto text-text-muted hover:text-text-primary cursor-pointer" style={{ fontSize: 18, lineHeight: 1, background: "none", border: "none" }}>×</button>
        </div>

        {!loaded ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 13 }}>스키마·CRUD 매트릭스 불러오는 중…</div>
        ) : !schema ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 12.5, padding: 40, textAlign: "center", lineHeight: 1.7 }}>db-schema.json 을 읽지 못했습니다 — 데이터 메뉴가 뜨는 상태에서 다시 여세요.</div>
        ) : byName && !crud ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 12.5, padding: 40, textAlign: "center", lineHeight: 1.7 }}>crud-matrix.json 을 읽지 못했습니다 — 기능→테이블 도달을 계산할 수 없습니다(스키마만으로는 비교 표식이 불가).</div>
        ) : hitCount === 0 && addedTables.length === 0 ? (
          <div className="flex-1 flex items-center justify-center" style={{ padding: 40 }}>
            <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.7, maxWidth: 520 }}>
              {byName ? (
                <>시드 기능이 CRUD 매트릭스에서 <b className="text-text-secondary">테이블에 닿지 않습니다</b> —
                화면·라우팅만 바꾸는 변경이거나, 시드 기능이 매트릭스 행과 매칭되지 않은 경우입니다.
                {join.unmatched.length > 0 && <> (미매칭 시드 {join.unmatched.length}건: {join.unmatched.join(" · ")})</>}</>
              ) : (
                <>이 분석 산출에 <b className="text-text-secondary">도달 테이블 기록이 없습니다</b> —
                화면·라우팅만 건드리는 변경이거나 persistence 축이 계산되지 않은 스냅샷입니다.</>
              )}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-2">
            <Pane label="비포 — 현행 스키마" tone={OK}>
              {subset.map(({ t, kind }) => <TableCard key={t.name} t={t} kind={kind} after={false} />)}
            </Pane>
            {/* 에프터 — 도달·CRUD 표식 + 스키마 초안([추정] 신규 테이블·컬럼). 신규 테이블은
                비포에 없다 — 그 부재가 곧 구조 diff 다(after-flow 의 신규 활동과 같은 어휘). */}
            <Pane label={afterSchema ? "에프터 — 변경 도달 + 스키마 초안 [추정]" : "에프터 — 변경 도달 + CRUD 표식"} tone={WARN} style={{ borderLeft: BORDER }}>
              {subset.map(({ t, kind, draft }) => <TableCard key={t.name} t={t} kind={kind} ops={join.ops.get(t.name)} after draft={draft} />)}
              {addedTables.map((d) => <AddedTableCard key={d.name} draft={d} />)}
            </Pane>
          </div>
        )}

        {/* 정직성 각주 — 미매칭 시드는 표시 범위 과소의 신호다(조용한 누락 금지). */}
        <div className="shrink-0 border-t border-border-subtle text-text-muted" style={{ padding: "7px 18px", fontSize: 10.5, lineHeight: 1.5 }}>
          <b className="text-text-secondary">에프터</b>는 현행 스키마 위에 <b style={{ color: WARN }}>변경 도달</b>{byName ? "과 연산(CRUD)" : ""}
          {afterSchema ? <>, 그리고 ②가 요구사항 근거로 제안한 <b style={{ color: OK }}>신규 테이블·컬럼([추정])</b></> : null}을 표식한 것입니다 —
          {afterSchema
            ? <> 스키마 초안은 <b className="text-text-secondary">검토·컨펌 전 확정이 아니며</b>, 이름·타입은 구현 설계에서 바뀔 수 있습니다.</>
            : <> 신규 컬럼·테이블(DAR)의 미래 스키마는 확정·구현 후 재분석이 반영합니다.</>} 전체 ERD 는 데이터 메뉴에서 봅니다.
          {byName && loaded && crud && join.unmatched.length > 0 && (
            <span style={{ color: WARN }}> ⚠ CRUD 매트릭스와 매칭되지 않은 시드 {join.unmatched.length}건({join.unmatched.join(" · ")}) — 실제 도달 범위가 표시보다 넓을 수 있습니다.</span>
          )}
        </div>
      </div>
    </div>
  );
}
