#!/usr/bin/env node
/**
 * audit-batches.mjs — deterministic completeness audit for Phase 2 outputs
 *
 * The single source of truth for "is batch <i> done?" on the fan-out path
 * (docs/ktds/UNDERSTAND_SCALE_WORKFLOW_DESIGN.md §4.1/§4.4). Used twice:
 *  - by each analyzer agent as its idempotent SKIP GUARD (`--indices <i>`)
 *  - by the workflow Audit stage over all batches
 *
 * A batch <i> is COMPLETE iff ALL of:
 *  1. sentinel `batch-<i>.done` exists (written only after all parts landed)
 *  2. `batch-<i>.json` or `batch-<i>-part-*.json` exist and parse as JSON
 *  3. the union of file paths covered by the output nodes ⊇ the expected
 *     `files[]` of `batch-input-<i>.json` (every batch file must have a node
 *     per the file-analyzer protocol — this catches silent partial analysis
 *     AND stale outputs from a different partition, so correctness never
 *     depends on batchIndex stability)
 *
 * Existence alone is NEVER trusted: a truncated JSON (session died mid-write)
 * or a missing part fails 1/2, and a batch whose composition drifted fails 3.
 *
 * Usage:
 *   node audit-batches.mjs <intermediate-dir> [--indices 1,5,12]
 *
 * Output (stdout, single JSON):
 *   { "complete": [1, 2], "incomplete": [{"batchIndex": 3, "reason": "..."}] }
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  let dir = null;
  let indices = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--indices') indices = (argv[++i] ?? '').split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
    else dir = a;
  }
  return { dir, indices };
}

const { dir: rawDir, indices } = parseArgs(process.argv);
if (!rawDir) {
  console.error('Usage: node audit-batches.mjs <intermediate-dir> [--indices 1,5,12]');
  process.exit(1);
}
const dir = resolve(rawDir);
// Slices live in their own subdirectory so they never collide with
// merge-batch-graphs.py's `batch-*.json` glob over intermediate/.
const inputsDir = join(dir, 'inputs');

// Default scope: every batch that has a slice on disk. Slices are the audit's
// expectation source, so a batch without a slice is out of scope by design.
const sliceRe = /^batch-input-(\d+)\.json$/;
const allIndices = (existsSync(inputsDir) ? readdirSync(inputsDir) : [])
  .map(f => f.match(sliceRe))
  .filter(Boolean)
  .map(m => parseInt(m[1], 10))
  .sort((a, b) => a - b);
const scope = indices && indices.length ? indices : allIndices;

/** Collect the set of file paths an output fragment covers (node filePath or file-ish id). */
function coveredPaths(fragment, into) {
  for (const n of fragment.nodes ?? []) {
    if (typeof n.filePath === 'string' && n.filePath) into.add(n.filePath);
    else if (typeof n.id === 'string') {
      // sub-file nodes: <prefix>:<path>[:<name>] — take the path segment
      const parts = n.id.split(':');
      if (parts.length >= 2 && parts[1]) into.add(parts[1]);
    }
  }
}

const complete = [];
const incomplete = [];

for (const i of scope) {
  const slicePath = join(inputsDir, `batch-input-${i}.json`);
  if (!existsSync(slicePath)) {
    incomplete.push({ batchIndex: i, reason: `slice batch-input-${i}.json missing` });
    continue;
  }
  let expected;
  try {
    expected = JSON.parse(readFileSync(slicePath, 'utf-8')).files.map(f => f.path);
  } catch (err) {
    incomplete.push({ batchIndex: i, reason: `slice unreadable: ${err.message}` });
    continue;
  }

  // 1. sentinel
  if (!existsSync(join(dir, `batch-${i}.done`))) {
    incomplete.push({ batchIndex: i, reason: 'sentinel batch-<i>.done missing' });
    continue;
  }

  // 2. output files parse (single-file or all parts; same naming rule as merge-batch-graphs.py)
  const partRe = new RegExp(`^batch-${i}(?:-part-(\\d+))?\\.json$`);
  const outFiles = readdirSync(dir).filter(f => partRe.test(f));
  if (outFiles.length === 0) {
    incomplete.push({ batchIndex: i, reason: 'no batch-<i>.json / batch-<i>-part-*.json output' });
    continue;
  }
  const covered = new Set();
  let parseError = null;
  for (const f of outFiles) {
    try {
      coveredPaths(JSON.parse(readFileSync(join(dir, f), 'utf-8')), covered);
    } catch (err) {
      parseError = `${f} invalid JSON: ${err.message}`;
      break;
    }
  }
  if (parseError) {
    incomplete.push({ batchIndex: i, reason: parseError });
    continue;
  }

  // 3. file-set coverage: output ⊇ expected slice files
  const missing = expected.filter(p => !covered.has(p));
  if (missing.length) {
    incomplete.push({
      batchIndex: i,
      reason: `output missing nodes for ${missing.length}/${expected.length} files: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`,
    });
    continue;
  }

  complete.push(i);
}

console.log(JSON.stringify({ complete, incomplete }));
