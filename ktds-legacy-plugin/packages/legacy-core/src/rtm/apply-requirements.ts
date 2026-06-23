/**
 * applyRequirements — 요구사항을 RTM 모델에 적용해 기능 상태/이력/규칙/커버리지를 재계산.
 * 설계: docs/ktds/RTM_TAB_DESIGN.md §1(불변 규칙) + v2 확장(AC·NFR·커버리지).
 *
 * 순수 함수. 요구사항(changeset −/~/+/= + supersede 체인 + 인수조건 AC)에서:
 *   1) requirementHistory = 그 기능을 건드린 요구사항 id(요구사항 순서).
 *   2) 기능 상태 = 현행 head(그 기능 건드린 가장 나중 요구사항) 동사로 재계산(되살아남 가능).
 *   3) rules(①) = 현행(ACTIVE) 요구사항들의 AC 중 이 기능을 매핑한 것 집계(규칙도 supersede).
 *   4) nfrTags(②) = 이 기능을 nfrScope 로 가리키는 ACTIVE 비기능 요구사항 id.
 *   5) coverage(⑥) = computeCoverage(model).
 *
 * 파괴적 삭제 없음. 결정론: 요구사항 id ASC. 입력 요구사항은 스키마 default 로 정규화한다.
 */
import { RtmRequirementSchema } from './types.js'
import type { RtmFunctionRow, RtmFunctionRule, RtmModel, RtmRequirement } from './types.js'
import { computeCoverage } from './coverage.js'
import { computeDiagnostics, natCmp } from './validate.js'

type Verb = 'added' | 'modified' | 'removed' | 'revived'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function verbOf(r: RtmRequirement, fnId: string): Verb | null {
  if (r.changeset.revived.includes(fnId)) return 'revived'
  if (r.changeset.added.includes(fnId)) return 'added'
  if (r.changeset.modified.includes(fnId)) return 'modified'
  if (r.changeset.removed.includes(fnId)) return 'removed'
  return null
}

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

/**
 * 요구사항을 모델에 적용. newFunctions(신규 TO-BE 행)는 기존 기능과 합쳐 동일 규칙으로 재계산.
 * 반환: functions(상태·이력·규칙·NFR 재계산) + requirements(정규화·정렬) + coverage.
 */
export function applyRequirements(
  model: RtmModel,
  requirements: RtmRequirement[],
  newFunctions: RtmFunctionRow[] = [],
): RtmModel {
  // 입력 정규화(스키마 default 채움) — 후방호환. 손상 요구사항은 드롭하되 **가시화**(C2).
  const droppedReqIds: string[] = []
  const sortedReqs: RtmRequirement[] = []
  for (const r of requirements) {
    const parsed = RtmRequirementSchema.safeParse(r)
    if (parsed.success) sortedReqs.push(parsed.data)
    else droppedReqIds.push(typeof (r as { id?: unknown })?.id === 'string' ? (r as { id: string }).id : '(id 미상)')
  }
  // 현행 head(§1) 선택이 순서에 의존하므로 자연순 정렬(REQ-2 < REQ-10, M3).
  sortedReqs.sort((a, b) => natCmp(a.id, b.id))

  const activeReqs = sortedReqs.filter((r) => r.status === 'ACTIVE')

  // ① 기능 → 규칙(현행 AC 집계). ② 기능 → NFR 태그.
  const rulesByFn = new Map<string, RtmFunctionRule[]>()
  const nfrByFn = new Map<string, Set<string>>()
  for (const r of activeReqs) {
    for (const ac of r.acceptanceCriteria) {
      for (const fnId of ac.fnIds) {
        const list = rulesByFn.get(fnId) ?? []
        list.push({ reqId: r.id, acId: ac.id, text: ac.text, kind: ac.kind, confidence: ac.confidence })
        rulesByFn.set(fnId, list)
      }
    }
    if (r.type === 'nonfunctional') {
      for (const fnId of r.nfrScope) {
        const set = nfrByFn.get(fnId) ?? new Set<string>()
        set.add(r.id)
        nfrByFn.set(fnId, set)
      }
    }
  }

  const recompute = (f: RtmFunctionRow): RtmFunctionRow => {
    const history = sortedReqs.filter((r) => verbOf(r, f.id) !== null).map((r) => r.id)
    let state = f.state
    let origin = f.origin
    if (history.length > 0) {
      let head: RtmRequirement | null = null
      for (const r of sortedReqs) if (verbOf(r, f.id)) head = r
      const verb = verbOf(head!, f.id)!
      const hasImpl = f.implementation.evidence.length > 0
      state = stateFor(verb, hasImpl)
      origin = verb === 'added' && !hasImpl ? 'TO_BE' : f.origin
    }
    const rules = (rulesByFn.get(f.id) ?? []).slice().sort((a, b) => cmp(a.reqId, b.reqId) || cmp(a.acId, b.acId))
    const nfrTags = [...(nfrByFn.get(f.id) ?? [])].sort(cmp)
    return { ...f, state, origin, requirementHistory: history, rules, nfrTags }
  }

  const functions = [...model.functions, ...newFunctions]
    .map(recompute)
    .sort((a, b) => cmp(a.domainId, b.domainId) || cmp(a.id, b.id))

  // 도메인 functionCount 갱신 + 신규(TO-BE) 도메인 표시명 승계.
  const counts = new Map<string, number>()
  const nameById = new Map(model.domains.map((d) => [d.id, d.name]))
  for (const f of functions) {
    counts.set(f.domainId, (counts.get(f.domainId) ?? 0) + 1)
    if (!nameById.has(f.domainId) && f.domainName.length > 0) nameById.set(f.domainId, f.domainName)
  }
  const domains = [...counts.keys()].sort(cmp).map((id) => ({
    id,
    name: nameById.get(id) ?? id,
    functionCount: counts.get(id) ?? 0,
  }))

  const next: RtmModel = { ...model, domains, functions, requirements: sortedReqs }
  const coverage = computeCoverage(next)
  const withCov: RtmModel = { ...next, coverage }
  return { ...withCov, diagnostics: computeDiagnostics(withCov, droppedReqIds) }
}
