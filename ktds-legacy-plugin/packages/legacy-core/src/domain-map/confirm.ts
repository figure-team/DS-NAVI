/**
 * CONFIRM 게이트(S7) — 확정 플랜에 대한 순수 연산 + 영속화.
 *
 * 자동 도메인 경계는 전문가 일치율 상한이 낮아 사람 게이트를 생략할 수 없다.
 * 결정은 domain-plan.confirmed.json 으로 영속되어 재실행의 결정론 닻이 된다.
 * 모든 순수 함수는 새 플랜 객체를 반환하며 입력을 변형하지 않는다(불변).
 * 모든 도메인/루트/aliasKeys/excludedKeys 는 정렬되어 byte-identical 을 보장한다.
 */
import type {
  CandidatesReport,
  ConfirmedDomain,
  ConfirmedGroup,
  ConfirmedPlan,
  DomainConfidence,
  PlanOp,
} from './types.js'
import { GROUP_KEY_PREFIX, PlanOpsSchema } from './types.js'

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

/**
 * 그룹 정합 유지(불변 규칙 1·5) — 도메인이 사라진 뒤(merge/move/exclude) 그룹의
 * memberKeys 에서 죽은 key 를 걷어내고, 빈 그룹은 삭제한다. groups 가 비면 필드를
 * 아예 생략해 그룹 없는 기존 플랜과 직렬화가 일치한다(byte-identical 폴백).
 */
function pruneGroups(plan: ConfirmedPlan): ConfirmedPlan {
  if (!plan.groups) return plan
  const alive = new Set(plan.domains.map((d) => d.key))
  const groups = plan.groups
    .map((g) => ({ ...g, memberKeys: g.memberKeys.filter((k) => alive.has(k)) }))
    .filter((g) => g.memberKeys.length > 0)
  if (groups.length === 0) {
    const { groups: _dropped, ...rest } = plan
    return rest
  }
  return { ...plan, groups }
}

/** 정렬 규약(불변 규칙 4) — groups 는 key 순, memberKeys 는 사전순. */
function sortGroups(groups: ConfirmedGroup[]): ConfirmedGroup[] {
  return groups
    .map((g) => ({ ...g, memberKeys: sortUnique(g.memberKeys) }))
    .sort((a, b) => cmp(a.key, b.key))
}

/**
 * 그룹 생성·확장(멱등 upsert) — 상단도메인(DOMAIN_HIERARCHY D1)을 plan 에 기록한다.
 * 같은 key 재호출 시 members 합집합 + name 갱신. 불변 규칙:
 * `g:` 접두 필수 / member 는 실존 도메인 / 한 도메인은 최대 1개 그룹(다른 그룹
 * 소속 member 는 오류 — LLM 초안의 중복 배정을 fail-closed 로 잡는다).
 */
export function groupDomains(
  plan: ConfirmedPlan,
  key: string,
  name: string,
  members: string[],
): ConfirmedPlan {
  if (!key.startsWith(GROUP_KEY_PREFIX)) {
    throw new Error(`group key must start with "${GROUP_KEY_PREFIX}": "${key}"`)
  }
  if (members.length === 0) throw new Error(`group "${key}" needs at least one member`)
  for (const m of members) {
    if (!plan.domains.some((d) => d.key === m)) throw new Error(`unknown domain key: "${m}"`)
    const other = (plan.groups ?? []).find((g) => g.key !== key && g.memberKeys.includes(m))
    if (other) {
      throw new Error(`domain "${m}" already belongs to group "${other.key}" — ungroup first`)
    }
  }
  const existing = (plan.groups ?? []).find((g) => g.key === key)
  const merged: ConfirmedGroup = {
    key,
    name,
    memberKeys: sortUnique([...(existing?.memberKeys ?? []), ...members]),
  }
  return {
    ...plan,
    groups: sortGroups([...(plan.groups ?? []).filter((g) => g.key !== key), merged]),
  }
}

/** 그룹 해체 — 그룹만 사라지고 소속 도메인은 잔존(비파괴). 마지막 그룹이면 필드 생략. */
export function ungroupDomains(plan: ConfirmedPlan, key: string): ConfirmedPlan {
  if (!(plan.groups ?? []).some((g) => g.key === key)) {
    throw new Error(`unknown group key: "${key}"`)
  }
  const groups = (plan.groups ?? []).filter((g) => g.key !== key)
  if (groups.length === 0) {
    const { groups: _dropped, ...rest } = plan
    return rest
  }
  return { ...plan, groups }
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
  return pruneGroups({
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
  })
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
  return pruneGroups({
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
  })
}

/** 제외 — 도메인을 빼고 key 를 excludedKeys 에 기록(정렬, 감사 추적). */
export function excludeDomain(plan: ConfirmedPlan, key: string): ConfirmedPlan {
  if (!plan.domains.some((d) => d.key === key)) {
    throw new Error(`unknown domain key: "${key}"`)
  }
  return pruneGroups({
    ...plan,
    domains: plan.domains.filter((d) => d.key !== key),
    excludedKeys: sortUnique([...plan.excludedKeys, key]),
  })
}

/**
 * ops 파일 파싱 — 형식 오류는 어떤 항목이 왜 틀렸는지 명확히 던진다(조용한 스킵 금지).
 */
export function parsePlanOps(raw: unknown): PlanOp[] {
  const parsed = PlanOpsSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `ops 형식 오류(${issue.path.join('.')}): ${issue.message} — ` +
        `허용: {op:"merge",from,into} | {op:"move",root,to} | {op:"exclude",key} | {op:"rename",key,name} | ` +
        `{op:"group",key,name,members[]} | {op:"ungroup",key}`,
    )
  }
  return parsed.data
}

/**
 * 보정 연산 순차 적용 — 자동 플랜 위에 사람 결정을 결정론적으로 재생한다.
 * 각 연산은 기존 순수 함수(merge/move/exclude/rename)로 위임하며, 존재하지 않는
 * key/root 는 해당 함수가 몇 번째 연산인지 식별 가능한 오류로 던진다.
 */
export function applyOps(plan: ConfirmedPlan, ops: PlanOp[]): ConfirmedPlan {
  let next = plan
  ops.forEach((op, i) => {
    try {
      switch (op.op) {
        case 'merge':
          next = mergeDomains(next, op.from, op.into)
          break
        case 'move':
          next = moveRoot(next, op.root, op.to)
          break
        case 'exclude':
          next = excludeDomain(next, op.key)
          break
        case 'rename':
          next = renameDomain(next, op.key, op.name)
          break
        case 'group':
          next = groupDomains(next, op.key, op.name, op.members)
          break
        case 'ungroup':
          next = ungroupDomains(next, op.key)
          break
      }
    } catch (err) {
      throw new Error(`ops[${i}] ${op.op} 적용 실패: ${(err as Error).message}`)
    }
  })
  return next
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
  /** 증거 확신도 — 후보(candidates) 소스에서만 존재(확정 플랜은 미보유). */
  confidence?: DomainConfidence
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
        confidence: c.confidence,
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
