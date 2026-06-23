/**
 * applyRequirements — 요구사항을 RTM 모델에 적용해 기능 상태/이력을 재계산(R4).
 * 설계: docs/ktds/RTM_TAB_DESIGN.md §1(불변 규칙).
 *
 * 순수 함수. 요구사항(각 changeset 으로 기능에 가한 분류 −/~/+/=) + supersede 체인에서:
 *   1) 각 기능의 requirementHistory = 그 기능을 건드린 요구사항 id(요구사항 순서).
 *   2) 기능 상태 = **현행 head(그 기능을 건드린 가장 나중 요구사항)** 의 동사로 재계산.
 *      → 누적이 아니라 항상 최신 기준 → REQ2 가 제거한 구현을 REQ3 가 되살릴(revive) 수 있다.
 *   3) 파괴적 삭제 없음: removed 는 ORPHANED(코드 존재 시) 로 표시만(실제 제거는 사람 확정).
 *
 * 결정론: 요구사항은 id ASC 로 정렬해 head 를 정한다(intake 가 zero-pad id 부여).
 * R4 범위: 기존(AS-IS) 기능에 대한 modify/remove/revive + newFunctions 로 들어온 신규(TO-BE)
 * 기능 행도 동일 규칙으로 처리. 합성 금지: 근거는 빌더 산출 그대로 승계.
 */
import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

type Verb = 'added' | 'modified' | 'removed' | 'revived'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 요구사항 r 이 기능 fnId 에 가한 동사(없으면 null). 우선순위: revived>added>modified>removed. */
function verbOf(r: RtmRequirement, fnId: string): Verb | null {
  if (r.changeset.revived.includes(fnId)) return 'revived'
  if (r.changeset.added.includes(fnId)) return 'added'
  if (r.changeset.modified.includes(fnId)) return 'modified'
  if (r.changeset.removed.includes(fnId)) return 'removed'
  return null
}

/** 현행 head 동사 + 구현 근거 보유 여부 → 기능 상태. */
function stateFor(verb: Verb, hasImpl: boolean): RtmFunctionRow['state'] {
  switch (verb) {
    case 'removed':
      return hasImpl ? 'ORPHANED' : 'PLANNED'
    case 'added':
      return hasImpl ? 'IMPLEMENTED' : 'PLANNED'
    case 'modified':
      return 'CHANGED'
    case 'revived':
      return hasImpl ? 'IMPLEMENTED' : 'PARTIAL'
  }
}

/** 한 기능 행을 요구사항 이력으로 재계산(history + state + origin). 건드린 요구사항 없으면 원본 유지. */
function recompute(f: RtmFunctionRow, sortedReqs: RtmRequirement[]): RtmFunctionRow {
  const history = sortedReqs.filter((r) => verbOf(r, f.id) !== null).map((r) => r.id)
  if (history.length === 0) return { ...f, requirementHistory: [] }
  // 현행 head = 그 기능을 건드린 가장 나중(최대 순서) 요구사항.
  let head: RtmRequirement | null = null
  for (const r of sortedReqs) if (verbOf(r, f.id)) head = r
  const verb = verbOf(head!, f.id)!
  const hasImpl = f.implementation.evidence.length > 0
  const state = stateFor(verb, hasImpl)
  // origin: 코드 근거 없이 요구사항으로만 존재(added/미구현) → TO_BE, 그 외 기존 유지.
  const origin: RtmFunctionRow['origin'] = verb === 'added' && !hasImpl ? 'TO_BE' : f.origin
  return { ...f, state, origin, requirementHistory: history }
}

/**
 * 요구사항을 모델에 적용. newFunctions(신규 TO-BE 기능 행, 인테이크 R5 용)는 기존 기능과 합쳐
 * 동일 규칙으로 재계산한다. 반환 모델의 requirements 는 id ASC 정렬, functions 는 (domainId,id) 정렬.
 */
export function applyRequirements(
  model: RtmModel,
  requirements: RtmRequirement[],
  newFunctions: RtmFunctionRow[] = [],
): RtmModel {
  const sortedReqs = [...requirements].sort((a, b) => cmp(a.id, b.id))
  const allFns = [...model.functions, ...newFunctions]
  const functions = allFns
    .map((f) => recompute(f, sortedReqs))
    .sort((a, b) => cmp(a.domainId, b.domainId) || cmp(a.id, b.id))

  // 도메인 functionCount 갱신(신규 기능 반영) + 신규 도메인 합류.
  const counts = new Map<string, number>()
  for (const f of functions) counts.set(f.domainId, (counts.get(f.domainId) ?? 0) + 1)
  const domainsById = new Map(model.domains.map((d) => [d.id, d]))
  const domains = [...counts.keys()].sort(cmp).map((id) => ({
    id,
    name: domainsById.get(id)?.name ?? id,
    functionCount: counts.get(id) ?? 0,
  }))

  return { ...model, domains, functions, requirements: sortedReqs }
}
