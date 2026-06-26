/**
 * withdrawRequest(절차 B) — 요청(REQ) 1건을 철회/폐기한다. 순수 함수.
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §8(변경관리). 철회는 **요청 단위**:
 * REQ-001 폐기 → 그 요청에서 분해된 하위 요구사항(source.section === REQ-001)을 **동반 폐기**.
 *
 * 불변 규칙(§4):
 *   1) 파괴적 삭제 금지 — 요구사항 행은 지우지 않고 status=WITHDRAWN 으로 표시(이력 보존).
 *   2) 폐기 메타 — changeReq(crNo/reason/approver/effort)에 CR 근거를 남긴다(⑨).
 *   3) 멱등 — 이미 WITHDRAWN 인 요구사항은 그대로 두고 alreadyWithdrawn 으로 보고.
 *
 * 입력 배열 순서를 보존한다(결정론, Date.now 미사용). 실제 기능 상태 원복은 applyRequirements 가
 * WITHDRAWN 을 현행 head 에서 제외해 재계산한다(rtm.json 재bake 시).
 */
import { RtmRequirementSchema } from './types.js'
import type { ChangeReq, RtmRequirement } from './types.js'

export interface WithdrawOptions {
  /** 변경요청 번호(CR-xxx). 폐기 근거의 키. */
  crNo: string
  reason?: string | null
  approver?: string | null
  effort?: string | null
}

export interface WithdrawResult {
  /** 갱신된 요구사항 배열(순서 보존). */
  requirements: RtmRequirement[]
  /** 이번에 WITHDRAWN 으로 바뀐 요구사항 id(자연 입력 순서). */
  withdrawn: string[]
  /** 이미 WITHDRAWN 이라 변경 없던 요구사항 id. */
  alreadyWithdrawn: string[]
  /** 이 REQ 에 속한 요구사항이 하나도 없으면 true(오타·없는 요청). */
  notFound: boolean
}

/** REQ 에 속한 요구사항 = source.section === reqId(project-intake 가 그렇게 귀속). */
function belongsToRequest(r: RtmRequirement, reqId: string): boolean {
  return r.source?.section === reqId
}

/**
 * 요청(REQ) 철회. requirements 안에서 source.section===reqId 인 항목을 WITHDRAWN 으로 표시하고
 * changeReq 를 채운다. 나머지는 그대로. 입력은 스키마 default 로 정규화(후방호환).
 */
export function withdrawRequest(
  requirements: RtmRequirement[],
  reqId: string,
  opts: WithdrawOptions,
): WithdrawResult {
  const changeReq: ChangeReq = {
    crNo: opts.crNo,
    reason: opts.reason ?? null,
    approver: opts.approver ?? null,
    effort: opts.effort ?? null,
  }
  const withdrawn: string[] = []
  const alreadyWithdrawn: string[] = []
  let matched = false

  const next = requirements.map((raw) => {
    const parsed = RtmRequirementSchema.safeParse(raw)
    const r = parsed.success ? parsed.data : raw
    if (!belongsToRequest(r, reqId)) return r
    matched = true
    if (r.status === 'WITHDRAWN') {
      alreadyWithdrawn.push(r.id)
      return r
    }
    withdrawn.push(r.id)
    return { ...r, status: 'WITHDRAWN' as const, changeReq }
  })

  return { requirements: next, withdrawn, alreadyWithdrawn, notFound: !matched }
}
