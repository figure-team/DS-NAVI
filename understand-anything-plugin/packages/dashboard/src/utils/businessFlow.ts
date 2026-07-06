import type { GraphNode } from "@understand-anything/core/types";
import { parseCitations, type DomainClaimCitation, type DomainFlow } from "./domainData";

/**
 * 업무 흐름도 데이터 계층(WORK_MAP §4-1/§5, P4) — domainMeta.businessFlow 소비.
 *
 * emit(legacy-core) 이 병합·검증한 순서도를 방어적으로 파싱한다(parseSystemMap 와
 * 같은 원칙 — 알 수 없는 형태는 null 로 degrade, 대시보드는 스키마를 신뢰하되
 * 구버전 산출물에서도 죽지 않는다). fill 미작성 도메인은 결정론 순차 폴백
 * (start → 기능 activity 나열 → end)을 그린다 — "업무 흐름 미채움 — 순차 근사"
 * 배너와 함께(창작 금지·정직 표기).
 */

export type BizNodeKind = "start" | "end" | "activity" | "decision";
const BIZ_KINDS: ReadonlySet<string> = new Set(["start", "end", "activity", "decision"]);

export interface BizFlowNode {
  id: string;
  kind: BizNodeKind;
  label: string;
  /** 이 활동이 대응하는 기능(flow) id — 업무→코드 드릴다운 앵커. */
  flowRef?: string;
  /** emit 기계검증 결과(activity/decision 만) — 없으면 검증 항목 없음(start/end). */
  verdict?: "GROUNDED" | "NEEDS_REVIEW";
  citations: DomainClaimCitation[];
}

export interface BizFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface BizFlow {
  nodes: BizFlowNode[];
  edges: BizFlowEdge[];
  /** true = fill 미작성 → 결정론 순차 근사(배너 표기 의무). */
  fallback: boolean;
}

/** domainMeta.businessFlow → BizFlow. 형태가 어긋나면 null(폴백 경로로). */
export function parseBusinessFlow(node: GraphNode | undefined): BizFlow | null {
  const meta = node?.domainMeta as { businessFlow?: unknown } | undefined;
  const raw = meta?.businessFlow as { nodes?: unknown; edges?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;

  const nodes: BizFlowNode[] = [];
  for (const item of raw.nodes as unknown[]) {
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.label !== "string") return null;
    if (typeof o.kind !== "string" || !BIZ_KINDS.has(o.kind)) return null;
    nodes.push({
      id: o.id,
      kind: o.kind as BizNodeKind,
      label: o.label,
      flowRef: typeof o.flowRef === "string" ? o.flowRef : undefined,
      verdict:
        o.verdict === "GROUNDED" || o.verdict === "NEEDS_REVIEW" ? o.verdict : undefined,
      citations: parseCitations(o.citations),
    });
  }
  if (nodes.length === 0) return null;

  const ids = new Set(nodes.map((n) => n.id));
  const edges: BizFlowEdge[] = [];
  for (const item of raw.edges as unknown[]) {
    const o = item as Record<string, unknown>;
    if (typeof o.from !== "string" || typeof o.to !== "string") return null;
    // emit 이 정합 검증을 통과시킨 산출물만 병합하지만, 손편집/구버전 방어로
    // 끝점 미실존 엣지는 조용히 버리지 않고 전체를 폴백으로 보낸다(부분 렌더 금지).
    if (!ids.has(o.from) || !ids.has(o.to)) return null;
    edges.push({ from: o.from, to: o.to, label: typeof o.label === "string" ? o.label : undefined });
  }
  return { nodes, edges, fallback: false };
}

/**
 * 결정론 순차 폴백(§4-1) — fill 미작성 도메인: start → 기능(그래프 순서) → end.
 * 분기 없음(창작 금지). 각 activity 는 flowRef 로 코드 탭 드릴다운을 유지한다.
 * start/end 라벨은 호출자(i18n)가 준다 — 유틸은 로케일 무지(순수 함수).
 */
export function buildSequentialFallback(
  flows: DomainFlow[],
  labels: { start: string; end: string },
): BizFlow {
  const nodes: BizFlowNode[] = [
    { id: "__start", kind: "start", label: labels.start, citations: [] },
    ...flows.map(
      (f): BizFlowNode => ({
        id: `seq:${f.id}`,
        kind: "activity",
        label: f.name,
        flowRef: f.id,
        citations: [],
      }),
    ),
    { id: "__end", kind: "end", label: labels.end, citations: [] },
  ];
  const edges: BizFlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return { nodes, edges, fallback: true };
}
