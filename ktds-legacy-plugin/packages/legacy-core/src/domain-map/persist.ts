import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CANDIDATES_FILENAME,
  CENSUS_FILENAME,
  EDGES_FILENAME,
  ROUTES_FILENAME,
  SKELETON_FILENAME,
  SkeletonReportSchema,
  SLICES_FILENAME,
  SPEC_MAP_DIR,
  type CandidatesReport,
  type CensusReport,
  type EdgesReport,
  type RoutesReport,
  type SkeletonReport,
  type SlicesReport,
} from "./types.js";

const execFileAsync = promisify(execFile);

// .spec/map/ persistence (ADR D6). Serialization is the determinism boundary:
// JSON.stringify preserves construction order, and every producer constructs
// objects in schema order with pre-sorted arrays, so same input → same bytes.

export function specMapDir(projectRoot: string): string {
  return path.join(projectRoot, ".spec", SPEC_MAP_DIR);
}

/** Stable JSON serialization: 2-space indent + trailing newline. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export async function writeMapArtifact(
  projectRoot: string,
  filename: string,
  value: unknown,
): Promise<string> {
  const dir = specMapDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  // temp+rename: crash가 절단된 산출물을 남기지 않는다(리뷰 반영). 산출물
  // 집합 전체의 원자성은 없음 — 재실행이 전체를 재생성해 자가 치유한다.
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, stableJson(value), "utf-8");
  await fs.rename(tmpPath, filePath);
  return filePath;
}

export async function writeCensus(
  projectRoot: string,
  census: CensusReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, CENSUS_FILENAME, census);
}

export async function writeRoutes(
  projectRoot: string,
  routes: RoutesReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, ROUTES_FILENAME, routes);
}

export async function writeEdges(
  projectRoot: string,
  edges: EdgesReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, EDGES_FILENAME, edges);
}

export async function writeSlices(
  projectRoot: string,
  slices: SlicesReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, SLICES_FILENAME, slices);
}

export async function writeCandidates(
  projectRoot: string,
  candidates: CandidatesReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, CANDIDATES_FILENAME, candidates);
}

export async function writeSkeleton(
  projectRoot: string,
  skeleton: SkeletonReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, SKELETON_FILENAME, skeleton);
}

/** 디스크의 skeleton.json — 부재 시 null, 손상은 throw (fail-closed). */
export async function readSkeleton(
  projectRoot: string,
): Promise<SkeletonReport | null> {
  let raw: string;
  try {
    raw = await fs.readFile(
      path.join(specMapDir(projectRoot), SKELETON_FILENAME),
      "utf-8",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return SkeletonReportSchema.parse(JSON.parse(raw));
}

/** HEAD commit hash, or null outside a git work tree (SVN/no-VCS projects). */
export async function gitCommitHash(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
    });
    const hash = stdout.trim();
    return /^[0-9a-f]{40}$/.test(hash) ? hash : null;
  } catch {
    return null;
  }
}
