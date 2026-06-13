/**
 * 노트 투영 (ADR-004 T2) — CanonicalGraph → WikiNote[] 순수함수.
 *
 * 입도(ID3): domain/flow/endpoint/table 노드별 1노트(+step opt-in). function/class/
 * file/module/concept 등 순수 코드 구조는 제외(코드 그래프 영역). claims는 claims.ts
 * 헬퍼로 도출 → 5종과 **동일 근거·태그**(근거 승계). 정렬은 uid 사전순(결정론).
 */

import type { CanonicalGraph, CanonicalNode, Claim } from "../types.js";
import { claimForNode, domainMetaClaims, summaryEvidence } from "../doc-generator/claims.js";
import type { WikiLayer, WikiNote, FrontmatterValue } from "./types.js";
import { assignRelPaths, type SlugEntry } from "./slug.js";

export interface ProjectNotesOptions {
  /** step 계층 포함(기본 false — 폭증 구간, --steps로만). */
  includeSteps?: boolean;
}

/** 노트 대상 kind → 계층. 그 외 kind는 노트화하지 않는다(ID3). */
const KIND_LAYER: Record<string, WikiLayer> = {
  domain: "feature",
  flow: "feature",
  endpoint: "api",
  table: "table",
  schema: "table",
  step: "step",
};

/** claim 본문 접두 — 5종 doc-generator와 동일 표기(일관성). */
function claimText(node: CanonicalNode): string {
  switch (node.kind) {
    case "domain": return `업무 도메인: ${node.name} — ${node.summary}`;
    case "flow": return `흐름: ${node.name} — ${node.summary}`;
    case "endpoint": return `엔드포인트: ${node.name} — ${node.summary}`;
    case "table":
    case "schema": return `테이블/스키마: ${node.name} — ${node.summary}`;
    case "step": return `처리 단계: ${node.name} — ${node.summary}`;
    default: return `${node.name} — ${node.summary}`;
  }
}

/**
 * 노드의 본문 claims. domain은 파일 근거가 없어도 summary 인용(기계 검증 통과)이
 * 있으면 CONFIRMED_AI로 승계(buildFeatureSpec와 동일) + entities/businessRules
 * (domainMetaClaims). 그 외는 claimForNode 단건.
 */
function notesClaimsFor(node: CanonicalNode): Claim[] {
  const text = claimText(node);
  if (node.kind === "domain") {
    const ev = summaryEvidence(node);
    const head: Claim = !node.evidence?.path && ev.length > 0
      ? { claim: text, confidence: "CONFIRMED_AI", evidence: ev, requires_human_review: false }
      : claimForNode(node, text);
    return [head, ...domainMetaClaims(node)];
  }
  return [claimForNode(node, text)];
}

/** frontmatter 빌드 — 결정론 키 순서(type, title, [domain], [tags], evidence). */
function buildFrontmatter(node: CanonicalNode, claims: Claim[]): Record<string, FrontmatterValue> {
  const fm: Record<string, FrontmatterValue> = { type: node.kind, title: node.name };
  if (node.kind === "domain") fm.domain = node.name;
  if (node.tags.length > 0) fm.tags = node.tags;
  fm.evidence = claims.filter((c) => c.evidence.length > 0).length;
  return fm;
}

/**
 * 그래프 → 세분화 노트. uid 사전순, relPath는 충돌 안전 배정(slug.ts). 같은 입력
 * → 같은 출력(byte-diff=0).
 */
export function projectNotes(graph: CanonicalGraph, options: ProjectNotesOptions = {}): WikiNote[] {
  const includeSteps = options.includeSteps ?? false;
  const selected = graph.nodes
    .filter((n) => {
      const layer = KIND_LAYER[n.kind];
      if (!layer) return false;
      if (n.kind === "step" && !includeSteps) return false;
      return true;
    })
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  const entries: SlugEntry[] = selected.map((n) => ({
    nodeUid: n.uid,
    layer: KIND_LAYER[n.kind],
    name: n.name,
  }));
  const relByUid = assignRelPaths(entries);

  return selected.map((n) => {
    const claims = notesClaimsFor(n);
    return {
      relPath: relByUid.get(n.uid)!,
      layer: KIND_LAYER[n.kind],
      nodeUid: n.uid,
      title: n.name,
      summary: n.summary,
      claims,
      links: [], // T3 deriveLinks가 채움
      frontmatter: buildFrontmatter(n, claims),
    };
  });
}
