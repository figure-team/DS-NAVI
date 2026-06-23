/**
 * buildRtm(R1) — AS-IS RTM 빌더 결정론·grounding 단위 테스트.
 */
import { describe, it, expect } from 'vitest'
import { buildRtm } from './build-rtm.js'
import type { DocInput } from '../doc-generator/builders/shared.js'
import { RtmModelSchema } from './types.js'

/** 최소 fixture — 결제 도메인 1개 + flow 1개 + dao step 1개 + 라우트/매퍼. */
function fixture(): DocInput {
  const nodes = [
    { id: 'd1', type: 'domain', name: '결제', summary: '', tags: [], complexity: 'simple' },
    {
      id: 'f1',
      type: 'flow',
      name: '결제 처리',
      summary: '',
      tags: [],
      complexity: 'simple',
      filePath: 'src/PayController.java',
      lineRange: [10, 50],
      domainMeta: { entryPoint: 'PayController#pay' },
    },
    {
      id: 's1',
      type: 'step',
      name: 'PayMapper',
      summary: '',
      tags: ['dao'],
      complexity: 'simple',
      layer: 'dao',
      filePath: 'src/PayMapper.java',
    },
  ]
  const edges = [
    { source: 'd1', target: 'f1', type: 'contains_flow' },
    { source: 'f1', target: 's1', type: 'flow_step' },
    { source: 'f1', target: 's1', type: 'calls', description: 'insertPayment' },
  ]
  const routes = {
    schemaVersion: 1,
    gitCommit: null,
    contextPath: null,
    batchEntries: [],
    routes: [
      {
        routeId: 'POST /pay',
        method: 'POST',
        path: '/pay',
        rawPath: '/pay',
        kind: 'form',
        framework: 'spring',
        filePath: 'src/PayController.java',
        line: 10,
        handler: 'PayController#pay',
        notes: [],
      },
    ],
  }
  const mybatisModel = {
    mappers: [
      {
        namespace: 'PayMapper',
        relPath: 'src/PayMapper.xml',
        statements: [{ id: 'insertPayment', crud: 'C', tables: ['PAYMENT'], columns: [], line: 5 }],
      },
    ],
    tables: ['PAYMENT'],
  }
  return { nodes, edges, routes, mybatisModel } as unknown as DocInput
}

describe('buildRtm (R1, AS-IS)', () => {
  it('스키마에 부합하고 도메인별 기능 행을 만든다', () => {
    const model = buildRtm(fixture(), 'abc123')
    expect(() => RtmModelSchema.parse(model)).not.toThrow()
    expect(model.gitCommit).toBe('abc123')
    expect(model.requirements).toEqual([])
    expect(model.domains).toEqual([{ id: 'd1', name: '결제', functionCount: 1 }])
    expect(model.functions).toHaveLength(1)
  })

  it('진입점은 라우트 매칭으로 file:line 근거를 단다([확정])', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.featureId).toBe('FN-001')
    expect(row.name).toBe('결제 처리')
    expect(row.entryPoint.value).toBe('POST /pay')
    expect(row.entryPoint.confidence).toBe('CONFIRMED')
    expect(row.entryPoint.evidence).toEqual([{ file: 'src/PayController.java', line: 10 }])
  })

  it('구현은 핸들러+step 파일을, 데이터는 매퍼 SQL 에서 테이블×CRUD 를 근거로 채운다', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.implementation.value).toBe('PayController, PayMapper')
    expect(row.implementation.confidence).toBe('CONFIRMED')
    expect(row.data.value).toBe('PAYMENT(C)')
    expect(row.data.confidence).toBe('CONFIRMED')
    expect(row.data.evidence).toEqual([{ file: 'src/PayMapper.xml', line: 5 }])
  })

  it('테스트 셀은 정보 부재로 UNVERIFIED(합성 금지), 상태=IMPLEMENTED', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.test).toEqual({ value: '', confidence: 'UNVERIFIED', evidence: [] })
    expect(row.origin).toBe('AS_IS')
    expect(row.state).toBe('IMPLEMENTED')
  })

  it('결정론 — 동일 입력에 byte-identical 산출', () => {
    expect(JSON.stringify(buildRtm(fixture(), 'c'))).toBe(JSON.stringify(buildRtm(fixture(), 'c')))
  })
})
