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
//     model?: string,        // fill-writer model: 'inherit' (session, default —
//                            // 공통 규약) | 'sonnet' (egov-proven) | 'haiku' | any model id
//     effort?: string,       // fill-writer reasoning effort (default 'low')
//     headerEffort?: string, // effort for header chunks only (default 'medium' — see below)
//     language?: string,     // output language for names/summaries (default '한국어')
//     stylePath?: string,    // Korean prose style guide path (default: derived from cliScript
//                            // → <plugin>/templates/style/ko-prose.md; project override wins)
//     stylePass?: boolean }  // run the post-audit prose style review round (default true)


export const meta = {
  name: 'ktds-map-fill-fanout',
  description: 'Fan out /understand-map fill chunks with disk-verified idempotent resume',
  whenToUse: 'Invoked by the /understand-map skill when domain/flow scale exceeds the inline fill gate',
  phases: [
    { title: 'Fill', detail: 'one fill-writer agent per chunk, disk-guarded skip' },
    { title: 'Audit', detail: 'deterministic completeness audit + bounded re-dispatch' },
    { title: 'Style', detail: 'Korean prose style review — rewrite violating sentences only' },
  ],
}

// Tolerate hosts that deliver args as a JSON-encoded string instead of an object.
const A = typeof args === 'string' ? JSON.parse(args) : args
const {
  projectRoot,
  cliScript,
  chunkIds,
  model = 'inherit',
  effort = 'low',
  headerEffort = 'medium',
  language = '한국어',
  stylePath,
  stylePass = true,
} = A ?? {}
if (!projectRoot || !cliScript || !Array.isArray(chunkIds) || chunkIds.length === 0) {
  throw new Error('args must provide { projectRoot, cliScript, chunkIds: [least one chunk id] }')
}

// Model gate resolution: 'inherit' = session model (no override). Effort defaults
// low — the judgment is template-guided Korean naming/summarizing over pre-cited
// slices, not open-ended analysis (egov: sonnet+low → 100% grounded).
const modelOpts = model === 'inherit' ? {} : { model }
const effortOpts = effort === 'inherit' ? {} : { effort }

// Header chunks (chunkId `<key>-000`, isHeaderChunk === gi === 0 in prepFillChunks) do
// strictly more work than the rest: on top of their own 20 flows they survey the domain's
// FULL header.flowIndex roster and write the domain summary/entities/rules plus up to 20
// business-process flowcharts. egov 실측: at a flat effort=low a 484-flow domain came back
// with ONE 8-node chart — the roster was in the payload, unread. Effort is per-chunk so the
// bump costs only 1 agent per domain, not per chunk.
// Korean prose style guide (문체 규약): agents load it from disk themselves (workflow
// scripts have no fs access). Project override wins over the plugin-bundled default.
const styleGuidePath = stylePath || cliScript.replace(/scripts\/[^/]+$/, 'templates/style/ko-prose.md')
const styleRule = (projectRootAbs) =>
  `   - STYLE (문체 규약): BEFORE writing any prose, read the style guide — first try ${projectRootAbs}/.understand-anything/templates/style/ko-prose.md, and if it does not exist read ${styleGuidePath}. Apply its rules (종결어미, 번역투 금지, 용어 표기 일관, few-shot 예시) to every name/summary/label/text you write. If neither file exists, skip silently and continue.
   - TERMS (용어 기준): if ${projectRootAbs}/.understand-anything/templates/style/ko-terms.md exists, read it and use its spellings as the canonical 표기 for every business term (사용자 확정 용어 — 최우선). Otherwise, if ${projectRootAbs}/.understand-anything/doc-output/policy-glossary.md exists, prefer its 용어 표기 for domain terms. These files fix spelling/naming ONLY — never copy them into citations. If absent, skip silently.`

