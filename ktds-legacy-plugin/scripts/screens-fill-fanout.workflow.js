// screens-fill-fanout.workflow.js — Workflow-tool script for /understand-screens Stage B at scale
//
// Fans out one fill-writer agent per prep chunk so the ~2×N dispatch/ack
// round-trips never touch the main conversation context. Mirrors the proven
// /understand-map fill fan-out harness (disk-guarded skip, deterministic audit,
// bounded re-dispatch). Citations are NOT authored by agents: each chunk carries
// a pre-verified handler dictionary (routeEvidence + chainCandidates) the agent
// copies verbatim, plus controller/service source slices it may cite by exact
// line copy. Completion truth lives on disk (understand-screens.mjs fill-audit),
// never in acks. The mechanicalHash-sealed fields (no/kind/selector/bbox/
// eventType/mechanical) are NEVER written by fragments — merge keeps the body.
//
// args:
//   { projectRoot: string,   // absolute path of the analyzed project
//     cliScript: string,     // absolute path to understand-screens.mjs
//     chunkIds: string[],    // screens-fill-prep/index.json chunks[].chunkId
//     model?: string,        // fill-writer model: 'inherit' (session, default here)
//                            // | 'sonnet' | 'haiku' | any model id
//     effort?: string,       // fill-writer reasoning effort (default 'low')
//     language?: string,     // output language for descriptions/summaries (default '한국어')
//     stylePath?: string,    // Korean prose style guide path (default: derived from cliScript
//                            // → <plugin>/templates/style/ko-prose.md; project override wins)
//     stylePass?: boolean }  // run the post-audit prose style review round (default true)


export const meta = {
  name: 'ktds-screens-fill-fanout',
  description: 'Fan out /understand-screens Stage B fill chunks with disk-verified idempotent resume',
  whenToUse: 'Invoked by the /understand-screens skill when screen/annotation scale exceeds the inline fill gate',
  phases: [
    { title: 'Fill', detail: 'one fill-writer agent per chunk, disk-guarded skip' },
    { title: 'Audit', detail: 'deterministic completeness audit + bounded re-dispatch' },
    { title: 'Style', detail: 'Korean prose style review — rewrite violating sentences only' },
  ],
}

// Tolerate hosts that deliver args as a JSON-encoded string instead of an object.
const A = typeof args === 'string' ? JSON.parse(args) : args
const { projectRoot, cliScript, chunkIds, model = 'inherit', effort = 'low', language = '한국어', stylePath, stylePass = true } = A ?? {}
if (!projectRoot || !cliScript || !Array.isArray(chunkIds) || chunkIds.length === 0) {
  throw new Error('args must provide { projectRoot, cliScript, chunkIds: [least one chunk id] }')
}

// Model gate resolution: 'inherit' = session model (no override). Effort defaults
// low — template-guided Korean naming/description over pre-cited slices, not
// open-ended analysis. The audit re-dispatch corrects verbatim-citation slips.
const modelOpts = model === 'inherit' ? {} : { model }
const effortOpts = effort === 'inherit' ? {} : { effort }

// Korean prose style guide (문체 규약): agents load it from disk themselves (workflow
// scripts have no fs access). Project override wins over the plugin-bundled default.
const styleGuidePath = stylePath || cliScript.replace(/scripts\/[^/]+$/, 'templates/style/ko-prose.md')
const styleRule =
  `   - STYLE (문체 규약): BEFORE writing any prose, read the style guide — first try ${projectRoot}/.understand-anything/templates/style/ko-prose.md, and if it does not exist read ${styleGuidePath}. Apply its rules (종결어미, 번역투 금지, 용어 표기 일관, few-shot 예시) to every title/summary/description/note you write. If neither file exists, skip silently and continue.
   - TERMS (용어 기준): if ${projectRoot}/.understand-anything/templates/style/ko-terms.md exists, read it and use its spellings as the canonical 표기 for every business term (사용자 확정 용어 — 최우선). Otherwise, if ${projectRoot}/.understand-anything/doc-output/policy-glossary.md exists, prefer its 용어 표기 for domain terms. These files fix spelling/naming ONLY — never copy them into citations. If absent, skip silently.`

const ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    skipped: { type: 'boolean' },
    screens: { type: 'number' },
    annotations: { type: 'number' },
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

