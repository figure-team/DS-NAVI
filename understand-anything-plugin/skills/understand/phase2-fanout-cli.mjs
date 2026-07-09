#!/usr/bin/env node
// phase2-fanout-cli.mjs — headless CLI fan-out driver for /understand Phase 2 at scale
//
// Platform-portable counterpart of phase2-fanout.workflow.js for hosts WITHOUT the
// Claude Workflow tool (e.g. opencode). Same contract as the workflow route
// (docs/ktds/UNDERSTAND_SCALE_WORKFLOW_DESIGN.md):
//  - one analyzer agent per batch, each reading its self-contained slice from disk
//  - completion truth lives on disk (audit-batches.mjs), never in agent replies
//  - bounded re-dispatch (initial run + at most 2 retry rounds), idempotent resume
//
// Instead of Workflow-harness agents, each batch is a headless CLI session
// (`opencode run` by default). Model-agnostic by design: the child session uses
// whatever model the host CLI is configured with unless --model is passed.
//
// Usage:
//   node phase2-fanout-cli.mjs <intermediateDir> [options]
//     <intermediateDir>        <projectRoot>/.understand-anything/intermediate (absolute)
//     --skill-dir <dir>        dir containing audit-batches.mjs (default: this script's dir)
//     --concurrency <n>        parallel child sessions (default: 5)
//     --model <provider/model> passthrough to `opencode run -m` (default: CLI's configured model)
//     --light-model <provider/model>
//                              model for light-tier batches (slice tier === 'light':
//                              markup/data/docs/config only — template-grade summaries).
//                              Code-tier batches keep --model / the CLI default.
//                              Ignored when --runner-cmd overrides the child command.
//     --variant <v>            passthrough to `opencode run --variant`
//     --runner-cmd "<cmd>"     override the child command entirely (whitespace-split;
//                              the analyze prompt is appended as the last argument).
//                              Default: opencode run --dir <projectRoot> --dangerously-skip-permissions
//     --timeout-sec <n>        kill a child after n seconds (default: 0 = no timeout)
//     --rounds <n>             total audit rounds incl. initial (default: 3)
//
// Prints progress to stderr and ONE final JSON line to stdout:
//   { "totalBatches", "analyzed", "skippedByGuard", "failed": [{ "batchIndex", "reason" }] }
// Exit code is 0 even with failed batches (the caller surfaces failed[] as warnings);
// non-zero only for setup errors (no slices, audit script missing, etc.).

import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    intermediateDir: null, skillDir: HERE, concurrency: 5, model: null,
    lightModel: null, variant: null, runnerCmd: null, timeoutSec: 0, rounds: 3,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skill-dir') opts.skillDir = resolve(argv[++i]);
    else if (a === '--concurrency') opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 5);
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--light-model') opts.lightModel = argv[++i];
    else if (a === '--variant') opts.variant = argv[++i];
    else if (a === '--runner-cmd') opts.runnerCmd = argv[++i];
    else if (a === '--timeout-sec') opts.timeoutSec = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--rounds') opts.rounds = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (!opts.intermediateDir) opts.intermediateDir = resolve(a);
    else { console.error(`unknown argument: ${a}`); process.exit(1); }
  }
  return opts;
}

const opts = parseArgs(process.argv);
if (!opts.intermediateDir) {
  console.error('Usage: node phase2-fanout-cli.mjs <intermediateDir> [--concurrency 5] [--model provider/model] [--light-model provider/model] [--runner-cmd "..."]');
  process.exit(1);
}
const { intermediateDir, skillDir } = opts;
const projectRoot = resolve(intermediateDir, '..', '..');
const auditScript = join(skillDir, 'audit-batches.mjs');
const inputsDir = join(intermediateDir, 'inputs');
const logsDir = join(intermediateDir, 'fanout-logs');

if (!existsSync(auditScript)) { console.error(`audit-batches.mjs not found in --skill-dir: ${skillDir}`); process.exit(1); }
if (!existsSync(inputsDir)) {
  console.error(`no slices at ${inputsDir} — run slice-batch-inputs.mjs first (see SKILL.md Workflow fan-out route step 1)`);
  process.exit(1);
}
const totalBatches = readdirSync(inputsDir).filter(f => /^batch-input-\d+\.json$/.test(f)).length;
if (totalBatches === 0) { console.error(`no batch-input-*.json slices in ${inputsDir}`); process.exit(1); }
mkdirSync(logsDir, { recursive: true });

/** Deterministic completeness audit — single source of truth (audit-batches.mjs). */
function audit(indices) {
  const args = [auditScript, intermediateDir];
  if (indices && indices.length) args.push('--indices', indices.join(','));
  const r = spawnSync(process.execPath, args, { encoding: 'utf-8' });
  if (r.status !== 0) { console.error(`audit failed: ${r.stderr || r.stdout}`); process.exit(1); }
  return JSON.parse(r.stdout);
}

