import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImpactResult } from "./types.js";
import {
  buildDiffOverlay,
  normalizeKgPath,
  publishDiffOverlay,
  DIFF_OVERLAY_FILENAME,
  OVERLAY_BASE_BRANCH,
  type KgOverlayNode,
} from "./overlay.js";

// T10 DoD: file: 직조인 / filePath 폴백(config 노드) / 절대경로 KG 정규화 /
// affected=(상류∪하류)−시드 / 미조인 echo / 정렬 결정론 / 경합 .bak / KG 부재 생략.

function makeResult(p: {
  seeds?: string[];
  up?: string[];
  down?: string[];
  gitCommit?: string | null;
}): ImpactResult {
  const affected = (relPath: string) => ({
    relPath,
    viaKinds: ["field-type" as const],
    minDepth: 1,
    citation: null,
  });
  return {
    schemaVersion: 1,
    gitCommit: p.gitCommit ?? null,
    depthCap: 12,
    edgeKinds: ["field-type"],
    fanInThreshold: 24,
    seeds: (p.seeds ?? []).map((relPath) => ({
      relPath,
      origin: "path" as const,
      confidence: "CONFIRMED_HUMAN" as const,
    })),
    upstream: {
      files: (p.up ?? []).map(affected),
      api: [],
      persistence: { mappers: [], sqlFiles: [], tableCandidateSlots: [], kgTableCatalog: [], note: "n" },
      flows: [],
      domains: [],
    },
    downstream: { files: (p.down ?? []).map(affected) },
    overEdges: { hubNodes: [], importOnlyCount: 0, crossCheckDiff: [] },
    needsReview: [],
  };
}

const ROOT = "/proj";

test("normalizeKgPath — 상대 통과·절대 상대화·루트 밖/순회 거부", () => {
  expect(normalizeKgPath("src/A.java", ROOT)).toBe("src/A.java");
  expect(normalizeKgPath("/proj/src/A.java", ROOT)).toBe("src/A.java");
  expect(normalizeKgPath("/other/src/A.java", ROOT)).toBeNull();
  expect(normalizeKgPath("/proj", ROOT)).toBeNull();
  expect(normalizeKgPath("src\\win\\A.java", ROOT)).toBe("src/win/A.java");
  expect(normalizeKgPath("../escape.java", ROOT)).toBeNull();
  expect(normalizeKgPath("src/./A.java", ROOT)).toBeNull();
  expect(normalizeKgPath("", ROOT)).toBeNull();
});

test("buildDiffOverlay — file: 직조인 + config 폴백 + affected는 시드 제외 + 미조인 echo", () => {
  const nodes: KgOverlayNode[] = [
    { id: "file:src/Svc.java", type: "file", filePath: "src/Svc.java" },
    { id: "file:src/Ctrl.java", type: "file", filePath: "src/Ctrl.java" },
    // 매퍼 XML: file: 노드 없음 → config 노드 폴백 (jpetstore 실측 패턴)
    { id: "config:src/M.xml", type: "config", filePath: "src/M.xml" },
    // 같은 파일의 함수 노드 — 대표 1노드 원칙으로 무시돼야 함
    { id: "function:src/Ctrl.java:handle", type: "function", filePath: "src/Ctrl.java" },
  ];
  const result = makeResult({
    seeds: ["src/Svc.java"],
    up: ["src/Ctrl.java", "src/Gone.java"],
    down: ["src/M.xml", "src/Ctrl.java", "src/Svc.java"], // Ctrl 중복 + 시드 재등장
  });
  const core = buildDiffOverlay(result, nodes, ROOT);
  expect(core.changedFiles).toEqual(["src/Svc.java"]);
  expect(core.changedNodeIds).toEqual(["file:src/Svc.java"]);
  // 시드 제외 + 중복 제거 + 정렬, Gone은 미조인
  expect(core.affectedNodeIds).toEqual(["config:src/M.xml", "file:src/Ctrl.java"]);
  expect(core.unresolved).toEqual([
    { relPath: "src/Gone.java", reason: "영향 — KG에 매칭 노드 없음(/understand 분석 범위 확인)" },
  ]);
});

test("buildDiffOverlay — 절대경로 KG도 projectRoot 상대화로 조인 (비평 반영)", () => {
  const nodes: KgOverlayNode[] = [
    { id: "file:src/Svc.java", type: "file", filePath: "/proj/src/Svc.java" },
    { id: "file:out/Esc.java", type: "file", filePath: "/elsewhere/out/Esc.java" },
  ];
  const result = makeResult({ seeds: ["src/Svc.java"], up: ["out/Esc.java"] });
  const core = buildDiffOverlay(result, nodes, ROOT);
  expect(core.changedNodeIds).toEqual(["file:src/Svc.java"]);
  // 루트 밖 절대경로 노드는 매칭 불가 → 미조인으로 정직하게 보고
  expect(core.affectedNodeIds).toEqual([]);
  expect(core.unresolved.map((u) => u.relPath)).toEqual(["out/Esc.java"]);
});

test("buildDiffOverlay — 시드 전건 미조인이면 changedNodeIds 빈 배열 (대시보드 미활성 신호)", () => {
  const core = buildDiffOverlay(makeResult({ seeds: ["src/NoNode.java"] }), [], ROOT);
  expect(core.changedNodeIds).toEqual([]);
  expect(core.unresolved).toHaveLength(1);
});

