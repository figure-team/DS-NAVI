// policy-fill-fanout.workflow.js — Workflow-tool script for /understand-policy LLM 보강 at scale
//
// Fans out one fill-writer agent per prep chunk so the ~2×N dispatch/ack
// round-trips never touch the main conversation context. Mirrors the proven
// /understand-map and /understand-screens fill fan-out harness (disk-guarded
// skip, deterministic audit, bounded re-dispatch). Citations are NOT authored
// blind: each chunk row carries a pre-verified anchor pre-cite (±40 lines,
// verbatim) the agent copies, plus source slices it may cite by exact line copy.
// Completion truth lives on disk (understand-policy.mjs fill-audit), never in
// acks. The deterministic anchor tables in policy-*.md are NEVER rewritten —
// fill-merge appends a sentinel-bounded 규범 진술 section and re-verifies every
// [확정] citation against the real file (mismatches removed, [확정]→[추정] demoted).
//
// args:
//   { projectRoot: string,   // absolute path of the analyzed project
//     cliScript: string,     // absolute path to understand-policy.mjs
//     chunkIds: string[],    // policy-fill-prep/index.json chunks[].chunkId
//     mode?: string,         // 'category' (default) | 'domain' — passed to fill-audit
//     model?: string,        // fill-writer model: 'inherit' (session, default here)
//                            // | 'sonnet' | 'haiku' | any model id
//     effort?: string,       // fill-writer reasoning effort (default 'low')
//     language?: string,     // output language for statements (default '한국어')
//     stylePath?: string,    // Korean prose style guide path (default: derived from cliScript
//                            // → <plugin>/templates/style/ko-prose.md; project override wins)
//     stylePass?: boolean }  // run the post-audit prose style review round (default true)


export const meta = {
  name: 'ktds-policy-fill-fanout',
  description: 'Fan out /understand-policy LLM 보강 fill chunks with disk-verified idempotent resume',
  whenToUse: 'Invoked by the /understand-policy skill when the fill row count exceeds the inline gate',
  phases: [
    { title: 'Fill', detail: 'one fill-writer agent per chunk, disk-guarded skip' },
    { title: 'Audit', detail: 'deterministic completeness audit + bounded re-dispatch' },
    { title: 'Style', detail: 'Korean prose style review — rewrite violating statements only' },
  ],
}

// Tolerate hosts that deliver args as a JSON-encoded string instead of an object.
const A = typeof args === 'string' ? JSON.parse(args) : args
const { projectRoot, cliScript, chunkIds, mode = 'category', model = 'inherit', effort = 'low', language = '한국어', stylePath, stylePass = true } = A ?? {}
if (!projectRoot || !cliScript || !Array.isArray(chunkIds) || chunkIds.length === 0) {
  throw new Error('args must provide { projectRoot, cliScript, chunkIds: [least one chunk id] }')
}

// fill-audit takes a --mode flag matching the prep mode so the domain path audits
// domain chunks. Category is the default; the flag is harmless for either.
const modeFlag = mode === 'domain' ? ' --mode domain' : ''

// Korean prose style guide (문체 규약): agents load it from disk themselves (workflow
// scripts have no fs access). Project override wins over the plugin-bundled default.
const styleGuidePath = stylePath || cliScript.replace(/scripts\/[^/]+$/, 'templates/style/ko-prose.md')
const styleRule =
  `   - STYLE (문체 규약): BEFORE writing any statement, read the style guide — first try ${projectRoot}/.understand-anything/templates/style/ko-prose.md, and if it does not exist read ${styleGuidePath}. Apply its rules (종결어미, 번역투 금지, 용어 표기 일관, few-shot 예시) to every statement you write. If neither file exists, skip silently and continue.
   - TERMS (용어 기준): if ${projectRoot}/.understand-anything/templates/style/ko-terms.md exists, read it and use its spellings as the canonical 표기 for every business term (사용자 확정 용어 — 최우선). Otherwise, if ${projectRoot}/.understand-anything/doc-output/policy-glossary.md exists, prefer its 용어 표기 for domain terms. These files fix spelling/naming ONLY — never copy them into citations. If absent, skip silently.`

// Model gate resolution: 'inherit' = session model (no override). Effort defaults
// low — template-guided Korean statements over pre-cited slices, not open-ended
// analysis. The audit re-dispatch corrects verbatim-citation slips.
const modelOpts = model === 'inherit' ? {} : { model }
const effortOpts = effort === 'inherit' ? {} : { effort }

const ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    skipped: { type: 'boolean' },
    rows: { type: 'number' },
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

