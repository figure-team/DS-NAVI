/**
 * STALE incremental re-approval (P4.5 / AC-26) 패키지 진입점.
 *
 * detectStaleClaims: 근거 fingerprint 변경으로 STALE claim 감지(결정론).
 * incrementalReapproval: STALE claim 만 재검토(0 stale -> APPROVED 유지).
 */
export { detectStaleClaims, incrementalReapproval, evidenceAnchor } from './stale.js'
export type {
  FingerprintMap,
  StaleClaim,
  StaleSection,
  StaleReport,
  IncrementalReapprovalResult,
} from './stale.js'
