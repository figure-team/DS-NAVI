import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Badge } from "../proto/Proto";
import { useTheme } from "../../themes/index.ts";
import { applyElkLayout } from "../../utils/elk-layout";
import { mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import { TableDetail } from "./TablesTab";
import { isPk } from "./types";
import type { DbColumn, DbSchema, DbTable } from "./types";

/**
 * ERD 탭 — db-schema 의 테이블·선언 FK 를 React Flow + ELK(layered) 로 그린다.
 * 노드 클릭 = 1-hop 이웃 강조(비이웃 디밍, 구조 탭 관례) + 우측 사이드 패널 상세
 * (TableDetail 재사용). 선택은 ?table= URL 단일 소스 — 테이블 탭과 공유되어
 * 탭을 오가도 같은 테이블이 선택돼 있다.
 */

/* ── 노드 크기(ELK 입력) — ErdTableNode 렌더 실측과 맞춘 추정치 ── */
const NODE_W = 232;
const HEADER_H = 34;
const ROW_H = 21;
const FOOTER_H = 22;
const MAX_KEY_ROWS = 6;

interface ErdColRow {
  name: string;
  type: string;
  kind: "PK" | "FK" | "UQ";
}
interface ErdNodeData extends Record<string, unknown> {
  name: string;
  isCodeTable: boolean;
  keyRows: ErdColRow[];
  moreCount: number;
  dimmed: boolean;
  active: boolean;
  /** 선택 테이블 기준 FK↔PK 컬럼 매칭 색(소문자 컬럼명 → 관계색들). */
  colColors: Record<string, string[]>;
}

/**
 * 관계(FK)별 매칭 색 팔레트 — 모드별 5색, dataviz 검증기(색각 이상 시뮬레이션 +
 * 서피스 대비) 통과 조합. 파랑↔보라·빨강↔주황·청록↔초록처럼 일반 시야에서도
 * 붙어 보이는 쌍을 배제했고, CVD 바닥 밴드(ΔE 10.3~11.2)는 FK 행↔PK 행을 잇는
 * 물리적 연결선 + 항상 보이는 컬럼명 텍스트가 2차 인코딩으로 보완한다.
 * 순서는 고정 배정(관계 수가 적을수록 앞 색부터) — 임의 재배열 금지.
 */
const REL_PALETTES: Record<"light" | "dark", string[]> = {
  light: ["#2a78d6", "#eb6834", "#008300", "#e87ba4", "#eda100"],
  dark: ["#3987e5", "#d95926", "#008300", "#d55181", "#c98500"],
};
type ErdFlowNode = Node<ErdNodeData, "erdTable">;

/** 노드에 보여줄 키 컬럼(PK → FK → UNIQUE 순, 최대 MAX_KEY_ROWS). */
function keyRowsOf(table: DbTable, fkCols: Set<string>): { rows: ErdColRow[]; more: number } {
  const rows: ErdColRow[] = [];
  const kind = (c: DbColumn): ErdColRow["kind"] | null =>
    isPk(table, c) ? "PK" : fkCols.has(c.name.toLowerCase()) ? "FK" : c.unique ? "UQ" : null;
  for (const c of table.columns) {
    const k = kind(c);
    if (k) rows.push({ name: c.name, type: c.type, kind: k });
  }
  const shown = rows.slice(0, MAX_KEY_ROWS);
  // 키 컬럼이 없는 테이블은 몸통 없이 "외 N개 컬럼"만 표시.
  return { rows: shown, more: table.columns.length - shown.length };
}

function nodeHeight(rowCount: number, more: number): number {
  return HEADER_H + Math.max(rowCount, 0) * ROW_H + (more > 0 ? FOOTER_H : 0) + 10;
}

const KIND_TONE: Record<ErdColRow["kind"], "info" | "warn"> = { PK: "info", FK: "warn", UQ: "info" };

function ErdTableNode({ data }: NodeProps<ErdFlowNode>) {
  return (
    <div
      className="rounded-lg border bg-panel card-shadow overflow-hidden transition-opacity duration-200"
      style={{
        width: NODE_W,
        opacity: data.dimmed ? 0.18 : 1,
        borderColor: data.active ? "var(--color-status-info)" : "var(--color-border-medium)",
        boxShadow: data.active ? "0 0 0 2px color-mix(in srgb, var(--color-status-info) 35%, transparent)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div
        className="flex items-center gap-1.5 border-b border-border-subtle"
        style={{ padding: "7px 10px", height: HEADER_H }}
      >
        <b className="font-mono text-text-primary truncate" style={{ fontSize: 12.5 }}>
          {data.name}
        </b>
        {data.isCodeTable && (
          <Badge tone="info" style={{ fontSize: 9.5, padding: "1px 5px" }}>
            코드성
          </Badge>
        )}
      </div>
      <div style={{ padding: "5px 10px" }}>
        {data.keyRows.map((r) => {
          const rel = data.colColors[r.name.toLowerCase()] ?? [];
          // 관계가 여럿이면 동심 링(최대 3겹)으로 겹쳐 그린다 — inset shadow 는 앞선 항목이 위.
          // 배경 틴트는 라이트 서피스에서 3:1 미달인 링 색(노랑·마젠타)의 시인성 완충(relief).
          const rings = rel
            .slice(0, 3)
            .map((c, i) => `inset 0 0 0 ${2 + 1.5 * i}px ${c}`)
            .join(", ");
          return (
          <div
            key={r.name}
            className="flex items-center gap-1.5"
            style={{
              height: ROW_H,
              borderRadius: 5,
              padding: "0 5px",
              margin: "0 -5px",
              boxShadow: rings || undefined,
              background: rel.length ? `color-mix(in srgb, ${rel[0]} 12%, transparent)` : undefined,
            }}
          >
            <Badge tone={KIND_TONE[r.kind]} style={{ fontSize: 9, padding: "0px 4px" }}>
              {r.kind}
            </Badge>
            <span className="font-mono text-text-primary truncate" style={{ fontSize: 11 }}>
              {r.name}
            </span>
            <span className="font-mono text-text-muted truncate" style={{ fontSize: 10, marginLeft: "auto" }}>
              {r.type}
            </span>
          </div>
          );
        })}
        {data.moreCount > 0 && (
          <div className="text-text-muted" style={{ fontSize: 10.5, height: FOOTER_H, display: "flex", alignItems: "center" }}>
            외 {data.moreCount}개 컬럼
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { erdTable: ErdTableNode };

interface FkEdgeInfo {
  id: string;
  source: string;
  target: string;
  /** 자식(source) 쪽 FK 컬럼명 — 소문자. */
  columns: string[];
  /** 부모(target) 쪽 참조 컬럼명(선언 부재 시 부모 PK로 폴백) — 소문자. */
  refColumns: string[];
}

/** 테이블 PK 컬럼명(소문자) — primaryKey 배열 또는 컬럼 플래그(스캐너에 따라 한쪽만 채워짐). */
function pkColsOf(t: DbTable): string[] {
  const declared = t.primaryKey?.length
    ? t.primaryKey
    : t.columns.filter((c) => c.primaryKey).map((c) => c.name);
  return declared.map((c) => c.toLowerCase());
}

function ErdCanvas({ schema }: { schema: DbSchema }) {
  const isDark = useTheme().preset.isDark;
  const relPalette = REL_PALETTES[isDark ? "dark" : "light"];
  const [searchParams, setSearchParams] = useSearchParams();
  const selName = searchParams.get("table");
  const selected = useMemo(
    () => schema.tables.find((t) => t.name === selName) ?? null,
    [schema.tables, selName],
  );

  const knownTables = useMemo(
    () => new Map(schema.tables.map((t) => [t.name.toLowerCase(), t.name])),
    [schema.tables],
  );

  // 선언 FK → 엣지(자식 → 참조 테이블). 참조 대상이 스키마에 없으면 제외(UnresolvedBanner 영역).
  const fkEdges = useMemo<FkEdgeInfo[]>(() => {
    const byLower = new Map(schema.tables.map((t) => [t.name.toLowerCase(), t]));
    const out: FkEdgeInfo[] = [];
    for (const t of schema.tables) {
      for (const [i, fk] of (t.foreignKeys ?? []).entries()) {
        const targetTable = byLower.get(fk.refTable.toLowerCase());
        if (!targetTable || targetTable.name === t.name) continue;
        out.push({
          id: `fk:${t.name}:${i}`,
          source: t.name,
          target: targetTable.name,
          columns: fk.columns.map((c) => c.toLowerCase()),
          refColumns: fk.refColumns?.length
            ? fk.refColumns.map((c) => c.toLowerCase())
            : pkColsOf(targetTable),
        });
      }
    }
    return out;
  }, [schema.tables]);

  // 선택 테이블에 닿는 관계별 색 배정 — 같은 색 = 같은 FK 관계(자식 FK 행 ↔ 부모 PK 행 ↔ 연결선).
  const highlight = useMemo(() => {
    if (!selected) return null;
    const edgeColors = new Map<string, string>();
    const rowColors = new Map<string, Map<string, string[]>>();
    const push = (table: string, col: string, color: string) => {
      const m = rowColors.get(table) ?? new Map<string, string[]>();
      m.set(col, [...(m.get(col) ?? []), color]);
      rowColors.set(table, m);
    };
    let i = 0;
    for (const e of fkEdges) {
      if (e.source !== selected.name && e.target !== selected.name) continue;
      const color = relPalette[i++ % relPalette.length];
      edgeColors.set(e.id, color);
      for (const c of e.columns) push(e.source, c, color);
      for (const c of e.refColumns) push(e.target, c, color);
    }
    return { edgeColors, rowColors };
  }, [selected, fkEdges, relPalette]);

  // 선택 테이블의 1-hop 이웃(FK 양방향) — 강조/디밍 판정.
  const neighborhood = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.name]);
    for (const e of fkEdges) {
      if (e.source === selected.name) set.add(e.target);
      if (e.target === selected.name) set.add(e.source);
    }
    return set;
  }, [selected, fkEdges]);

  // 기하(노드·엣지 구성)는 선택과 무관 — 선택 변화로 ELK 재계산이 돌지 않게 분리.
  const base = useMemo(() => {
    const dims = new Map<string, { width: number; height: number }>();
    const nodes: ErdFlowNode[] = schema.tables.map((t) => {
      const fkCols = new Set((t.foreignKeys ?? []).flatMap((fk) => fk.columns.map((c) => c.toLowerCase())));
      const { rows, more } = keyRowsOf(t, fkCols);
      dims.set(t.name, { width: NODE_W, height: nodeHeight(rows.length, more) });
      return {
        id: t.name,
        type: "erdTable",
        position: { x: 0, y: 0 },
        data: { name: t.name, isCodeTable: t.isCodeTable, keyRows: rows, moreCount: more, dimmed: false, active: false, colColors: {} },
      };
    });
    const edges: Edge[] = fkEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return { nodes, edges, dims };
  }, [schema.tables, fkEdges]);

  const [layouted, setLayouted] = useState<ErdFlowNode[] | null>(null);
  useEffect(() => {
    let alive = true;
    const input = nodesToElkInput(base.nodes, base.edges, base.dims, {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "36",
      "elk.spacing.componentComponent": "48",
      "elk.separateConnectedComponents": "true",
    });
    applyElkLayout(input)
      .then(({ positioned }) => {
        if (alive) setLayouted(mergeElkPositions(base.nodes, positioned));
      })
      .catch(() => alive && setLayouted(base.nodes));
    return () => {
      alive = false;
    };
  }, [base]);

  // 선택/이웃 강조는 레이아웃 결과 위에 오버레이(위치 재계산 없음).
  const nodes = useMemo(() => {
    const src = layouted ?? [];
    return src.map((n) => ({
      ...n,
      data: {
        ...n.data,
        active: n.id === selected?.name,
        dimmed: neighborhood != null && !neighborhood.has(n.id),
        colColors: Object.fromEntries(highlight?.rowColors.get(n.id) ?? []),
      },
    }));
  }, [layouted, selected, neighborhood, highlight]);

  const edges = useMemo(
    () =>
      base.edges.map((e) => {
        // 선택 테이블에 닿는 엣지는 관계 고유색(노드의 FK/PK 행 외곽선과 동일).
        const rel = highlight?.edgeColors.get(e.id);
        return {
          ...e,
          style: rel
            ? { stroke: rel, strokeWidth: 2 }
            : { stroke: "var(--color-border-medium)", strokeWidth: 1.2, opacity: neighborhood ? 0.15 : 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: rel ?? "var(--color-border-medium)",
          },
          zIndex: rel ? 10 : 0,
        };
      }),
    [base.edges, neighborhood, highlight],
  );

  const setTable = (name: string | null) =>
    setSearchParams((prev) => {
      if (name) prev.set("table", name);
      else prev.delete("table");
      return prev;
    });

  return (
    <div
      className="grid items-start min-w-0"
      style={{ gap: 14, gridTemplateColumns: selected ? "minmax(0,1fr) 440px" : "minmax(0,1fr)" }}
    >
      <div
        className="rounded-[10px] border border-border-subtle bg-panel card-shadow overflow-hidden"
        style={{ height: "calc(100vh - 320px)", minHeight: 420 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setTable(n.id)}
          onPaneClick={() => setTable(null)}
          fitView
          minZoom={0.05}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          {schema.tables.length > 30 && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>

      {selected && (
        <div className="min-w-0" style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
          <TableDetail
            table={selected}
            tier={schema.tier}
            highlightCols={new Set()}
            fixedColumns={false}
            knownTables={knownTables}
            onSelectTable={(name) => setTable(name)}
            onSeeCrud={() =>
              setSearchParams((prev) => {
                prev.set("tab", "crud");
                prev.set("crudTable", selected.name);
                return prev;
              })
            }
          />
          <div style={{ marginTop: 10, textAlign: "right" }}>
            <button
              type="button"
              onClick={() =>
                setSearchParams((prev) => {
                  prev.set("tab", "tables");
                  return prev;
                })
              }
              className="cursor-pointer bg-transparent border-0"
              style={{ color: "var(--color-status-info)", fontSize: 12, padding: 0 }}
            >
              테이블 탭에서 열기 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErdTab({ schema }: { schema: DbSchema }) {
  if (schema.tables.length === 0) {
    return (
      <div
        className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
        style={{ padding: "28px 26px", fontSize: 13, lineHeight: 1.7 }}
      >
        테이블이 없습니다.
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <ErdCanvas schema={schema} />
    </ReactFlowProvider>
  );
}
