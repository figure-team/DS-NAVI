import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../config/index.js";
import { readKnowledgeGraph } from "../kg-reader/index.js";
import { validateClaims, computeInferredRatio } from "../evidence/index.js";
import { generateDocs, renderMarkdown, type ProseProvider } from "../doc-generator/index.js";
import { acquireLock, releaseLock, withStaging, publishStaging } from "../lock/index.js";
import { registerDraft } from "../doc-state/index.js";
import { logEvent } from "../audit/index.js";
import type { Claim } from "../types.js";

/**
 * /understand-docs 의 핵심 흐름 (plan §3.2 데이터 흐름) — 결정론 코드 부분.
 * lock → graph 로드(version/fingerprint 가드) → 5종 생성(staging) → 근거 검증 →
 * [추정] 비율 게이트 → atomic publish → DRAFT 등록 + 감사. 실패 시 staging 폐기 + RUN_ABORTED.
 *
 * 실제 LLM 산문은 ProseProvider(host CLI/Claude)가 주입. 보안 게이트는 Phase 2.
 */
export interface PipelineOptions {
  runId: string;
  /** LLM 산문 주입자. 미지정 시 skeleton-only(근거·구조만). */
  prose?: ProseProvider;
}

export interface PipelineResult {
  runId: string;
  published: string[];
  docsDir: string;
}

export class RunAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunAbortedError";
  }
}

export async function runDocsPipeline(
  projectRoot: string,
  options: PipelineOptions
): Promise<PipelineResult> {
  const specDir = join(projectRoot, ".spec");
  const docsDir = join(projectRoot, "docs");
  const graphPath = join(projectRoot, ".understand-anything", "knowledge-graph.json");
  const config = await loadConfig(projectRoot);

  let phase: "generate" | "publish" = "generate";
  const lock = await acquireLock(specDir);
  if (lock.staleRemoved) await logEvent(specDir, "STALE_LOCK_REMOVED", { runId: options.runId });

  try {
    const graph = await readKnowledgeGraph(graphPath, {
      supportedVersions: config.supportedSchemaVersions,
    });
    // LLM_REQUEST: 실제 LLM(prose) 사용 시에만 기록 (skeleton-only 실행은 LLM 호출 없음)
    if (options.prose) {
      await logEvent(specDir, "LLM_REQUEST", {
        runId: options.runId,
        detail: { networkType: config.networkType },
      });
    }

    const { stagingDir } = await withStaging(specDir, options.runId, async (staging) => {
      const docs = await generateDocs(graph, { prose: options.prose });
      for (const doc of docs) {
        const claims: Claim[] = doc.sections.flatMap((s) => s.claims);

        // 근거 스키마 검증: CONFIRMED_AI ∧ evidence 없음 → RETURNED (A5)
        if (validateClaims(claims) === "RETURNED") {
          throw new RunAbortedError(`${doc.filename}: CONFIRMED_AI without evidence (RETURNED)`);
        }
        // [추정] 비율 게이트 (config 임계값; block 초과 → RUN_ABORTED)
        const ratio = computeInferredRatio(claims);
        if (ratio > config.inferredRatioBlockThreshold) {
          throw new RunAbortedError(
            `${doc.filename}: inferred ratio ${(ratio * 100).toFixed(0)}% exceeds block ` +
              `${(config.inferredRatioBlockThreshold * 100).toFixed(0)}%`
          );
        }
        await writeFile(join(staging, doc.filename), renderMarkdown(doc), "utf-8");
      }
    });

    phase = "publish";
    const published = (await publishStaging(stagingDir, docsDir)).sort();
    for (const f of published) {
      await registerDraft(specDir, f); // 신규 문서 = DRAFT
      await logEvent(specDir, "DOC_GENERATED", { doc: f, runId: options.runId });
    }
    return { runId: options.runId, published, docsDir };
  } catch (err) {
    // 감사 기록 실패가 원인 오류를 가리지 않게 한다. phase로 publish 중 부분발행 구분 가능.
    try {
      await logEvent(specDir, "RUN_ABORTED", {
        runId: options.runId,
        detail: { phase, error: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      /* swallow audit failure; original error wins */
    }
    throw err;
  } finally {
    await releaseLock(specDir);
  }
}
