/**
 * RTM 무결성 진단 + 자연순 id 비교 — critic 리뷰 반영(C1/C2/M3/M4/M5).
 *
 * LLM 인테이크(claude -p)는 잘못된 rtm-requirements.json 을 쓸 수 있다. zod 는 shape 만 검증하고
 * 교차참조(changeset/AC fnId·dependsOn·supersede)는 검증하지 않는다 → 여기서 **가시화**한다
 * (강제 대신 진단, 조용한 손실 금지). error=치명, warn=주의.
 */
import type { RtmDiagnostic, RtmModel, RtmRequirement } from './types.js'

/**
 * 자연순 비교(M3) — "REQ-2" < "REQ-10"(숫자 구간은 수치로). 문자열 cmp 의 사전순 역전 버그 해소.
 * 현행 head(§1 불변규칙) 선택이 요구사항 순서에 의존하므로 정확한 순서가 필수다.
 */
export function natCmp(a: string, b: string): number {
  const ax = a.match(/(\d+|\D+)/g) ?? [a]
  const bx = b.match(/(\d+|\D+)/g) ?? [b]
  const n = Math.max(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const aa = ax[i]
    const bb = bx[i]
    if (aa === undefined) return -1
    if (bb === undefined) return 1
    if (aa === bb) continue
    const an = /^\d/.test(aa)
    const bn = /^\d/.test(bb)
    if (an && bn) {
      const d = parseInt(aa, 10) - parseInt(bb, 10)
      if (d !== 0) return d < 0 ? -1 : 1
    } else {
      return aa < bb ? -1 : 1
    }
  }
  return 0
}

/** 첫 중복 원소(없으면 null) — id 중복 검출용. */
function firstDuplicate(ids: string[]): string | null {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) return id
    seen.add(id)
  }
  return null
}

/** 방향 그래프 순환 검출(DFS) — supersede / dependsOn 체인 acyclicity. */
function hasCycle(edges: Map<string, string[]>): boolean {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2
  const color = new Map<string, number>()
  const visit = (u: string): boolean => {
    color.set(u, GRAY)
    for (const v of edges.get(u) ?? []) {
      const c = color.get(v) ?? WHITE
      if (c === GRAY) return true
      if (c === WHITE && visit(v)) return true
    }
    color.set(u, BLACK)
    return false
  }
  for (const u of edges.keys()) if ((color.get(u) ?? WHITE) === WHITE && visit(u)) return true
  return false
}

/**
 * 조립된 모델 + 드롭된 요구사항 id 로 진단을 만든다. 결정론: 진단은 (level, code, ref) 정렬.
 * - error: 드롭(파싱 실패)·댕글링 changeset/AC fnId·중복 id·순환(supersede/dependsOn).
 * - warn:  AC.fnIds ⊄ changeset·동일 fnId 다중 버킷·댕글링 nfrScope/dependsOn/supersede·supersede 비대칭.
 */
export function computeDiagnostics(model: RtmModel, droppedReqIds: string[] = []): RtmDiagnostic[] {
  const out: RtmDiagnostic[] = []
  const add = (level: 'error' | 'warn', code: string, message: string, ref?: string): void => {
    out.push(ref === undefined ? { level, code, message } : { level, code, message, ref })
  }

  const fnIds = new Set(model.functions.map((f) => f.id))
  const domainIds = new Set(model.domains.map((d) => d.id))
  const reqIds = new Set(model.requirements.map((r) => r.id))
  const statusById = new Map(model.requirements.map((r) => [r.id, r.status]))

  for (const id of droppedReqIds) add('error', 'req-dropped', `요구사항 파싱 실패로 누락됨: ${id}`, id)

  const dupFn = firstDuplicate(model.functions.map((f) => f.id))
  if (dupFn) add('error', 'dup-function-id', `중복 기능 id: ${dupFn}`, dupFn)
  const dupReq = firstDuplicate(model.requirements.map((r) => r.id))
  if (dupReq) add('error', 'dup-requirement-id', `중복 요구사항 id: ${dupReq}`, dupReq)

  const supEdges = new Map<string, string[]>()
  const depEdges = new Map<string, string[]>()
  for (const r of model.requirements) {
    const buckets: Array<[keyof RtmRequirement['changeset'], string[]]> = [
      ['added', r.changeset.added],
      ['modified', r.changeset.modified],
      ['removed', r.changeset.removed],
      ['revived', r.changeset.revived],
    ]
    const csUnion = new Set<string>()
    const seenInBucket = new Set<string>()
    for (const [bucket, ids] of buckets) {
      for (const id of ids) {
        if (!fnIds.has(id)) add('error', 'dangling-changeset-fn', `요구 ${r.id} changeset.${bucket} 의 기능 id 없음: ${id}`, r.id)
        if (seenInBucket.has(id)) add('warn', 'fn-multiple-buckets', `요구 ${r.id} 의 기능 ${id} 이 changeset 여러 버킷에 중복`, r.id)
        seenInBucket.add(id)
        csUnion.add(id)
      }
    }
    for (const ac of r.acceptanceCriteria) {
      for (const id of ac.fnIds) {
        if (!fnIds.has(id)) add('error', 'dangling-ac-fn', `요구 ${r.id} ${ac.id} 의 기능 id 없음: ${id}`, `${r.id}/${ac.id}`)
        else if (!csUnion.has(id)) add('warn', 'ac-fn-not-in-changeset', `요구 ${r.id} ${ac.id} 의 기능 ${id} 이 changeset 에 없음`, `${r.id}/${ac.id}`)
      }
    }
    for (const id of r.nfrScope) {
      if (!fnIds.has(id) && !domainIds.has(id)) add('warn', 'dangling-nfr-scope', `요구 ${r.id} nfrScope 의 기능/도메인 id 없음: ${id}`, r.id)
    }
    for (const id of r.dependsOn) {
      if (!reqIds.has(id)) add('warn', 'dangling-depends-on', `요구 ${r.id} dependsOn 의 요구 id 없음: ${id}`, r.id)
      else if (r.status === 'ACTIVE' && statusById.get(id) === 'WITHDRAWN') {
        add('warn', 'depends-on-withdrawn', `유효 요구 ${r.id} 가 폐기된 요구 ${id} 에 의존(의존 끊김 — 재검토 필요)`, r.id)
      }
    }
    depEdges.set(r.id, r.dependsOn)
    if (r.supersedes !== null) {
      if (!reqIds.has(r.supersedes)) add('warn', 'dangling-supersedes', `요구 ${r.id} supersedes 의 요구 id 없음: ${r.supersedes}`, r.id)
      else {
        supEdges.set(r.id, [r.supersedes])
        const prev = model.requirements.find((x) => x.id === r.supersedes)
        if (prev && prev.supersededBy !== r.id) add('warn', 'supersede-asymmetry', `요구 ${r.id} supersedes ${r.supersedes} 이나 역참조(supersededBy) 불일치`, r.id)
      }
    }
  }
  if (hasCycle(supEdges)) add('error', 'supersede-cycle', 'supersede 체인에 순환이 있다(이력 타임라인 무한루프 위험)')
  if (hasCycle(depEdges)) add('error', 'depends-on-cycle', 'dependsOn 에 순환이 있다')

  return out.sort((a, b) => natCmp(a.level, b.level) || natCmp(a.code, b.code) || natCmp(a.ref ?? '', b.ref ?? ''))
}