/** Remove stale outputs for a batch so a re-run never mixes old and new parts. */
function cleanStale(i) {
  const re = new RegExp(`^batch-${i}(?:-part-\\d+)?\\.(?:json|done)$`);
  for (const f of readdirSync(intermediateDir)) {
    if (re.test(f)) rmSync(join(intermediateDir, f), { force: true });
  }
  rmSync(join(intermediateDir, `batch-${i}.done`), { force: true });
}

const analyzePrompt = (i, retryReason) => `You are executing ONE batch of the /understand Phase 2 file analysis.
${retryReason ? `\nThis is a RE-DISPATCH. Previous attempt was incomplete: ${retryReason}\n` : ''}
1. Read your self-contained batch slice (absolute path): ${intermediateDir}/inputs/batch-input-${i}.json
   It carries everything you need: projectRoot, skillDir, agentDefPath, projectName, projectDescription, languages, languageDirective, files[], batchImportData, neighborMap.

2. ANALYZE: read the agent definition file at the slice's agentDefPath (absolute) and follow that protocol EXACTLY as if you had been dispatched with:
   - Project root: slice.projectRoot   - Skill directory: slice.skillDir
   - Project: slice.projectName — slice.projectDescription   - Languages: slice.languages
   - Batch: ${i}/${totalBatches}
   - Pre-resolved import data: slice.batchImportData   - Cross-batch neighbors: slice.neighborMap
   - Files to analyze: slice.files (pass every entry through to batchFiles with all four fields)
   - Output: write to ${intermediateDir}/batch-${i}.json (single-file) OR batch-${i}-part-<k>.json (split mode, per the protocol's output rules — STRICT naming, never any other pattern)
   - If slice.languageDirective is non-empty, apply it to ALL textual output as the protocol describes.

3. SENTINEL: only after ALL output parts are fully written and self-validated per the protocol, create the empty file ${intermediateDir}/batch-${i}.done (e.g. via touch). Never create it earlier.

4. Reply with ONE line only: \`batch ${i}: <filesAnalyzed> files, <nodes> nodes, <edges> edges\`. Never include node/edge JSON or file lists in your reply — completion is verified on disk, not from your reply.`;

/** Per-batch tier from the slice on disk; missing/old slices default to 'code'. */
function tierOf(i) {
  try {
    const slice = JSON.parse(readFileSync(join(inputsDir, `batch-input-${i}.json`), 'utf-8'));
    return slice.tier === 'light' ? 'light' : 'code';
  } catch {
    return 'code';
  }
}

function modelFor(i) {
  return (opts.lightModel && tierOf(i) === 'light') ? opts.lightModel : opts.model;
}

function childCommand(prompt, model) {
  if (opts.runnerCmd) return [...opts.runnerCmd.split(/\s+/).filter(Boolean), prompt];
  const cmd = ['opencode', 'run', '--dir', projectRoot, '--dangerously-skip-permissions'];
  if (model) cmd.push('-m', model);
  if (opts.variant) cmd.push('--variant', opts.variant);
  cmd.push(prompt);
  return cmd;
}

function runChild(i, round, retryReason) {
  return new Promise((resolveP) => {
    const logPath = join(logsDir, `batch-${i}-r${round}.log`);
    const out = createWriteStream(logPath);
    const cmd = childCommand(analyzePrompt(i, retryReason), modelFor(i));
    const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let timer = null;
    if (opts.timeoutSec > 0) {
      timer = setTimeout(() => { out.write(`\n[driver] timeout after ${opts.timeoutSec}s — killing\n`); child.kill('SIGKILL'); }, opts.timeoutSec * 1000);
    }
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on('error', (err) => { if (timer) clearTimeout(timer); out.end(`\n[driver] spawn error: ${err.message}\n`); resolveP(-1); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); out.end(); resolveP(code ?? -1); });
  });
}

async function runPool(batches, round) {
  const queue = [...batches];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const b = queue.shift();
      cleanStale(b.batchIndex);
      const code = await runChild(b.batchIndex, round, b.reason);
      done++;
      console.error(`  [round ${round}] batch ${b.batchIndex} exited ${code} (${done}/${batches.length})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, worker));
}

// ---- main ----
const initial = audit();
const skippedByGuard = initial.complete.length;
let pending = initial.incomplete;
console.error(`fan-out: ${totalBatches} batches, ${skippedByGuard} already complete (disk guard), ${pending.length} to analyze, concurrency ${opts.concurrency}`);

for (let round = 1; round <= opts.rounds && pending.length; round++) {
  if (round > 1) console.error(`audit: ${pending.length} incomplete — re-dispatching (round ${round}/${opts.rounds})`);
  // Retry rounds carry the audit reason into the prompt; the initial round has none.
  await runPool(pending.map(p => (round === 1 ? { ...p, reason: undefined } : p)), round);
  pending = audit(pending.map(p => p.batchIndex)).incomplete;
}

if (pending.length) console.error(`WARNING: ${pending.length} batches incomplete after ${opts.rounds} rounds — see ${logsDir}`);
console.log(JSON.stringify({
  totalBatches,
  analyzed: totalBatches - pending.length,
  skippedByGuard,
  failed: pending,
}));
