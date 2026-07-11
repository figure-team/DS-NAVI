import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  Background,
  BackgroundVariant,
  Controls,
  getNodesBounds,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";

import { Badge } from "../proto/Proto";
import { useTheme } from "../../themes/index.ts";
import { applyElkLayout } from "../../utils/elk-layout";
import { mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import { fkCardinality } from "./erd-cardinality";
import type { FkCardinality } from "./erd-cardinality";
import { planErdExport } from "./erd-export";
import { inferFkEdges } from "./erd-infer";
import { TableDetail } from "./TablesTab";
import { isPk } from "./types";
import type { DbColumn, DbSchema, DbTable } from "./types";

/**
 * ERD 탭 — db-schema 의 테이블·선언 FK 를 React Flow + ELK(layered) 로 그린다.
 * 노드 클릭 = 1-hop 이웃 강조(비이웃 디밍, 구조 탭 관례) + 우측 사이드 패널 상세
 * (TableDetail 재사용). 선택은 ?table= URL 단일 소스 — 테이블 탭과 공유되어
 * 탭을 오가도 같은 테이블이 선택돼 있다.
 * 엣지는 컬럼 앵커(FK 행 ↔ 참조 행에 직접 연결) + crow's foot 카디널리티
 * (erd-cardinality — 자식 0..N/0..1, 부모 1/0..1, 추정 FK 는 무표기 점선만).
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

/** i번째 키 행의 세로 중심 — 컬럼 앵커 핸들 top(px). 몸통 padding-top 5px 포함. */
const rowAnchorTop = (i: number): number => HEADER_H + 5 + i * ROW_H + ROW_H / 2;

const HIDDEN_HANDLE = { opacity: 0, pointerEvents: "none" } as const;

/**
 * 키 행별 컬럼 앵커 핸들 — 엣지가 FK/PK 컬럼 행 높이에 직접 붙는다.
 * 좌우 어느 쪽에 붙을지는 레이아웃 후 상대 위치로 엣지가 고르므로 4방(소스/타깃 × 좌/우) 전부 등록.
 * id 규약: `{s|t}:{소문자 컬럼명}:{l|r}` — ErdCanvas 의 edges 메모와 맞물림.
 */
function ColumnAnchors({ rows }: { rows: ErdColRow[] }) {
  return (
    <>
      {rows.map((r, i) => {
        const col = r.name.toLowerCase();
        const top = rowAnchorTop(i);
        return (
          <span key={col}>
            <Handle type="source" id={`s:${col}:l`} position={Position.Left} style={{ ...HIDDEN_HANDLE, top }} />
            <Handle type="source" id={`s:${col}:r`} position={Position.Right} style={{ ...HIDDEN_HANDLE, top }} />
            <Handle type="target" id={`t:${col}:l`} position={Position.Left} style={{ ...HIDDEN_HANDLE, top }} />
            <Handle type="target" id={`t:${col}:r`} position={Position.Right} style={{ ...HIDDEN_HANDLE, top }} />
          </span>
        );
      })}
    </>
  );
}

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
      {/* 노드 레벨 폴백 핸들 — 앵커 컬럼이 MAX_KEY_ROWS 로 잘려 안 보일 때 사용. */}
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
      <ColumnAnchors rows={data.keyRows} />
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

/**
 * crow's foot 마커 defs — 자식 끝 0..N(원+까마귀발)/0..1(원+바), 부모 끝 1(바)/0..1(원+바).
 * 선언 FK 전용(추정 FK 는 카디널리티 무표기 — 점선만). 관계 강조색 5색 + 기본색별로 한 벌씩
 * 생성(마커는 CSS 로 색을 못 물려받음). markerUnits=userSpaceOnUse 라 선 굵기(1.2/2)와
 * 무관하게 크기 고정. 원 fill 은 캔버스 서피스색 — 밑을 지나는 연결선을 가려 ○ 가 읽히게 한다.
 */
function ErdMarkerDefs({ palette }: { palette: string[] }) {
  const colors: Array<[string, string]> = [
    ["d", "var(--color-border-medium)"],
    ...palette.map((c, i): [string, string] => [String(i), c]),
  ];
  const marker = (id: string, children: ReactNode) => (
    <marker
      key={id}
      id={id}
      viewBox="0 0 20 12"
      markerWidth={20}
      markerHeight={12}
      refX={20}
      refY={6}
      orient="auto-start-reverse"
      markerUnits="userSpaceOnUse"
    >
      {children}
    </marker>
  );
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <defs>
        {colors.flatMap(([k, c]) => {
          const crow = <path d="M10 6 L20 1.2 M10 6 L20 6 M10 6 L20 10.8" fill="none" stroke={c} strokeWidth={1.5} />;
          const bar = <path d="M13 1.5 L13 10.5" fill="none" stroke={c} strokeWidth={1.5} />;
          const circle = <circle cx={4.5} cy={6} r={3} fill="var(--color-panel)" stroke={c} strokeWidth={1.5} />;
          return [
            marker(`erd-many-${k}`, <>{circle}{crow}</>),
            marker(`erd-one-${k}`, bar),
            marker(`erd-zeroone-${k}`, <>{circle}{bar}</>),
          ];
        })}
      </defs>
    </svg>
  );
}

