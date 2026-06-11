import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { specMapDir } from "./persist.js";
import { safeKeyFilename } from "./bundle.js";
import { SKELETON_BLANK, type SkeletonReport, type UaGraphNode } from "./types.js";

// 17.2 LLM 채움 계약 — S8.
// 디스패치 자체는 호스트(Claude)가 SKILL.md 지시로 수행한다: 도메인당 1회,
// bundle/<key>.json을 읽고 fill/<key>.json을 쓴다. 이 모듈은 그 계약의
// 스키마와 적용 규칙이다:
//   - 모든 사실 주장(summary/entities/businessRules/crossDomain)에 파일:라인
//     인용 + 인용 라인 스니펫 동봉 의무 (스키마 강제, citations min 1)
//   - 구조 필드는 read-only — 적용은 기존 노드의 의미 필드를 채우는 것만
//     가능하고, 모르는 ID·다른 도메인의 ID는 항목 단위로 기각(보고)된다
//   - 실패 도메인만 재시도 (파일 단위 멱등 — fill/<key>.json 재작성)

export const FILL_DIR = "fill";

export const CitationSchema = z.object({
  /** 프로젝트 루트 상대 경로. */
  filePath: z.string().min(1),
  /** 1-based 라인. */
  line: z.number().int().positive(),
  /** 인용 라인의 실제 텍스트 (검증기가 실파일과 대조 — M3). ") {" 같은
   *  도처 일치 토막을 막기 위해 최소 8자 + 검증기의 식별자성 토큰 검사. */
  snippet: z.string().min(8),
});
export type Citation = z.infer<typeof CitationSchema>;

