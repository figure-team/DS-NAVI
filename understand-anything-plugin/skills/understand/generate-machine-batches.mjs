#!/usr/bin/env node
/**
 * generate-machine-batches.mjs — deterministic node generation for machine-tier
 * batches (Phase 2, task A file tiering)
 *
 * Batches whose `tier` is `machine` in batches.json (pure markup/docs/csv plus
 * SQL-mapper XML — see compute-batches.mjs isMachineEligible/detectMapperXml)
 * get their `batch-<i>.json` output written directly by this script, with NO
 * LLM call: template summaries + structural data from the same parser registry
 * the analyzer agents use. SQL mappers additionally get deterministic
 * `defines_schema` edges to their DAO interface (namespace resolution) and
 * `related` edges between DB variants (`<name>_SQL_<db>.xml`).
 * The `batch-<i>.done` sentinel is written last, so the fan-out disk guard
 * (audit-batches.mjs) treats these batches as complete and the dispatch loop
 * never spends an agent on them. If this script fails for a batch, the audit
 * flags it incomplete and the normal LLM re-dispatch path picks it up — the
 * pipeline degrades to task-C behavior instead of losing the batch.
 *
 * Output nodes satisfy the same contract as file-analyzer output: GraphNode
 * with id/type/name/filePath/summary/tags/complexity, `{ nodes, edges }`
 * fragment shape, and node coverage ⊇ batch files (audit rule 3) — unreadable
 * files still get a minimal node so completeness never regresses.
 *
 * Usage:
 *   node generate-machine-batches.mjs <project-root> [--locale <id>]
 *
 * --locale: template language for summaries (en, ko; others fall back to en).
 */

import { createRequire } from 'node:module';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';

import { buildResult } from './extract-structure.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '../..');
const require = createRequire(resolve(pluginRoot, 'package.json'));

// Same core resolution as extract-structure.mjs (incl. Windows file:// rule).
let core;
try {
  core = await import(pathToFileURL(require.resolve('@understand-anything/core')).href);
} catch {
  core = await import(pathToFileURL(resolve(pluginRoot, 'packages/core/dist/index.js')).href);
}
const { TreeSitterPlugin, PluginRegistry, builtinLanguageConfigs, registerAllParsers } = core;

// ---------------------------------------------------------------------------
// Locale templates — deterministic summary strings. `en` is the fallback.
// ---------------------------------------------------------------------------
const TEMPLATES = {
  en: {
    html: (n, title) => `Static HTML page (${n} lines${title ? `, title: "${title}"` : ''}).`,
    stylesheet: (n) => `Stylesheet (${n} lines).`,
    doc: (n, secs) => `Documentation file (${n} lines${secs.length ? `; sections: ${secs.join(', ')}` : ''}).`,
    tabular: (rows, cols) => `Tabular data file (${rows} rows${cols.length ? `; columns: ${cols.join(', ')}` : ''}).`,
    mapper: (ns, db, total, parts, tables) => `SQL mapper (MyBatis/iBatis) for namespace ${ns}${db ? ` (${db})` : ''} — ${total} statements${parts ? ` (${parts})` : ''}${tables.length ? `; main tables: ${tables.join(', ')}` : ''}.`,
    generic: (ext, n) => `${ext.toUpperCase()} file (${n} lines).`,
    unreadable: () => 'File could not be read during analysis.',
  },
  ko: {
    html: (n, title) => `정적 HTML 페이지 (${n}라인${title ? `, 제목: "${title}"` : ''}).`,
    stylesheet: (n) => `스타일시트 (${n}라인).`,
    doc: (n, secs) => `문서 파일 (${n}라인${secs.length ? `; 섹션: ${secs.join(', ')}` : ''}).`,
    tabular: (rows, cols) => `표 형식 데이터 파일 (${rows}행${cols.length ? `; 컬럼: ${cols.join(', ')}` : ''}).`,
    mapper: (ns, db, total, parts, tables) => `${ns} 네임스페이스의${db ? ` ${db}용` : ''} SQL 매퍼(MyBatis/iBatis) — 쿼리 ${total}개${parts ? `(${parts})` : ''}${tables.length ? `, 주요 테이블: ${tables.join(', ')}` : ''}.`,
    generic: (ext, n) => `${ext.toUpperCase()} 파일 (${n}라인).`,
    unreadable: () => '분석 중 파일을 읽을 수 없었습니다.',
  },
};