const isHeaderChunkId = (id) => /-000$/.test(id)
const headerEffortOpts = headerEffort === 'inherit' ? {} : { effort: headerEffort }
const chunkOpts = (id) => (isHeaderChunkId(id) ? headerEffortOpts : effortOpts)

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
${styleRule(projectRoot)}
   - flows[]: EXACTLY one entry per chunk.flows[] id — { "flowId", "name", "summary": { "text", "citations": [...] } }. No ids from outside the chunk.
   - steps[]: EXACTLY one entry per chunk.steps[] id — { "stepId", "name", "summary": { "text", "citations": [...] } }. If the step has a "layer" and chunk.nodeDetailTemplate.byLayer[<layer>] lists sections, ALSO add "detail": { "<sectionId>": { "text", "citations": [...] } } for each section, following that section's promptHint, grounded in the step file's slice.
   - CITATIONS (the load-bearing rule): copy the chunk's preCite objects VERBATIM — byte-for-byte, do not rephrase, re-indent, translate, or shorten the snippet. You may ADD citations only by copying an EXACT line from a chunk.files[].slice.text with its real 1-based line number (slice.startLine + line offset within the slice). NEVER invent or alter file paths, line numbers, or snippets — a machine verifier compares every snippet against the real file and demotes mismatches.
   - Rule H (header): "header" MUST be null unless chunk.isHeaderChunk is true. If true, header = { "name" (domain display name, business language — the ONLY citation-exempt field), "summary": Claim, "entities": Claim[], "businessRules": Claim[], "crossDomainInteractions": Claim[], "businessFlows": [...] (optional) }. Every Claim = { "text", "citations": [≥1] } grounded per the citation rule.
   - businessFlows (header chunk): per-business-process flowcharts { "title" (~20 chars, citation-exempt), "nodes": [...], "edges": [...] }. Node = { "id", "kind": "start"|"end"|"activity"|"decision", "label" (≤30 chars business language), "flowRef"? , "citations"? }. activity/decision REQUIRE citations; each chart needs ≥1 start and ≥1 end; decision nodes need ≥2 outgoing edges, ALL labeled (e.g. "YES"/"NO"/"재고 있음") — only create a decision when the slice/rules actually evidence a branch. flowRef may ONLY be an id from chunk.header.flowIndex.
   - HOW MANY CHARTS — coverage, not effort budget: chunk.header.flowIndex is the domain's COMPLETE flow roster (EVERY flow in the domain, not just this chunk's flows[]), and each entry carries its own preCite you may copy verbatim. SURVEY IT FIRST, then group its entries into distinct business processes — entries sharing a controller or URL prefix are normally one process (.../nts/insert|update|delete|selectList → one chart "공지사항 관리"). Write ONE chart PER process you find, up to 20. Scale to what the roster shows: a 400-flow domain has many processes, and returning a single chart for it is a COVERAGE FAILURE, not brevity. Never let chart count be decided by how much work it is.
   - Do NOT pad, either: a domain whose roster genuinely shows one process gets exactly one chart, and any process you cannot ground in a real citation is omitted rather than invented. Coverage means every process the roster evidences, never a process it does not.
   - If a flow/step has preCite: null and you cannot find a citable line in the provided slices, still write the entry citing the nearest meaningful slice line — the verifier will judge it. Do not drop the entry (coverage is audited).

4. SELF-VERIFY: re-run the exact command from step 1. If chunk ${id} is still in "incomplete", fix your fragment ONCE according to the printed reason and re-verify.

