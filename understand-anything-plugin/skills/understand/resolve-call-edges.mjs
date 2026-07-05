#!/usr/bin/env node
/**
 * resolve-call-edges.mjs — Phase 3.5 of /understand
 *
 * Deterministic call-edge resolver. The tree-sitter call graph is extracted
 * per-file (compute-batches.mjs → call-graph.json) but the final knowledge
 * graph's method-level `calls` edges were previously produced only
 * incidentally by the LLM batches, which each see only their own batch. At
 * scale that batch-locality collapses `calls` coverage to near zero. This
 * script resolves the extracted call graph into `calls` edges directly,
 * bypassing the LLM entirely.
 *
 * Tier 1 (name-only) emits an edge when the callee's bare method name
 * resolves to a single function node — either uniquely by name, or uniquely
 * after filtering candidates to imported files. This is precision-first but
 * has a real leak: when a Controller and its ServiceImpl share a method name
 * (a common Java/Spring pattern), self-removal from the candidate set can
 * leave the WRONG class as the sole "unique" match, producing reversed edges
 * (e.g. ServiceImpl -> Controller instead of Controller -> ServiceImpl).
 *
 * Tier 2 (receiver-aware) fixes this using the qualified callee text the
 * extractor already captures (`object.method`, e.g. `egovXxxService.selectX`).
 * The receiver identifier is matched against each candidate's owning class
 * simple name; only receiver-confirmed candidates are considered, so a
 * ServiceImpl calling `dao.selectX()` can never match a same-named Controller
 * method (the receiver `dao` does not match the Controller's class name).
 * Unqualified calls (no receiver) fall back to the Tier-1 name-only logic.
 *
 * Usage:
 *   node resolve-call-edges.mjs <PROJECT_ROOT>
 *
 * Reads:
 *   <ROOT>/.understand-anything/intermediate/assembled-graph.json
 *   <ROOT>/.understand-anything/intermediate/call-graph.json
 * Writes:
 *   <ROOT>/.understand-anything/intermediate/assembled-graph.json  (edges merged in)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Derives a function node's owning class simple name. Function nodes carry
 * no explicit `className` field, so this falls back to the file's basename
 * minus its extension (e.g. `EgovAdressBookServiceImpl.java` ->
 * `EgovAdressBookServiceImpl`), which holds for the one-public-class-per-file
 * Java convention this extractor targets.
 */
function classNameOf(node) {
  if (node.className) return node.className;
  const fp = node.filePath || '';
  const base = basename(fp);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(0, dot) : base;
}

/**
 * Classifies how strongly a receiver identifier matches a candidate class
 * simple name (both pre-lowercased by the caller):
 *   'strong'   — one is a prefix of the other (handles `xxxService` receiver
 *                vs `XxxServiceImpl` class, and vice versa)
 *   'contains' — substring match without a shared prefix
 *   null       — no relationship
 */
function receiverMatchKind(receiverLower, classLower) {
  if (!receiverLower || !classLower) return null;
  if (classLower.startsWith(receiverLower) || receiverLower.startsWith(classLower)) return 'strong';
  if (classLower.includes(receiverLower) || receiverLower.includes(classLower)) return 'contains';
  return null;
}

