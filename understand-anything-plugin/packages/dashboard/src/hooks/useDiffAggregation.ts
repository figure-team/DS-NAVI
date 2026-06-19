// ktds-fork (ADR-003): GraphView에 흩어져 있던 diff 집계(diff-aggregation) 로직을
// 한 곳으로 모은 훅 모듈. 오버뷰는 계층(layer)별, 디테일은 컨테이너(container)별로
// 변경/영향 노드 수를 집계한다 — 단일 Set으로는 어느 그룹이 무엇을 몇 개 품는지
// 보이지 않는다는 PL 피드백. 두 집계는 키(layer id vs container id)만 다르고 동일한
// O(changed + affected) bump 패턴이다. 계산 로직은 GraphView 원본을 그대로(verbatim) 옮겼다.
import { useMemo } from "react";
import { useDashboardStore } from "../store";

export interface DiffCounts {
  changed: number;
  affected: number;
}

/**
 * 계층별 변경/영향 노드 수. `useOverviewGraph`의 인라인 블록을 그대로 이관.
 * 키: layer id (nodeIdToLayerId로 노드→계층 매핑).
 */
export function useDiffByLayer(
  nodeIdToLayerId: Map<string, string>,
): Map<string, DiffCounts> {
  const diffMode = useDashboardStore((s) => s.diffMode);
  const changedNodeIds = useDashboardStore((s) => s.changedNodeIds);
  const affectedNodeIds = useDashboardStore((s) => s.affectedNodeIds);

  return useMemo(() => {
    const diffByLayer = new Map<string, DiffCounts>();
    if (diffMode) {
      const bump = (id: string, key: "changed" | "affected") => {
        const lid = nodeIdToLayerId.get(id);
        if (!lid) return;
        const e = diffByLayer.get(lid) ?? { changed: 0, affected: 0 };
        e[key] += 1;
        diffByLayer.set(lid, e);
      };
      for (const id of changedNodeIds) bump(id, "changed");
      for (const id of affectedNodeIds) bump(id, "affected");
    }
    return diffByLayer;
  }, [diffMode, changedNodeIds, affectedNodeIds, nodeIdToLayerId]);
}

/**
 * 컨테이너별 변경/영향 노드 수. `useLayerDetailGraph`의 `diffContainers` useMemo를
 * 그대로 이관. 키: container id (nodeToContainer로 노드→컨테이너 매핑;
 * cid === id 인 self-매핑은 컨테이너가 아니므로 제외).
 */
export function useDiffByContainer(
  nodeToContainer: Map<string, string>,
): Map<string, DiffCounts> {
  const diffMode = useDashboardStore((s) => s.diffMode);
  const changedNodeIds = useDashboardStore((s) => s.changedNodeIds);
  const affectedNodeIds = useDashboardStore((s) => s.affectedNodeIds);

  return useMemo(() => {
    const m = new Map<string, DiffCounts>();
    if (!diffMode) return m;
    const bump = (id: string, key: "changed" | "affected") => {
      const cid = nodeToContainer.get(id);
      if (!cid || cid === id) return;
      const e = m.get(cid) ?? { changed: 0, affected: 0 };
      e[key] += 1;
      m.set(cid, e);
    };
    for (const id of changedNodeIds) bump(id, "changed");
    for (const id of affectedNodeIds) bump(id, "affected");
    return m;
  }, [diffMode, changedNodeIds, affectedNodeIds, nodeToContainer]);
}