5. ACK via structured output ONLY: { "chunkId": "${id}", "skipped": false, "flows": <count>, "steps": <count> }. Do NOT include fragment content, JSON bodies, or file lists in any text.`

const auditPrompt = () => `Run this exact command and nothing else:
node ${cliScript} ${projectRoot} fill-audit
It prints a single JSON line: { "complete": [...], "incomplete": [{ "chunkId", "reason" }], "warnings": [{ "chunkId", "reason" }] }.
Return { incomplete } via structured output, copied verbatim from the command output. Do NOT attempt to fix, rewrite, or delete anything yourself.`

phase('Fill')
const headerCount = chunkIds.filter(isHeaderChunkId).length
log(
  `Fanning out ${chunkIds.length} fill chunks (model=${model}, effort=${effort}, ` +
    `${headerCount} header chunks at effort=${headerEffort}, disk-guarded skip)`,
)
const acks = await pipeline(chunkIds, id =>
  agent(fillPrompt(id), { label: `fill:${id}`, phase: 'Fill', schema: ACK, ...modelOpts, ...chunkOpts(id) }))

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
    agent(fillPrompt(p.chunkId, p.reason), { label: `retry:${p.chunkId}`, phase: 'Audit', schema: ACK, ...modelOpts, ...chunkOpts(p.chunkId) })))
}

const okAcks = acks.filter(Boolean)
const skippedByGuard = okAcks.filter(a => a.skipped).length
if (failed.length) log(`WARNING: ${failed.length} chunks incomplete after bounded retries`)

// Style pass (문체 검수): separate from the completeness/citation gates above — it only
// rewrites prose that violates the style guide, never structure/ids/citations. Runs after
// the audit loop so it reviews complete fragments; skipped chunks are re-reviewed on
// resume, which is harmless (compliant text is left byte-identical).
const STYLE_ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    revised: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['chunkId', 'revised'],
}

const styleReviewPrompt = (id) => `You are a Korean prose STYLE REVIEWER for ONE fill fragment of /understand-map.
1. Read the style guide — first try ${projectRoot}/.understand-anything/templates/style/ko-prose.md, else ${styleGuidePath}. If neither exists, return { "chunkId": "${id}", "revised": 0 } immediately.
   Also load the term base if present: ${projectRoot}/.understand-anything/templates/style/ko-terms.md (사용자 확정 표기 — 최우선), else ${projectRoot}/.understand-anything/doc-output/policy-glossary.md.
2. Read the fragment: ${projectRoot}/.spec/map/fill-frag/${id}.json. If it does not exist, return { "chunkId": "${id}", "revised": 0 }.
3. Review ONLY these prose fields against the guide: flows[].name, flows[].summary.text, steps[].name, steps[].summary.text, steps[].detail[*].text, header.name, header.summary.text, header.entities[].text, header.businessRules[].text, header.crossDomainInteractions[].text, header.businessFlows[].title and their nodes[].label / edges[].label.
   Rewrite a field ONLY when it violates the guide (종결어미 혼용, 존댓말, 번역투, 이중 피동, 음차, 코드 심볼 노출, 표기 흔들림). RULES:
   - STYLE-ONLY edits: preserve the meaning and every fact exactly. Never add, remove, or weaken a claim.
   - NEVER change: any id (flowId/stepId/domainId/node id), any citations array or its {filePath,line,snippet} contents (snippets are verbatim evidence), confidence values, structural fields, or JSON shape/keys.
   - A compliant field stays byte-identical. When in doubt, leave it unchanged.
4. If you changed anything, write the fragment back to the SAME path (valid JSON, same schema).
5. SELF-VERIFY: run \`node ${cliScript} ${projectRoot} fill-audit --chunk ${id}\` — if the chunk turned "incomplete", fix your edit per the printed reason ONCE and re-verify.
6. ACK via structured output ONLY: { "chunkId": "${id}", "revised": <number of fields you rewrote> }. No fragment content in text.`

let styleRevised = 0
if (stylePass) {
  phase('Style')
  const styleTargets = chunkIds.filter(id => !failed.some(f => f.chunkId === id))
  log(`Style review over ${styleTargets.length} complete chunks (violating sentences only)`)
  const styleAcks = await pipeline(styleTargets, id =>
    agent(styleReviewPrompt(id), { label: `style:${id}`, phase: 'Style', schema: STYLE_ACK, ...modelOpts, ...effortOpts }))
  styleRevised = styleAcks.filter(Boolean).reduce((n, a) => n + (a.revised || 0), 0)
}

return {
  totalChunks: chunkIds.length,
  filled: chunkIds.length - failed.length,
  skippedByGuard,
  styleRevised,
  failed,
}
