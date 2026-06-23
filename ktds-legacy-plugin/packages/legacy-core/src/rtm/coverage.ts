/**
 * computeCoverage(⑥) — RTM 커버리지/갭 롤업. 순수 함수. 설계: docs/ktds/RTM_TAB_DESIGN.md.
 *
 * RTM 의 핵심 가치(빈칸=위험)를 요약 수치 + 갭 목록으로 드러낸다:
 *   - 요구사항: 구현·검증·검수 집계 + lifecycle 분포.
 *   - 기능: 구현/미구현/고아/확정 집계.
 *   - 테스트: AC 의 시험결과 집계(통과/실패/미실행).
 *   - 갭: 미구현 요구 ↔ 고아 코드 ↔ 미검증 기능(양방향 추적 누락).
 *
 * 결정론: 갭 배열은 id ASC. confirmedIds(런타임 오버레이의 확정 기능 집합)는 선택(없으면 0).
 */
import type { RtmCoverage, RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 구현 근거가 있거나 상태가 구현/변경이면 "만들어진" 기능으로 본다. */
function isBuilt(f: RtmFunctionRow): boolean {
  return f.implementation.evidence.length > 0 || f.state === 'IMPLEMENTED' || f.state === 'CHANGED'
}

/** 요구사항이 실제로 바꾸려는 기능 = added ∪ modified ∪ revived(removed 는 제거 대상이라 제외). */
function targetsOf(r: RtmRequirement): string[] {
  return [...new Set([...r.changeset.added, ...r.changeset.modified, ...r.changeset.revived])]
}

export function computeCoverage(model: RtmModel, confirmedIds: Set<string> = new Set()): RtmCoverage {
  const fns = model.functions
  const byId = new Map(fns.map((f) => [f.id, f]))

  // 요구사항: 대상 기능이 전부 만들어졌으면 구현, AC 가 전부 PASS 면 검증, signoff.approved 면 검수.
  const reqImplemented = (r: RtmRequirement): boolean => {
    const ts = targetsOf(r)
    if (ts.length === 0) return false // NFR/대상 미정 — 구현 판정 불가(보수적).
    return ts.every((id) => {
      const f = byId.get(id)
      return f ? isBuilt(f) : false
    })
  }
  const reqVerified = (r: RtmRequirement): boolean =>
    r.acceptanceCriteria.length > 0 && r.acceptanceCriteria.every((ac) => ac.tests.some((t) => t.result === 'PASS'))

  const reqs = model.requirements
  const byLifecycle: Record<string, number> = {}
  for (const r of reqs) byLifecycle[r.lifecycle] = (byLifecycle[r.lifecycle] ?? 0) + 1

  // 테스트: AC 의 시험결과 집계.
  let tTotal = 0,
    tPass = 0,
    tFail = 0,
    tUntested = 0
  for (const r of reqs) {
    for (const ac of r.acceptanceCriteria) {
      for (const t of ac.tests) {
        tTotal += 1
        if (t.result === 'PASS') tPass += 1
        else if (t.result === 'FAIL') tFail += 1
        else if (t.result === 'UNTESTED') tUntested += 1
      }
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
        .filter((f) => (f.state === 'IMPLEMENTED' || f.state === 'CHANGED') && f.test.value.trim() === '')
        .map((f) => f.id)
        .sort(cmp),
    },
  }
}