// ---------------------------------------------------------------------------
// SQL-mapper XML parsing — mirrors compute-batches detectMapperXml scope.
// ---------------------------------------------------------------------------
const SQL_NON_TABLE_WORDS = new Set(['select', 'where', 'set', 'values', 'dual', 'id', 'on', 'as', 'into']);

/** Parse a MyBatis/iBatis mapper XML. Returns null when not a mapper. Exported for tests. */
export function parseMapperXml(filePath, content) {
  const ns = content.match(/<\s*(?:mapper|sqlMap)\b[^>]*\bnamespace\s*=\s*["']([^"']+)["']/);
  if (!ns) return null;
  const counts = {};
  let total = 0;
  for (const kind of ['select', 'insert', 'update', 'delete']) {
    counts[kind] = (content.match(new RegExp(`<\\s*${kind}\\b`, 'gi')) || []).length;
    total += counts[kind];
  }
  // Table names from SQL text. Negative lookbehind excludes the XML statement
  // tags themselves (`<update id=...>` must not yield "ID" as a table).
  const freq = new Map();
  for (const m of content.matchAll(/(?<!<)\b(?:from|join|into|update)\s+([A-Za-z_][A-Za-z0-9_.$]*)/gi)) {
    const name = m[1].toUpperCase();
    if (SQL_NON_TABLE_WORDS.has(name.toLowerCase())) continue;
    freq.set(name, (freq.get(name) || 0) + 1);
  }
  const tables = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([n]) => n);
  const db = filePath.match(/_SQL_([A-Za-z0-9]+)\.xml$/i)?.[1] ?? '';
  return { namespace: ns[1], counts, total, tables, db };
}

/**
 * Resolve a mapper namespace to its Java interface/DAO file. FQCN namespaces
 * (MyBatis 3 convention) match by path suffix; short-alias namespaces (egov
 * style, e.g. "FileManageDAO") match by file basename, then by exported
 * symbol. Ambiguous or missing → null (no edge — conservative).
 */
export function resolveMapperNamespace(ns, allPaths, exportsByPath) {
  const unique = hits => (hits.length === 1 ? hits[0] : null);
  if (ns.includes('.')) {
    return unique(allPaths.filter(p => p.endsWith(`/${ns.replace(/\./g, '/')}.java`)));
  }
  const byName = unique(allPaths.filter(p => p.endsWith(`/${ns}.java`) || p === `${ns}.java`));
  if (byName) return byName;
  return unique(Object.entries(exportsByPath ?? {})
    .filter(([, syms]) => Array.isArray(syms) && syms.includes(ns))
    .map(([p]) => p));
}

const TRUNC = (s, max = 60) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function complexityOf(nonEmptyLines) {
  if (nonEmptyLines < 50) return 'simple';
  if (nonEmptyLines <= 200) return 'moderate';
  return 'complex';
}

/** Node type + id prefix per the file-analyzer mapping table. */
function nodeKind(file) {
  if (file.fileCategory === 'docs') return { type: 'document', prefix: 'document' };
  if (file.fileCategory === 'data') return { type: 'table', prefix: 'table' };
  return { type: 'file', prefix: 'file' }; // markup → file (treated like code)
}

/**
 * Build the GraphNode for one machine-tier file. Pure except for the content
 * argument (already read by the caller); exported for unit tests.
 * `mapperInfo` is the parseMapperXml result for SQL-mapper XML files (null otherwise).
 */