/** 사실 주장 — 텍스트 + 인용 의무. */
export const ClaimSchema = z.object({
  text: z.string().min(1),
  citations: z.array(CitationSchema).min(1),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const DomainFillSchema = z.object({
  schemaVersion: z.literal(1),
  domainId: z.string().regex(/^domain:/),
  /** 도메인 표시명 — 명명이라 인용 면제. */
  name: z.string().min(1).max(120),
  summary: ClaimSchema,
  entities: z.array(ClaimSchema),
  businessRules: z.array(ClaimSchema),
  crossDomainInteractions: z.array(ClaimSchema),
  flows: z.array(
    z.object({
      flowId: z.string().regex(/^flow:/),
      name: z.string().min(1).max(120),
      summary: ClaimSchema,
    }),
  ),
  steps: z.array(
    z.object({
      stepId: z.string().regex(/^step:/),
      name: z.string().min(1).max(120),
      summary: ClaimSchema,
    }),
  ),
});
export type DomainFill = z.infer<typeof DomainFillSchema>;

export interface RejectedItem {
  domainId: string;
  ref: string;
  reason: string;
}

export function fillDir(projectRoot: string): string {
  return path.join(specMapDir(projectRoot), FILL_DIR);
}

export function fillPathFor(projectRoot: string, key: string): string {
  return path.join(fillDir(projectRoot), `${safeKeyFilename(key)}.json`);
}

/**
 * fill/*.json 읽기 — 파싱·스키마 실패는 그 도메인만 "pending"으로 남긴다
 * (실패 도메인만 재시도, 멱등).
 */
export async function readFills(
  projectRoot: string,
  skeleton: SkeletonReport,
): Promise<{ fills: DomainFill[]; pending: string[]; invalid: Array<{ key: string; error: string }> }> {
  const fills: DomainFill[] = [];
  const pending: string[] = [];
  const invalid: Array<{ key: string; error: string }> = [];
  for (const node of skeleton.nodes) {
    if (node.type !== "domain") continue;
    const key = node.id.slice("domain:".length);
    let raw: string;
    try {
      raw = await fs.readFile(fillPathFor(projectRoot, key), "utf-8");
    } catch {
      pending.push(key);
      continue;
    }
    try {
      const fill = DomainFillSchema.parse(JSON.parse(raw));
      if (fill.domainId !== node.id) {
        throw new Error(`domainId 불일치: ${fill.domainId} ≠ ${node.id}`);
      }
      fills.push(fill);
    } catch (err) {
      invalid.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { fills, pending, invalid };
}

/**
 * fill을 skeleton 노드에 적용 — 구조 read-only.
 * 반환 노드는 복사본이다(skeleton 불변). 모르는 flowId/stepId, 도메인 밖
 * ID는 항목 단위 기각으로 보고된다 — 조용한 누락 금지.
 * 인용은 domainMeta.ktdsClaims(passthrough 필드)로 동봉되어 18.1의 문서
 * 렌더가 근거를 읽는다 — U-A 스키마의 string[] domainMeta 필드에는 텍스트만.
 */
export function applyFills(
  skeleton: SkeletonReport,
  fills: DomainFill[],
): { nodes: UaGraphNode[]; rejected: RejectedItem[] } {
  const rejected: RejectedItem[] = [];
  const nodes: UaGraphNode[] = skeleton.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 도메인 멤버십: skeleton 태그(tags[0] = 도메인 key)가 닻
  const domainKeyOf = (n: UaGraphNode): string | null => n.tags[0] ?? null;

  for (const fill of [...fills].sort((a, b) => cmp(a.domainId, b.domainId))) {
    const domainNode = byId.get(fill.domainId);
    if (!domainNode || domainNode.type !== "domain") {
      rejected.push({
        domainId: fill.domainId,
        ref: fill.domainId,
        reason: "unknown-domain",
      });
      continue;
    }
    const key = fill.domainId.slice("domain:".length);

    domainNode.name = fill.name;
    domainNode.summary = fill.summary.text;
    domainNode.domainMeta = {
      ...domainNode.domainMeta,
      entities: fill.entities.map((c) => c.text),
      businessRules: fill.businessRules.map((c) => c.text),
      crossDomainInteractions: fill.crossDomainInteractions.map((c) => c.text),
      // 근거 동봉 (passthrough) — 18.1 문서 렌더와 17.3 검증기의 입력
      ktdsClaims: [
        { kind: "summary", text: fill.summary.text, citations: fill.summary.citations },
        ...fill.entities.map((c) => ({ kind: "entity", ...c })),
        ...fill.businessRules.map((c) => ({ kind: "businessRule", ...c })),
        ...fill.crossDomainInteractions.map((c) => ({ kind: "crossDomain", ...c })),
      ],
    };

    for (const f of fill.flows) {
      const node = byId.get(f.flowId);
      if (!node || node.type !== "flow" || domainKeyOf(node) !== key) {
        rejected.push({
          domainId: fill.domainId,
          ref: f.flowId,
          reason: !node ? "unknown-flow" : "flow-outside-domain",
        });
        continue;
      }
      node.name = f.name;
      node.summary = f.summary.text;
      node.domainMeta = {
        ...node.domainMeta,
        ktdsClaims: [{ kind: "summary", text: f.summary.text, citations: f.summary.citations }],
      };
    }
    for (const s of fill.steps) {
      const node = byId.get(s.stepId);
      if (!node || node.type !== "step" || domainKeyOf(node) !== key) {
        rejected.push({
          domainId: fill.domainId,
          ref: s.stepId,
          reason: !node ? "unknown-step" : "step-outside-domain",
        });
        continue;
      }
      node.name = s.name;
      node.summary = s.summary.text;
      node.domainMeta = {
        ...node.domainMeta,
        ktdsClaims: [{ kind: "summary", text: s.summary.text, citations: s.summary.citations }],
      };
    }
  }

  return { nodes, rejected };
}

/** 채움이 안 된(= 여전히 빈칸) 노드 목록 — 디스패치 진행률 표시용. */
export function unfilledNodes(nodes: UaGraphNode[]): string[] {
  return nodes
    .filter((n) => n.summary === SKELETON_BLANK)
    .map((n) => n.id)
    .sort();
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
