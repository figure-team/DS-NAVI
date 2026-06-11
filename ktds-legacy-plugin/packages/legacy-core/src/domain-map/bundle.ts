import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { specMapDir, stableJson } from "./persist.js";
import type { SkeletonReport } from "./types.js";

// 17.1 도메인 번들 조립 — S8 LLM 디스패치의 입력.
// 도메인 서브그래프(flow/step 골격) + step 대상 파일의 실제 소스 슬라이스
// (인용 가능한 텍스트를 실제로 제공 — 비판검증 반영) + KG 존재 시 파일
// summary/tags 기회 보강. 결정론 + 크기 상한(잘린 것은 보고, 조용한 누락 금지).

export const BUNDLE_DIR = "bundle";
/** step 파일당 소스 슬라이스 라인 수 상한. */
export const DEFAULT_SLICE_LINES = 80;
/** 번들 전체 소스 슬라이스 문자 수 상한 — LLM 컨텍스트 예산. */
export const DEFAULT_BUNDLE_CHAR_CAP = 120_000;

export const SourceSliceSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
  /** 파일이 슬라이스 창보다 길어 잘렸으면 true. */
  truncated: z.boolean(),
});
export type SourceSlice = z.infer<typeof SourceSliceSchema>;

export const BundleFileSchema = z.object({
  relPath: z.string(),
  className: z.string().nullable(),
  /** 주 앵커 라인 (skeleton stepSources와 동일). */
  line: z.number().int().positive(),
  /** char cap으로 슬라이스가 통째로 생략되면 null (sliceOmitted에 보고). */
  slice: SourceSliceSchema.nullable(),
  /** KG 존재 시 파일 노드의 summary/tags (기회 보강, 없으면 null). */
  kgHint: z.object({ summary: z.string(), tags: z.array(z.string()) }).nullable(),
});
export type BundleFile = z.infer<typeof BundleFileSchema>;

export const DomainBundleSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domainId: z.string(),
  key: z.string(),
  name: z.string(),
  flows: z.array(
    z.object({
      flowId: z.string(),
      entryPoint: z.string(),
      entryType: z.string(),
      filePath: z.string(),
      line: z.number().int().positive(),
      /** flow의 step 체인 (stepId, 순서대로). */
      stepIds: z.array(z.string()),
    }),
  ),
  steps: z.array(z.object({ stepId: z.string(), relPath: z.string() })),
  /** 소스 슬라이스 포함 파일 (도메인 내 유일, 정렬). */
  files: z.array(BundleFileSchema),
  /** char cap으로 슬라이스가 생략된 파일 (보고 — 조용한 누락 금지). */
  sliceOmitted: z.array(z.string()),
});
export type DomainBundle = z.infer<typeof DomainBundleSchema>;

interface KgFileHint {
  summary: string;
  tags: string[];
}

/** KG 파일 노드 → relPath 기준 힌트 인덱스 (KG 부재 시 빈 맵 — D5). */
async function loadKgHints(projectRoot: string): Promise<Map<string, KgFileHint>> {
  const hints = new Map<string, KgFileHint>();
  let raw: string;
  try {
    raw = await fs.readFile(
      path.join(projectRoot, ".understand-anything", "knowledge-graph.json"),
      "utf-8",
    );
  } catch {
    return hints;
  }
  try {
    const graph = JSON.parse(raw) as {
      nodes?: Array<{ type?: string; filePath?: string; summary?: string; tags?: string[] }>;
    };
    for (const node of graph.nodes ?? []) {
      if (node.type === "file" && node.filePath && !hints.has(node.filePath)) {
        hints.set(node.filePath, {
          summary: node.summary ?? "",
          tags: node.tags ?? [],
        });
      }
    }
  } catch {
    // 손상된 KG는 힌트 없이 진행 — 번들의 진실은 소스 슬라이스다
  }
  return hints;
}

async function sliceFile(
  projectRoot: string,
  relPath: string,
  anchorLine: number,
  sliceLines: number,
): Promise<SourceSlice | null> {
  let content: string;
  try {
    content = await fs.readFile(path.join(projectRoot, relPath), "utf-8");
  } catch {
    return null;
  }
  const lines = content.split("\n");
  // 앵커 위 10줄부터 창을 연다 — 클래스 선언 직전 import/주석 문맥 포함
  const startLine = Math.max(1, anchorLine - 10);
  const endLine = Math.min(lines.length, startLine + sliceLines - 1);
  return {
    startLine,
    endLine,
    text: lines.slice(startLine - 1, endLine).join("\n"),
    truncated: endLine < lines.length || startLine > 1,
  };
}