function main() {
  const projectRoot = process.argv[2];
  if (!projectRoot) {
    process.stderr.write('Usage: node resolve-call-edges.mjs <PROJECT_ROOT>\n');
    process.exit(1);
  }

  const interDir = join(projectRoot, '.understand-anything', 'intermediate');
  const graphPath = join(interDir, 'assembled-graph.json');
  const callGraphPath = join(interDir, 'call-graph.json');

  if (!existsSync(graphPath)) {
    process.stderr.write(`Error: assembled-graph.json not found at ${graphPath}\n`);
    process.exit(1);
  }
  if (!existsSync(callGraphPath)) {
    process.stderr.write(
      `Error: call-graph.json not found at ${callGraphPath} ` +
      `— run compute-batches.mjs first\n`,
    );
    process.exit(1);
  }

  const graph = JSON.parse(readFileSync(graphPath, 'utf-8'));
  const callGraph = JSON.parse(readFileSync(callGraphPath, 'utf-8'));
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // nameIndex: methodName -> [functionNodeId]
  const nameIndex = new Map();
  // set of existing function node ids (for source anchoring)
  const functionIds = new Set();
  // functionNodeId -> filePath (for import filtering)
  const fileOfNode = new Map();
  // functionNodeId -> lowercased owning-class simple name (for receiver matching)
  const classOfNode = new Map();
  for (const n of nodes) {
    if (n.type !== 'function') continue;
    functionIds.add(n.id);
    if (n.filePath) fileOfNode.set(n.id, n.filePath);
    classOfNode.set(n.id, classNameOf(n).toLowerCase());
    const name = n.name;
    if (!name) continue;
    if (!nameIndex.has(name)) nameIndex.set(name, []);
    nameIndex.get(name).push(n.id);
  }

  // importsOf: callerFilePath -> Set<importedFilePath>, from `imports` edges.
  const importsOf = new Map();
  for (const e of edges) {
    if (e.type !== 'imports') continue;
    const src = typeof e.source === 'string' ? e.source.replace(/^file:/, '') : null;
    const tgt = typeof e.target === 'string' ? e.target.replace(/^file:/, '') : null;
    if (!src || !tgt) continue;
    if (!importsOf.has(src)) importsOf.set(src, new Set());
    importsOf.get(src).add(tgt);
  }

  // Existing calls edge keys (for dedup against what's already there).
  const existingCallKeys = new Set();
  let existingCallsCount = 0;
  for (const e of edges) {
    if (e.type === 'calls') {
      existingCallsCount++;
      existingCallKeys.add(`${e.source}|${e.target}`);
    }
  }

  const counts = {
    total: 0,
    unanchored: 0,
    constructor: 0,
    external: 0,
    self: 0,
    resolved_unique: 0,
    resolved_import: 0,
    resolved_receiver: 0,
    receiver_nomatch: 0,
    ambiguous: 0,
  };
  let unqualifiedCount = 0;

  const emitted = new Map(); // "source|target" -> { source, target }
  const samples = [];

  for (const [relPath, entries] of Object.entries(callGraph)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      counts.total++;

      const sourceId = `function:${relPath}:${entry.caller}`;
      if (!functionIds.has(sourceId)) {
        counts.unanchored++;
        continue;
      }

      const rawCallee = String(entry.callee || '');
      if (rawCallee.startsWith('new ')) {
        counts.constructor++;
        continue;
      }

      // Parse into { receiver, method }: receiver is everything before the
      // LAST '.' (null for unqualified calls), method is the bare name used
      // as the nameIndex resolution key.
      const dot = rawCallee.lastIndexOf('.');
      const m = dot >= 0 ? rawCallee.slice(dot + 1) : rawCallee;
      const receiver = dot >= 0 ? rawCallee.slice(0, dot) : null;
      if (!receiver) unqualifiedCount++;
      if (!m) {
        counts.external++;
        continue;
      }

      const rawCandidates = nameIndex.get(m);
      if (!rawCandidates || rawCandidates.length === 0) {
        counts.external++;
        continue;
      }

      // Remove self.
      const candidates = rawCandidates.filter(id => id !== sourceId);
      if (candidates.length === 0) {
        counts.self++;
        continue;
      }

      let targetId = null;
      let resolutionKind = null;

      if (receiver) {
        // Receiver-aware (Tier 2): only receiver-confirmed candidates are
        // considered. A ServiceImpl calling `dao.selectX()` can never match
        // a same-named Controller method here — the receiver "dao" won't
        // strong-match the Controller's class name — so this is what closes
        // off the Tier-1 reversed-edge leak. No fallback to bare-name
        // singleton emission when the receiver doesn't confirm anything.
        const receiverLower = receiver.toLowerCase();
        const strongMatches = candidates.filter(
          id => receiverMatchKind(receiverLower, classOfNode.get(id) || '') === 'strong',
        );

        if (strongMatches.length === 1) {
          targetId = strongMatches[0];
          resolutionKind = 'resolved_receiver';
        } else if (strongMatches.length > 1) {
          // Tie-break among strong matches by longest shared prefix with the
          // receiver identifier — the more specific class name wins.
          const prefixLen = (a, b) => {
            let i = 0;
            while (i < a.length && i < b.length && a[i] === b[i]) i++;
            return i;
          };
          const scored = strongMatches.map(id => ({
            id,
            score: prefixLen(receiverLower, classOfNode.get(id) || ''),
          }));
          const maxScore = Math.max(...scored.map(s => s.score));
          const best = scored.filter(s => s.score === maxScore);
          if (best.length === 1) {
            targetId = best[0].id;
            resolutionKind = 'resolved_receiver';
          } else {
            counts.ambiguous++;
            continue;
          }
        } else {
          counts.receiver_nomatch++;
          continue;
        }
      } else {
        // Unqualified call: no receiver to confirm against, so keep the
        // Tier-1 name-only behavior — emit only when the bare name is truly
        // unambiguous, with the import-filter as a secondary tie-breaker.
        if (candidates.length === 1) {
          targetId = candidates[0];
          resolutionKind = 'resolved_unique';
        } else {
          const imports = importsOf.get(relPath) || new Set();
          const inImport = candidates.filter(id => {
            const fp = fileOfNode.get(id);
            return fp && imports.has(fp);
          });
          if (inImport.length === 1) {
            targetId = inImport[0];
            resolutionKind = 'resolved_import';
          } else {
            counts.ambiguous++;
            continue;
          }
        }
      }

      counts[resolutionKind]++;

      if (!targetId || targetId === sourceId) continue;
      const key = `${sourceId}|${targetId}`;
      if (existingCallKeys.has(key) || emitted.has(key)) continue;
      emitted.set(key, { source: sourceId, target: targetId });

      if (samples.length < 12) {
        const srcName = sourceId.split(':').pop();
        const tgtName = targetId.split(':').pop();
        const srcFile = basename(relPath);
        const tgtFile = basename(fileOfNode.get(targetId) || '');
        samples.push(`${srcName} (${srcFile}) -> ${tgtName} (${tgtFile})`);
      }
    }
  }

  // Merge emitted edges into the graph.
  const newEdges = [...emitted.values()].map(({ source, target }) => ({
    source,
    target,
    type: 'calls',
    direction: 'forward',
    weight: 0.8,
  }));
  graph.edges = [...edges, ...newEdges];

  writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');

  const afterCallsCount = existingCallsCount + newEdges.length;

  // ── Summary to STDERR ────────────────────────────────────────────────────
  const w = process.stderr.write.bind(process.stderr);
  w('\n── resolve-call-edges (Tier 1 + Tier 2 receiver-aware) summary ────\n');
  w(`  total call entries       : ${counts.total}\n`);
  w(`  unqualified (no receiver): ${unqualifiedCount}\n`);
  w(`  unanchored (no src node) : ${counts.unanchored}\n`);
  w(`  constructor (new X)      : ${counts.constructor}\n`);
  w(`  external / JDK (no name) : ${counts.external}\n`);
  w(`  self (only self match)   : ${counts.self}\n`);
  w(`  resolved_receiver        : ${counts.resolved_receiver}\n`);
  w(`  receiver_nomatch         : ${counts.receiver_nomatch}\n`);
  w(`  resolved_unique          : ${counts.resolved_unique}\n`);
  w(`  resolved_import          : ${counts.resolved_import}\n`);
  w(`  ambiguous (skipped)      : ${counts.ambiguous}\n`);
  w(`  final_calls_edges_added  : ${newEdges.length}\n`);
  w(`  calls edges before       : ${existingCallsCount}\n`);
  w(`  calls edges after        : ${afterCallsCount}\n`);
  w('  ── sample emitted edges (up to 12) ──\n');
  for (const s of samples) {
    w(`    ${s}\n`);
  }
  w('─────────────────────────────────────────────────────────────────\n');
}

main();
