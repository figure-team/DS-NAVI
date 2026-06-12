import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ImpactResult } from "./types.js";

// T10 — 대시보드 오버레이 (ADR-002 부록 A). impact.json의 시드/도달 집합을
// U-A 대시보드가 이미 소비하는 입력 계약 `.understand-anything/diff-overlay.json`
// (understand-diff SKILL.md §8)으로 변환한다. U-A 코드·스킬·산출물 무수정 —
// 서버 엔드포인트(vite.config.ts /diff-overlay.json)·로더(App.tsx)·렌더
// (CustomNode ring/fade·DiffToggle)가 전부 기성품이고, 이 파일은 U-A가 "소비"
// 하는 입력일 뿐이다.
//
// 계약 매핑: changedNodeIds = 시드, affectedNodeIds = (상류∪하류)−시드
// (계약 명시: "excluding changedNodeIds"). App.tsx는 두 배열 존재 +
// changedNodeIds.length>0 만 검사하므로 ktds 확장 필드(ktdsImpact)는 무해하다.
// 한계(부록 A 명시): diff 의미론 2분류뿐 — 시드/상류/하류 3색·깊이·API/DB 표는
// 표현 불가(필요 시 fork 수정으로 상승, 이 조인 로직은 재사용).

export const DIFF_OVERLAY_FILENAME = "diff-overlay.json";
/** 오버레이 출처 마커 — 다른 생산자(/understand-diff)의 파일과 경합 판별용. */
export const OVERLAY_BASE_BRANCH = "ktds-impact";

export interface KgOverlayNode {
  id: string;
  type: string;
  filePath: string;
}

export interface OverlayUnresolved {
  relPath: string;
  reason: string;
}

/** diff-overlay.json 본문 (U-A 계약 필드 + ktds 확장). */
export interface DiffOverlay {
  version: "1.0.0";
  baseBranch: typeof OVERLAY_BASE_BRANCH;
  generatedAt: string;
  changedFiles: string[];
  changedNodeIds: string[];
  affectedNodeIds: string[];
  /** ktds 확장 — App.tsx가 읽지 않는 부가 정보(무해). */
  ktdsImpact: {
    gitCommit: string | null;
    seedCount: number;
    upstreamFileCount: number;
    downstreamFileCount: number;
    unresolved: OverlayUnresolved[];
  };
}

