/**
 * claim 헬퍼 (ADR-004 ID11 / T1) — doc-generator와 wiki가 공유하는 근거·태그 도출.
 *
 * 이 파일은 doc-generator/index.ts에서 **move-only 추출**된 것이다(중복 구현 금지 —
 * "동일 근거·태그" 일관성 보장). **시그니처·cite 접미사 포맷을 절대 변경하지 말 것**:
 *   - `approval/index.ts`가 `renderClaim`의 cite 접미사를 역파싱(포맷 변경 시 승인 깨짐)
 *   - `renderMarkdown`이 impact/{archive,doc,review}·orchestrator에서 import됨
 * 추출 직후 5종 골든 byte-diff=0 + approval 역파서 + impact 렌더 회귀로 가드한다.
 */

import type { CanonicalGraph, CanonicalNode, CanonicalEdge, Claim, Evidence, ProjectMeta } from "../types.js";
import { CONFIDENCE_TAG } from "../types.js";
import { NEEDS_REVIEW_MARKER } from "../domain-map/emit.js";

// ── 정렬 ─────────────────────────────────────────────────────────────────────
export const byUid = (a: CanonicalNode, b: CanonicalNode) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

/** Total order over edges by (source, target, type) — returns 0 on ties (A2/A11 determinism). */
export const cmpEdge = (a: CanonicalEdge, b: CanonicalEdge): number =>
  a.sourceUid < b.sourceUid ? -1 : a.sourceUid > b.sourceUid ? 1 :
  a.targetUid < b.targetUid ? -1 : a.targetUid > b.targetUid ? 1 :
  a.type < b.type ? -1 : a.type > b.type ? 1 : 0;

export function nodesOfKind(graph: CanonicalGraph, ...kinds: string[]): CanonicalNode[] {
  const set = new Set(kinds);
  return graph.nodes.filter((n) => set.has(n.kind)).sort(byUid);
}
export function edgesOfType(graph: CanonicalGraph, ...types: string[]): CanonicalEdge[] {
  const set = new Set(types);
  return graph.edges.filter((e) => set.has(e.type)).sort(cmpEdge);
}

// ── claim 도출 ────────────────────────────────────────────────────────────────
/** Edge → claim carrying the SOURCE node's evidence when available. */
export function edgeClaim(graph: CanonicalGraph, e: CanonicalEdge, text: string): Claim {
  const src = graph.nodes.find((n) => n.uid === e.sourceUid);
  return src ? claimForNode(src, text) : inferredClaim(text);
}

/** Node-backed claim → CONFIRMED_AI(근거 있음) / INFERRED(근거 없음). */
export function claimForNode(node: CanonicalNode, text: string): Claim {
  const ev = node.evidence;
  // CONFIRMED_AI only with real path evidence (A5); ev narrows to non-undefined here.
  return ev?.path
    ? { claim: text, confidence: "CONFIRMED_AI", evidence: [ev], requires_human_review: false }
    : { claim: text, confidence: "INFERRED", evidence: [], requires_human_review: true };
}
/** Project/layer-derived claim → INFERRED(파일 근거 없음, 검토 권장). */
export function inferredClaim(text: string): Claim {
  return { claim: text, confidence: "INFERRED", evidence: [], requires_human_review: true };
}

/**
 * 언어/프레임워크 claim — build/config 파일(pom.xml 등)을 근거로 인용하면 CONFIRMED_AI
 * (§5.2 파일 경로만 있어도 허용). configFiles 없으면 INFERRED로 격하.
 */
export function configClaim(project: ProjectMeta, text: string): Claim {
  const path = project.configFiles[0];
  return path
    ? { claim: text, confidence: "CONFIRMED_AI", evidence: [{ path }], requires_human_review: false }
    : inferredClaim(text);
}

