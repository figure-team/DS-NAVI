// phase2-fanout.workflow.js — Workflow-tool script for /understand Phase 2 at scale
//
// Fans out one analyzer agent per batch inside the Workflow harness so that
// the ~2×N dispatch/ack round-trips never touch the main conversation context
// (docs/ktds/UNDERSTAND_SCALE_WORKFLOW_DESIGN.md §3.1). FULL-analysis only:
// batchIndex is guaranteed contiguous 1..N on the full path; the incremental
// path keeps sparse indices and stays on the inline route (§3.5).
//
// args (all paths absolute):
//   { intermediateDir: string,   // <projectRoot>/.understand-anything/intermediate
//     skillDir: string,          // dir containing audit-batches.mjs etc.
//     totalBatches: number,
//     codeModel?: string,        // model for code-tier batches (default 'inherit' = session model)
//     lightModel?: string,       // model for light-tier batches (default 'sonnet')
//     lightBatches?: number[],   // batchIndex list of light-tier batches (batches.json
//                                // entries with tier === 'light'); absent/empty = all code-tier
//     machineBatches?: number[] }// batchIndex list of machine-tier batches already generated
//                                // on disk by generate-machine-batches.mjs — skipped at
//                                // dispatch; the audit still verifies them and re-dispatches
//                                // to an LLM agent if generation left one incomplete
//
// Batch payloads never pass through this script or its prompts: each agent
// reads its own self-contained slice batch-input-<i>.json from disk (§3.2).
// Completion truth lives on disk (audit-batches.mjs), never in acks (§4.1).

export const meta = {
  name: 'ua-phase2-fanout',
  description: 'Fan out /understand Phase 2 file-analyzer batches with disk-verified idempotent resume',
  whenToUse: 'Invoked by the /understand skill when a FULL analysis exceeds the batch-count threshold',
  phases: [
    { title: 'Analyze', detail: 'one analyzer agent per batch, disk-guarded skip' },
    { title: 'Audit', detail: 'deterministic completeness audit + bounded re-dispatch' },
  ],
}

// Tolerate hosts that deliver args as a JSON-encoded string instead of an object.
const A = typeof args === 'string' ? JSON.parse(args) : args
const { intermediateDir, skillDir, totalBatches, codeModel = 'inherit', lightModel = 'sonnet', lightBatches = [], machineBatches = [] } = A ?? {}
if (!intermediateDir || !skillDir || !totalBatches) {
  throw new Error('args must provide { intermediateDir, skillDir, totalBatches }')
}

// Mixed model routing, keyed by the deterministic per-batch tier from
// compute-batches (fileCategory-based): code-tier batches produce the summaries
// humans actually read → session model by default; light-tier batches
// (markup/data/docs/config only) produce template-grade summaries/tags on top of
// script-extracted structure → a lighter model is safe. Judgment-heavy stages
// (architecture-analyzer, tour-builder) are dispatched elsewhere and always use
// the session model.
const lightSet = new Set(lightBatches)
const asOpts = m => (m === 'inherit' ? {} : { model: m })
const modelOptsFor = i => (lightSet.has(i) ? asOpts(lightModel) : asOpts(codeModel))

