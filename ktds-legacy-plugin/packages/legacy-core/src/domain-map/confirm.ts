/**
 * CONFIRM 게이트(S7) — 확정 플랜에 대한 순수 연산 + 영속화.
 *
 * 자동 도메인 경계는 전문가 일치율 상한이 낮아 사람 게이트를 생략할 수 없다.
 * 결정은 domain-plan.confirmed.json 으로 영속되어 재실행의 결정론 닻이 된다.
 * 모든 순수 함수는 새 플랜 객체를 반환하며 입력을 변형하지 않는다(불변).
 * 모든 도메인/루트/aliasKeys/excludedKeys 는 정렬되어 byte-identical 을 보장한다.
 */
import type { CandidatesReport, ConfirmedDomain, ConfirmedPlan } from './types.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(cmp)
}

/** 후보를 그대로 수용하는 플랜 — 인터랙티브 세션/--auto-approve 의 시작점. */
export function buildAutoPlan(
  candidates: CandidatesReport,
  decidedBy: string = 'auto',
): ConfirmedPlan {
  const domains: ConfirmedDomain[] = candidates.candidates
    .map((c) => ({
      key: c.key,
      name: c.key,
      roots: sortUnique(c.roots),
      aliasKeys: [],
    }))
    .sort((a, b) => cmp(a.key, b.key))
  return {
    schemaVersion: 1,
    gitCommit: candidates.gitCommit,
    decidedBy,
    domains,
    excludedKeys: [],
  }
}

/** 개명 — 표시명만 바꾼다(key 는 skeleton ID 의 닻이라 불변). AC-31: LLM 제안명 적용 지점. */
export function renameDomain(plan: ConfirmedPlan, key: string, newName: string): ConfirmedPlan {
  if (!plan.domains.some((d) => d.key === key)) {
    throw new Error(`unknown domain key: "${key}"`)
  }
  return {
    ...plan,
    domains: plan.domains.map((d) => (d.key === key ? { ...d, name: newName } : d)),
  }
}

/** 병합 — from 의 루트를 into 로 흡수, from key 를 into.aliasKeys 에 기록 후 from 도메인 제거. */
export function mergeDomains(
  plan: ConfirmedPlan,
  fromKey: string,
  intoKey: string,
): ConfirmedPlan {
  if (fromKey === intoKey) throw new Error('cannot merge a domain into itself')
  const from = plan.domains.find((d) => d.key === fromKey)
  const into = plan.domains.find((d) => d.key === intoKey)
  if (!from) throw new Error(`unknown domain key: "${fromKey}"`)
  if (!into) throw new Error(`unknown domain key: "${intoKey}"`)
  return {
    ...plan,
    domains: plan.domains
      .filter((d) => d.key !== fromKey)
      .map((d) =>
        d.key === intoKey
          ? {
              ...d,
              roots: sortUnique([...d.roots, ...from.roots]),
              aliasKeys: sortUnique([...d.aliasKeys, fromKey, ...from.aliasKeys]),
            }
          : d,
      ),
  }
}

/**
 * 이동 — 루트 파일을 다른 도메인으로 옮긴다.
 * 마지막 루트가 빠진 도메인은 사라진다(빈 도메인은 skeleton 에서 무의미).
 */
export function moveRoot(plan: ConfirmedPlan, root: string, toKey: string): ConfirmedPlan {
  const owner = plan.domains.find((d) => d.roots.includes(root))
  if (!owner) throw new Error(`root not in any domain: "${root}"`)
  if (!plan.domains.some((d) => d.key === toKey)) {
    throw new Error(`unknown domain key: "${toKey}"`)
  }
  return {
    ...plan,
    domains: plan.domains
      .map((d) => ({
        ...d,
        roots:
          d.key === toKey
            ? sortUnique([...d.roots, root])
            : d.roots.filter((r) => r !== root),
      }))
      .filter((d) => d.roots.length > 0),
  }
}

/** 제외 — 도메인을 빼고 key 를 excludedKeys 에 기록(정렬, 감사 추적). */
export function excludeDomain(plan: ConfirmedPlan, key: string): ConfirmedPlan {
  if (!plan.domains.some((d) => d.key === key)) {
    throw new Error(`unknown domain key: "${key}"`)
  }
  return {
    ...plan,
    domains: plan.domains.filter((d) => d.key !== key),
    excludedKeys: sortUnique([...plan.excludedKeys, key]),
  }
}

/**
 * 드리프트 감지 — confirmed 이후 코드가 변해 후보가 달라진 경우.
 * addedRoots: 현재 후보에 새로 생겼지만 플랜이 모르는 루트(재확정 필요 신호).
 * removedRoots: 플랜이 알지만 현재 후보에 없는 루트(삭제/이동됨).
 */
export function detectPlanDrift(
  plan: ConfirmedPlan,
  freshCandidates: CandidatesReport,
): { addedRoots: string[]; removedRoots: string[] } {
  const candidateRoots = new Set(freshCandidates.candidates.flatMap((c) => c.roots))
  const planRoots = new Set(plan.domains.flatMap((d) => d.roots))
  return {
    addedRoots: [...candidateRoots].filter((r) => !planRoots.has(r)).sort(cmp),
    removedRoots: [...planRoots].filter((r) => !candidateRoots.has(r)).sort(cmp),
  }
}

/** 게이트 제시용 표 행 — 데이터만 반환(엔진은 콘솔 포매팅을 하지 않는다). */
export interface PlanRow {
  key: string
  name: string
  rootCount: number
  entryCount: number
  fileCount: number
}

/**
 * 후보 또는 확정 플랜을 결정론적 표 행 배열로 변환한다(key 정렬).
 * 후보는 entryCount/파일수를 직접 안다. 확정 플랜은 도메인 멤버십만 알므로
 * entryCount/fileCount 를 0 으로 둔다(라우트/슬라이스는 재스캔의 책임).
 */
export function planTable(source: CandidatesReport | ConfirmedPlan): PlanRow[] {
  if ('candidates' in source) {
    return source.candidates
      .map((c) => ({
        key: c.key,
        name: c.key,
        rootCount: c.roots.length,
        entryCount: c.entryCount,
        fileCount: c.files.length + c.roots.length,
      }))
      .sort((a, b) => cmp(a.key, b.key))
  }
  return source.domains
    .map((d) => ({
      key: d.key,
      name: d.name,
      rootCount: d.roots.length,
      entryCount: 0,
      fileCount: d.roots.length,
    }))
    .sort((a, b) => cmp(a.key, b.key))
}

export { writeConfirmedPlan, readConfirmedPlan } from './persist.js'
