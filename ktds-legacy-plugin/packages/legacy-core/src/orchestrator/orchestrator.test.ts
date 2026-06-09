import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runDocsPipeline, RunAbortedError } from "./index.js";
import type { ProseProvider } from "../doc-generator/index.js";
import { listDrafts, startReview, approveDoc } from "../approval/index.js";
import { getDocState } from "../doc-state/index.js";
import { readAudit } from "../audit/index.js";
import { isLocked } from "../lock/index.js";

const EXPECTED = ["01_tech-stack.md", "02_architecture.md", "03_feature-spec.md", "04_api-spec.md", "05_db-spec.md"];

// A controlled graph where every claim is evidence-backed → passes the [추정] gate.
const PASSING_GRAPH = {
  version: "1.0.0",
  project: { name: "demo", languages: [], frameworks: [], description: "", gitCommitHash: "" },
  layers: [],
  nodes: [
    { id: "m1", type: "module", name: "AuthModule", filePath: "src/auth/Auth.java", lineRange: [1, 50], summary: "인증", tags: [] },
    { id: "e1", type: "endpoint", name: "POST /login", filePath: "src/auth/LoginController.java", lineRange: [42, 60], summary: "로그인", tags: [] },
    { id: "t1", type: "table", name: "USERS", filePath: "schema/users.sql", lineRange: [1, 20], summary: "사용자", tags: [] },
    { id: "d1", type: "domain", name: "인증", filePath: "src/auth", lineRange: [1, 1], summary: "인증 도메인", tags: [] },
  ],
  edges: [{ source: "e1", target: "t1", type: "reads_from", direction: "forward", weight: 1 }],
};

// tech-stack becomes 100% INFERRED (langs/frameworks, no evidence) → exceeds block 0.6.
const BLOCKING_GRAPH = {
  version: "1.0.0",
  project: { name: "x", languages: ["java", "go", "rust"], frameworks: ["spring"], description: "", gitCommitHash: "" },
  layers: [], nodes: [], edges: [],
};

async function seed(root: string, graph: unknown) {
  await mkdir(join(root, ".understand-anything"), { recursive: true });
  await writeFile(join(root, ".understand-anything", "knowledge-graph.json"), JSON.stringify(graph), "utf-8");
}
const prose: ProseProvider = async (req) => `산문: ${req.heading}`;

describe("runDocsPipeline — E2E", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "ktds-e2e-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("generates 5 DRAFT docs, publishes them, and records audit", async () => {
    await seed(root, PASSING_GRAPH);
    const res = await runDocsPipeline(root, { runId: "r1", prose });

    expect(res.published).toEqual(EXPECTED);
    const onDisk = (await readdir(join(root, "docs"))).sort();
    expect(onDisk).toEqual([...EXPECTED].sort());

    // published markdown carries injected prose + evidence tag
    const techMd = await readFile(join(root, "docs", "01_tech-stack.md"), "utf-8");
    expect(techMd).toContain("산문:");
    expect(techMd).toContain("[확정(AI)]");

    // all 5 tracked as DRAFT → visible to review
    for (const f of EXPECTED) expect(await getDocState(join(root, ".spec"), f)).toBe("DRAFT");
    expect((await listDrafts(join(root, ".spec"))).length).toBe(5);

    // audit: one LLM_REQUEST + five DOC_GENERATED
    const audit = await readAudit(join(root, ".spec"));
    expect(audit.filter((e) => e.type === "LLM_REQUEST")).toHaveLength(1);
    expect(audit.filter((e) => e.type === "DOC_GENERATED")).toHaveLength(5);

    // lock released
    expect(await isLocked(join(root, ".spec"))).toBe(false);
  });

  it("review→approve works on a generated doc (DRAFT→UNDER_REVIEW→APPROVED + audit)", async () => {
    await seed(root, PASSING_GRAPH);
    await runDocsPipeline(root, { runId: "r1", prose });
    const spec = join(root, ".spec");
    await startReview(spec, "04_api-spec.md");
    await approveDoc(spec, "04_api-spec.md", "kim");
    expect(await getDocState(spec, "04_api-spec.md")).toBe("APPROVED");
    const audit = await readAudit(spec);
    expect(audit.some((e) => e.type === "DOC_APPROVED" && e.doc === "04_api-spec.md")).toBe(true);
  });

  it("aborts (RUN_ABORTED) when a doc exceeds the [추정] block threshold — no publish, lock freed", async () => {
    await seed(root, BLOCKING_GRAPH);
    await expect(runDocsPipeline(root, { runId: "r1", prose })).rejects.toBeInstanceOf(RunAbortedError);

    // nothing published
    await expect(readdir(join(root, "docs"))).rejects.toMatchObject({ code: "ENOENT" });
    // staging discarded
    await expect(readdir(join(root, ".spec", "runs", "r1"))).rejects.toMatchObject({ code: "ENOENT" });
    // audit recorded RUN_ABORTED, lock released (retryable)
    const audit = await readAudit(join(root, ".spec"));
    expect(audit.some((e) => e.type === "RUN_ABORTED")).toBe(true);
    expect(await isLocked(join(root, ".spec"))).toBe(false);
  });

  it("refuses to run when a live analysis lock is held", async () => {
    await seed(root, PASSING_GRAPH);
    await mkdir(join(root, ".spec"), { recursive: true });
    await writeFile(join(root, ".spec", ".analysis.lock"),
      JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }), "utf-8");
    await expect(runDocsPipeline(root, { runId: "r1", prose })).rejects.toThrow(/already running/);
  });
});
