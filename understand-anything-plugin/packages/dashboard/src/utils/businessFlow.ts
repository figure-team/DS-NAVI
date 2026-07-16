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

/**
 * 에프터 도식(after-flow.json)의 변경 표기 — RTM ② 가 제안한 미래 업무흐름도 초안 전용
 * (RTM_AFTER_FLOW_DESIGN.md, 2026-07-17). 현행 도식(domainMeta.businessFlows)에는 없다.
 */
export type BizChange = "added" | "modified" | "removed";
const BIZ_CHANGES: ReadonlySet<string> = new Set(["added", "modified", "removed"]);

export interface BizFlowNode {
  id: string;
  kind: BizNodeKind;
  label: string;
  /** 이 활동이 대응하는 기능(flow) id — 업무→코드 드릴다운 앵커. */
  flowRef?: string;
  /** emit 기계검증 결과(activity/decision 만) — 없으면 검증 항목 없음(start/end). */
  verdict?: "GROUNDED" | "NEEDS_REVIEW";
  /** 에프터 초안의 변경 표기 — added=신규 삽입 · modified=변경 기점 · removed=삭제 예정(잔존 렌더). */
  change?: BizChange;
  citations: DomainClaimCitation[];
}

export interface BizFlowEdge {
  from: string;
  to: string;
  label?: string;
  /** 에프터 초안 전용 — 신규 활동을 잇는 제안 연결([추정], 점선 렌더). */
  change?: "added";
}

export interface BizFlow {
  nodes: BizFlowNode[];
  edges: BizFlowEdge[];
  /** true = fill 미작성 → 결정론 순차 근사(배너 표기 의무). */
  fallback: boolean;
}

/**
 * emit 이 businessFlow 를 그래프 정합 실패로 기각한 사유(domainMeta.businessFlowRejected).
 * "미채움"과 "작성했으나 기각"을 대시보드가 구별해 배너를 나눈다(리뷰 C2).
 */
export function businessFlowRejectedReason(node: GraphNode | undefined): string | null {
  const meta = node?.domainMeta as { businessFlowRejected?: unknown } | undefined;
  return typeof meta?.businessFlowRejected === "string" ? meta.businessFlowRejected : null;
}

/**
 * B안(복수화): 단위 업무 프로세스 1건 — domainMeta.businessFlows[] 의 원소.
 * `index` 는 파싱 생존분 기준 표시 순서(딥링크 `?bf=` 의 기준), `title` 은
 * 프로세스 이름(레거시 단수 산출물은 무제목 → null, UI 가 기본 라벨을 붙인다).
 */
export interface BizProcess {
  index: number;
  title: string | null;
  flow: BizFlow;
}

/**
 * domainMeta → 업무 프로세스 목록. 신형 `businessFlows[]` 우선, 없으면 레거시
 * 단수 `businessFlow` 를 1건 목록으로(하위호환 — 재분석 전 구 산출물). 형태가
 * 어긋나는 프로세스는 그 장만 조용히 제외한다(다른 장 렌더 보존 — 부분 수용).
 */
export function parseBusinessFlows(node: GraphNode | undefined): BizProcess[] {
  const meta = node?.domainMeta as { businessFlows?: unknown; businessFlow?: unknown } | undefined;
  if (Array.isArray(meta?.businessFlows)) {
    const out: BizProcess[] = [];
    for (const raw of meta!.businessFlows as unknown[]) {
      const o = raw as Record<string, unknown>;
      const flow = parseBizGraph(o);
      if (flow) {
        out.push({
          index: out.length,
          title: typeof o.title === "string" ? o.title : null,
          flow,
        });
      }
    }
    return out;
  }
  const legacy = parseBizGraph(meta?.businessFlow);
  return legacy ? [{ index: 0, title: null, flow: legacy }] : [];
}

/** 첫 프로세스만 — 레거시 호출부/테스트 호환용 축약. */
export function parseBusinessFlow(node: GraphNode | undefined): BizFlow | null {
  return parseBusinessFlows(node)[0]?.flow ?? null;
}

