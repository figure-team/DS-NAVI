#!/usr/bin/env node
/**
 * sync-demo-data.mjs — copy the vendored demo project's analysis output into
 * the dashboard's public/ dir so `build:demo` (and a local demo preview) serve
 * the jpetstore-6 graphs.
 *
 * Single source of truth: examples/jpetstore-6/.understand-anything/.
 * The copied public/*.json are generated artifacts (gitignored). After you
 * re-analyze the vendored project (e.g. analysis logic changed), just re-run
 * `pnpm sync:demo` (build:demo does this automatically).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(here, "..");
const repoRoot = resolve(dashboardRoot, "..", "..", "..");

const SRC_DIR = join(repoRoot, "examples", "jpetstore-6", ".understand-anything");
// 신설 메뉴(데이터·변경영향·프로그램·품질·보고서·정책서)의 엔진 산출은 .spec/map/ 에 산다.
const SPEC_MAP_DIR = join(repoRoot, "examples", "jpetstore-6", ".spec", "map");
// 골든셋 기준선(품질 화면 정확도 탭) — jpetstore 골든은 ktds-legacy-plugin fixtures 에 동결.
const GOLDEN_BASELINE = join(
  repoRoot, "ktds-legacy-plugin", "packages", "legacy-core", "fixtures", "golden", "jpetstore", "baseline.json",
);
const DEST_DIR = join(dashboardRoot, "public");

// Files the demo dashboard fetches. Optional ones are skipped silently when
// the vendored project doesn't produce them.
const FILES = [
  "knowledge-graph.json",
  "domain-graph.json",
  "meta.json",
  "config.json",
  "impact-overlay.json",
  "system-map.json",
  "rtm.json",
  "run-ledger.json",
  "screens.json",
  "screen-overrides.json",
];
// .spec/map/ 산출 — 신설 메뉴 화면이 fetch 하는 파일들(없으면 skip: 우아한 degrade).
const SPEC_FILES = [
  "db-schema.json",
  "crud-matrix.json",
  "program-inventory.json",
  "interfaces.json",
  "batch-jobs.json",
  "risk-report.json",
  "coverage.json",
  "work-summary.json",
  "impact.json",
  // impact.json 의 검증 리포트 — 없으면 demo 에서도 GROUNDED 배지가 통째로 빠진다.
  "impact-verify-report.json",
  // impact 앵커(=census.gitCommit)의 출처 — 변경·영향의 재스캔 판정에 필요.
  "census.json",
  "policy-signals.json",
  "policy-reconcile.json",
];
// 캡처 PNG 디렉터리(화면설계서) — 통째로 복사.
const DIRS = ["screens"];

if (!existsSync(SRC_DIR)) {
  console.error(`[sync:demo] source not found: ${SRC_DIR}`);
  process.exit(1);
}
mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const name of FILES) {
  const src = join(SRC_DIR, name);
  if (!existsSync(src)) {
    console.warn(`[sync:demo] skip (absent): ${name}`);
    continue;
  }
  cpSync(src, join(DEST_DIR, name));
  copied += 1;
}
for (const name of SPEC_FILES) {
  const src = join(SPEC_MAP_DIR, name);
  if (!existsSync(src)) {
    console.warn(`[sync:demo] skip (absent): .spec/map/${name}`);
    continue;
  }
  cpSync(src, join(DEST_DIR, name));
  copied += 1;
}
if (existsSync(GOLDEN_BASELINE)) {
  cpSync(GOLDEN_BASELINE, join(DEST_DIR, "golden-baseline.json"));
  copied += 1;
} else {
  console.warn("[sync:demo] skip (absent): golden baseline");
}
for (const name of DIRS) {
  const src = join(SRC_DIR, name);
  const dest = join(DEST_DIR, name);
  if (!existsSync(src)) {
    console.warn(`[sync:demo] skip dir (absent): ${name}/`);
    continue;
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[sync:demo] copied dir ${name}/ → packages/dashboard/public/`);
}
console.log(
  `[sync:demo] copied ${copied}/${FILES.length + SPEC_FILES.length + 1} files → packages/dashboard/public/`,
);
