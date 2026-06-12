import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImpactResult } from "./types.js";
import type { ImpactVerifyReport } from "./verify.js";
import { buildChangeImpact, IMPACT_STATUS_LINE } from "./doc.js";
import {
  archiveImpactRun,
  assertSrId,
  listImpactRuns,
  srImpactDir,
} from "./archive.js";

// T11 DoD: SR ID fail-closed / 보관 3종 파일 / 목록(정렬·손상 표면화·ENOENT []).

function makeResult(seed: string, gitCommit: string | null = "c1"): ImpactResult {
  return {
    schemaVersion: 1,
    gitCommit,
    depthCap: 12,
    edgeKinds: ["field-type"],
    fanInThreshold: 24,
    seeds: [{ relPath: seed, origin: "path", confidence: "CONFIRMED_HUMAN" }],
    upstream: {
      files: [{ relPath: "src/Ctrl.java", viaKinds: ["field-type"], minDepth: 1, citation: null }],
      api: [],
      persistence: { mappers: [], sqlFiles: [], tableCandidateSlots: [], kgTableCatalog: [], note: "n" },
      flows: [],
      domains: [],
    },
    downstream: { files: [] },
    overEdges: { hubNodes: [], importOnlyCount: 0, crossCheckDiff: [] },
    needsReview: [],
  };
}

const VERIFY: ImpactVerifyReport = {
  schemaVersion: 1,
  gitCommit: "c1",
  items: [],
  overall: { itemTotal: 0, itemGrounded: 0, citationTotal: 0, citationOk: 0, groundedPct: 100, uncitedClaims: 0 },
};

test("assertSrId — 영숫자 시작·안전 문자만 허용 (fail-closed)", () => {
  expect(() => assertSrId("SR-2026-0612-001")).not.toThrow();
  expect(() => assertSrId("a")).not.toThrow();
  for (const bad of ["", "../x", "a/b", "a\\b", "-x", ".hidden", "한글SR", "a".repeat(101), "--by"]) {
    expect(() => assertSrId(bad), bad).toThrow(/잘못된 SR ID/);
  }
});

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-sr-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

test("archiveImpactRun — .spec/impact/<SR-ID>/에 impact.json+verify+.md 보관", async () => {
  const result = makeResult("src/Svc.java");
  const doc = buildChangeImpact(result, VERIFY);
  const out = await archiveImpactRun(dir, "SR-1", { result, verify: VERIFY, doc });
  expect(out).toBe(srImpactDir(dir, "SR-1"));

  const impact = JSON.parse(await readFile(join(out, "impact.json"), "utf-8"));
  expect(impact.seeds[0].relPath).toBe("src/Svc.java");
  const verify = JSON.parse(await readFile(join(out, "impact-verify-report.json"), "utf-8"));
  expect(verify.overall.groundedPct).toBe(100);
  const md = await readFile(join(out, "change-impact-analysis.md"), "utf-8");
  expect(md).toContain(IMPACT_STATUS_LINE); // 발행본과 동일 렌더(읽기전용 상태문)
});

test("listImpactRuns — srId 정렬 + 요약 필드 + 손상 보관본 valid:false + ENOENT 빈 목록", async () => {
  expect(await listImpactRuns(dir)).toEqual([]);

  const r1 = makeResult("src/B.java");
  await archiveImpactRun(dir, "SR-2", { result: r1, verify: VERIFY, doc: buildChangeImpact(r1, VERIFY) });
  const r2 = makeResult("src/A.java", null);
  await archiveImpactRun(dir, "SR-1", { result: r2, verify: VERIFY, doc: buildChangeImpact(r2, VERIFY) });
  // 손상 보관본
  await mkdir(join(dir, ".spec", "impact", "SR-0"), { recursive: true });
  await writeFile(join(dir, ".spec", "impact", "SR-0", "impact.json"), "{broken", "utf-8");
  // SR ID 규칙 밖 디렉터리는 무시
  await mkdir(join(dir, ".spec", "impact", ".hidden"), { recursive: true });

  const runs = await listImpactRuns(dir);
  expect(runs.map((r) => r.srId)).toEqual(["SR-0", "SR-1", "SR-2"]);
  expect(runs[0].valid).toBe(false);
  expect(runs[1]).toMatchObject({
    valid: true, gitCommit: null, seeds: ["src/A.java"],
    upstreamFiles: 1, api: 0, mappers: 0, needsReview: 0, groundedPct: 100,
  });
});

test("listImpactRuns — verify 부재면 groundedPct null (impact는 유효)", async () => {
  const r = makeResult("src/C.java");
  const out = await archiveImpactRun(dir, "SR-9", { result: r, verify: VERIFY, doc: buildChangeImpact(r, VERIFY) });
  await rm(join(out, "impact-verify-report.json"));
  const runs = await listImpactRuns(dir);
  expect(runs[0].valid).toBe(true);
  expect(runs[0].groundedPct).toBeNull();
});
