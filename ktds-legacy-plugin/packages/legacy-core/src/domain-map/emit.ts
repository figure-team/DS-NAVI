import { promises as fs } from "node:fs";
import * as path from "node:path";
import { stableJson } from "./persist.js";
import { kgFingerprint } from "./extract.js";
import type { SkeletonReport, UaGraphNode } from "./types.js";
import type { VerifyReport } from "./verify.js";

// S10 — domain-graph.json emit.
// U-A KnowledgeGraph 전체 형태(version/project/nodes/edges/layers/tour)로
// .understand-anything/domain-graph.json에 쓴다 — U-A 대시보드가 이 경로를
// fetch해 도메인 뷰를 그리고(D2 무수정 재사용), 18.1 병합 로더가 docs로
// 가져간다. 생성 시점의 KG fingerprint·commit을 기록해 freshness 대조(18.2).
//
// NEEDS_REVIEW 강등(S9): 검증 실패 항목은 삭제하지 않는다 — 텍스트 앞에
// "[확인 필요]" 마커를 붙여 보존한다. 이 마커는 ktds 문서 파이프라인의
// confirm 워크플로(Stage-12f)가 식별하는 신뢰도 태그와 같은 표기라서,
// 03 문서로 흘러가면 항목 확정 대상으로 자연 합류한다.

export const DOMAIN_GRAPH_FILENAME = "domain-graph.json";
export const NEEDS_REVIEW_MARKER = "[확인 필요] ";

export interface EmitOptions {
  /** 프로젝트 표시명 — 기본 basename(projectRoot). */
  projectName?: string;
  /** 테스트용 고정 시각 (기본 now — 최종 emit은 M1 대상이 아님). */
  analyzedAt?: string;
}

/**
 * 검증 리포트를 노드에 반영: NEEDS_REVIEW 항목 텍스트에 마커 부착.
 * (applyFills가 만든 노드 배열을 입력으로 받아 복사·수정한다.)
 */
export function demoteUnverified(
  nodes: UaGraphNode[],
  report: VerifyReport,
): UaGraphNode[] {
  const verdictByRef = new Map<string, "GROUNDED" | "NEEDS_REVIEW">();
  // ref 규칙: 도메인 summary=domainId, 배열 항목=`<domainId>#<kind>[i]`,
  // flow/step summary=flowId/stepId (verify.ts와 동일한 키 체계)
  for (const d of report.domains) {
    for (const item of d.items) verdictByRef.set(item.ref, item.verdict);
  }
  const mark = (text: string, ref: string): string =>
    verdictByRef.get(ref) === "NEEDS_REVIEW" && !text.startsWith(NEEDS_REVIEW_MARKER)
      ? NEEDS_REVIEW_MARKER + text
      : text;

  return nodes.map((node) => {
    const out: UaGraphNode = { ...node };
    if (node.type === "domain") {
      out.summary = mark(node.summary, node.id);
      const meta = { ...node.domainMeta };
      for (const [kind, field] of [
        ["entity", "entities"],
        ["businessRule", "businessRules"],
        ["crossDomain", "crossDomainInteractions"],
      ] as const) {
        const arr = meta[field];
        if (Array.isArray(arr)) {
          meta[field] = arr.map((text, i) =>
            typeof text === "string" ? mark(text, `${node.id}#${kind}[${i}]`) : text,
          );
        }
      }
      out.domainMeta = meta;
    } else {
      out.summary = mark(node.summary, node.id);
    }
    return out;
  });
}

/**
 * domain-graph.json 최종 emit. skeleton의 구조(엣지/순서)는 그대로, 노드는
 * applyFills→demoteUnverified를 거친 배열을 받는다.
 */
export async function emitDomainGraph(
  projectRoot: string,
  skeleton: SkeletonReport,
  nodes: UaGraphNode[],
  options: EmitOptions = {},
): Promise<string> {
  const graph = {
    version: "1.0.0",
    project: {
      name: options.projectName ?? path.basename(path.resolve(projectRoot)),
      languages: [],
      frameworks: [],
      description: "ktds /understand-map 결정론 도메인 그래프 (skeleton+LLM fill+기계검증)",
      analyzedAt: options.analyzedAt ?? new Date().toISOString(),
      gitCommitHash: skeleton.gitCommit ?? "",
    },
    nodes,
    edges: skeleton.edges,
    layers: [],
    tour: [],
    // ktds 확장 (U-A 스키마 passthrough) — freshness 대조용 (18.2)
    ktdsMap: {
      generatedFromCommit: skeleton.gitCommit,
      kgFingerprintAtEmit: await kgFingerprint(projectRoot),
    },
  };
  const dir = path.join(projectRoot, ".understand-anything");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, DOMAIN_GRAPH_FILENAME);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, stableJson(graph), "utf-8");
  await fs.rename(tmpPath, filePath);
  return filePath;
}
