#!/usr/bin/env node
// /understand-docs 엔진 진입점 — 근거 기반 5종 문서 생성 (결정론 skeleton).
// 사용: node understand-docs.mjs [projectRoot]
//
// 주: 이 스크립트는 결정론 skeleton(근거·태그·구조)만 생성한다. 실제 LLM 산문은
// host CLI(Claude)가 SKILL.md 지시에 따라 각 섹션 본문을 채운다(ProseProvider).
import { runDocsPipeline } from "../packages/legacy-core/dist/index.js";

const root = process.argv[2] ?? process.cwd();
const runId = process.argv[3] ?? `run-${Date.now()}`;

try {
  const res = await runDocsPipeline(root, { runId }); // prose 미주입 → skeleton-only
  console.log(`DRAFT 생성: ${res.published.join(", ")}`);
  console.log(`→ ${res.docsDir} · 검토: /understand-docs review --list`);
} catch (err) {
  console.error(`RUN_ABORTED: ${err.message}`);
  process.exitCode = 1;
}
