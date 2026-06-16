# Understand Anything

## Project Overview
An open-source tool combining LLM intelligence + static analysis to produce interactive dashboards for understanding codebases.

## Prerequisites
- Node.js >= 22 (developed on v24)
- pnpm >= 10 (pinned via `packageManager` field in root `package.json`)

## Architecture
- **Monorepo** with pnpm workspaces
- **understand-anything-plugin/** — Claude Code plugin containing all source code:
  - **packages/core** — Shared analysis engine (types, persistence, tree-sitter, search, schema, tours, plugins)
  - **packages/dashboard** — React + TypeScript web dashboard (React Flow, Zustand, TailwindCSS v4)
  - **src/** — Skill TypeScript source for `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard`
  - **skills/** — Skill definitions (`/understand`, `/understand-dashboard`, etc.)
  - **agents/** — Agent definitions (project-scanner, file-analyzer, architecture-analyzer, tour-builder, graph-reviewer)

## Dashboard
- Dark luxury theme: deep blacks (#0a0a0a), gold/amber accents (#d4a574), DM Serif Display typography
- Graph-first layout: 75% graph + 360px right sidebar
- No ChatPanel or Monaco Editor
- Sidebar tabs: `Info` (ProjectOverview default → NodeInfo when node selected → LearnPanel in Learn persona, composing) and `Files` (FileExplorer tree built from the structural graph)
- Code viewer: prism-react-renderer source viewer that slides up from the bottom on file node click; an expand button promotes it into a full-screen modal. Source content is fetched from the dev server's `/file-content.json` endpoint, gated by access token + a graph-derived path allowlist
- Schema validation on graph load with error banner
- **Domain mode = independent full-page experience (ADR-006):** when a `domain-graph.json` is present the dashboard lands on the domain tab. Domain mode replaces the U-A React Flow `DomainGraphView` with a 3-screen prototype-faithful flow: `DomainMapView` (card landing + stats) → `FlowListView` (master-detail flow list + inline spine) → `FlowSpineView` (cross-layer **main spine**: a flow's backend call chain laid out horizontally across API→Service→DAO→DB(+Other) lanes with continuous edges, no PortalNode). Layer is derived heuristically (`src/utils/flowLayer.ts` — engine emits no per-node layer) with an `unknown ≤15%` test gate; spine layout is pure JS coordinates (`flowSpineLayout.ts`, no ELK). The header tab group `[구조·도메인·문서]` + `[Diff·영향도]` is unified; domain mode is full-bleed (U-A chrome hidden, breadcrumb in header, Diff/영향도 excluded). v1 = backend flows only; branch-folding is v2. Test fixture: `public/domain-graph.json` (generator `scripts/gen-domain-graph.mjs`); dev server serves data from `.understand-anything/`

## Agent Pipeline
- Agents write intermediate results to `.understand-anything/intermediate/` on disk (not returned to context)
- Agent model field is omitted from frontmatter so each platform falls back to its configured default — `inherit` was a Claude Code-only keyword that opencode (and similar tools) treated as a literal model id and rejected with `ProviderModelNotFoundError` (see #167)
- `/understand` auto-triggers `/understand-dashboard` after completion
- Intermediate files cleaned up after graph assembly

## Key Commands
- `pnpm install` — Install all dependencies
- `pnpm --filter @understand-anything/core build` — Build the core package
- `pnpm --filter @understand-anything/core test` — Run core tests
- `pnpm --filter @understand-anything/skill build` — Build the plugin package
- `pnpm test` — Run all tests (skill tests live at repo-root `tests/skill/`, picked up by root `vitest.config.ts`)
- `pnpm --filter @understand-anything/dashboard build` — Build the dashboard
- `pnpm dev:dashboard` — Start dashboard dev server
- `pnpm lint` — Run ESLint across the project

## Conventions
- TypeScript strict mode everywhere
- Vitest for testing
- ESM modules (`"type": "module"`)
- Knowledge graph JSON lives in `.understand-anything/` directory of analyzed projects
- Core uses subpath exports (`./search`, `./types`, `./schema`) to avoid pulling Node.js modules into browser

## Gotchas
- **tree-sitter**: Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` — native bindings fail on darwin/arm64 + Node 24
- **Dashboard imports**: Dashboard must only import from core's browser-safe subpath exports (`./search`, `./types`, `./schema`), never the main entry point which pulls in Node.js modules

## Scripts
- `scripts/generate-large-graph.mjs` — Generates a fake knowledge graph for performance testing (e.g. large-graph layout). Writes to `.understand-anything/knowledge-graph.json`. Usage: `node scripts/generate-large-graph.mjs [nodeCount]` (default: 3000 nodes). Not part of the production pipeline.

## Versioning

**Understand-anything (U-A) version = base-tracking scheme `<upstream-base>-ktds.<N>`.**
This fork follows the upstream `Egonex-AI/Understand-Anything` lineage, so the version number tracks **which upstream U-A release the fork is built on** plus a ktds increment — it does NOT invent an independent number. Format:
- `<upstream-base>` = the upstream `understand-anything-plugin/package.json` version the current tree is merged up to (e.g. `2.7.6`). Find it via `git merge-base origin/main upstream/main` → that commit's U-A version.
- `<N>` = ktds release counter on that base, starting at `1`.
- Current: **`2.7.6-ktds.1`** (fork sits on upstream 2.7.6; no upstream code merged yet beyond the fork point).

Bump rules:
- **ktds-only changes** (no upstream merge): increment `N` → `2.7.6-ktds.2`, `2.7.6-ktds.3`, …
- **After merging upstream** (e.g. up to 2.7.7): set base to the new upstream version and reset N → `2.7.7-ktds.1`.

> History note: the fork previously self-incremented to a `2.8.x` line independent of upstream (it was never an upstream merge — just self-bumping from the 2.7.6 base). That collided semantically with upstream's own 2.x line, so versioning was reset to base-tracking. `2.7.6-ktds.1` may appear "lower" than the old `2.8.3` to tooling that compares semver — acceptable because the fork is not published into the same registry as upstream U-A.

When pushing to remote, keep the U-A version in sync across **all five** files:
- `understand-anything-plugin/package.json` → `"version"` field
- `understand-anything-plugin/.claude-plugin/plugin.json` → `"version"` field
- `.claude-plugin/plugin.json` → `"version"` field
- `.cursor-plugin/plugin.json` → `"version"` field
- `.copilot-plugin/plugin.json` → `"version"` field

Note: `.claude-plugin/marketplace.json` does **not** carry a version — the `plugins[]` entry only supports `name` and `source`, and adding other fields causes marketplace schema validation failures.

ktds-legacy plugin (this fork's addition) carries its own version in **two** more files — bump together when ktds code changes:
- `ktds-legacy-plugin/.claude-plugin/plugin.json` → `"version"` field
- `ktds-legacy-plugin/packages/legacy-core/package.json` → `"version"` field

## ktds-legacy development
Module map + shared-helper conventions: **`docs/ktds/ARCHITECTURE.md`**. When writing ktds engine/CLI code, reuse the shared homes instead of re-duplicating: `src/utils/{cmp,collections,fs}.ts`, `src/test-helpers.ts` (test fixtures), `scripts/cli-utils.mjs` (CLI arg parsing/handle guards), and `CONFIDENCE_VALUES` in `types.ts` (single source for the Confidence type + Zod enum). CLI `.mjs` scripts are thin wrappers — keep business logic in the tested engine and load it via `await import(await ensureBuilt())`.

## Testing Local Plugin Changes

Claude Code caches installed plugins at `~/.claude/plugins/cache/understand-anything/understand-anything/<version>/`. Symlinks don't work because Claude's Search/Glob tools can't follow them. To test local changes:

1. **Build the packages:**
   ```bash
   pnpm --filter @understand-anything/core build
   pnpm --filter @understand-anything/skill build
   ```

2. **Find the installed version** (must match what the marketplace currently serves):
   ```bash
   ls ~/.claude/plugins/cache/understand-anything/understand-anything/
   ```

3. **Copy your local plugin into the cache**, replacing `<VERSION>` with the version from step 2:
   ```bash
   rm -rf ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>
   cp -R ./understand-anything-plugin ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>
   ```

4. **Start a fresh Claude Code session** (existing sessions cache the old prompts in context).

5. **Run `/understand --full`** in the target project to verify.

**Re-sync after further changes:**
```bash
pnpm --filter @understand-anything/core build && \
cp -R ./understand-anything-plugin/* ~/.claude/plugins/cache/understand-anything/understand-anything/<VERSION>/
```

**To revert to upstream:** Uninstall and reinstall the plugin from the marketplace — it repopulates the cache from the upstream repo.
