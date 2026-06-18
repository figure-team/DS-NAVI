/**
 * 02_architecture.md — 아키텍처 빌더(template §1).
 *
 * 섹션 순서·헤딩(AC-36): 레이어 / 의존 방향 / 순환 의존 후보.
 *
 * 그래프 모델 매핑(정직성): UaGraphEdge 종류는 contains_flow/flow_step/calls 다.
 * 의존 방향·순환 탐지는 `calls`(단계→단계 호출) 엣지로 한다 — 이 모델에서 의존을
 * 표현하는 유일한 엣지다(블루프린트의 depends_on/imports 에 대응). file-단위
 * import 의존(edges.json)은 별도 산출물이므로 여기서 합성하지 않는다(grounding 보존).
 *
 * 레이어는 node.layer(ground-truth 신호 기반, 하드코딩 4계층 아님) 그룹에서 도출한다.
 * 레이어/순환은 구조 추론이므로 INFERRED/UNVERIFIED([추정]/[확인 필요]).
 */
import { claim } from '../claims.js'
import type { Claim, GeneratedDoc } from '../types.js'
import type { UaGraphEdge } from '../../domain-map/types.js'
import { type DocInput, edgesOfType, inferred, sortNodes } from './shared.js'

/**
 * `calls` 엣지 위에서 사이클에 속한 노드열을 결정론적으로 반환.
 * 인접 목록·DFS 진입 순서를 모두 정렬해 byte-identical 재실행을 보장한다.
 */
export function detectCycles(edges: UaGraphEdge[]): string[][] {
  const adj = new Map<string, string[]>()
  for (const e of edgesOfType(edges, 'calls')) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }
  for (const [k, list] of adj) adj.set(k, list.slice().sort())

  const cycles: string[][] = []
  const state = new Map<string, 1 | 2>() // 1=gray(stack), 2=black(done)
  const stack: string[] = []
  const dfs = (u: string): void => {
    state.set(u, 1)
    stack.push(u)
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) {
        const i = stack.indexOf(v)
        if (i >= 0) cycles.push(stack.slice(i))
      } else if (!state.has(v)) {
        dfs(v)
      }
    }
    stack.pop()
    state.set(u, 2)
  }
  for (const u of [...adj.keys()].sort()) if (!state.has(u)) dfs(u)
  return cycles
}

/** 아키텍처 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export function buildArchitecture(input: DocInput): GeneratedDoc {
  // 레이어: node.layer 그룹(신호 보유분만). 'unknown'/미상은 제외(끼워맞춤 금지).
  const byLayer = new Map<string, number>()
  for (const n of sortNodes(input.nodes)) {
    if (typeof n.layer === 'string' && n.layer !== 'unknown') {
      byLayer.set(n.layer, (byLayer.get(n.layer) ?? 0) + 1)
    }
  }
  const layerClaims = [...byLayer.keys()]
    .sort()
    .map((name): Claim => inferred(`레이어: ${name} (${byLayer.get(name) ?? 0}개 구성요소)`))

  // 의존 방향: calls 엣지(단계 호출). 근거 없는 합성 엣지이므로 INFERRED.
  const depClaims = edgesOfType(input.edges, 'calls').map(
    (e): Claim => inferred(`의존: ${e.source} → ${e.target} (calls)`),
  )

  // 순환 의존 후보: 동적/구조 추론 -> [확인 필요](UNVERIFIED), 근거 미확보.
  const cycleClaims = detectCycles(input.edges).map(
    (c): Claim => claim(`순환 의존 후보: ${c.join(' → ')} → ${c[0]}`, 'UNVERIFIED'),
  )

  return {
    docId: '02_architecture',
    title: '아키텍처',
    methodology: 'as-built',
    sections: [
      { heading: '레이어', claims: layerClaims },
      { heading: '의존 방향', claims: depClaims },
      { heading: '순환 의존 후보', claims: cycleClaims },
    ],
  }
}
