// map-fill-fanout.workflow.js — Workflow-tool script for /understand-map fill at scale
//
// Fans out one fill-writer agent per prep chunk so the ~2×N dispatch/ack
// round-trips never touch the main conversation context. Mirrors the proven
// /understand phase2-fanout harness (disk-guarded skip, deterministic audit,
// bounded re-dispatch) — the egov run (1,255 flows, 104 chunks, 100% grounded)
// is the empirical basis. Citations are NOT authored by agents: each chunk
// carries pre-verified pre-cite objects the agent copies verbatim, plus source
// slices it may cite by exact line copy. Completion truth lives on disk
// (understand-map.mjs fill-audit), never in acks.
//
// args:
//   { projectRoot: string,   // absolute path of the analyzed project
//     cliScript: string,     // absolute path to understand-map.mjs
//     chunkIds: string[],    // fill-prep/index.json chunks[].chunkId
//     model?: string,        // fill-writer model: 'sonnet' (default, egov-proven)
//                            // | 'inherit' (session model) | 'haiku' | any model id
//     effort?: string,       // fill-writer reasoning effort (default 'low')
//     language?: string }    // output language for names/summaries (default '한국어')

/* global args, agent, pipeline, parallel, phase, log -- Workflow-tool DSL injects these */

export const meta = {
  name: 'ktds-map-fill-fanout',
  description: 'Fan out /understand-map fill chunks with disk-verified idempotent resume',
  whenToUse: 'Invoked by the /understand-map skill when domain/flow scale exceeds the inline fill gate',
  phases: [
    { title: 'Fill', detail: 'one fill-writer agent per chunk, disk-guarded skip' },
    { title: 'Audit', detail: 'deterministic completeness audit + bounded re-dispatch' },
  ],
}

// Tolerate hosts that deliver args as a JSON-encoded string instead of an object.
const A = typeof args === 'string' ? JSON.parse(args) : args
const { projectRoot, cliScript, chunkIds, model = 'sonnet', effort = 'low', language = '한국어' } = A ?? {}
if (!projectRoot || !cliScript || !Array.isArray(chunkIds) || chunkIds.length === 0) {
  throw new Error('args must provide { projectRoot, cliScript, chunkIds: [least one chunk id] }')
}

// Model gate resolution: 'inherit' = session model (no override). Effort defaults
// low — the judgment is template-guided Korean naming/summarizing over pre-cited
// slices, not open-ended analysis (egov: sonnet+low → 100% grounded).
const modelOpts = model === 'inherit' ? {} : { model }
const effortOpts = effort === 'inherit' ? {} : { effort }

const ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    skipped: { type: 'boolean' },
    flows: { type: 'number' },
    steps: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['chunkId', 'skipped'],
}

const AUDIT = {
  type: 'object',
  properties: {
    incomplete: {
      type: 'array',
      items: {
        type: 'object',
        properties: { chunkId: { type: 'string' }, reason: { type: 'string' } },
        required: ['chunkId', 'reason'],
      },
    },
  },
  required: ['incomplete'],
}

