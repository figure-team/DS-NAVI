import { afterEach, beforeEach, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImpactResult } from "./types.js";
import type { ImpactVerifyReport } from "./verify.js";
import { buildChangeImpact } from "./doc.js";
import { archiveImpactRun, archiveReviewRun, listImpactRuns } from "./archive.js";
import {
  buildReviewChecklist,
  buildReviewComparison,
  changesToSeeds,
  collectChangedFiles,
  filterChangesToInventory,
  publishReviewChecklist,
  ReviewGitError,
  REVIEW_CHECKLIST_FILENAME,
  REVIEW_STATUS_LINE,
} from "./review.js";

const execFileAsync = promisify(execFile);

// T12 DoD: git 변경 수집(A/M/R/D·정렬·fail-closed) / 시드 변환 / 예측 대조 /
// 체크리스트(범위·삭제·대조 절 + impact 섹션 재사용) / SR 보관(예측·실측 나란히).

function makeResult(p: { seeds?: string[]; up?: string[]; down?: string[] }): ImpactResult {
  const affected = (relPath: string) => ({
    relPath, viaKinds: ["field-type" as const], minDepth: 1, citation: null,
  });
  return {
    schemaVersion: 1,
    gitCommit: null,
    depthCap: 12,
    edgeKinds: ["field-type"],
    fanInThreshold: 24,
    seeds: (p.seeds ?? []).map((relPath) => ({
      relPath, origin: "git" as const, confidence: "CONFIRMED_AI" as const,
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

const VERIFY: ImpactVerifyReport = {
  schemaVersion: 1,
  gitCommit: null,
  items: [],
  overall: { itemTotal: 0, itemGrounded: 0, citationTotal: 0, citationOk: 0, groundedPct: 100, uncitedClaims: 0 },
};

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-review-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function git(...args: string[]): Promise<void> {
  await execFileAsync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
}

test("collectChangedFiles — 미스테이징 M/D + untracked A + 스테이징 R 전부 포착", async () => {
  await git("init", "-q");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/Keep.java"), "k1\n");
  await writeFile(join(dir, "src/Mod.java"), "m1\n");
  await writeFile(join(dir, "src/Del.java"), "d1\n");
  await writeFile(join(dir, "src/Old.java"), "same-content-for-rename-detection\nlong enough body\n");
  await git("add", "-A");
  await git("commit", "-qm", "base");

  await writeFile(join(dir, "src/Mod.java"), "m2\n"); // M — 스테이징 없이
  await writeFile(join(dir, "src/Added.java"), "a1\n"); // A — untracked (git add 없이도 포착돼야 함)
  await unlink(join(dir, "src/Del.java")); // D — 스테이징 없이
  await rename(join(dir, "src/Old.java"), join(dir, "src/New.java"));
  await git("add", "src/Old.java", "src/New.java"); // R — rename 검출은 index 필요

  const changes = await collectChangedFiles(dir, "HEAD");
  expect(changes.baseRef).toBe("HEAD");
  expect(changes.changed).toEqual([
    { relPath: "src/Added.java", status: "A" },
    { relPath: "src/Mod.java", status: "M" },
    { relPath: "src/New.java", status: "R" },
  ]);
  expect(changes.deleted).toEqual(["src/Del.java", "src/Old.java"]);
});

test("collectChangedFiles — 한글 파일명도 원본 경로 (quotepath C-인용 회피, 리뷰 major)", async () => {
  await git("init", "-q");
  await writeFile(join(dir, "한글파일.java"), "a\n");
  await git("add", "-A");
  await git("commit", "-qm", "base");
  await writeFile(join(dir, "한글파일.java"), "b\n"); // M 미스테이징
  await writeFile(join(dir, "새한글.java"), "c\n"); // untracked A
  const changes = await collectChangedFiles(dir, "HEAD");
  expect(changes.changed).toEqual([
    { relPath: "새한글.java", status: "A" },
    { relPath: "한글파일.java", status: "M" },
  ]);
});

test("collectChangedFiles — 비-git/잘못된 ref는 ReviewGitError (fail-closed)", async () => {
  await expect(collectChangedFiles(dir, "HEAD")).rejects.toBeInstanceOf(ReviewGitError);
  await git("init", "-q");
  await expect(collectChangedFiles(dir, "no-such-ref")).rejects.toBeInstanceOf(ReviewGitError);
});

test("filterChangesToInventory — census 밖(자체 산출물 등) 제외 + 투명 반환, deleted는 이전 인벤토리 기준", () => {
  const raw = {
    baseRef: "b",
    changed: [
      { relPath: ".spec/map/impact.json", status: "A" as const }, // 자체 산출물 — 제외
      { relPath: "docs/01_tech-stack.md", status: "A" as const }, // 생성 문서 — 제외
      { relPath: "src/Svc.java", status: "M" as const }, // 인벤토리 안 — 유지
    ],
    deleted: ["src/Old.java", ".understand-anything/stale.json"],
  };
  const inv = new Set(["src/Svc.java", "src/Other.java"]);
  const prior = new Set(["src/Old.java", "src/Svc.java"]);
  const r = filterChangesToInventory(raw, inv, prior);
  expect(r.changes.changed).toEqual([{ relPath: "src/Svc.java", status: "M" }]);
  expect(r.excludedChanged).toEqual([".spec/map/impact.json", "docs/01_tech-stack.md"]);
  expect(r.changes.deleted).toEqual(["src/Old.java"]);
  expect(r.excludedDeleted).toEqual([".understand-anything/stale.json"]);
  // 이전 인벤토리 없으면 deleted는 그대로 (필터 근거 없음)
  expect(filterChangesToInventory(raw, inv).changes.deleted).toEqual(raw.deleted);
});

test("changesToSeeds — origin=git, CONFIRMED_AI", () => {
  const seeds = changesToSeeds({
    baseRef: "b",
    changed: [{ relPath: "a.java", status: "M" }],
    deleted: [],
  });
  expect(seeds).toEqual([{ relPath: "a.java", origin: "git", confidence: "CONFIRMED_AI" }]);
});

test("buildReviewComparison — 예측 밖 변경 / 시드 미변경 / 시드 삭제 구분 (정렬)", () => {
  const prediction = makeResult({
    seeds: ["src/PlanA.java", "src/PlanB.java", "src/PlanC.java"],
    up: ["src/Up.java"],
    down: ["src/Down.xml"],
  });
  const c = buildReviewComparison(
    "SR-1",
    prediction,
    [
      "src/PlanA.java", // 예측 시드 그대로 변경
      "src/Up.java", // 예측 상류 안 — 예측 밖 아님
      "src/Surprise.java", // 예측 어디에도 없음 → 예측 밖
    ],
    ["src/PlanC.java"], // 예측 시드였는데 삭제 — "미변경" 오분류 금지 (리뷰 minor)
  );
  expect(c.unpredictedChanges).toEqual(["src/Surprise.java"]);
  expect(c.predictedSeedsNotChanged).toEqual(["src/PlanB.java"]);
  expect(c.predictedSeedsDeleted).toEqual(["src/PlanC.java"]);
});

test("buildReviewChecklist — 범위/삭제/대조 절 + impact 섹션 재사용, 옵션 절은 조건부", () => {
  const result = makeResult({ seeds: ["src/Mod.java"], up: ["src/Up.java"] });
  const full = buildReviewChecklist(result, VERIFY, {
    changes: { baseRef: "abc123", changed: [{ relPath: "src/Mod.java", status: "M" }], deleted: ["src/Del.java"] },
    comparison: {
      srId: "SR-1",
      unpredictedChanges: ["src/Surprise.java"],
      predictedSeedsNotChanged: [],
      predictedSeedsDeleted: ["src/Gone.java"],
    },
  });
  expect(full.filename).toBe(REVIEW_CHECKLIST_FILENAME);
  expect(full.title).toBe("변경 리뷰 체크리스트");
  const headings = full.sections.map((s) => s.heading);
  expect(headings.slice(0, 3)).toEqual(["리뷰 범위 (git 변경분)", "삭제된 파일 (수동 확인)", "예측 대비 (SR 대조)"]);
  expect(headings).toContain("변경 대상 (시드)"); // buildChangeImpact 재사용
  expect(full.sections[2].prose).toContain("src/Surprise.java");
  expect(full.sections[2].prose).toContain("예측 시드는 전부 실제로 변경됨");
  expect(full.sections[2].prose).toContain("예측 시드 중 삭제됨 1건");
  expect(full.sections[2].prose).toContain("src/Gone.java");

  const minimal = buildReviewChecklist(result, VERIFY, {
    changes: { baseRef: "abc123", changed: [{ relPath: "src/Mod.java", status: "M" }], deleted: [] },
  });
  const minHeadings = minimal.sections.map((s) => s.heading);
  expect(minHeadings[0]).toBe("리뷰 범위 (git 변경분)");
  expect(minHeadings).not.toContain("삭제된 파일 (수동 확인)");
  expect(minHeadings).not.toContain("예측 대비 (SR 대조)");
});

test("publishReviewChecklist — docs/09_release에 읽기전용 상태문으로 발행", async () => {
  const result = makeResult({ seeds: ["a.java"] });
  const doc = buildReviewChecklist(result, VERIFY, {
    changes: { baseRef: "b", changed: [{ relPath: "a.java", status: "M" }], deleted: [] },
  });
  const file = await publishReviewChecklist(dir, doc);
  expect(file).toBe(join(dir, "docs/09_release", REVIEW_CHECKLIST_FILENAME));
  const md = await readFile(file, "utf-8");
  expect(md).toContain("# 변경 리뷰 체크리스트");
  expect(md).toContain(REVIEW_STATUS_LINE);
});

test("archiveReviewRun — 예측과 같은 SR 폴더에 나란히 보관, listImpactRuns hasReview", async () => {
  const prediction = makeResult({ seeds: ["src/Plan.java"] });
  await archiveImpactRun(dir, "SR-7", {
    result: prediction, verify: VERIFY, doc: buildChangeImpact(prediction, VERIFY),
  });
  const review = makeResult({ seeds: ["src/Actual.java"] });
  const out = await archiveReviewRun(dir, "SR-7", {
    result: review, verify: VERIFY,
    doc: buildReviewChecklist(review, VERIFY, {
      changes: { baseRef: "b", changed: [{ relPath: "src/Actual.java", status: "M" }], deleted: [] },
    }),
  });
  const reviewJson = JSON.parse(await readFile(join(out, "review.json"), "utf-8"));
  expect(reviewJson.seeds[0].relPath).toBe("src/Actual.java");
  // 예측 보관본 불변
  const impactJson = JSON.parse(await readFile(join(out, "impact.json"), "utf-8"));
  expect(impactJson.seeds[0].relPath).toBe("src/Plan.java");

  const runs = await listImpactRuns(dir);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ srId: "SR-7", valid: true, hasReview: true, seeds: ["src/Plan.java"] });
});

test("listImpactRuns — 예측 손상 + 유효 리뷰: 폴백하되 predictionCorrupt 표면화", async () => {
  const review = makeResult({ seeds: ["src/R.java"] });
  await archiveReviewRun(dir, "SR-10", {
    result: review, verify: VERIFY,
    doc: buildReviewChecklist(review, VERIFY, {
      changes: { baseRef: "b", changed: [{ relPath: "src/R.java", status: "M" }], deleted: [] },
    }),
  });
  await writeFile(join(dir, ".spec", "impact", "SR-10", "impact.json"), "{broken", "utf-8");
  const runs = await listImpactRuns(dir);
  expect(runs[0]).toMatchObject({
    srId: "SR-10", valid: true, hasReview: true, predictionCorrupt: true, seeds: ["src/R.java"],
  });
});

test("listImpactRuns — 리뷰 단독 SR도 valid (리뷰로 폴백 요약)", async () => {
  const review = makeResult({ seeds: ["src/Only.java"] });
  await archiveReviewRun(dir, "SR-8", {
    result: review, verify: VERIFY,
    doc: buildReviewChecklist(review, VERIFY, {
      changes: { baseRef: "b", changed: [{ relPath: "src/Only.java", status: "M" }], deleted: [] },
    }),
  });
  const runs = await listImpactRuns(dir);
  expect(runs[0]).toMatchObject({ srId: "SR-8", valid: true, hasReview: true, seeds: ["src/Only.java"] });
});
