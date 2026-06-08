import { describe, it, expect } from "vitest";
import { mapClaim, validateClaims, computeInferredRatio, isWarn, isBlock } from "./index.js";
import type { Claim } from "../types.js";

describe("mapClaim", () => {
  it("builds a Claim with provided values", () => {
    const c = mapClaim({
      claim: "The system uses Spring MVC.",
      confidence: "CONFIRMED_AI",
      evidence: [{ path: "src/App.java", line: 12 }],
    });
    expect(c.claim).toBe("The system uses Spring MVC.");
    expect(c.confidence).toBe("CONFIRMED_AI");
    expect(c.evidence).toHaveLength(1);
    expect(c.requires_human_review).toBe(false);
  });

  it("defaults evidence to [] and requires_human_review to false", () => {
    const c = mapClaim({ claim: "x", confidence: "INFERRED" });
    expect(c.evidence).toEqual([]);
    expect(c.requires_human_review).toBe(false);
  });

  it("preserves requires_human_review: true", () => {
    const c = mapClaim({ claim: "x", confidence: "NEEDS_REVIEW", requires_human_review: true });
    expect(c.requires_human_review).toBe(true);
  });
});

describe("validateClaims — RETURNED path (A5)", () => {
  it("returns RETURNED when CONFIRMED_AI claim has zero evidence", () => {
    const claims: Claim[] = [
      mapClaim({ claim: "uses Oracle DB", confidence: "CONFIRMED_AI" }),
    ];
    expect(validateClaims(claims)).toBe("RETURNED");
  });

  it("returns OK when CONFIRMED_AI has at least one evidence item", () => {
    const claims: Claim[] = [
      mapClaim({
        claim: "uses Oracle DB",
        confidence: "CONFIRMED_AI",
        evidence: [{ path: "src/DataSource.java", line: 5 }],
      }),
    ];
    expect(validateClaims(claims)).toBe("OK");
  });

  it("returns RETURNED if any CONFIRMED_AI claim in a mixed list has no evidence", () => {
    const claims: Claim[] = [
      mapClaim({ claim: "c1", confidence: "INFERRED" }),
      mapClaim({ claim: "c2", confidence: "CONFIRMED_AI" }), // no evidence
      mapClaim({ claim: "c3", confidence: "CONFIRMED_AI", evidence: [{ path: "x.java" }] }),
    ];
    expect(validateClaims(claims)).toBe("RETURNED");
  });

  it("returns OK for empty claim list", () => {
    expect(validateClaims([])).toBe("OK");
  });

  it("returns OK when only INFERRED / CONFIRMED_HUMAN / NEEDS_REVIEW claims present", () => {
    const claims: Claim[] = [
      mapClaim({ claim: "a", confidence: "INFERRED" }),
      mapClaim({ claim: "b", confidence: "CONFIRMED_HUMAN" }),
      mapClaim({ claim: "c", confidence: "NEEDS_REVIEW" }),
    ];
    expect(validateClaims(claims)).toBe("OK");
  });
});

describe("computeInferredRatio", () => {
  it("returns 0 for empty list", () => {
    expect(computeInferredRatio([])).toBe(0);
  });

  it("returns 0 when no INFERRED claims", () => {
    const claims = [
      mapClaim({ claim: "a", confidence: "CONFIRMED_AI", evidence: [{ path: "x" }] }),
      mapClaim({ claim: "b", confidence: "CONFIRMED_HUMAN" }),
    ];
    expect(computeInferredRatio(claims)).toBe(0);
  });

  it("returns 1 when all claims are INFERRED", () => {
    const claims = [
      mapClaim({ claim: "a", confidence: "INFERRED" }),
      mapClaim({ claim: "b", confidence: "INFERRED" }),
    ];
    expect(computeInferredRatio(claims)).toBe(1);
  });

  it("computes exact fraction", () => {
    const claims = [
      mapClaim({ claim: "a", confidence: "INFERRED" }),
      mapClaim({ claim: "b", confidence: "INFERRED" }),
      mapClaim({ claim: "c", confidence: "CONFIRMED_AI", evidence: [{ path: "x" }] }),
      mapClaim({ claim: "d", confidence: "CONFIRMED_HUMAN" }),
    ];
    expect(computeInferredRatio(claims)).toBeCloseTo(0.5);
  });
});

describe("isWarn / isBlock thresholds (plan D4)", () => {
  it("isWarn returns false at or below 0.3", () => {
    expect(isWarn(0)).toBe(false);
    expect(isWarn(0.3)).toBe(false);
  });

  it("isWarn returns true above 0.3", () => {
    expect(isWarn(0.31)).toBe(true);
    expect(isWarn(0.6)).toBe(true);
    expect(isWarn(1)).toBe(true);
  });

  it("isBlock returns false at or below 0.6", () => {
    expect(isBlock(0)).toBe(false);
    expect(isBlock(0.3)).toBe(false);
    expect(isBlock(0.6)).toBe(false);
  });

  it("isBlock returns true above 0.6", () => {
    expect(isBlock(0.61)).toBe(true);
    expect(isBlock(1)).toBe(true);
  });

  it("ratio at boundary 0.3 is warn=false, block=false", () => {
    expect(isWarn(0.3)).toBe(false);
    expect(isBlock(0.3)).toBe(false);
  });

  it("ratio at boundary 0.6 is warn=true, block=false", () => {
    expect(isWarn(0.6)).toBe(true);
    expect(isBlock(0.6)).toBe(false);
  });
});
