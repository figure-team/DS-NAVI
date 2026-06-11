import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAutoPlan,
  detectPlanDrift,
  excludeDomain,
  mergeDomains,
  moveRoot,
  planTable,
  readConfirmedPlan,
  renameDomain,
  writeConfirmedPlan,
} from "./confirm.js";
import type { CandidatesReport, ConfirmedPlan } from "./types.js";

// 16.5 확정 게이트 — 플랜 연산의 순수성/멱등성, 영속 round-trip, 드리프트.

function candidates(): CandidatesReport {
  return {
    schemaVersion: 1,
    gitCommit: "a".repeat(40),
    directoryDegenerate: null,
    candidates: [
      { key: "account", roots: ["a/AccountCtrl.java"], entryCount: 2, files: [] },
      { key: "order", roots: ["a/OrderCtrl.java"], entryCount: 3, files: [] },
      { key: "web", roots: ["web.xml"], entryCount: 1, files: [] },
    ],
    common: [],
    ambiguous: [],
    unresolved: [],
  };
}

test("auto plan: 후보 그대로, decidedBy 기록", () => {
  const plan = buildAutoPlan(candidates(), "auto");
  expect(plan.domains.map((d) => d.key)).toEqual(["account", "order", "web"]);
  expect(plan.decidedBy).toBe("auto");
  expect(plan.domains[0]).toEqual({
    key: "account",
    name: "account",
    roots: ["a/AccountCtrl.java"],
    aliasKeys: [],
  });
});

test("개명은 표시명만 — key(ID 닻)는 불변", () => {
  const plan = renameDomain(buildAutoPlan(candidates(), "kim"), "account", "계정/인증");
  const d = plan.domains.find((x) => x.key === "account")!;
  expect(d.name).toBe("계정/인증");
  expect(d.key).toBe("account");
});

test("병합: 루트 흡수 + alias 보존, 원본 불변(순수 함수)", () => {
  const base = buildAutoPlan(candidates(), "kim");
  const merged = mergeDomains(base, "web", "order");
  expect(merged.domains.map((d) => d.key)).toEqual(["account", "order"]);
  const order = merged.domains.find((d) => d.key === "order")!;
  expect(order.roots).toEqual(["a/OrderCtrl.java", "web.xml"]);
  expect(order.aliasKeys).toEqual(["web"]);
  // 원본 비파괴
  expect(base.domains).toHaveLength(3);
});

test("이동: 루트가 빠져 빈 도메인은 사라진다", () => {
  const plan = moveRoot(buildAutoPlan(candidates(), "kim"), "web.xml", "account");
  expect(plan.domains.map((d) => d.key)).toEqual(["account", "order"]);
  expect(plan.domains[0].roots).toContain("web.xml");
});

test("제외: excludedKeys에 감사 흔적", () => {
  const plan = excludeDomain(buildAutoPlan(candidates(), "kim"), "web");
  expect(plan.domains.map((d) => d.key)).toEqual(["account", "order"]);
  expect(plan.excludedKeys).toEqual(["web"]);
});

test("존재하지 않는 key/root는 명시적 오류 (조용한 무시 금지)", () => {
  const plan = buildAutoPlan(candidates(), "kim");
  expect(() => renameDomain(plan, "ghost", "x")).toThrow(/unknown/);
  expect(() => mergeDomains(plan, "ghost", "order")).toThrow(/unknown/);
  expect(() => mergeDomains(plan, "order", "order")).toThrow(/itself/);
  expect(() => moveRoot(plan, "ghost.java", "order")).toThrow(/not in any domain/);
  expect(() => excludeDomain(plan, "ghost")).toThrow(/unknown/);
});

test("드리프트 감지: 플랜 이후 루트 증감", () => {
  const plan: ConfirmedPlan = {
    schemaVersion: 1,
    gitCommit: null,
    decidedBy: "kim",
    domains: [
      { key: "order", name: "order", roots: ["a/OrderCtrl.java", "a/Gone.java"], aliasKeys: [] },
    ],
    excludedKeys: [],
  };
  const drift = detectPlanDrift(plan, candidates());
  expect(drift.missingRoots).toEqual(["a/Gone.java"]);
  expect(drift.newRoots).toEqual(["a/AccountCtrl.java", "web.xml"]);
});

test("planTable: 후보·모호·미해소가 전부 표면화된다", () => {
  const c = candidates();
  c.ambiguous.push({ relPath: "a/X.java", reachKey: "order", directoryKey: "account" });
  const table = planTable(c);
  expect(table).toContain("account");
  expect(table).toContain("모호 1건");
  expect(table).toContain("a/X.java — reach=order / dir=account");
});

// ── 영속 round-trip ─────────────────────────────────────────────────────────

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ktds-confirm-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("confirmed plan round-trip + 부재 시 null (게이트 멱등의 토대)", async () => {
  expect(await readConfirmedPlan(dir)).toBe(null);
  const plan = renameDomain(buildAutoPlan(candidates(), "kim"), "order", "주문");
  await writeConfirmedPlan(dir, plan);
  expect(await readConfirmedPlan(dir)).toEqual(plan);
});
