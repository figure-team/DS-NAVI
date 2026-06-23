/**
 * computeCoverage(⑥) — RTM 커버리지/갭 롤업. 순수 함수. 설계: docs/ktds/RTM_TAB_DESIGN.md.
 *
 * RTM 핵심 가치(빈칸=위험)를 요약 수치 + 갭 + 요구사항 단위 진척으로 드러낸다.
 * critic 반영: NFR 은 nfrScope 로 구현 판정(M1), 검증은 AC.tests ↔ 기능 test 셀을 화해(M2).
 * 결정론: 갭 배열은 id ASC. confirmedIds(런타임 확정 기능 집합)는 선택(없으면 0).
 */
import type { RtmCoverage, RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function isBuilt(f: RtmFunctionRow): boolean {
  return f.implementation.evidence.length > 0 || f.state === 'IMPLEMENTED' || f.state === 'CHANGED'
}

/** 요구사항이 바꾸려는 기능 = added ∪ modified ∪ revived(removed 는 제거 대상이라 제외). */
function targetsOf(r: RtmRequirement): string[] {
  return [...new Set([...r.changeset.added, ...r.changeset.modified, ...r.changeset.revived])]
}

export function computeCoverage(model: RtmModel, confirmedIds: Set<string> = new Set()): RtmCoverage {
  const fns = model.functions
  const byId = new Map(fns.map((f) => [f.id, f]))
  const reqs = model.requirements

  // M2: AC 의 PASS 테스트가 가리키는 기능 집합 — 기능 검증 판정에 AC.tests 를 반영(축 화해).
  const acPassFns = new Set<string>()
  for (const r of reqs) {
    for (const ac of r.acceptanceCriteria) {
      if (ac.tests.some((t) => t.result === 'PASS')) for (const id of ac.fnIds) acPassFns.add(id)
    }
  }
  const fnVerified = (f: RtmFunctionRow): boolean => f.test.value.trim() !== '' || acPassFns.has(f.id)

  // M1: NFR 은 nfrScope 로 구현 판정(대상 기능 없음을 미구현으로 오인하지 않음).
  const reqImplemented = (r: RtmRequirement): boolean => {
    if (r.type === 'nonfunctional') {
      const scope = r.nfrScope.map((id) => byId.get(id)).filter((f): f is RtmFunctionRow => Boolean(f))
      if (scope.length === 0) return r.signoff?.approved === true // 시스템 전체 NFR: 검수돼야 완료.
      return scope.every(isBuilt)
    }
    const ts = targetsOf(r)
    if (ts.length === 0) return false
    return ts.every((id) => {
      const f = byId.get(id)
      return f ? isBuilt(f) : false
    })
  }
  // AC 가 있으면 전 AC PASS, 없으면 대상 기능이 전부 검증됐는지로 폴백(0-AC 도 판정 가능, M2).
  const reqVerified = (r: RtmRequirement): boolean => {
    if (r.acceptanceCriteria.length > 0) return r.acceptanceCriteria.every((ac) => ac.tests.some((t) => t.result === 'PASS'))
    const ts = targetsOf(r)
    if (ts.length === 0) return false
    return ts.every((id) => {
      const f = byId.get(id)
      return f ? fnVerified(f) : false
    })
  }

  const byLifecycle: Record<string, number> = {}
  for (const r of reqs) byLifecycle[r.lifecycle] = (byLifecycle[r.lifecycle] ?? 0) + 1

  let tTotal = 0,
    tPass = 0,
    tFail = 0,
    tUntested = 0
  const byRequirement: Record<string, { targetsTotal: number; targetsBuilt: number; acsTotal: number; acsPassed: number }> = {}
  for (const r of reqs) {
    for (const ac of r.acceptanceCriteria) {
      for (const t of ac.tests) {
        tTotal += 1
        if (t.result === 'PASS') tPass += 1
        else if (t.result === 'FAIL') tFail += 1
        else if (t.result === 'UNTESTED') tUntested += 1
      }
    }
    const ts = targetsOf(r)
    byRequirement[r.id] = {
      targetsTotal: ts.length,
      targetsBuilt: ts.filter((id) => {
        const f = byId.get(id)
        return f ? isBuilt(f) : false
      }).length,
      acsTotal: r.acceptanceCriteria.length,
      acsPassed: r.acceptanceCriteria.filter((ac) => ac.tests.some((t) => t.result === 'PASS')).length,
    }
  }

  return {
    requirements: {
      total: reqs.length,
      implemented: reqs.filter(reqImplemented).length,
      verified: reqs.filter(reqVerified).length,
      signedOff: reqs.filter((r) => r.signoff?.approved === true).length,
      byLifecycle,
    },
    functions: {
      total: fns.length,
      implemented: fns.filter((f) => f.state === 'IMPLEMENTED').length,
      planned: fns.filter((f) => f.state === 'PLANNED').length,
      orphaned: fns.filter((f) => f.state === 'ORPHANED').length,
      confirmed: fns.filter((f) => confirmedIds.has(f.id)).length,
    },
    tests: { total: tTotal, pass: tPass, fail: tFail, untested: tUntested },
    gaps: {
      unimplemented: reqs.filter((r) => r.status === 'ACTIVE' && !reqImplemented(r)).map((r) => r.id).sort(cmp),
      orphanCode: fns.filter((f) => f.state === 'ORPHANED').map((f) => f.id).sort(cmp),
      unverified: fns
        .filter((f) => (f.state === 'IMPLEMENTED' || f.state === 'CHANGED') && !fnVerified(f))
        .map((f) => f.id)
        .sort(cmp),
    },
    byRequirement,
  }
}