const fillPrompt = (id, retryReason) => `You are writing ONE fill fragment chunk for the /understand-policy LLM 보강(정책서 규범 진술 채움).
${retryReason ? `\nThis is a RE-DISPATCH. Previous attempt was incomplete: ${retryReason}\n` : ''}
1. SKIP GUARD (idempotent resume) — run first:
   node ${cliScript} ${projectRoot} fill-audit --chunk ${id}${modeFlag}
   It prints one JSON line. If chunk ${id} is in "complete", do NOT rewrite anything — return the ack with skipped:true immediately.

2. Read your self-contained chunk (absolute path): ${projectRoot}/.spec/map/policy-fill-prep/${id}.json
   It carries everything you need: docId/title, rows[] (each with rowKey + subject + detail(원문) + anchor + pre-verified preCite), files[] source slices, and sliceOmitted[].

3. Write ${projectRoot}/.spec/map/policy-fill-frag/${id}.json — a PolicyFillFragment JSON:
   { "schemaVersion": 1, "chunkId": "${id}", "rows": [ { "rowKey", "statement", "confidence", "citations": [...] } ] }

   RULES (violations are machine-rejected by fill-audit / merge — no partial credit):
   - Language: every "statement" (규범 진술) you write is ${language}, business language (업무 언어). No code symbols in prose — read the anchor source and state the NORM the code enforces.
${styleRule}
   - COVERAGE: rows[] must contain EXACTLY one entry per chunk.rows[] rowKey. No rowKeys from outside the chunk. Copy each rowKey verbatim from the chunk.
   - CONFIDENCE (3-tier, fail-closed): "확정" REQUIRES citations.length ≥ 1 (file:line 근거 필수). Use "추정" for 구조/관례 based inference (근거 없어도 됨), "확인 필요" for what code can't settle (사람 확인 대상). Do NOT claim 확정 without a real citation.
   - CITATIONS (the load-bearing rule): for a 확정 row, copy the row's preCite object VERBATIM into citations (byte-for-byte snippet — do not rephrase/re-indent/translate/shorten). You may ADD a citation only by copying an EXACT line from a chunk.files[].slice.text with its real 1-based line number (slice.startLine + offset). NEVER invent or alter file paths, line numbers, or snippets. Include a "snippet" (≥8 chars) on every citation. A machine verifier in fill-merge re-opens the real file and compares every snippet — mismatches are removed, and a 확정 row left with zero surviving citations is demoted to 추정.
   - 앵커 보존: you are ONLY authoring the statement + confidence + citations. The deterministic anchor table in the doc stays untouched — merge appends your rows as a separate 규범 진술 section.

4. SELF-VERIFY: re-run the exact command from step 1. If chunk ${id} is still in "incomplete", fix your fragment ONCE according to the printed reason and re-verify.

5. ACK via structured output ONLY: { "chunkId": "${id}", "skipped": false, "rows": <count> }. Do NOT include fragment content, JSON bodies, or file lists in any text.`

const auditPrompt = () => `Run this exact command and nothing else:
node ${cliScript} ${projectRoot} fill-audit${modeFlag}
It prints a single JSON line: { "complete": [...], "incomplete": [{ "chunkId", "reason" }] }.
Return { incomplete } via structured output, copied verbatim from the command output. Do NOT attempt to fix, rewrite, or delete anything yourself.`

phase('Fill')
log(`Fanning out ${chunkIds.length} policy-fill chunks (mode=${mode}, model=${model}, effort=${effort}, disk-guarded skip)`)
const acks = await pipeline(chunkIds, id =>
  agent(fillPrompt(id), { label: `fill:${id}`, phase: 'Fill', schema: ACK, ...modelOpts, ...effortOpts }))

phase('Audit')
// Bounded re-dispatch: initial run + at most 2 re-injections, then whatever is
// still incomplete is surfaced as failed[] (never silently dropped) — the host
// reports it and fill-merge proceeds partially (missing rows kept as body).
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

// Style pass (문체 검수): separate from the completeness/citation gates — it only rewrites
// statements that violate the style guide, never rowKeys/citations/confidence. Compliant
// statements stay byte-identical, so re-runs on resume are harmless.
const STYLE_ACK = {
  type: 'object',
  properties: {
    chunkId: { type: 'string' },
    revised: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['chunkId', 'revised'],
}

const styleReviewPrompt = (id) => `You are a Korean prose STYLE REVIEWER for ONE fill fragment of /understand-policy.
1. Read the style guide — first try ${projectRoot}/.understand-anything/templates/style/ko-prose.md, else ${styleGuidePath}. If neither exists, return { "chunkId": "${id}", "revised": 0 } immediately.
   Also load the term base if present: ${projectRoot}/.understand-anything/templates/style/ko-terms.md (사용자 확정 표기 — 최우선), else ${projectRoot}/.understand-anything/doc-output/policy-glossary.md.
2. Read the fragment: ${projectRoot}/.spec/map/policy-fill-frag/${id}.json. If it does not exist, return { "chunkId": "${id}", "revised": 0 }.
3. Review ONLY rows[].statement against the guide. Rewrite a statement ONLY when it violates the guide (종결어미 혼용, 존댓말, 번역투, 이중 피동, 음차, 코드 심볼 노출, 표기 흔들림). RULES:
   - STYLE-ONLY edits: preserve the norm's meaning exactly. Never add, remove, or weaken a rule; never change values (숫자·한도·조건).
   - NEVER change: rowKey, confidence, any citations array or its {file,line,snippet} contents (snippets are verbatim evidence), or JSON shape/keys.
   - A compliant statement stays byte-identical. When in doubt, leave it unchanged.
4. If you changed anything, write the fragment back to the SAME path (valid JSON, same schema).
5. SELF-VERIFY: run \`node ${cliScript} ${projectRoot} fill-audit --chunk ${id}${modeFlag}\` — if the chunk turned "incomplete", fix your edit per the printed reason ONCE and re-verify.
6. ACK via structured output ONLY: { "chunkId": "${id}", "revised": <number of statements you rewrote> }. No fragment content in text.`

let styleRevised = 0
if (stylePass) {
  phase('Style')
  const styleTargets = chunkIds.filter(id => !failed.some(f => f.chunkId === id))
  log(`Style review over ${styleTargets.length} complete chunks (violating statements only)`)
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