export function buildMachineNode(file, content, t, structResult, mapperInfo = null) {
  const { type, prefix } = mapperInfo ? { type: 'config', prefix: 'config' } : nodeKind(file);
  const ext = file.path.includes('.') ? file.path.slice(file.path.lastIndexOf('.') + 1) : '';
  const base = {
    id: `${prefix}:${file.path}`,
    type,
    name: basename(file.path),
    filePath: file.path,
  };

  if (content === null) {
    return {
      ...base,
      summary: t.unreadable(),
      tags: [file.fileCategory, 'machine-tier'],
      complexity: 'simple',
    };
  }

  const lines = content.split('\n');
  const totalLines = content.endsWith('\n') ? Math.max(0, lines.length - 1) : lines.length;
  const nonEmpty = lines.filter(l => l.trim().length > 0).length;

  let summary;
  let tags;
  if (mapperInfo) {
    const parts = ['select', 'insert', 'update', 'delete']
      .filter(k => mapperInfo.counts[k] > 0)
      .map(k => `${k} ${mapperInfo.counts[k]}`)
      .join('/');
    summary = t.mapper(mapperInfo.namespace, mapperInfo.db, mapperInfo.total, parts, mapperInfo.tables);
    tags = ['configuration', 'database', 'sql-mapper', 'machine-tier'];
  } else if (/^html?$/i.test(ext)) {
    const m = content.match(/<title[^>]*>([^<]*)<\/title>/i);
    summary = t.html(totalLines, m ? TRUNC(m[1].trim()) : '');
    tags = ['markup', 'static-page', 'machine-tier'];
  } else if (file.fileCategory === 'markup') {
    summary = t.stylesheet(totalLines);
    tags = ['markup', 'stylesheet', 'machine-tier'];
  } else if (file.fileCategory === 'docs') {
    const secs = (structResult?.sections ?? []).slice(0, 3).map(s => TRUNC(String(s.heading), 40));
    summary = t.doc(totalLines, secs);
    tags = ['documentation', 'machine-tier'];
  } else if (file.fileCategory === 'data') {
    const sep = /\.tsv$/i.test(file.path) ? '\t' : ',';
    const header = (lines[0] ?? '').split(sep).map(c => c.trim()).filter(Boolean);
    const cols = header.slice(0, 5).map(c => TRUNC(c, 30));
    summary = t.tabular(Math.max(0, totalLines - 1), cols);
    tags = ['data', 'tabular', 'machine-tier'];
  } else {
    summary = t.generic(ext || file.language || 'text', totalLines);
    tags = [file.fileCategory, 'machine-tier'];
  }

  return { ...base, summary, tags, complexity: complexityOf(nonEmpty) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const positional = [];
  let locale = 'en';
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--locale') locale = process.argv[++i] ?? 'en';
    else positional.push(a);
  }
  const projectRoot = positional[0] ? resolve(positional[0]) : null;
  if (!projectRoot) {
    process.stderr.write('Usage: node generate-machine-batches.mjs <project-root> [--locale <id>]\n');
    process.exit(1);
  }
  const t = TEMPLATES[locale] ?? TEMPLATES.en;

  const intermediateDir = join(projectRoot, '.understand-anything', 'intermediate');
  const batchesPath = join(intermediateDir, 'batches.json');
  if (!existsSync(batchesPath)) {
    process.stderr.write(`Error: batches.json not found at ${batchesPath}\n`);
    process.exit(1);
  }
  const batchesDoc = JSON.parse(readFileSync(batchesPath, 'utf-8'));
  const { batches, exportsByPath } = batchesDoc;
  const machineBatches = (batches ?? []).filter(b => b.tier === 'machine');
  if (machineBatches.length === 0) {
    process.stderr.write('Info: generate-machine-batches: no machine-tier batches — nothing to do\n');
    console.log(JSON.stringify({ generated: 0, files: 0 }));
    return;
  }

  // Full project path list for namespace→Java resolution. scan-result.json is
  // the complete set even on incremental runs (batches.json may be filtered).
  let allPaths = [];
  try {
    const scan = JSON.parse(readFileSync(join(intermediateDir, 'scan-result.json'), 'utf-8'));
    allPaths = (scan.files ?? []).map(f => f.path);
  } catch {
    allPaths = (batches ?? []).flatMap(b => b.files.map(f => f.path));
  }

  // Parser registry (markdown sections etc.); a failed init degrades to
  // template-only summaries — never fatal, structure fields are optional here.
  let registry = null;
  try {
    const tsPlugin = new TreeSitterPlugin(builtinLanguageConfigs.filter(c => c.treeSitter));
    await tsPlugin.init();
    registry = new PluginRegistry();
    registry.register(tsPlugin);
    registerAllParsers(registry);
  } catch (err) {
    process.stderr.write(`Warning: generate-machine-batches: parser registry init failed (${err.message}) — template-only summaries\n`);
  }

  // Pass 1 — build nodes/edges per batch; collect DB-variant groups globally
  // (variants of one mapper can straddle a batch split, so pairing is global).
  let fileCount = 0;
  let mapperCount = 0;
  let daoEdgeCount = 0;
  const prepared = [];
  const variantGroups = new Map(); // groupKey → [{ path, nodeId, edges }]
  for (const b of machineBatches) {
    const nodes = [];
    const edges = [];
    for (const file of b.files) {
      let content = null;
      try {
        content = readFileSync(join(projectRoot, file.path), 'utf-8');
      } catch {
        // fall through — minimal node keeps audit coverage complete
      }

      const mapperInfo = content !== null && /\.xml$/i.test(file.path)
        ? parseMapperXml(file.path, content)
        : null;

      let structResult = null;
      if (content !== null && registry && !mapperInfo) {
        try {
          const analysis = registry.analyzeFile(file.path, content);
          const ls = content.split('\n');
          const totalLines = content.endsWith('\n') ? Math.max(0, ls.length - 1) : ls.length;
          const nonEmpty = ls.filter(l => l.trim().length > 0).length;
          structResult = buildResult(file, totalLines, nonEmpty, analysis, null, b.batchImportData);
        } catch {
          // parser failure → template-only node
        }
      }

      const node = buildMachineNode(file, content, t, structResult, mapperInfo);
      nodes.push(node);

      if (mapperInfo) {
        mapperCount++;
        // Mapper → DAO interface (namespace resolution). Deterministic and
        // complete — the LLM path only ever caught these when mapper and DAO
        // landed in the same batch (egov: 0/1226).
        const dao = resolveMapperNamespace(mapperInfo.namespace, allPaths, exportsByPath);
        if (dao) {
          edges.push({ source: node.id, target: `file:${dao}`, type: 'defines_schema', direction: 'forward', weight: 0.8 });
          daoEdgeCount++;
        }
        // DB-variant grouping: EgovFile_SQL_altibase.xml ↔ ..._mysql.xml etc.
        if (mapperInfo.db) {
          const key = file.path.replace(/_SQL_[A-Za-z0-9]+\.xml$/i, '');
          if (!variantGroups.has(key)) variantGroups.set(key, []);
          variantGroups.get(key).push({ path: file.path, nodeId: node.id, edges });
        }
      }

      for (const target of b.batchImportData?.[file.path] ?? []) {
        edges.push({ source: node.id, target: `file:${target}`, type: 'imports', direction: 'forward', weight: 0.7 });
      }
      fileCount++;
    }
    prepared.push({ b, nodes, edges });
  }

  // Pass 2 — DB-variant `related` edges: each variant links to the group's
  // first (path-sorted) member; the edge lives in the source file's batch.
  let variantEdgeCount = 0;
  for (const members of variantGroups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b2) => a.path.localeCompare(b2.path));
    for (let i = 1; i < members.length; i++) {
      members[i].edges.push({
        source: members[i].nodeId, target: members[0].nodeId,
        type: 'related', direction: 'forward', weight: 0.6,
      });
      variantEdgeCount++;
    }
  }

  // Pass 3 — write. Stale parts and sentinel removed first, fragment written,
  // fresh sentinel LAST (audit trusts the sentinel only with full coverage).
  for (const { b, nodes, edges } of prepared) {
    const staleRe = new RegExp(`^batch-${b.batchIndex}(?:-part-\\d+)?\\.(?:json|done)$`);
    for (const f of readdirSync(intermediateDir)) {
      if (staleRe.test(f)) rmSync(join(intermediateDir, f), { force: true });
    }
    writeFileSync(join(intermediateDir, `batch-${b.batchIndex}.json`), JSON.stringify({ nodes, edges }, null, 2), 'utf-8');
    writeFileSync(join(intermediateDir, `batch-${b.batchIndex}.done`), '', 'utf-8');
  }

  process.stderr.write(
    `Info: generate-machine-batches: wrote ${machineBatches.length} machine-tier batches ` +
    `(${fileCount} files incl. ${mapperCount} SQL mappers → ${daoEdgeCount} DAO edges, ` +
    `${variantEdgeCount} variant edges; locale ${TEMPLATES[locale] ? locale : `${locale}→en fallback`}) — no LLM calls\n`,
  );
  console.log(JSON.stringify({
    generated: machineBatches.length, files: fileCount,
    mappers: mapperCount, daoEdges: daoEdgeCount, variantEdges: variantEdgeCount,
  }));
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    const argvPath = realpathSync(process.argv[1]);
    return modulePath === argvPath;
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main().catch(err => {
    process.stderr.write(`Error: generate-machine-batches: ${err.message}\n`);
    process.exit(1);
  });
}
