/**
 * claim 헬퍼 — 근거·태그·신뢰도율 도출(doc-templates.md §0 단일 소스).
 *
 * 신뢰도 태그 매핑(§0)은 CONFIDENCE_VALUES 단일 소스에 1:1 대응한다:
 *   CONFIRMED -> [확정] / CONFIRMED_AI -> [확정(AI)] / INFERRED -> [추정] /
 *   UNVERIFIED -> [확인 필요].
 *
 * evidence enforcement(§0): CONFIRMED claim 은 근거 0이면 안 된다 — claim() 이
 * 빌드 타임에 강제(throw)해 "근거 없는 확정"이 산출물에 새지 않게 한다.
 */
import type { Confidence } from '../types.js'
import type { Claim, Evidence, GeneratedDoc, TableRow } from './types.js'

/** confidence -> 신뢰도 태그(§0 4단계 매핑). CONFIDENCE_VALUES 단일 소스와 일치. */
export function confidenceTag(confidence: Confidence): string {
  switch (confidence) {
    case 'CONFIRMED':
      return '[확정]'
    case 'CONFIRMED_AI':
      return '[확정(AI)]'
    case 'INFERRED':
      return '[추정]'
    case 'UNVERIFIED':
      return '[확인 필요]'
  }
}

/**
 * claim 생성 헬퍼.
 *  - requiresHumanReview 미지정 시: CONFIRMED 만 false, 나머지는 true(검토 권장).
 *  - CONFIRMED 는 근거 0이면 throw(§0 evidence enforcement, fail-closed).
 */
export function claim(
  text: string,
  confidence: Confidence,
  evidence: Evidence[] = [],
  requiresHumanReview?: boolean,
): Claim {
  if (confidence === 'CONFIRMED' && evidence.length === 0) {
    throw new Error(`CONFIRMED claim without evidence (§0): ${text}`)
  }
  const review = requiresHumanReview ?? confidence !== 'CONFIRMED'
  return { text, confidence, evidence, requiresHumanReview: review }
}

/**
 * claim-unit — grounding 게이트(근거율/추론율/enforce/stale)의 단위.
 * as-built 문서는 section.claims, SI 문서는 section.table.rows 를 쓰지만 둘 다
 * 신뢰도(confidence) + 근거(evidence) 를 갖는 claim-equivalent 이므로 동일 단위로
 * 취급한다(AC-9 grounding 불변: 표 행도 1급 claim-unit). label 은 결정론적 식별자다.
 */
export interface ClaimUnit {
  section: string
  label: string
  confidence: Confidence
  evidence: Evidence[]
}

/**
 * 표 행(TableRow)의 결정론 식별자 — 첫 셀(비어 있지 않으면), 없으면 전체 셀을 ' | '
 * 로 조인. cells 가 전부 비면 행 인덱스로 폴백(중복/빈 셀에도 안정적 라벨 보장).
 */
function rowLabel(row: TableRow, index: number): string {
  const first = row.cells[0]
  if (typeof first === 'string' && first.length > 0) return first
  const joined = row.cells.join(' | ')
  return joined.length > 0 ? joined : `row#${index + 1}`
}

/**
 * 문서의 모든 claim-unit 을 평탄화 — section.claims(label=claim.text) 와
 * section.table.rows(label=행 식별자) 를 통합한다. 순서는 섹션 순서 -> 섹션 내
 * claims 먼저, 그다음 table.rows(결정론). SI 문서는 이로써 실제 근거율을 얻는다.
 */
export function claimUnits(doc: GeneratedDoc): ClaimUnit[] {
  const units: ClaimUnit[] = []
  for (const section of doc.sections) {
    for (const c of section.claims) {
      units.push({
        section: section.heading,
        label: c.text,
        confidence: c.confidence,
        evidence: c.evidence,
      })
    }
    if (section.table) {
      section.table.rows.forEach((row, i) => {
        units.push({
          section: section.heading,
          label: rowLabel(row, i),
          confidence: row.confidence,
          evidence: row.evidence,
        })
      })
    }
  }
  return units
}

/**
 * evidenceRate — CONFIRMED 비율(§0 "CONFIRMED 비율(근거 보유 claim)").
 * claim-unit 이 0건이면 0(0/0 NaN 방지). claims + table.rows 를 함께 센다.
 */
export function evidenceRate(doc: GeneratedDoc): number {
  const units = claimUnits(doc)
  if (units.length === 0) return 0
  const confirmed = units.filter((u) => u.confidence === 'CONFIRMED').length
  return confirmed / units.length
}

/**
 * inferredRatio — INFERRED 비율(§0 "INFERRED 비율 > 0.6 -> 승인 차단" 게이트용).
 * claim-unit 이 0건이면 0. claims + table.rows 를 함께 센다.
 */
export function inferredRatio(doc: GeneratedDoc): number {
  const units = claimUnits(doc)
  if (units.length === 0) return 0
  const inferred = units.filter((u) => u.confidence === 'INFERRED').length
  return inferred / units.length
}