const ACK = {
  type: 'object',
  properties: {
    batchIndex: { type: 'number' },
    skipped: { type: 'boolean' },
    filesAnalyzed: { type: 'number' },
    nodes: { type: 'number' },
    edges: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['batchIndex', 'skipped'],
}

const AUDIT = {
  type: 'object',
  properties: {
    incomplete: {
      type: 'array',
      items: {
        type: 'object',
        properties: { batchIndex: { type: 'number' }, reason: { type: 'string' } },
        required: ['batchIndex', 'reason'],
      },
    },
  },
  required: ['incomplete'],
}

const analyzePrompt = (i, retryReason) => `You are executing ONE batch of the /understand Phase 2 file analysis.
${retryReason ? `\nThis is a RE-DISPATCH. Previous attempt was incomplete: ${retryReason}\n` : ''}
1. Read your self-contained batch slice (absolute path): ${intermediateDir}/inputs/batch-input-${i}.json
   It carries everything you need: projectRoot, skillDir, agentDefPath, projectName, projectDescription, languages, languageDirective, files[], batchImportData, neighborMap.

2. SKIP GUARD (idempotent resume) — run first:
   node ${skillDir}/audit-batches.mjs ${intermediateDir} --indices ${i}
   If batch ${i} is in "complete", do NOT re-analyze. Return the ack with skipped:true immediately.
   If it is in "incomplete", delete any stale batch-${i}.json / batch-${i}-part-*.json / batch-${i}.done in ${intermediateDir}, then analyze.

3. ANALYZE: read the agent definition file at the slice's agentDefPath (absolute) and follow that protocol EXACTLY as if you had been dispatched with:
   - Project root: slice.projectRoot   - Skill directory: slice.skillDir
   - Project: slice.projectName — slice.projectDescription   - Languages: slice.languages
   - Batch: ${i}/${totalBatches}
   - Pre-resolved import data: slice.batchImportData   - Cross-batch neighbors: slice.neighborMap
   - Files to analyze: slice.files (pass every entry through to batchFiles with all four fields)
   - Output: write to ${intermediateDir}/batch-${i}.json (single-file) OR batch-${i}-part-<k>.json (split mode, per the protocol's output rules — STRICT naming, never any other pattern)
   - If slice.languageDirective is non-empty, apply it to ALL textual output as the protocol describes.

4. SENTINEL: only after ALL output parts are fully written and self-validated per the protocol, create the empty file ${intermediateDir}/batch-${i}.done (e.g. via touch). Never create it earlier.

5. ACK: respond via structured output ONLY: { batchIndex: ${i}, skipped: false, filesAnalyzed, nodes, edges }. Do not include node/edge JSON or file lists in any text.`

const auditPrompt = () => `Run this exact command and nothing else:
node ${skillDir}/audit-batches.mjs ${intermediateDir}
It prints a single JSON: { "complete": [...], "incomplete": [{ "batchIndex", "reason" }] }.
Return { incomplete } via structured output, copied verbatim from the script output. Do NOT attempt to fix, re-analyze, or delete anything yourself.`

// Machine-tier batches were generated deterministically before this workflow
// ran — no agent dispatched. They remain in the Audit scope below: if the
// generator failed one, the audit re-dispatches it to a normal LLM agent.
const machineSet = new Set(machineBatches)
const indices = Array.from({ length: totalBatches }, (_, k) => k + 1).filter(i => !machineSet.has(i))

phase('Analyze')
log(`Fanning out ${indices.length} batches (${machineSet.size} machine-tier pre-generated, self-contained slices, disk-guarded skip)`)
const acks = await pipeline(indices, i =>
  agent(analyzePrompt(i), { label: `batch:${i}`, phase: 'Analyze', schema: ACK, ...modelOptsFor(i) }))

phase('Audit')
// Bounded re-dispatch: initial run + at most 2 re-injections per §4.4, then
// whatever is still incomplete is surfaced as failed[] (never silently dropped).
let failed = []
for (let round = 0; round < 3; round++) {
  const audit = await agent(auditPrompt(), { label: `audit:r${round + 1}`, phase: 'Audit', schema: AUDIT })
  const pending = audit?.incomplete ?? []
  if (!pending.length) { failed = []; break }
  if (round === 2) { failed = pending; break }
  log(`Audit round ${round + 1}: ${pending.length} incomplete — re-dispatching`)
  await parallel(pending.map(p => () =>
    agent(analyzePrompt(p.batchIndex, p.reason), { label: `retry:${p.batchIndex}`, phase: 'Audit', schema: ACK, ...modelOptsFor(p.batchIndex) })))
}

const okAcks = acks.filter(Boolean)
const skippedByGuard = okAcks.filter(a => a.skipped).length
if (failed.length) log(`WARNING: ${failed.length} batches incomplete after bounded retries`)

return {
  totalBatches,
  analyzed: totalBatches - failed.length,
  skippedByGuard,
  failed,
}