test("buildDiffOverlay — file/config 없이 function 노드만 있으면 id 사전순 첫 노드 폴백", () => {
  const nodes: KgOverlayNode[] = [
    { id: "function:src/S.java:zeta", type: "function", filePath: "src/S.java" },
    { id: "function:src/S.java:alpha", type: "function", filePath: "src/S.java" },
  ];
  const core = buildDiffOverlay(makeResult({ seeds: ["src/S.java"] }), nodes, ROOT);
  expect(core.changedNodeIds).toEqual(["function:src/S.java:alpha"]);
});

// ── IO ───────────────────────────────────────────────────────────────────────

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-overlay-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function writeKg(nodes: Array<Record<string, unknown>>): Promise<void> {
  await mkdir(join(dir, ".understand-anything"), { recursive: true });
  await writeFile(
    join(dir, ".understand-anything", "knowledge-graph.json"),
    JSON.stringify({ version: "1.0.0", nodes }),
    "utf-8",
  );
}

test("publishDiffOverlay — KG 부재면 null (오버레이 생략)", async () => {
  expect(await publishDiffOverlay(dir, makeResult({ seeds: ["a.java"] }))).toBeNull();
});

test("publishDiffOverlay — KG 손상(비JSON·null·nodes 비배열)도 null (감사 경로 보호)", async () => {
  const kgPath = join(dir, ".understand-anything", "knowledge-graph.json");
  await mkdir(join(dir, ".understand-anything"), { recursive: true });
  for (const broken of ["{not json", "null", JSON.stringify({ nodes: "oops" })]) {
    await writeFile(kgPath, broken, "utf-8");
    expect(await publishDiffOverlay(dir, makeResult({ seeds: ["a.java"] })), broken).toBeNull();
  }
});

test("publishDiffOverlay — 계약 필드 + ktds 확장 + nowIso 주입", async () => {
  await writeKg([
    { id: "file:src/Svc.java", type: "file", filePath: "src/Svc.java" },
    { id: "file:src/Ctrl.java", type: "file", filePath: "src/Ctrl.java" },
  ]);
  const res = await publishDiffOverlay(
    dir,
    makeResult({ seeds: ["src/Svc.java"], up: ["src/Ctrl.java"], gitCommit: "abc" }),
    { nowIso: "2026-06-12T00:00:00.000Z" },
  );
  expect(res).not.toBeNull();
  expect(res!.backedUp).toBe(false);
  const raw = JSON.parse(await readFile(join(dir, ".understand-anything", DIFF_OVERLAY_FILENAME), "utf-8"));
  expect(raw).toEqual({
    version: "1.0.0",
    baseBranch: OVERLAY_BASE_BRANCH,
    generatedAt: "2026-06-12T00:00:00.000Z",
    changedFiles: ["src/Svc.java"],
    changedNodeIds: ["file:src/Svc.java"],
    affectedNodeIds: ["file:src/Ctrl.java"],
    ktdsImpact: {
      gitCommit: "abc",
      seedCount: 1,
      upstreamFileCount: 1,
      downstreamFileCount: 0,
      unresolved: [],
    },
  });
});

test("publishDiffOverlay — 다른 출처 기존 파일은 .bak 보존, ktds 것은 그냥 덮어씀", async () => {
  await writeKg([{ id: "file:a.java", type: "file", filePath: "a.java" }]);
  const overlayPath = join(dir, ".understand-anything", DIFF_OVERLAY_FILENAME);
  // /understand-diff가 만든 외부 오버레이
  await writeFile(overlayPath, JSON.stringify({ baseBranch: "main", changedNodeIds: ["x"] }), "utf-8");

  const first = await publishDiffOverlay(dir, makeResult({ seeds: ["a.java"] }), { nowIso: "t" });
  expect(first!.backedUp).toBe(true);
  const bak = JSON.parse(await readFile(`${overlayPath}.bak`, "utf-8"));
  expect(bak.baseBranch).toBe("main");

  // 우리 파일 재발행 — 추가 백업 없음 (.bak 불변)
  const second = await publishDiffOverlay(dir, makeResult({ seeds: ["a.java"] }), { nowIso: "t2" });
  expect(second!.backedUp).toBe(false);
  expect(JSON.parse(await readFile(`${overlayPath}.bak`, "utf-8")).baseBranch).toBe("main");
  expect(JSON.parse(await readFile(overlayPath, "utf-8")).generatedAt).toBe("t2");
});

test("publishDiffOverlay — 비JSON 기존 오버레이도 출처 미상으로 .bak 보존", async () => {
  await writeKg([{ id: "file:a.java", type: "file", filePath: "a.java" }]);
  const overlayPath = join(dir, ".understand-anything", DIFF_OVERLAY_FILENAME);
  await writeFile(overlayPath, "not-json-at-all", "utf-8");
  const res = await publishDiffOverlay(dir, makeResult({ seeds: ["a.java"] }), { nowIso: "t" });
  expect(res!.backedUp).toBe(true);
  expect(await readFile(`${overlayPath}.bak`, "utf-8")).toBe("not-json-at-all");
});