interface FkEdgeInfo {
  id: string;
  source: string;
  target: string;
  /** 자식(source) 쪽 FK 컬럼명 — 소문자. */
  columns: string[];
  /** 부모(target) 쪽 참조 컬럼명(선언 부재 시 부모 PK로 폴백) — 소문자. */
  refColumns: string[];
  /** 이름 기반 추정 관계(erd-infer) — 점선 렌더, 토글로 숨김 가능. */
  inferred?: boolean;
  /** 스키마 제약에서 유도한 카디널리티 — 선언 FK 전용(추정은 근거 없음 → 무주장 까마귀발). */
  card?: FkCardinality;
}

type ErdView = "all" | "fk" | "inferred" | "isolated";
const ERD_VIEWS: Array<{ key: ErdView; label: string }> = [
  { key: "all", label: "전체" },
  { key: "fk", label: "선언 FK" },
  { key: "inferred", label: "추정 FK" },
  { key: "isolated", label: "고립" },
];

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
  const { fitView, getNodes } = useReactFlow();
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

  // 보기 모드 — 전체 / 선언 FK 연결 / 추정 FK 연결 / 고립(연결 없음). URL ?view= 단일 소스.
  const viewParam = searchParams.get("view");
  const view: ErdView = ERD_VIEWS.some((v) => v.key === viewParam) ? (viewParam as ErdView) : "all";

  // 선언 FK → 엣지(자식 → 참조 테이블). 참조 대상이 스키마에 없으면 제외(UnresolvedBanner 영역).
  // + 이름 기반 추정 관계(erd-infer) — 선언 FK 없는 레거시 대응, 점선 렌더.
  const { fkEdges, inferredCount } = useMemo(() => {
    const byLower = new Map(schema.tables.map((t) => [t.name.toLowerCase(), t]));
    const out: FkEdgeInfo[] = [];
    for (const t of schema.tables) {
      for (const [i, fk] of (t.foreignKeys ?? []).entries()) {
        const targetTable = byLower.get(fk.refTable.toLowerCase());
        if (!targetTable || targetTable.name === t.name) continue;
        const columns = fk.columns.map((c) => c.toLowerCase());
        out.push({
          id: `fk:${t.name}:${i}`,
          source: t.name,
          target: targetTable.name,
          columns,
          refColumns: fk.refColumns?.length
            ? fk.refColumns.map((c) => c.toLowerCase())
            : pkColsOf(targetTable),
          card: fkCardinality(t, columns),
        });
      }
    }
    const inferred = inferFkEdges(schema.tables).map<FkEdgeInfo>((e, i) => ({
      id: `ifk:${e.source}:${i}`,
      source: e.source,
      target: e.target,
      columns: [e.column],
      refColumns: [e.refColumn],
      inferred: true,
    }));
    return { fkEdges: [...out, ...inferred], inferredCount: inferred.length };
  }, [schema.tables]);

  // 모드별 표시 대상(노드 집합 + 엣지 목록) — 레이아웃·이웃·색 배정 전부 이 기준.
  // tables=null 은 "전체". 모드별 노드 수는 필터 배지에 표기.
  const { visibleEdges, visibleTables, viewCounts } = useMemo(() => {
    const declared = fkEdges.filter((e) => !e.inferred);
    const inferred = fkEdges.filter((e) => e.inferred);
    const nodeSet = (edges: FkEdgeInfo[]) =>
      new Set(edges.flatMap((e) => [e.source, e.target]));
    const fkNodes = nodeSet(declared);
    const infNodes = nodeSet(inferred);
    const isolated = new Set(
      schema.tables.map((t) => t.name).filter((n) => !fkNodes.has(n) && !infNodes.has(n)),
    );
    const byView: Record<ErdView, { tables: Set<string> | null; edges: FkEdgeInfo[] }> = {
      all: { tables: null, edges: fkEdges },
      fk: { tables: fkNodes, edges: declared },
      inferred: { tables: infNodes, edges: inferred },
      isolated: { tables: isolated, edges: [] },
    };
    return {
      visibleEdges: byView[view].edges,
      visibleTables: byView[view].tables,
      viewCounts: {
        all: schema.tables.length,
        fk: fkNodes.size,
        inferred: infNodes.size,
        isolated: isolated.size,
      } satisfies Record<ErdView, number>,
    };
  }, [fkEdges, schema.tables, view]);

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
    for (const e of visibleEdges) {
      if (e.source !== selected.name && e.target !== selected.name) continue;
      const color = relPalette[i++ % relPalette.length];
      edgeColors.set(e.id, color);
      for (const c of e.columns) push(e.source, c, color);
      for (const c of e.refColumns) push(e.target, c, color);
    }
    return { edgeColors, rowColors };
  }, [selected, visibleEdges, relPalette]);

  // 선택 테이블의 1-hop 이웃(FK 양방향, 추정 포함) — 강조/디밍 판정.
  const neighborhood = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.name]);
    for (const e of visibleEdges) {
      if (e.source === selected.name) set.add(e.target);
      if (e.target === selected.name) set.add(e.source);
    }
    return set;
  }, [selected, visibleEdges]);

  // 기하(노드·엣지 구성)는 선택과 무관 — 선택 변화로 ELK 재계산이 돌지 않게 분리.
  // (보기 모드 변화는 노드 집합이 바뀌므로 재계산 대상.)
  const base = useMemo(() => {
    const dims = new Map<string, { width: number; height: number }>();
    // 테이블별 노드에 실제 표시된 키 행(소문자) — 컬럼 앵커 핸들 존재 여부 판정.
    const shownCols = new Map<string, Set<string>>();
    const shown = visibleTables
      ? schema.tables.filter((t) => visibleTables.has(t.name))
      : schema.tables;
    const nodes: ErdFlowNode[] = shown.map((t) => {
      const fkCols = new Set((t.foreignKeys ?? []).flatMap((fk) => fk.columns.map((c) => c.toLowerCase())));
      const { rows, more } = keyRowsOf(t, fkCols);
      dims.set(t.name, { width: NODE_W, height: nodeHeight(rows.length, more) });
      shownCols.set(t.name, new Set(rows.map((r) => r.name.toLowerCase())));
      return {
        id: t.name,
        type: "erdTable",
        position: { x: 0, y: 0 },
        data: { name: t.name, isCodeTable: t.isCodeTable, keyRows: rows, moreCount: more, dimmed: false, active: false, colColors: {} },
      };
    });
    const edges: Edge[] = visibleEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      data: { inferred: !!e.inferred },
    }));
    return { nodes, edges, dims, shownCols };
  }, [schema.tables, visibleTables, visibleEdges]);

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

  // 보기 모드 전환 등으로 노드 집합·배치가 바뀌면 뷰포트 재적합(fitView prop 은 초기 1회뿐).
  useEffect(() => {
    if (!layouted) return;
    const raf = requestAnimationFrame(() => fitView({ padding: 0.15, duration: 200 }));
    return () => cancelAnimationFrame(raf);
  }, [layouted, fitView]);

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

  const edges = useMemo(() => {
    const infoById = new Map(visibleEdges.map((e) => [e.id, e]));
    const nodeX = new Map((layouted ?? []).map((n) => [n.id, n.position.x]));
    return base.edges.map((e) => {
      // 선택 테이블에 닿는 엣지는 관계 고유색(노드의 FK/PK 행 외곽선과 동일). 추정은 점선.
      const rel = highlight?.edgeColors.get(e.id);
      const dash = e.data?.inferred ? "6 4" : undefined;

      // 컬럼 앵커 — FK 컬럼 행(자식) ↔ 참조 컬럼 행(부모)에 직접 연결. 좌우는 레이아웃 후
      // 상대 x 로 결정(복합 FK 는 첫 컬럼 기준). 행이 안 보이면 노드 레벨 폴백.
      const info = infoById.get(e.id);
      const sx = nodeX.get(e.source);
      const tx = nodeX.get(e.target);
      let sourceHandle: string | undefined;
      let targetHandle: string | undefined;
      if (info && sx != null && tx != null) {
        const ltr = sx <= tx;
        const sCol = info.columns[0];
        const tCol = info.refColumns[0];
        if (sCol && base.shownCols.get(e.source)?.has(sCol)) sourceHandle = `s:${sCol}:${ltr ? "r" : "l"}`;
        if (tCol && base.shownCols.get(e.target)?.has(tCol)) targetHandle = `t:${tCol}:${ltr ? "l" : "r"}`;
      }

      // crow's foot — 자식 끝(markerStart) 0..N/0..1, 부모 끝(markerEnd) 1/0..1.
      // 추정 FK 는 제약 근거가 없어 카디널리티 무표기(점선만).
      const colorKey = rel ? String(relPalette.indexOf(rel)) : "d";
      const card = info?.card;
      const markers = card
        ? {
            // React Flow 가 문자열 마커를 url('#…') 로 감싼다 — id 만 넘길 것.
            markerStart: `erd-${card.childUnique ? "zeroone" : "many"}-${colorKey}`,
            markerEnd: `erd-${card.parentOptional ? "zeroone" : "one"}-${colorKey}`,
          }
        : {};

      return {
        ...e,
        sourceHandle,
        targetHandle,
        style: rel
          ? { stroke: rel, strokeWidth: 2, strokeDasharray: dash }
          : {
              stroke: "var(--color-border-medium)",
              strokeWidth: 1.2,
              strokeDasharray: dash,
              opacity: neighborhood ? 0.15 : 1,
            },
        ...markers,
        zIndex: rel ? 10 : 0,
      };
    });
  }, [base.edges, base.shownCols, visibleEdges, layouted, neighborhood, highlight, relPalette]);

  const setTable = (name: string | null) =>
    setSearchParams((prev) => {
      if (name) prev.set("table", name);
      else prev.delete("table");
      return prev;
    });

  // PNG 내보내기 — 화면 줌 무관 zoom=1(테이블 실측 크기) × pixelRatio(erd-export 계획)로
  // 캔버스 전체 캡처. 캡처 대상은 .react-flow__viewport 라 Controls/MiniMap/배경 점은 제외,
  // 마커 defs 는 ViewportPortal 로 뷰포트 안에 있어 클론에 포함된다. 선택 강조 상태도 그대로 찍힘.
  const flowWrapRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const exportPng = async () => {
    const wrap = flowWrapRef.current;
    const el = wrap?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!wrap || !el || exporting || !layouted) return;
    setExporting(true);
    try {
      const plan = planErdExport(getNodesBounds(getNodes()));
      const dataUrl = await toPng(el, {
        width: plan.width,
        height: plan.height,
        pixelRatio: plan.pixelRatio,
        backgroundColor: getComputedStyle(wrap).backgroundColor,
        style: {
          width: `${plan.width}px`,
          height: `${plan.height}px`,
          transform: `translate(${plan.x}px, ${plan.y}px) scale(1)`,
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `erd-${view}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-w-0">
      {/* 보기 모드 필터 + 범례 — 캔버스를 가리지 않게 캔버스 밖 툴바 행. */}
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 10 }}>
        <div
          className="flex items-center gap-1 rounded-lg border border-border-subtle bg-panel card-shadow select-none"
          style={{ padding: "4px 6px" }}
        >
          {ERD_VIEWS.map((v) => {
            const active = view === v.key;
            const count = viewCounts[v.key];
            return (
              <button
                key={v.key}
                type="button"
                disabled={count === 0}
                onClick={() =>
                  setSearchParams((prev) => {
                    if (v.key === "all") prev.delete("view");
                    else prev.set("view", v.key);
                    return prev;
                  })
                }
                className="rounded-md border-0 cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
                style={{
                  padding: "4px 9px",
                  fontSize: 11.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--color-status-info)" : "var(--color-text-secondary)",
                  background: active
                    ? "color-mix(in srgb, var(--color-status-info) 12%, transparent)"
                    : "transparent",
                }}
              >
                {v.label} {count}
              </button>
            );
          })}
        </div>
        {inferredCount > 0 && (
          <div className="flex items-center text-text-muted" style={{ gap: 6, fontSize: 11.5 }}>
            <svg width="24" height="8" aria-hidden>
              <line x1="1" y1="4" x2="23" y2="4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            선언 FK
            <svg width="24" height="8" aria-hidden style={{ marginLeft: 6 }}>
              <line x1="1" y1="4" x2="23" y2="4" stroke="currentColor" strokeWidth="1.8" strokeDasharray="5 3" />
            </svg>
            추정(컬럼명=타 테이블 PK)
          </div>
        )}
        <button
          type="button"
          onClick={() => void exportPng()}
          disabled={exporting || !layouted}
          className="rounded-lg border border-border-subtle bg-panel card-shadow cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
          style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 11.5, color: "var(--color-text-secondary)" }}
          title="현재 보기 모드의 캔버스 전체를 원본 크기 기준 고해상도 PNG로 저장"
        >
          {exporting ? "내보내는 중…" : "PNG 내보내기"}
        </button>
      </div>

      <div
        className="grid items-start min-w-0"
        style={{ gap: 14, gridTemplateColumns: selected ? "minmax(0,1fr) 440px" : "minmax(0,1fr)" }}
      >
        <div
          ref={flowWrapRef}
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
          {/* 마커 defs 는 뷰포트 내부에 있어야 PNG 내보내기(뷰포트 서브트리 클론)에서 url(#) 참조가 살아남는다. */}
          <ViewportPortal>
            <ErdMarkerDefs palette={relPalette} />
          </ViewportPortal>
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
