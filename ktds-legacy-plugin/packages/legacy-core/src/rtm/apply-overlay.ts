/**
 * applyOverlay — 사람 편집/확정/검증 오버레이(rtm-overrides.json)를 모델에 적용(critic ⓐ).
 *
 * 검증 스파인의 **입력 경로**: 인테이크는 시험결과/검수를 채우지 않으므로(실측·고객 몫), 사람이
 * 대시보드에서 기록한 값을 여기서 모델에 반영해야 coverage(verified/signedOff)가 실데이터를 반영한다.
 * 적용 후 coverage/diagnostics 를 재계산한다(merged 모델 기준).
 *
 * on-disk 형식(R3 후방호환): 최상위 fnId 키 = 기능 오버레이, `_requirements` = 요구사항 오버레이.
 *   { "<fnId>": {editedCells,approver,at,audit},
 *     "_requirements": { "<reqId>": {lifecycle?,signoff?,tests:{"<acId>::<caseId>":{result,defectId}},approver,at,audit} } }
 *
 * 순수 함수. grounding: 사람 입력은 confidence 가 아니라 별도 축(approver/audit). 셀 값만 덮고
 * confidence 는 건드리지 않는다(편집셀 표시는 오버레이 존재로 판단 — 대시보드 책임).
 */
import type {
  AcceptanceCriterion,
  RtmFunctionOverride,
  RtmFunctionRow,
  RtmModel,
  RtmRequirement,
  RtmRequirementOverride,
} from './types.js'
import { RtmFunctionOverrideSchema, RtmRequirementOverrideSchema } from './types.js'
import { computeCoverage } from './coverage.js'
import { computeDiagnostics } from './validate.js'

/** on-disk 오버레이를 {functions, requirements} 로 분리(최상위 fnId vs `_requirements`). */
function splitOverlay(raw: Record<string, unknown>): {
  functions: Record<string, RtmFunctionOverride>
  requirements: Record<string, RtmRequirementOverride>
} {
  const functions: Record<string, RtmFunctionOverride> = {}
  const requirements: Record<string, RtmRequirementOverride> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k === '_requirements') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [reqId, rv] of Object.entries(v as Record<string, unknown>)) {
          const p = RtmRequirementOverrideSchema.safeParse(rv)
          if (p.success) requirements[reqId] = p.data
        }
      }
      continue
    }
    if (k.startsWith('_')) continue // 예약 키(미래 _fields 등) 무시.
    const p = RtmFunctionOverrideSchema.safeParse(v)
    if (p.success) functions[k] = p.data
  }
  return { functions, requirements }
}

/** editedCells 키 → 기능 셀 적용(값만 덮음). */
function applyFnEdits(f: RtmFunctionRow, ov: RtmFunctionOverride): RtmFunctionRow {
  const e = ov.editedCells
  const cell = (key: 'entryPoint' | 'implementation' | 'data' | 'test') =>
    typeof e[key] === 'string' ? { ...f[key], value: e[key] } : f[key]
  return {
    ...f,
    name: typeof e.name === 'string' ? e.name : f.name,
    entryPoint: cell('entryPoint'),
    implementation: cell('implementation'),
    data: cell('data'),
    test: cell('test'),
  }
}

/** 요구사항 오버레이 적용 — lifecycle/signoff 덮기 + AC 시험결과 반영. */
function applyReqEdits(r: RtmRequirement, ov: RtmRequirementOverride): RtmRequirement {
  const acceptanceCriteria: AcceptanceCriterion[] = r.acceptanceCriteria.map((ac) => {
    const tests = ac.tests.map((t) => {
      const key = `${ac.id}::${t.caseId}`
      const o = ov.tests[key]
      return o ? { ...t, result: o.result, defectId: o.defectId } : t
    })
    return { ...ac, tests }
  })
  return {
    ...r,
    lifecycle: ov.lifecycle ?? r.lifecycle,
    signoff: ov.signoff !== undefined ? ov.signoff : r.signoff,
    acceptanceCriteria,
  }
}

/**
 * 오버레이를 모델에 적용해 merged 모델 + 재계산된 coverage/diagnostics 를 반환.
 * rawOverlay 가 비었으면(없음) 입력 모델을 그대로(coverage 만 보장) 돌려준다.
 */
export function applyOverlay(model: RtmModel, rawOverlay: Record<string, unknown> = {}): RtmModel {
  const { functions: fnOv, requirements: reqOv } = splitOverlay(rawOverlay)
  const functions = model.functions.map((f) => (fnOv[f.id] ? applyFnEdits(f, fnOv[f.id]) : f))
  const requirements = model.requirements.map((r) => (reqOv[r.id] ? applyReqEdits(r, reqOv[r.id]) : r))
  const confirmedIds = new Set(Object.keys(fnOv))
  const merged: RtmModel = { ...model, functions, requirements }
  return {
    ...merged,
    coverage: computeCoverage(merged, confirmedIds),
    diagnostics: computeDiagnostics(merged),
  }
}
