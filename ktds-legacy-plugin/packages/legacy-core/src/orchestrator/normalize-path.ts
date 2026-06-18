import { isAbsolute, relative, basename } from "node:path";

/**
 * Reproduce UA core's `sanitiseFilePaths` per-node behavior for a single path.
 *
 * Mirrors understand-anything-plugin/packages/core/src/persistence/index.ts:38-67
 * (the `sanitiseFilePaths` function). Three cases:
 *   1. absolute path INSIDE projectRoot  -> path relative to projectRoot
 *   2. absolute path OUTSIDE projectRoot -> basename only (leak nothing)
 *   3. already-relative path             -> unchanged (passthrough)
 *
 * Pure and deterministic. Forward-slash output follows node:path on POSIX;
 * `relative`/`basename` are used exactly as core does, so golden equivalence holds.
 */
export function normalizeKgPath(filePath: string, projectRoot: string): string {
  const normalRoot = projectRoot.endsWith("/") ? projectRoot : projectRoot + "/";

  if (!isAbsolute(filePath)) {
    // Already relative — nothing to do.
    return filePath;
  }

  if (filePath.startsWith(normalRoot) || filePath.startsWith(projectRoot)) {
    // Inside the project root — make it relative.
    return relative(projectRoot, filePath);
  }

  // Absolute but outside the project root — keep only the filename.
  return basename(filePath);
}
