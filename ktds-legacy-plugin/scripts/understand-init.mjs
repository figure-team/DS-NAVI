#!/usr/bin/env node
// /understand-init 엔진 진입점 — understanding.config.json 생성 + .spec/ scaffold.
// 사용: node understand-init.mjs [projectRoot]
import { writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { defaultConfig, scaffoldSpecDir } from "../packages/legacy-core/dist/index.js";

const root = process.argv[2] ?? process.cwd();
const configPath = join(root, "understanding.config.json");

let rerun = false;
try { await access(configPath); rerun = true; } catch { /* new */ }

if (!rerun) {
  await writeFile(configPath, JSON.stringify(defaultConfig(), null, 2), "utf-8");
}
await scaffoldSpecDir(root);
console.log(rerun
  ? `재실행: 기존 config 보존, .spec 확인 (${root})`
  : `초기화 완료: understanding.config.json + .spec/ 생성 (${root})`);
console.log("⚠ MVP는 비민감 샘플 전용. 실제 고객 코드 금지 (보안 게이트는 Phase 2).");
