/**
 * 상호링크 메시 (ADR-004 T3/ID5) — 그래프 엣지 + filePath 조인에서 결정론 도출.
 *
 * 전방 링크만 emit한다(백링크는 옵시디언/대시보드 자동 → 중복·역방향 0). 노드↔노트가
 * 없는 엣지는 드롭. targetRelPath는 슬러그(slug.ts) `.md` 없이. 노트별 링크는
 * targetRelPath 사전순(결정론).
 *
 * 도출(ID5):
 *   domain → flow          : contains_flow 엣지
 *   flow   → step          : flow_step 엣지
 *   endpoint/step → table  : reads_from/writes_to 엣지 (실 KG 0건이면 테이블은 섬 —
 *                            매퍼 경유는 census/mapper 데이터가 필요해 T7 합성에서 보강)
 *   endpoint → flow/step   : filePath 공유 조인(기능↔API) — evidence.path 동일
 */

import type { CanonicalGraph, CanonicalNode } from "../types.js";
import { edgesOfType } from "../doc-generator/claims.js";
import type { WikiLink, WikiNote } from "./types.js";
import { toWikiTarget } from "./slug.js";

/** node.evidence.path = U-A filePath (kg-reader 매핑). */
function filePathOf(n: CanonicalNode): string | undefined {
  return n.evidence?.path;
}

export interface DeriveLinksResult {
  notes: WikiNote[];
  /** filePath 조인 미스 endpoint uid(소유 기능 못 찾음) — NEEDS_REVIEW 후보. */
  unresolvedEndpoints: string[];
}

/**
 * notes(T2 산출)에 전방 위키링크를 채워 새 배열로 반환(비파괴). graph 엣지·filePath
 * 조인에서 도출. 같은 입력 → 같은 출력(byte-diff=0).
 */
export function deriveLinks(graph: CanonicalGraph, notes: WikiNote[]): DeriveLinksResult {
  const noteByUid = new Map(notes.map((n) => [n.nodeUid, n]));
  const nodeByUid = new Map(graph.nodes.map((n) => [n.uid, n]));
  // source uid → (targetRelPath → label) 중복 제거.
  const linksByUid = new Map<string, Map<string, string>>();

  const add = (sourceUid: string, targetUid: string) => {
    const src = noteByUid.get(sourceUid);
    const dst = noteByUid.get(targetUid);
    if (!src || !dst || sourceUid === targetUid) return; // 노트 없는 엣지·자기참조 드롭
    const target = toWikiTarget(dst.relPath);
    let m = linksByUid.get(sourceUid);
    if (!m) linksByUid.set(sourceUid, (m = new Map()));
    if (!m.has(target)) m.set(target, dst.title);
  };

  // 1) 엣지 기반: domain→flow, flow→step, X→table
  for (const e of edgesOfType(graph, "contains_flow", "flow_step", "reads_from", "writes_to")) {
    add(e.sourceUid, e.targetUid);
  }

  // 2) filePath 공유 조인: endpoint → 같은 파일의 flow/step (기능↔API)
  const featureByPath = new Map<string, string[]>(); // filePath → flow/step uid[]
  for (const n of graph.nodes) {
    if (n.kind !== "flow" && n.kind !== "step") continue;
    if (!noteByUid.has(n.uid)) continue; // step 미포함 시 노트 없음
    const fp = filePathOf(n);
    if (!fp) continue;
    let arr = featureByPath.get(fp);
    if (!arr) featureByPath.set(fp, (arr = []));
    arr.push(n.uid);
  }
  const unresolvedEndpoints: string[] = [];
  for (const ep of notes) {
    if (ep.layer !== "api") continue;
    const node = nodeByUid.get(ep.nodeUid);
    const fp = node ? filePathOf(node) : undefined;
    const owners = fp ? featureByPath.get(fp) : undefined;
    if (!owners || owners.length === 0) {
      unresolvedEndpoints.push(ep.nodeUid); // 소유 기능 못 찾음 → NEEDS_REVIEW 후보
      continue;
    }
    for (const ownerUid of owners) add(ep.nodeUid, ownerUid);
  }

  // 3) 노트에 정렬된 링크 부착(비파괴)
  const outNotes = notes.map((n) => {
    const m = linksByUid.get(n.nodeUid);
    const links: WikiLink[] = m
      ? [...m.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([targetRelPath, label]) => ({ targetRelPath, label }))
      : [];
    return { ...n, links };
  });

  unresolvedEndpoints.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { notes: outNotes, unresolvedEndpoints };
}