// domainMeta의 항목(entities/businessRules/crossDomainInteractions)을 claim으로
// 렌더 (Stage-18.1 — 이전엔 name/summary만 소비, 리뷰 B-1). 근거는 /understand-map이
// domainMeta.ktdsClaims(passthrough)에 동봉한 파일:라인 인용에서 가져온다:
//   인용 있음 → CONFIRMED_AI / 없음 → INFERRED /
//   기계 검증 강등 마커("[확인 필요] " 접두) → NEEDS_REVIEW (마커는 떼고
//   CONFIDENCE_TAG 렌더가 다시 붙인다 — 이중 표기 방지)
export function domainMetaClaims(n: CanonicalNode): Claim[] {
  const meta = n.domainMeta;
  if (!meta) return [];
  // (kind, text) 복합 키 — 종류가 다른 항목이 같은 텍스트를 가져도 근거가
  // 섞이지 않는다(리뷰 반영).
  const evidenceByKey = new Map<string, Evidence[]>();
  if (Array.isArray(meta.ktdsClaims)) {
    for (const c of meta.ktdsClaims as Array<Record<string, unknown>>) {
      if (typeof c?.text === "string" && typeof c?.kind === "string" && Array.isArray(c.citations)) {
        const ev = (c.citations as Array<Record<string, unknown>>)
          .filter((x) => typeof x?.filePath === "string")
          .map((x) => ({ path: x.filePath as string, line: x.line as number | undefined }));
        const key = `${c.kind} ${c.text}`;
        if (ev.length > 0 && !evidenceByKey.has(key)) evidenceByKey.set(key, ev);
      }
    }
  }
  const out: Claim[] = [];
  for (const [field, kind, label] of [
    ["entities", "entity", "엔터티"],
    ["businessRules", "businessRule", "업무 규칙"],
    ["crossDomainInteractions", "crossDomain", "도메인 간 상호작용"],
  ] as const) {
    const items = meta[field];
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      if (typeof raw !== "string" || raw.length === 0) continue;
      const demoted = raw.startsWith(NEEDS_REVIEW_MARKER);
      const text = demoted ? raw.slice(NEEDS_REVIEW_MARKER.length) : raw;
      const evidence = evidenceByKey.get(`${kind} ${text}`) ?? [];
      const claimText = `${n.name} ${label}: ${text}`;
      if (demoted) {
        out.push({ claim: claimText, confidence: "NEEDS_REVIEW", evidence, requires_human_review: true });
      } else if (evidence.length > 0) {
        out.push({ claim: claimText, confidence: "CONFIRMED_AI", evidence, requires_human_review: false });
      } else {
        out.push({ claim: claimText, confidence: "INFERRED", evidence: [], requires_human_review: true });
      }
    }
  }
  return out;
}

/** domainMeta.ktdsClaims에서 summary 인용 → Evidence[] (없으면 []). */
export function summaryEvidence(n: CanonicalNode): Evidence[] {
  const claims = n.domainMeta?.ktdsClaims;
  if (!Array.isArray(claims)) return [];
  for (const c of claims as Array<Record<string, unknown>>) {
    if (c?.kind === "summary" && Array.isArray(c.citations)) {
      return (c.citations as Array<Record<string, unknown>>)
        .filter((x) => typeof x?.filePath === "string")
        .map((x) => ({ path: x.filePath as string, line: x.line as number | undefined }));
    }
  }
  return [];
}

// ── 렌더링 (결정론) ──────────────────────────────────────────────────────────
/**
 * claim 한 줄 렌더. **cite 접미사 포맷 고정**(approval/index.ts가 역파싱):
 *   `- <태그> <본문>[ — 근거: \`path[:line]\`]`
 */
export function renderClaim(c: Claim): string {
  const tag = CONFIDENCE_TAG[c.confidence];
  const ev = c.evidence[0];
  const cite = ev ? ` — 근거: \`${ev.path}${ev.line != null ? ":" + ev.line : ""}\`` : "";
  return `- ${tag} ${c.claim}${cite}`;
}
