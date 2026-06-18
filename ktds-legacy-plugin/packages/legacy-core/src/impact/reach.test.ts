import { describe, it, expect } from 'vitest'
import type { EdgeKind, EdgeRecord } from '../domain-map/types.js'
import { buildAdjacency, reachClosure, computeFanIn } from './reach.js'

// 합성 그래프: A -> B -> C (forward 의존), D -> B. 즉 B 에 A,D 가 의존.
//   import 약신호: E -> B (기본 필터 제외 대상).
const edges: EdgeRecord[] = [
  { source: 'A.java', target: 'B.java', kind: 'injection', line: 10 },
  { source: 'B.java', target: 'C.java', kind: 'field-type', line: 5 },
  { source: 'D.java', target: 'B.java', kind: 'ctor-param', line: 7 },
  { source: 'E.java', target: 'B.java', kind: 'import', line: 3 },
]
const strong = new Set<EdgeKind>(['injection', 'field-type', 'ctor-param', 'impl', 'implements'])

describe('buildAdjacency', () => {
  it('reverse: key=target, neighbor=source(=의존하는 파일), 약신호 제외', () => {
    const adj = buildAdjacency(edges, strong, 'reverse')
    // B 에 의존하는 것: A, D (E 는 import 라 제외)
    expect((adj.get('B.java') ?? []).map((e) => e.relPath)).toEqual(['A.java', 'D.java'])
    // C 에 의존: B
    expect((adj.get('C.java') ?? []).map((e) => e.relPath)).toEqual(['B.java'])
  })

  it('forward: key=source, neighbor=target', () => {
    const adj = buildAdjacency(edges, strong, 'forward')
    expect((adj.get('A.java') ?? []).map((e) => e.relPath)).toEqual(['B.java'])
    expect((adj.get('B.java') ?? []).map((e) => e.relPath)).toEqual(['C.java'])
  })

  it('evidenceFile 은 항상 간선의 source', () => {
    const adj = buildAdjacency(edges, strong, 'reverse')
    const entry = (adj.get('B.java') ?? []).find((e) => e.relPath === 'A.java')!
    expect(entry.evidenceFile).toBe('A.java')
    expect(entry.line).toBe(10)
  })
})

describe('reachClosure', () => {
  it('reverse from seed=B → upstream {A,D}, 시드 제외, minDepth=1', () => {
    const adj = buildAdjacency(edges, strong, 'reverse')
    const out = reachClosure(['B.java'], adj, 12)
    expect(out.map((r) => r.relPath)).toEqual(['A.java', 'D.java'])
    expect(out.every((r) => r.minDepth === 1)).toBe(true)
    // 인용: A 가 B 를 참조하는 라인(evidenceFile=A, line=10)
    const a = out.find((r) => r.relPath === 'A.java')!
    expect(a.citation).toEqual({ filePath: 'A.java', line: 10 })
  })

  it('forward from seed=A → downstream {B,C}, minDepth 누적(B=1,C=2)', () => {
    const adj = buildAdjacency(edges, strong, 'forward')
    const out = reachClosure(['A.java'], adj, 12)
    expect(out.map((r) => r.relPath)).toEqual(['B.java', 'C.java'])
    expect(out.find((r) => r.relPath === 'B.java')!.minDepth).toBe(1)
    expect(out.find((r) => r.relPath === 'C.java')!.minDepth).toBe(2)
  })

  it('depthCap 제한 — cap=1 이면 1-hop 만', () => {
    const adj = buildAdjacency(edges, strong, 'forward')
    const out = reachClosure(['A.java'], adj, 1)
    expect(out.map((r) => r.relPath)).toEqual(['B.java'])
  })

  it('결정론: 동일 입력 → 동일 출력(정렬 안정)', () => {
    const adj = buildAdjacency(edges, strong, 'reverse')
    expect(reachClosure(['B.java'], adj, 12)).toEqual(reachClosure(['B.java'], adj, 12))
  })
})

describe('computeFanIn', () => {
  it('fan-in(B)=2 (A,D 가 의존), 약신호 제외, self-edge 무시', () => {
    const fanIn = computeFanIn(edges, strong)
    expect(fanIn.get('B.java')).toBe(2)
    expect(fanIn.get('C.java')).toBe(1)
    expect(fanIn.has('E.java')).toBe(false)
  })
})
