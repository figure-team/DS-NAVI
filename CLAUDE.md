# Understand Anything

## Project Overview
An open-source tool combining LLM intelligence + static analysis to produce interactive dashboards for understanding codebases.

## Agent Pipeline
- Agents write intermediate results to `.understand-anything/intermediate/` on disk (not returned to context)
- Agent model field is omitted from frontmatter so each platform falls back to its configured default — `inherit` was a Claude Code-only keyword that opencode (and similar tools) treated as a literal model id and rejected with `ProviderModelNotFoundError` (see #167)
- `/understand` auto-triggers `/understand-dashboard` after completion
- Intermediate files cleaned up after graph assembly

## Conventions
- Skill tests live at repo-root `tests/skill/`, picked up by root `vitest.config.ts` (`pnpm test` includes them)
- Knowledge graph JSON lives in `.understand-anything/` directory of analyzed projects
- Core uses subpath exports (`./search`, `./types`, `./schema`) to avoid pulling Node.js modules into browser

## Gotchas
- **tree-sitter**: Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` — native bindings fail on darwin/arm64 + Node 24
- **Dashboard imports**: Dashboard must only import from core's browser-safe subpath exports (`./search`, `./types`, `./schema`), never the main entry point which pulls in Node.js modules

## Versioning
When pushing to remote, bump the version in **all five** of these files (keep them in sync):
- `understand-anything-plugin/package.json` → `"version"` field
- `understand-anything-plugin/.claude-plugin/plugin.json` → `"version"` field
- `.claude-plugin/plugin.json` → `"version"` field
- `.cursor-plugin/plugin.json` → `"version"` field
- `.copilot-plugin/plugin.json` → `"version"` field

Note: `.claude-plugin/marketplace.json` does **not** carry a version — the `plugins[]` entry only supports `name` and `source`, and adding other fields causes marketplace schema validation failures.

## Testing Local Plugin Changes

See the `test-local-plugin-cache` skill (`.claude/skills/test-local-plugin-cache/SKILL.md`) — cache-copy procedure for testing local plugin changes (symlinks don't work).
