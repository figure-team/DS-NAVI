#!/usr/bin/env node
/**
 * ktds DS-NAVI — 5-manifest 2-scheme version-sync gate (P0.3 / P0 exit gate b).
 *
 * Scheme A (UA base-tracking, `<base>-ktds.N`): 3 platform plugin.json + UA plugin.json + UA package.json.
 * Scheme B (ktds semver, `X.Y.Z`): legacy plugin.json + legacy-core package.json.
 *
 * Reimplemented for the ktds fork (no code ported from the blueprint).
 * Exit 0 = all manifests in sync; exit 1 = drift or malformed version.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionOf = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8')).version

// Scheme A — UA base-tracking. All must share one `<base>-ktds.N` version.
const SCHEME_A = [
  '.claude-plugin/plugin.json',
  '.copilot-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  'understand-anything-plugin/.claude-plugin/plugin.json',
  'understand-anything-plugin/package.json',
]
// Scheme B — ktds semver. All must share one `X.Y.Z` version.
const SCHEME_B = [
  'ktds-legacy-plugin/.claude-plugin/plugin.json',
  'ktds-legacy-plugin/packages/legacy-core/package.json',
]

const SCHEME_A_RE = /^\d+\.\d+\.\d+-ktds\.\d+$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/

const errors = []

function checkScheme(name, files, re, label) {
  const seen = files.map((file) => {
    let v
    try {
      v = versionOf(file)
    } catch (err) {
      errors.push(`[${name}] ${file}: cannot read version (${err.message})`)
      return { file, v: undefined }
    }
    if (typeof v !== 'string' || !re.test(v)) {
      errors.push(`[${name}] ${file}: version "${v}" does not match ${label}`)
    }
    return { file, v }
  })
  const distinct = [...new Set(seen.map((s) => s.v).filter((v) => v !== undefined))]
  if (distinct.length > 1) {
    errors.push(
      `[${name}] versions out of sync: ${seen.map((s) => `${s.file}=${s.v}`).join(', ')}`,
    )
  }
  return distinct[0]
}

const aVer = checkScheme('Scheme A (UA base-ktds)', SCHEME_A, SCHEME_A_RE, '<base>-ktds.N')
const bVer = checkScheme('Scheme B (ktds semver)', SCHEME_B, SEMVER_RE, 'X.Y.Z')

if (errors.length > 0) {
  console.error('✗ version-sync-check FAILED:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log(
  `✓ version-sync-check OK — Scheme A=${aVer} (${SCHEME_A.length} manifests), ` +
    `Scheme B=${bVer} (${SCHEME_B.length} manifests)`,
)
