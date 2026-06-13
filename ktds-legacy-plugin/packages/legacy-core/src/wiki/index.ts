// /understand-docs wiki (Stage-22, ADR-004) public surface. Each stage (T0..T8)
// adds its exports here without touching other module barrels.
export * from "./types.js";
export {
  slugify,
  toWikiTarget,
  layerDir,
  assignRelPaths,
  type SlugEntry,
} from "./slug.js";
export { renderFrontmatter } from "./frontmatter.js";
export { projectNotes, type ProjectNotesOptions } from "./project.js";
export { deriveLinks, type DeriveLinksResult } from "./links.js";
export { buildIndex } from "./index-gen.js";
export {
  injectHubLinks,
  WIKI_LINKS_FENCE_OPEN,
  WIKI_LINKS_FENCE_CLOSE,
} from "./hub-inject.js";
export {
  buildKnowledgeGraph,
  type HubArticle,
  type BuildKnowledgeGraphInput,
} from "./graph-emit.js";
export { renderNote, renderWikiSkeleton, WIKI_NOTE_STATUS_LINE } from "./render.js";
export { HUB_DEFS, type HubDef } from "./hubs.js";
export {
  generateWiki,
  type GenerateWikiOptions,
  type GenerateWikiResult,
  type WikiProseProvider,
} from "./orchestrate.js";
