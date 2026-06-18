import { mkdtemp, rm, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadProjectGraph } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "..", "fixtures", "dual-load", "sample");

async function seedFull(root: string): Promise<void> {
  // Copy the full fixture .understand-anything dir (KG + domain overlay).
  await cp(join(FIXTURE, ".understand-anything"), join(root, ".understand-anything"), {
    recursive: true,
  });
}

async function seedKgOnly(root: string): Promise<void> {
  // Copy only the KG file, leaving domain-graph.json absent.
  await mkdir(join(root, ".understand-anything"), { recursive: true });
  await cp(
    join(FIXTURE, ".understand-anything", "knowledge-graph.json"),
    join(root, ".understand-anything", "knowledge-graph.json"),
  );
}

describe("loadProjectGraph — dual-load orchestrator", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ktds-dualload-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("merges the ktds overlay additively onto the UA native KG", async () => {
    await seedFull(root);
    const merged = await loadProjectGraph(root);

    expect(merged.nativeNodeCount).toBeGreaterThan(0);
    expect(merged.overlayNodeCount).toBeGreaterThan(0);
    // merged = native + overlay - skipped
    expect(merged.mergedNodeCount).toBe(
      merged.nativeNodeCount + merged.overlayNodeCount - merged.skippedIds.length,
    );

    const ids = new Set(merged.nodes.map((n) => n.id));
    expect(ids.has("domain:auth")).toBe(true);
    expect(ids.has("flow:auth.login")).toBe(true);
    expect(ids.has("step:auth.login.controller")).toBe(true);
    expect(ids.has("step:auth.login.verify")).toBe(true);
    // base nodes still present
    expect(ids.has("file:src/auth/Auth.java")).toBe(true);
  });

  it("honors the edge filter rule (drops base->base overlay edge, keeps edges touching new nodes)", async () => {
    await seedFull(root);
    const merged = await loadProjectGraph(root);

    const edgeKey = (e: { source: string; target: string; type: string }) =>
      `${e.source}|${e.target}|${e.type}`;
    const keys = new Set(merged.edges.map(edgeKey));

    // Kept: overlay edges that touch a newly-added overlay node.
    expect(keys.has("domain:auth|flow:auth.login|contains_flow")).toBe(true);
    expect(keys.has("flow:auth.login|step:auth.login.controller|flow_step")).toBe(true);
    expect(keys.has("flow:auth.login|step:auth.login.verify|flow_step")).toBe(true);

    // Dropped: overlay edge between two BASE nodes (no new endpoint).
    expect(
      keys.has(
        "file:src/auth/LoginController.java|file:src/auth/Auth.java|calls",
      ),
    ).toBe(false);
  });

  it("is deterministic (two calls deep-equal) with sorted outputs", async () => {
    await seedFull(root);
    const a = await loadProjectGraph(root);
    const b = await loadProjectGraph(root);
    expect(a).toEqual(b);

    const ids = a.nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());

    const edgeKeys = a.edges.map((e) => `${e.source}|${e.target}|${e.type}`);
    expect(edgeKeys).toEqual([...edgeKeys].sort());
  });

  it("works when domain-graph.json is ABSENT (overlay=null -> base nodes only)", async () => {
    await seedKgOnly(root);
    const merged = await loadProjectGraph(root);

    expect(merged.overlayNodeCount).toBe(0);
    expect(merged.skippedIds).toEqual([]);
    expect(merged.mergedNodeCount).toBe(merged.nativeNodeCount);
    expect(merged.edges).toEqual([]);
    const ids = new Set(merged.nodes.map((n) => n.id));
    expect(ids.has("domain:auth")).toBe(false);
  });

  it("throws a clear error when no UA knowledge-graph.json exists", async () => {
    await expect(loadProjectGraph(root)).rejects.toThrow(/run \/understand first/);
  });
});
