/**
 * rtm — 요구사항 추적표(RTM) 패키지 진입점. docs/ktds/RTM_TAB_DESIGN.md.
 *
 * R1: 데이터 모델(zod) + buildRtm(AS-IS 빌더). R3 에서 rtm-overrides 오버레이,
 * R4/R5 에서 requirements/changeset/인테이크가 이어진다.
 */
export {
  RtmConfidenceSchema,
  RtmTraceCellSchema,
  RtmOriginSchema,
  RtmFunctionStateSchema,
  RtmFunctionRowSchema,
  RtmDomainSchema,
  RtmChangesetSchema,
  RtmRequirementSchema,
  RtmModelSchema,
} from './types.js'
export type {
  RtmTraceCell,
  RtmOrigin,
  RtmFunctionState,
  RtmFunctionRow,
  RtmDomain,
  RtmChangeset,
  RtmRequirement,
  RtmModel,
} from './types.js'
export { buildRtm } from './build-rtm.js'
