/**
 * evidence enforcement (P4.2) — doc-templates.md §0 의 두 게이트를 결정론으로 판정.
 *
 * 권위(AUTHORITY)는 doc-templates.md §0:
 *   · [확정](CONFIRMED) 근거 0 -> 저장 차단(RETURNED 트리거).
 *   · 문서 INFERRED 비율 > 0.6 -> 승인 차단(inferredBlocked).
 *
 * 순수 함수. timestamp/Date.now 미사용 — 입력만으로 byte-identical 판정.
 * inferredRatio 는 claims.ts 단일 소스에서 가져온다(중복 정의 금지).
 */
import type { GeneratedDoc } from '../doc-generator/types.js'
import { claimUnits, inferredRatio } from '../doc-generator/claims.js'

/** 문서 INFERRED 비율 차단 임계값(§0) — 초과 시 승인 차단. */
export const INFERRED_BLOCK_THRESHOLD = 0.6

/** evidence 위반 단건 — CONFIRMED claim 이 근거 0(§0 저장 차단 사유). */
export interface EvidenceViolation {
  section: string
  claim: string
  reason: 'confirmed-no-evidence'
}

/**
 * evidence 판정 결과.
 *  - ok: 위반 없음 && inferred 미차단(저장·승인 가능).
 *  - violations: (section, claim) 사전순 정렬(결정론).
 *  - inferredRatio: 문서 전체 INFERRED 비율(claims.ts 단일 소스).
 *  - inferredBlocked: inferredRatio > 0.6(승인 차단).
 */
export interface EvidenceVerdict {
  ok: boolean
  violations: EvidenceViolation[]
  inferredRatio: number
  inferredBlocked: boolean
}

/**
 * §0 evidence enforcement 판정.
 *  - Rule A: confidence CONFIRMED && evidence.length===0 -> 'confirmed-no-evidence' 위반.
 *  - Rule B: inferredRatio > 0.6 -> inferredBlocked(승인 차단).
 *  - ok = 위반 0 && !inferredBlocked.
 * claim-unit(claims + table.rows) 단위로 스캔한다 — SI 표 행도 1급 claim 이므로
 * 근거 0 CONFIRMED 행은 동일하게 위반이다(AC-9 grounding 불변).
 * violations 는 (section, claim) 사전순으로 안정 정렬한다.
 */
export function enforceEvidence(doc: GeneratedDoc): EvidenceVerdict {
  const violations: EvidenceViolation[] = []
  for (const unit of claimUnits(doc)) {
    if (unit.confidence === 'CONFIRMED' && unit.evidence.length === 0) {
      violations.push({
        section: unit.section,
        claim: unit.label,
        reason: 'confirmed-no-evidence',
      })
    }
  }
  violations.sort((a, b) =>
    a.section < b.section
      ? -1
      : a.section > b.section
        ? 1
        : a.claim < b.claim
          ? -1
          : a.claim > b.claim
            ? 1
            : 0,
  )

  const ratio = inferredRatio(doc)
  const inferredBlocked = ratio > INFERRED_BLOCK_THRESHOLD

  return {
    ok: violations.length === 0 && !inferredBlocked,
    violations,
    inferredRatio: ratio,
    inferredBlocked,
  }
}