export interface PublishOverlayResult {
  path: string;
  overlay: DiffOverlay;
  /** 다른 생산자의 기존 오버레이를 .bak으로 보존했는지. */
  backedUp: boolean;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * KG 노드 filePath → 프로젝트 상대 경로 정규화. U-A dev 서버는 서빙 시점에
 * 절대경로를 상대화하지만(vite normalizeGraphPath) 이 변환기는 **디스크 원본**
 * KG를 읽으므로 정규화를 직접 수행해야 한다 — 안 하면 절대경로 KG 프로젝트에서
 * 전건 미조인이 된다(중간 점검 비평 반영). vite와 방향은 같되 **더 엄격**:
 * dot-segment(`.`/`..`)는 접지 않고 거부하고, 절대경로는 분리자 경계까지 요구
 * (`/a/b` 루트에서 `/a/bc/x` 불허) — 미조인은 unresolved로 표면화되므로
 * fail-closed가 오답보다 낫다. 루트 밖 절대경로·순회 세그먼트는 null(매칭 불가).
 */
export function normalizeKgPath(filePath: string, projectRoot: string): string | null {
  let p = filePath.replace(/\\/g, "/");
  const root = path.resolve(projectRoot).replace(/\\/g, "/").replace(/\/+$/, "");
  const isAbs = p.startsWith("/") || /^[A-Za-z]:\//.test(p);
  if (isAbs) {
    if (p === root || !p.startsWith(root + "/")) return null;
    p = p.slice(root.length + 1);
  }
  if (p.includes("\0")) return null;
  const segs = p.split("/").filter((s) => s.length > 0);
  if (segs.length === 0 || segs.some((s) => s === "." || s === "..")) return null;
  return segs.join("/");
}

/** relPath → 대표 노드 1개 (파일 수=하이라이트 수 유지). 우선순위: `file:` 직조인 → type=file → type=config → id 사전순. */
function pickNodeId(relPath: string, candidates: readonly KgOverlayNode[]): string {
  const direct = candidates.find((n) => n.id === `file:${relPath}`);
  if (direct) return direct.id;
  const byType = (t: string) =>
    candidates
      .filter((n) => n.type === t)
      .map((n) => n.id)
      .sort(cmp)[0];
  return byType("file") ?? byType("config") ?? candidates.map((n) => n.id).sort(cmp)[0];
}

export interface OverlayCore {
  changedFiles: string[];
  changedNodeIds: string[];
  affectedNodeIds: string[];
  unresolved: OverlayUnresolved[];
}

/** 순수 변환 — impact 결과 × KG 노드 → 오버레이 집합 (IO 없음, 결정론). */
export function buildDiffOverlay(
  result: ImpactResult,
  kgNodes: readonly KgOverlayNode[],
  projectRoot: string,
): OverlayCore {
  const byPath = new Map<string, KgOverlayNode[]>();
  for (const n of kgNodes) {
    const rel = normalizeKgPath(n.filePath, projectRoot);
    if (rel === null) continue;
    const list = byPath.get(rel);
    if (list) list.push(n);
    else byPath.set(rel, [n]);
  }

  const seedPaths = [...new Set(result.seeds.map((s) => s.relPath))].sort(cmp);
  const seedSet = new Set(seedPaths);
  const affectedPaths = [
    ...new Set(
      [...result.upstream.files, ...result.downstream.files]
        .map((f) => f.relPath)
        .filter((p) => !seedSet.has(p)),
    ),
  ].sort(cmp);

  const unresolved: OverlayUnresolved[] = [];
  const resolve = (relPath: string, role: string): string | null => {
    const candidates = byPath.get(relPath);
    if (!candidates || candidates.length === 0) {
      unresolved.push({ relPath, reason: `${role} — KG에 매칭 노드 없음(/understand 분석 범위 확인)` });
      return null;
    }
    return pickNodeId(relPath, candidates);
  };

  const changedNodeIds = [
    ...new Set(seedPaths.map((p) => resolve(p, "시드")).filter((v): v is string => v !== null)),
  ].sort(cmp);
  const changedSet = new Set(changedNodeIds);
  const affectedNodeIds = [
    ...new Set(
      affectedPaths
        .map((p) => resolve(p, "영향"))
        .filter((v): v is string => v !== null && !changedSet.has(v)),
    ),
  ].sort(cmp);

  return { changedFiles: seedPaths, changedNodeIds, affectedNodeIds, unresolved };
}

/** 디스크 KG → 오버레이용 노드 목록. KG 부재/손상이면 null (오버레이 생략 신호). */
export async function loadKgOverlayNodes(projectRoot: string): Promise<KgOverlayNode[] | null> {
  const p = path.join(projectRoot, ".understand-anything", "knowledge-graph.json");
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let g: unknown;
  try {
    g = JSON.parse(raw);
  } catch {
    return null;
  }
  // 손상 계약: 비JSON뿐 아니라 null/비객체/nodes 비배열도 "손상 → 생략(null)"
  // — analyze 후속(감사 기록)이 KG 손상으로 죽지 않게 (리뷰 minor).
  if (g === null || typeof g !== "object" || !Array.isArray((g as { nodes?: unknown }).nodes)) {
    return null;
  }
  const out: KgOverlayNode[] = [];
  for (const n of (g as { nodes: Array<Record<string, unknown>> }).nodes) {
    if (n === null || typeof n !== "object") continue;
    if (typeof n.id !== "string" || typeof n.filePath !== "string") continue;
    out.push({ id: n.id, type: typeof n.type === "string" ? n.type : "", filePath: n.filePath });
  }
  return out;
}

/**
 * 오버레이 발행 (IO 래퍼). KG 부재/손상이면 null(생략). 다른 생산자
 * (/understand-diff 등 baseBranch≠ktds-impact)의 기존 파일은 .bak으로 보존 후
 * 덮어쓴다 — 같은 경로 last-writer-wins 경합의 완화책. generatedAt은 IO 경계
 * 에서만 찍는다(순수 변환은 결정론 유지; .spec/map 산출물 아님 — U-A 계약 필드).
 */
export async function publishDiffOverlay(
  projectRoot: string,
  result: ImpactResult,
  opts: { nowIso?: string } = {},
): Promise<PublishOverlayResult | null> {
  const nodes = await loadKgOverlayNodes(projectRoot);
  if (nodes === null) return null;
  const core = buildDiffOverlay(result, nodes, projectRoot);
  const overlay: DiffOverlay = {
    version: "1.0.0",
    baseBranch: OVERLAY_BASE_BRANCH,
    generatedAt: opts.nowIso ?? new Date().toISOString(),
    changedFiles: core.changedFiles,
    changedNodeIds: core.changedNodeIds,
    affectedNodeIds: core.affectedNodeIds,
    ktdsImpact: {
      gitCommit: result.gitCommit,
      seedCount: result.seeds.length,
      upstreamFileCount: result.upstream.files.length,
      downstreamFileCount: result.downstream.files.length,
      unresolved: core.unresolved,
    },
  };

  const dir = path.join(projectRoot, ".understand-anything");
  const filePath = path.join(dir, DIFF_OVERLAY_FILENAME);
  let backedUp = false;
  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (existing !== null) {
    // 출처 판별: ktds 마커가 아니면(비JSON·null 포함 — 출처 미상도) 보존 대상.
    let foreign = true;
    try {
      const parsed: unknown = JSON.parse(existing);
      foreign =
        parsed === null ||
        typeof parsed !== "object" ||
        (parsed as { baseBranch?: unknown }).baseBranch !== OVERLAY_BASE_BRANCH;
    } catch {
      /* 비JSON — foreign 유지 */
    }
    if (foreign) {
      // 백업 실패는 throw(fail-closed) — 타 출처 파일을 백업 없이 덮어쓰지 않는다 (리뷰 minor)
      await fs.writeFile(`${filePath}.bak`, existing, "utf-8");
      backedUp = true;
    }
  }
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(overlay, null, 2) + "\n", "utf-8");
  await fs.rename(tmpPath, filePath);
  return { path: filePath, overlay, backedUp };
}
