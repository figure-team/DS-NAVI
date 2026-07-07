#!/usr/bin/env node
/**
 * slice-batch-inputs.mjs — Phase 1.5 tail step for the Phase 2 fan-out path
 *
 * Splits batches.json into one SELF-CONTAINED slice per batch
 * (`batch-input-<batchIndex>.json`) so that fan-out analyzer agents read
 * exactly one bounded file instead of the whole multi-MB batches.json, and
 * so that no batch payload ever travels through the orchestrator context or
 * the workflow args (docs/ktds/UNDERSTAND_SCALE_WORKFLOW_DESIGN.md §4.3).
 *
 * Self-contained means the slice also carries fields that batches.json does
 * NOT have: projectRoot/skillDir/agentDefPath (absolute paths, passed as CLI
 * args because only the orchestrator has them resolved), languageDirective
 * (exists only in orchestrator memory), and projectName/projectDescription/
 * languages (sourced from scan-result.json).
 *
 * Usage:
 *   node slice-batch-inputs.mjs <project-root> \
 *     --skill-dir <abs> --agent-def-path <abs> [--language-directive "<text>"]
 *
 * Input:  <project-root>/.understand-anything/intermediate/batches.json
 *         <project-root>/.understand-anything/intermediate/scan-result.json
 * Output: <project-root>/.understand-anything/intermediate/inputs/batch-input-<i>.json
 *         (own subdirectory — merge-batch-graphs.py globs `batch-*.json` in
 *         intermediate/ and warns on unrecognized names, so slices must never
 *         sit next to the batch outputs)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

function parseArgs(argv) {
  const args = { projectRoot: null, skillDir: null, agentDefPath: null, languageDirective: '' };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skill-dir') args.skillDir = argv[++i];
    else if (a === '--agent-def-path') args.agentDefPath = argv[++i];
    else if (a === '--language-directive') args.languageDirective = argv[++i] ?? '';
    else positional.push(a);
  }
  args.projectRoot = positional[0] ?? null;
  return args;
}

const { projectRoot: rawRoot, skillDir, agentDefPath, languageDirective } = parseArgs(process.argv);

if (!rawRoot || !skillDir || !agentDefPath) {
  console.error('Usage: node slice-batch-inputs.mjs <project-root> --skill-dir <abs> --agent-def-path <abs> [--language-directive "<text>"]');
  process.exit(1);
}

const projectRoot = resolve(rawRoot);
// Absolute-path principle (§3.3): fan-out subagents have no guaranteed cwd,
// so every path baked into a slice must already be absolute.
for (const [name, p] of [['skill-dir', skillDir], ['agent-def-path', agentDefPath]]) {
  if (!isAbsolute(p)) {
    console.error(`Error: --${name} must be an absolute path, got: ${p}`);
    process.exit(1);
  }
}

const intermediateDir = join(projectRoot, '.understand-anything', 'intermediate');
const inputsDir = join(intermediateDir, 'inputs');
mkdirSync(inputsDir, { recursive: true });
const batchesDoc = JSON.parse(readFileSync(join(intermediateDir, 'batches.json'), 'utf-8'));
const scan = JSON.parse(readFileSync(join(intermediateDir, 'scan-result.json'), 'utf-8'));

const { totalBatches, batches } = batchesDoc;
if (!Array.isArray(batches) || batches.length === 0) {
  console.error('Error: batches.json contains no batches');
  process.exit(1);
}

let written = 0;
for (const b of batches) {
  const slice = {
    batchIndex: b.batchIndex,
    totalBatches,
    projectRoot,
    skillDir,
    agentDefPath,
    projectName: scan.name ?? '',
    projectDescription: scan.description ?? '',
    languages: scan.languages ?? [],
    languageDirective: languageDirective ?? '',
    files: b.files,
    batchImportData: b.batchImportData,
    neighborMap: b.neighborMap,
  };
  writeFileSync(join(inputsDir, `batch-input-${b.batchIndex}.json`), JSON.stringify(slice, null, 2), 'utf-8');
  written++;
}

console.log(`slice-batch-inputs: wrote ${written} slices (batch-input-<i>.json) to ${inputsDir}`);
