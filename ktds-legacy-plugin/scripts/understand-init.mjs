#!/usr/bin/env node
// /understand-init 엔진 진입점 — understanding.config.json 생성 + .spec/ scaffold.
// 사용: node understand-init.mjs [projectRoot]
import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { ensureBuilt } from "./ensure-built.mjs";

const { defaultConfig, scaffoldSpecDir } = await import(await ensureBuilt());

const root = process.argv[2] ?? process.cwd();
const configPath = join(root, "understanding.config.json");

let rerun = false;
try { await access(configPath); rerun = true; } catch { /* new */ }

if (!rerun) {
  await writeFile(configPath, JSON.stringify(defaultConfig(), null, 2), "utf-8");
}
await scaffoldSpecDir(root);

// 대시보드(U-A) 언어 보장: U-A 대시보드는 .understand-anything/config.json 의
// outputLanguage 로 UI 언어를 정한다(부재 시 fork fallback=ko). ktds 기본은 한국어이므로
// 여기서 ko 를 보장한다. 기존 값/다른 키는 보존(idempotent merge).
try {
  const uaDir = join(root, ".understand-anything");
  await mkdir(uaDir, { recursive: true });
  const dashConfigPath = join(uaDir, "config.json");
  let dash = {};
  try { dash = JSON.parse(await readFile(dashConfigPath, "utf-8")); } catch { /* 신규/없음 */ }
  if (!dash.outputLanguage) {
    dash.outputLanguage = "ko";
    await writeFile(dashConfigPath, JSON.stringify(dash, null, 2), "utf-8");
  }
} catch { /* best-effort: 실패해도 init 진행 (대시보드 fallback=ko) */ }
console.log(rerun
  ? `재실행: 기존 config 보존, .spec 확인 (${root})`
  : `초기화 완료: understanding.config.json + .spec/ 생성 (${root})`);
console.log("⚠ MVP는 비민감 샘플 전용. 실제 고객 코드 금지 (보안 게이트는 Phase 2).");
