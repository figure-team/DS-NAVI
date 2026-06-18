import { describe, it, expect } from "vitest";
import { normalizeKgPath } from "./normalize-path.js";

// These expectations mirror UA core's per-node `sanitiseFilePaths` behavior in
// understand-anything-plugin/packages/core/src/persistence/index.ts:38-67.
// `sanitiseFilePaths` is not exported from core, so we assert against
// hand-computed expected values for the three R3b cases.
describe("normalizeKgPath — R3b golden equivalence", () => {
  const projectRoot = "/home/alice/project";

  it("absolute path INSIDE projectRoot -> relative to projectRoot", () => {
    expect(normalizeKgPath("/home/alice/project/src/auth.ts", projectRoot)).toBe(
      "src/auth.ts",
    );
  });

  it("absolute path OUTSIDE projectRoot -> basename only", () => {
    expect(normalizeKgPath("/home/alice/other/secret.ts", projectRoot)).toBe(
      "secret.ts",
    );
  });

  it("already-relative path -> unchanged passthrough", () => {
    expect(normalizeKgPath("src/auth.ts", projectRoot)).toBe("src/auth.ts");
  });

  it("is idempotent on already-relative output", () => {
    const once = normalizeKgPath("/home/alice/project/src/auth.ts", projectRoot);
    expect(normalizeKgPath(once, projectRoot)).toBe(once);
  });

  it("handles projectRoot with trailing slash identically", () => {
    expect(
      normalizeKgPath("/home/alice/project/src/auth.ts", "/home/alice/project/"),
    ).toBe("src/auth.ts");
  });
});