const fillPrompt = (id, retryReason) => `You are writing ONE fill fragment chunk for the /understand-screens Stage B fill (화면설계서 의미 채움).
${retryReason ? `\nThis is a RE-DISPATCH. Previous attempt was incomplete: ${retryReason}\n` : ''}
1. SKIP GUARD (idempotent resume) — run first:
   node ${cliScript} ${projectRoot} fill-audit --chunk ${id}
   It prints one JSON line. If chunk ${id} is in "complete", do NOT rewrite anything — return the ack with skipped:true immediately.

2. Read your self-contained chunk (absolute path): ${projectRoot}/.spec/map/screens-fill-prep/${id}.json
   It carries everything you need: screens[] (immutable mechanical skeleton + current fill state), handlerDict[] (pre-verified routeEvidence + chainCandidates), viewConstants[] (view-path literal dictionary scanned from the whole anchor files: constant name → literal value → resolvedPath repo-relative path, with declaration relPath:line + verbatim snippet), files[] source slices, and sliceOmitted[].

3. Write ${projectRoot}/.spec/map/screens-fill-frag/${id}.json — a ScreenFillFragment JSON:
   { "schemaVersion": 1, "chunkId": "${id}", "screens": [ { "screenId", ...fills, "annotations": [...] } ] }

   RULES (violations are machine-rejected by fill-audit / merge — no partial credit):
   - Language: every title/summary/description/note you write is ${language}, business language (업무 언어). No code symbols in prose.
${styleRule}
   - NEVER write the sealed mechanical fields (no/kind/selector/bbox/eventType/mechanical) — the fragment carries ONLY fill fields. Merge keeps the body's mechanical facts; anything else you send for them is ignored.
   - COVERAGE: screens[] must contain EXACTLY one entry per chunk.screens[] screenId, and each screen's annotations[] must contain EXACTLY one entry per that screen's declared annotation "key" (<kind>:<no>). No screenIds or keys from outside the chunk.
   - Screen fills (per screen, all optional but write what you can ground): "jspFile" (the JSP actually rendered — confirm via the handler's ForwardResolution/view return in the slices; when the return uses a CONSTANT, e.g. ForwardResolution(NEW_ORDER), resolve it through viewConstants[] by matching the constant name declared in the same file as the handler, and use its non-null resolvedPath as jspFile verbatim; cite BOTH the handler return line and the constant declaration relPath:line in summary.text; if resolvedPath is null or no dictionary entry matches, leave jspFile null — do NOT guess a path), "graphNodeId" (only "file:<jspFile>" when it truly exists in the KG, else null), "title" (한국어), "summary": { "text", "confidence" }.
   - Annotation fills (per annotation): "description" (범례 문장 — field=용도, action/link=수행 동작), "note" ("※ …" 비고 or null), "handler": { "target", "chain": [...], "evidence": [...], "confidence" } or null. For links with no in-app handler (external/anchor/static) keep handler null and just describe.
   - CITATIONS (the load-bearing rule): for a handler, copy the matching handlerDict entry's routeEvidence and chainCandidates[].preCite objects VERBATIM into handler.evidence — byte-for-byte, do not rephrase/re-indent/translate/shorten the snippet. handler.chain is the business-language ActionBean→Service→Mapper names derived from chainCandidates. You may ADD an evidence citation only by copying an EXACT line from a chunk.files[].slice.text with its real 1-based line number (slice.startLine + offset). NEVER invent or alter file paths, line numbers, or snippets. A machine verifier in fill-merge re-opens the real file and compares every evidence snippet you added — mismatches are removed, and a CONFIRMED/CONFIRMED_AI handler left with zero surviving evidence is demoted to INFERRED. Include a "snippet" on every evidence entry you author (evidence with no snippet cannot be verified and is dropped).
   - CONFIDENCE (fail-closed): a handler with confidence "CONFIRMED" or "CONFIRMED_AI" REQUIRES evidence.length ≥ 1. If you have no citable code, use "INFERRED" (구조/관례) or "UNVERIFIED" (근거 없음). Do not invent evidence. Preserve an existing CONFIRMED handler (from Stage A routes-join) as-is unless you are deepening its chain with cited evidence.

4. SELF-VERIFY: re-run the exact command from step 1. If chunk ${id} is still in "incomplete", fix your fragment ONCE according to the printed reason and re-verify.

5. ACK via structured output ONLY: { "chunkId": "${id}", "skipped": false, "screens": <count>, "annotations": <count> }. Do NOT include fragment content, JSON bodies, or file lists in any text.`

const auditPrompt = () => `Run this exact command and nothing else:
node ${cliScript} ${projectRoot} fill-audit
It prints a single JSON line: { "complete": [...], "incomplete": [{ "chunkId", "reason" }] }.
Return { incomplete } via structured output, copied verbatim from the command output. Do NOT attempt to fix, rewrite, or delete anything yourself.`

phase('Fill')
log(`Fanning out ${chunkIds.length} screen-fill chunks (model=${model}, effort=${effort}, disk-guarded skip)`)
const acks = await pipeline(chunkIds, id =>
  agent(fillPrompt(id), { label: `fill:${id}`, phase: 'Fill', schema: ACK, ...modelOpts, ...effortOpts }))

phase('Audit')
// Bounded re-dispatch: initial run + at most 2 re-injections, then whatever is
// still incomplete is surfaced as failed[] (never silently dropped) — the host
// reports it and fill-merge proceeds partially (missing screens kept as body).
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

// Style pass (문체 검수): separate from the completeness/evidence gates — it only rewrites
// prose that violates the style guide, never sealed fields/ids/evidence/confidence.
// Compliant text stays byte-identical, so re-runs on resume are harmless.
const STYLE_ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    revised: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['chunkId', 'revised'],
}

const styleReviewPrompt = (id) => `You are a Korean prose STYLE REVIEWER for ONE fill fragment of /understand-screens Stage B.
1. Read the style guide — first try ${projectRoot}/.understand-anything/templates/style/ko-prose.md, else ${styleGuidePath}. If neither exists, return { "chunkId": "${id}", "revised": 0 } immediately.
   Also load the term base if present: ${projectRoot}/.understand-anything/templates/style/ko-terms.md (사용자 확정 표기 — 최우선), else ${projectRoot}/.understand-anything/doc-output/policy-glossary.md.
2. Read the fragment: ${projectRoot}/.spec/map/screens-fill-frag/${id}.json. If it does not exist, return { "chunkId": "${id}", "revised": 0 }.
3. Review ONLY these prose fields against the guide: screens[].title, screens[].summary.text, annotations[].description, annotations[].note. Rewrite a field ONLY when it violates the guide (종결어미 혼용, 존댓말, 번역투, 이중 피동, 음차, 코드 심볼 노출, 표기 흔들림). RULES:
   - STYLE-ONLY edits: preserve the meaning and every fact exactly. Never add, remove, or weaken a claim. Keep the file:line references embedded in summary.text intact.
   - NEVER change: screenId, annotation keys, jspFile, graphNodeId, handler (target/chain/evidence/confidence — evidence snippets are verbatim), confidence values, or JSON shape/keys.
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
