import type { Claim, Confidence, Evidence } from "../types.js";

// ── Mapper ────────────────────────────────────────────────────────────────

export interface ClaimInput {
  claim: string;
  confidence: Confidence;
  evidence?: Evidence[];
  requires_human_review?: boolean;
}

/** Build a Claim object with defaults and normalization. */
export function mapClaim(input: ClaimInput): Claim {
  return {
    claim: input.claim,
    confidence: input.confidence,
    evidence: input.evidence ?? [],
    requires_human_review: input.requires_human_review ?? false,
  };
}

// ── Validator ─────────────────────────────────────────────────────────────

export type ValidationResult = "OK" | "RETURNED";

/**
 * Validate a list of claims.
 * Returns "RETURNED" if any CONFIRMED_AI claim has zero evidence (A5 / plan §5.2).
 */
export function validateClaims(claims: Claim[]): ValidationResult {
  for (const c of claims) {
    if (c.confidence === "CONFIRMED_AI" && c.evidence.length === 0) {
      return "RETURNED";
    }
  }
  return "OK";
}

// ── Ratio computation ─────────────────────────────────────────────────────

/**
 * Compute the fraction of INFERRED claims in a per-doc claim list (plan §2.2, A6).
 * Returns 0 for an empty list.
 */
export function computeInferredRatio(claims: Claim[]): number {
  if (claims.length === 0) return 0;
  const inferred = claims.filter((c) => c.confidence === "INFERRED").length;
  return inferred / claims.length;
}

/** ratio > 0.3 → warn threshold (plan D4). */
export function isWarn(ratio: number): boolean {
  return ratio > 0.3;
}

/** ratio > 0.6 → block threshold (plan D4). */
export function isBlock(ratio: number): boolean {
  return ratio > 0.6;
}