const fillPrompt = (id, retryReason) => `You are writing ONE fill fragment chunk for the /understand-map domain fill.
${retryReason ? `\nThis is a RE-DISPATCH. Previous attempt was incomplete: ${retryReason}\n` : ''}
1. SKIP GUARD (idempotent resume) — run first:
   node ${cliScript} ${projectRoot} fill-audit --chunk ${id}
   It prints one JSON line. If chunk ${id} is in "complete", do NOT rewrite anything — return the ack with skipped:true immediately.

2. Read your self-contained chunk (absolute path): ${projectRoot}/.spec/map/fill-prep/${id}.json
   It carries everything you need: domain identity, flows[] and steps[] to fill (with pre-verified preCite citations), files[] source slices, sliceOmitted[], nodeDetailTemplate, and (header chunk only) header.flowIndex.

3. Write ${projectRoot}/.spec/map/fill-frag/${id}.json — a FillFragment JSON:
   { "schemaVersion": 1, "chunkId": "${id}", "domainId": "<chunk.domainId>", "header": <see rule H>, "flows": [...], "steps": [...] }

   RULES (violations are machine-rejected by fill-audit / emit — no partial credit):
   - Language: every name/summary/text you write is ${language}, business language (업무 언어). Names ≤120 chars, no code symbols in names ("주문 생성" ○, "createOrder()" ✕).
   - flows[]: EXACTLY one entry per chunk.flows[] id — { "flowId", "name", "summary": { "text", "citations": [...] } }. No ids from outside the chunk.
   - steps[]: EXACTLY one entry per chunk.steps[] id — { "stepId", "name", "summary": { "text", "citations": [...] } }. If the step has a "layer" and chunk.nodeDetailTemplate.byLayer[<layer>] lists sections, ALSO add "detail": { "<sectionId>": { "text", "citations": [...] } } for each section, following that section's promptHint, grounded in the step file's slice.
   - CITATIONS (the load-bearing rule): copy the chunk's preCite objects VERBATIM — byte-for-byte, do not rephrase, re-indent, translate, or shorten the snippet. You may ADD citations only by copying an EXACT line from a chunk.files[].slice.text with its real 1-based line number (slice.startLine + line offset within the slice). NEVER invent or alter file paths, line numbers, or snippets — a machine verifier compares every snippet against the real file and demotes mismatches.
   - Rule H (header): "header" MUST be null unless chunk.isHeaderChunk is true. If true, header = { "name" (domain display name, business language — the ONLY citation-exempt field), "summary": Claim, "entities": Claim[], "businessRules": Claim[], "crossDomainInteractions": Claim[], "businessFlows": [...] (optional) }. Every Claim = { "text", "citations": [≥1] } grounded per the citation rule.
   - businessFlows (header chunk, optional — quality over quantity): 1..N per-business-process flowcharts { "title" (~20 chars, citation-exempt), "nodes": [...], "edges": [...] }. Node = { "id", "kind": "start"|"end"|"activity"|"decision", "label" (≤30 chars business language), "flowRef"? , "citations"? }. activity/decision REQUIRE citations; each chart needs ≥1 start and ≥1 end; decision nodes need ≥2 outgoing edges, ALL labeled (e.g. "YES"/"NO"/"재고 있음") — only create a decision when the slice/rules actually evidence a branch. flowRef may ONLY be an id from chunk.header.flowIndex. If the domain has one obvious process, write one chart; if evidence is weak, OMIT businessFlows entirely rather than forcing it.
   - If a flow/step has preCite: null and you cannot find a citable line in the provided slices, still write the entry citing the nearest meaningful slice line — the verifier will judge it. Do not drop the entry (coverage is audited).

4. SELF-VERIFY: re-run the exact command from step 1. If chunk ${id} is still in "incomplete", fix your fragment ONCE according to the printed reason and re-verify.

5. ACK via structured output ONLY: { "chunkId": "${id}", "skipped": false, "flows": <count>, "steps": <count> }. Do NOT include fragment content, JSON bodies, or file lists in any text.`

const auditPrompt = () => `Run this exact command and nothing else:
node ${cliScript} ${projectRoot} fill-audit
It prints a single JSON line: { "complete": [...], "incomplete": [{ "chunkId", "reason" }] }.
Return { incomplete } via structured output, copied verbatim from the command output. Do NOT attempt to fix, rewrite, or delete anything yourself.`

phase('Fill')
log(`Fanning out ${chunkIds.length} fill chunks (model=${model}, effort=${effort}, disk-guarded skip)`)
const acks = await pipeline(chunkIds, id =>
  agent(fillPrompt(id), { label: `fill:${id}`, phase: 'Fill', schema: ACK, ...modelOpts, ...effortOpts }))

phase('Audit')
// Bounded re-dispatch: initial run + at most 2 re-injections, then whatever is
// still incomplete is surfaced as failed[] (never silently dropped) — the host
// reports it and fill-merge proceeds partially (missing chunks → emit fallback).
let failed = []
for (let round = 0; round < 3; round++) {
  const audit = await agent(auditPrompt(), { label: `audit:r${round + 1}`, phase: 'Audit', schema: AUDIT })
  const pending = audit?.incomplete ?? []
  if (!pending.length) { failed = []; break }
  if (round === 2) { failed = pending; break }
  log(`Audit round ${round + 1}: ${pending.length} incomplete — re-dispatching`)
  await parallel(pending.map(p => () =>
    agent(fillPrompt(p.chunkId, p.reason), { label: `retry:${p.chunkId}`, phase: 'Audit', schema: ACK, ...modelOpts, ...effortOpts })))
}

const okAcks = acks.filter(Boolean)
const skippedByGuard = okAcks.filter(a => a.skipped).length
if (failed.length) log(`WARNING: ${failed.length} chunks incomplete after bounded retries`)

return {
  totalChunks: chunkIds.length,
  filled: chunkIds.length - failed.length,
  skippedByGuard,
  failed,
}
