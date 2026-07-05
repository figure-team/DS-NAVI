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
const DEST_DIR = join(dashboardRoot, "public");

// Files the demo dashboard fetches. Optional ones are skipped silently when
// the vendored project doesn't produce them.
const FILES = [
  "knowledge-graph.json",
  "domain-graph.json",
  "meta.json",
  "config.json",
  "impact-overlay.json",
  "rtm.json",
  "screens.json",
  "screen-overrides.json",
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
console.log(`[sync:demo] copied ${copied}/${FILES.length} files → packages/dashboard/public/`);