/** 순서도 그래프 1장 파싱 공통부 — 알 수 없는 형태는 null 로 degrade. */
function parseBizGraph(rawInput: unknown): BizFlow | null {
  const raw = rawInput as { nodes?: unknown; edges?: unknown } | undefined | null;
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
      change: typeof o.change === "string" && BIZ_CHANGES.has(o.change) ? (o.change as BizChange) : undefined,
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
    edges.push({
      from: o.from,
      to: o.to,
      label: typeof o.label === "string" ? o.label : undefined,
      change: o.change === "added" ? "added" : undefined,
    });
  }
  return { nodes, edges, fallback: false };
}

// ── RTM ② 에프터 도식 초안(after-flow.json) — RTM_AFTER_FLOW_DESIGN.md ────────
/**
 * 에프터 프로세스 1건 — `domainId`+`baseTitle` 이 비포(현행 businessFlows 의 프로세스)와
 * 짝짓는 키다. 짝이 없으면 대시보드는 초안을 버리고 표식 오버레이로 폴백한다(부분 수용).
 */
export interface AfterProcess {
  domainId: string;
  /** 기반이 된 현행 프로세스 제목 — 비포 패널과의 조인 키. */
  baseTitle: string;
  flow: BizFlow;
  /** 초안 한 줄 근거(선택) — 엔진이 제안 이유를 남긴 경우. */
  note?: string;
}

/**
 * after-flow.json 파싱 — ②(LLM)가 쓴 산출물이라 **전부 방어적**이다: 형태가 어긋난
 * 프로세스는 그 장만 조용히 제외(parseBusinessFlows 와 같은 부분 수용). 도식 자체는
 * parseBizGraph 를 그대로 태워 현행 도식과 동일 정합 기준(끝점 실존 등)을 적용한다.
 */
export function parseAfterFlows(rawInput: unknown): AfterProcess[] {
  const raw = rawInput as { flows?: unknown } | undefined | null;
  if (!raw || !Array.isArray(raw.flows)) return [];
  const out: AfterProcess[] = [];
  for (const item of raw.flows as unknown[]) {
    const o = item as Record<string, unknown>;
    if (typeof o.domainId !== "string" || typeof o.baseTitle !== "string") continue;
    const flow = parseBizGraph(o);
    if (!flow) continue;
    out.push({
      domainId: o.domainId,
      baseTitle: o.baseTitle,
      flow,
      note: typeof o.note === "string" ? o.note : undefined,
    });
  }
  return out;
}

/** 폴백 순차 나열의 activity 상한 — 초과분은 "…외 N건" 집계 노드로 접는다(리뷰 C3). */
export const FALLBACK_MAX_ACTIVITIES = 30;

/**
 * 결정론 순차 폴백(§4-1) — fill 미작성 도메인: start → 기능(그래프 순서) → end.
 * 분기 없음(창작 금지). 각 activity 는 flowRef 로 코드 탭 드릴다운을 유지한다.
 * start/end/초과 라벨은 호출자(i18n)가 준다 — 유틸은 로케일 무지(순수 함수).
 * eGov급(216기능) 도메인에서 판독 불가 체인이 되지 않도록 상한을 두고, 초과분은
 * "…외 N건" 노드로 정직하게 집계한다(침묵 절단 금지 — 코드 탭이 전수 목록).
 */
export function buildSequentialFallback(
  flows: DomainFlow[],
  labels: { start: string; end: string; more: string },
  maxActivities: number = FALLBACK_MAX_ACTIVITIES,
): BizFlow {
  const shown = flows.slice(0, maxActivities);
  const overflow = flows.length - shown.length;
  const nodes: BizFlowNode[] = [
    { id: "__start", kind: "start", label: labels.start, citations: [] },
    ...shown.map(
      (f): BizFlowNode => ({
        id: `seq:${f.id}`,
        kind: "activity",
        label: f.name,
        flowRef: f.id,
        citations: [],
      }),
    ),
    ...(overflow > 0
      ? [
          {
            id: "__more",
            kind: "activity" as const,
            label: labels.more.replace("{count}", String(overflow)),
            citations: [],
          },
        ]
      : []),
    { id: "__end", kind: "end", label: labels.end, citations: [] },
  ];
  const edges: BizFlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return { nodes, edges, fallback: true };
}