export interface BuildBundlesOptions {
  sliceLines?: number;
  charCap?: number;
}

/**
 * skeleton의 도메인별 번들을 조립해 .spec/map/bundle/<key>.json으로 영속.
 * 파일 슬라이스는 정렬 순서로 charCap까지 채우고, 초과분은 slice=null +
 * sliceOmitted 보고 — LLM은 생략 파일에 대해 인용 없는 주장을 만들 수 없고,
 * 검증기(17.3)가 어차피 환각을 걸러낸다.
 */
export async function buildBundles(
  projectRoot: string,
  skeleton: SkeletonReport,
  options: BuildBundlesOptions = {},
): Promise<{ bundles: DomainBundle[]; paths: string[] }> {
  const sliceLines = options.sliceLines ?? DEFAULT_SLICE_LINES;
  const charCap = options.charCap ?? DEFAULT_BUNDLE_CHAR_CAP;
  const kgHints = await loadKgHints(projectRoot);

  const domains = skeleton.nodes.filter((n) => n.type === "domain");
  const flowsByDomain = new Map<string, string[]>();
  for (const e of skeleton.edges) {
    if (e.type !== "contains_flow") continue;
    const list = flowsByDomain.get(e.source);
    if (list) list.push(e.target);
    else flowsByDomain.set(e.source, [e.target]);
  }
  const stepsByFlow = new Map<string, string[]>();
  for (const e of skeleton.edges) {
    if (e.type !== "flow_step") continue;
    const list = stepsByFlow.get(e.source);
    if (list) list.push(e.target);
    else stepsByFlow.set(e.source, [e.target]);
    // flow_step은 weight 단조증가 순으로 정렬돼 있다(skeleton 정렬 계약)
  }
  const nodeById = new Map(skeleton.nodes.map((n) => [n.id, n]));
  const sourceByStep = new Map(skeleton.stepSources.map((s) => [s.stepId, s]));

  const bundles: DomainBundle[] = [];
  const paths: string[] = [];
  for (const domain of domains) {
    const key = domain.id.slice("domain:".length);
    const flowIds = (flowsByDomain.get(domain.id) ?? []).sort();
    const flows: DomainBundle["flows"] = [];
    const steps: DomainBundle["steps"] = [];
    const fileAnchors = new Map<string, { line: number; className: string | null }>();

    for (const flowId of flowIds) {
      const flow = nodeById.get(flowId);
      if (!flow) continue;
      const stepIds = stepsByFlow.get(flowId) ?? [];
      flows.push({
        flowId,
        entryPoint: String(flow.domainMeta?.entryPoint ?? ""),
        entryType: String(flow.domainMeta?.entryType ?? ""),
        filePath: flow.filePath ?? "",
        line: flow.lineRange?.[0] ?? 1,
        stepIds,
      });
      for (const stepId of stepIds) {
        const src = sourceByStep.get(stepId);
        if (!src) continue;
        steps.push({ stepId, relPath: src.relPath });
        if (!fileAnchors.has(src.relPath)) {
          fileAnchors.set(src.relPath, { line: src.line, className: src.className });
        }
      }
    }
    steps.sort((a, b) => (a.stepId < b.stepId ? -1 : a.stepId > b.stepId ? 1 : 0));

    const files: BundleFile[] = [];
    const sliceOmitted: string[] = [];
    let used = 0;
    for (const relPath of [...fileAnchors.keys()].sort()) {
      const anchor = fileAnchors.get(relPath)!;
      const hint = kgHints.get(relPath) ?? null;
      let slice = await sliceFile(projectRoot, relPath, anchor.line, sliceLines);
      if (slice && used + slice.text.length > charCap) {
        slice = null;
        sliceOmitted.push(relPath);
      }
      if (slice) used += slice.text.length;
      files.push({
        relPath,
        className: anchor.className,
        line: anchor.line,
        slice,
        kgHint: hint,
      });
    }

    const bundle: DomainBundle = {
      schemaVersion: 1,
      gitCommit: skeleton.gitCommit,
      domainId: domain.id,
      key,
      name: domain.name,
      flows,
      steps,
      files,
      sliceOmitted,
    };
    const dir = path.join(specMapDir(projectRoot), BUNDLE_DIR);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${safeKeyFilename(key)}.json`);
    await fs.writeFile(filePath, stableJson(DomainBundleSchema.parse(bundle)), "utf-8");
    bundles.push(bundle);
    paths.push(filePath);
  }
  return { bundles, paths };
}

/** 도메인 key → 파일명 (경로 구분자/특수문자 안전). */
export function safeKeyFilename(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}
