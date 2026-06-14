/**
 * 테스트 공용 CanonicalGraph 팩토리. 여러 *.test.ts가 복사하던 node()/edge()/graphOf()의
 * 단일 출처(리팩토링 2026-06). summary 기본값은 "s"(어떤 테스트도 값에 의존하지 않음 —
 * graph-emit.test는 typeof만 단언).
 */
import type { CanonicalGraph, CanonicalNode, CanonicalEdge } from "./types.js";

export function node(uid: string, kind: string, extra: Partial<CanonicalNode> = {}): CanonicalNode {
  return { uid, kind: kind as CanonicalNode["kind"], name: uid, summary: "s", tags: [], ...extra };
}

export function edge(s: string, t: string, type: string): CanonicalEdge {
  return { sourceUid: s, targetUid: t, type, direction: "forward", weight: 1 };
}

export function graphOf(
  nodes: CanonicalNode[],
  edges: CanonicalEdge[] = [],
  extra: Partial<CanonicalGraph> = {},
): CanonicalGraph {
  return {
    sourceVersion: "1.0.0",
    fingerprint: "x",
    project: { name: "p", languages: [], frameworks: [], description: "", gitCommitHash: "", configFiles: [] },
    layers: [],
    nodes,
    edges,
    ...extra,
  };
}
