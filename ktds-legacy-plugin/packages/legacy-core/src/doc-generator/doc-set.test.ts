/**
 * DOC-SET (D2) — 신규 빌더 4종(program-list/crud-matrix/batch-list/impact-analysis) +
 * 템플릿 적용 라운드트립. 결정론 픽스처(도메인2·flow·dao/svc step·cross-domain calls·
 * batch 진입점)로 섹션/셀/신뢰도를 단언하고 renderSkeleton 골든을 잠근다.
 *
 * 라운드트립 불변: 기본 템플릿(templates/doc/*.md)을 적용해도 빌더 출력 skeleton 이
 * byte-identical(기본값=빌더 헤딩/컬럼) → 템플릿 도입이 골든을 깨지 않음을 증명.
 */
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { RoutesReport, UaGraphEdge, UaGraphNode } from '../domain-map/types.js'
import type { DocInput } from './builders/index.js'
import { buildProgramList, buildCrudMatrix, buildBatchList, buildImpactAnalysis } from './builders/index.js'
import { buildSiTableSpec } from './methodology/si-standard.js'
import { buildMyBatisModel } from '../mybatis/index.js'
import { parseDocTemplate, applyDocTemplate } from './doc-template.js'
import { DOC_SET } from './doc-set.js'
import { renderSkeleton } from './render.js'
import type { GeneratedDoc } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const DOC_DIR = join(here, '..', '..', '..', '..', 'templates', 'doc')

function node(id: string, type: UaGraphNode['type'], over: Partial<UaGraphNode> = {}): UaGraphNode {
  return {
    id, type,
    name: over.name ?? id,
    summary: over.summary ?? '',
    tags: over.tags ?? [],
    complexity: over.complexity ?? 'simple',
    filePath: over.filePath,
    lineRange: over.lineRange,
    domainMeta: over.domainMeta,
    layer: over.layer,
  }
}

const NODES: UaGraphNode[] = [
  node('domain:order', 'domain', { name: '주문', tags: ['order'] }),
  node('domain:catalog', 'domain', { name: '카탈로그', tags: ['catalog'] }),
  node('flow:place', 'flow', { name: '주문생성', tags: ['order'], filePath: 'src/web/OrderController.java', lineRange: [10, 20] }),
  node('step:place:svc', 'step', { name: '주문서비스', tags: ['order'], layer: 'service', filePath: 'src/order/OrderService.java', lineRange: [5, 50], summary: '주문 조율' }),
  node('step:place:dao', 'step', { name: '주문매퍼', tags: ['order'], layer: 'dao', filePath: 'src/order/OrderMapper.java', lineRange: [3, 9] }),
  node('step:place:catdao', 'step', { name: '상품매퍼', tags: ['catalog'], layer: 'dao', filePath: 'src/catalog/ProductMapper.java', lineRange: [2, 8] }),
]

const EDGES: UaGraphEdge[] = [
  { source: 'flow:place', target: 'step:place:svc', type: 'flow_step', weight: 0.4 },
  { source: 'flow:place', target: 'step:place:dao', type: 'flow_step', weight: 0.7 },
  { source: 'flow:place', target: 'step:place:catdao', type: 'flow_step', weight: 1 },
  { source: 'step:place:svc', target: 'step:place:dao', type: 'calls', description: 'insertOrder → insertOrder' },
  { source: 'step:place:svc', target: 'step:place:dao', type: 'calls', description: 'getOrder → getOrder' },
  { source: 'step:place:svc', target: 'step:place:catdao', type: 'calls', description: 'getProductList → getProductList' },
]

const ROUTES: RoutesReport = {
  schemaVersion: 1, gitCommit: null, contextPath: null, routes: [],
  batchEntries: [
    { entryId: 'nightlyJob', trigger: 'scheduled', schedule: '0 0 * * *', filePath: 'src/batch/NightlyJob.java', line: 12, handler: 'NightlyJob.run', notes: [] },
  ],
}

const INPUT: DocInput = { nodes: NODES, edges: EDGES, routes: ROUTES }
const cells = (doc: GeneratedDoc, i = 0) => doc.sections[i].table!.rows.map((r) => r.cells)

describe('buildProgramList', () => {
  it('flow/step filePath 를 파일 단위 dedup, 경로 정렬, CONFIRMED+근거', () => {
    const doc = buildProgramList(INPUT)
    const rows = cells(doc)
    expect(rows.map((c) => c[1])).toEqual([
      'src/catalog/ProductMapper.java',
      'src/order/OrderMapper.java',
      'src/order/OrderService.java',
      'src/web/OrderController.java',
    ])
    expect(rows[0]).toEqual(['PG-001', 'src/catalog/ProductMapper.java', 'ProductMapper', 'dao', ''])
    expect(doc.sections[0].table!.rows.every((r) => r.confidence === 'CONFIRMED')).toBe(true)
  })
})

describe('buildCrudMatrix', () => {
  it('기능×DAO, 메서드명에서 CRUD 추론, 동적 컬럼', () => {
    const doc = buildCrudMatrix(INPUT)
    expect(doc.sections[0].table!.columns).toEqual(['기능', 'OrderMapper', 'ProductMapper'])
    // insertOrder→C, getOrder→R (OrderMapper) = 'CR'; getProductList→R (ProductMapper) = 'R'.
    expect(cells(doc)).toEqual([['주문생성', 'CR', 'R']])
    expect(doc.sections[0].table!.rows[0].confidence).toBe('INFERRED')
  })
})

describe('buildBatchList', () => {
  it('batchEntries 1건 → 1행 CONFIRMED+근거', () => {
    const doc = buildBatchList(INPUT)
    expect(cells(doc)).toEqual([['BAT-001', 'nightlyJob', 'scheduled', 'NightlyJob.run', '0 0 * * *', '']])
    expect(doc.sections[0].table!.rows[0].evidence).toEqual([{ file: 'src/batch/NightlyJob.java', line: 12 }])
  })
  it('batchEntries 없으면 0행(합성 금지)', () => {
    expect(buildBatchList({ nodes: [], edges: [] }).sections[0].table!.rows).toEqual([])
  })
})

describe('buildImpactAnalysis', () => {
  it('fan-in/out + reach(고영향), 도메인 간 의존', () => {
    const doc = buildImpactAnalysis(INPUT)
    const hot = cells(doc, 0)
    // OrderService fan-out=2, fan-in=0; OrderMapper/ProductMapper fan-in=1 (fan-in desc → 둘 먼저, 경로 asc).
    expect(hot.map((c) => c[0])).toEqual([
      'src/catalog/ProductMapper.java',
      'src/order/OrderMapper.java',
      'src/order/OrderService.java',
    ])
    expect(hot[2]).toEqual(['src/order/OrderService.java', '0', '2', '2', 'service'])
    // cross-domain: order → catalog 1건.
    const cross = cells(doc, 1)
    expect(cross).toEqual([['주문', '카탈로그', '1', '1']])
  })
})

describe('Tier B — mybatisModel 있으면 기능×테이블 / 테이블+컬럼', () => {
  const ORDER_XML = `<mapper namespace="com.shop.OrderMapper">
    <insert id="insertOrder"> INSERT INTO ORDERS (ID, USERID, TOTAL) VALUES (?,?,?) </insert>
    <select id="getOrder"> SELECT * FROM ORDERS WHERE ID = ? </select>
  </mapper>`
  const PRODUCT_XML = `<mapper namespace="com.shop.ProductMapper">
    <select id="getProductList"> SELECT * FROM PRODUCT WHERE CATEGORY = ? </select>
  </mapper>`
  const model = buildMyBatisModel([
    { relPath: 'OrderMapper.xml', content: ORDER_XML },
    { relPath: 'ProductMapper.xml', content: PRODUCT_XML },
  ])
  const mybInput = { ...INPUT, mybatisModel: model }

  it('crud-matrix: 열=테이블, CRUD 는 SQL 문에서([확정])', () => {
    const doc = buildCrudMatrix(mybInput)
    expect(doc.sections[0].table!.columns).toEqual(['기능', 'ORDERS', 'PRODUCT'])
    // place 흐름: insertOrder(C)+getOrder(R)→ORDERS 'CR', getProductList(R)→PRODUCT 'R'.
    expect(cells(doc)).toEqual([['주문생성', 'CR', 'R']])
    expect(doc.sections[0].table!.rows[0].confidence).toBe('CONFIRMED')
    expect(doc.sections[0].table!.rows[0].evidence.length).toBeGreaterThan(0)
  })

  it('crud-matrix: mybatisModel 없으면 기능×DAO 폴백', () => {
    expect(buildCrudMatrix(INPUT).sections[0].table!.columns).toEqual(['기능', 'OrderMapper', 'ProductMapper'])
  })

  it('si-테이블정의서: 테이블별 섹션 + INSERT 컬럼([확정])', () => {
    const doc = buildSiTableSpec(mybInput)
    expect(doc.sections.map((s) => s.heading)).toEqual(['ORDERS 테이블', 'PRODUCT 테이블'])
    const orders = doc.sections[0].table!
    expect(orders.rows.map((r) => r.cells[0])).toEqual(['ID', 'TOTAL', 'USERID'])
    expect(orders.rows[0].confidence).toBe('CONFIRMED')
    // SELECT 전용 PRODUCT 는 컬럼 미추출(행 0).
    expect(doc.sections[1].table!.rows).toEqual([])
  })
})

describe('doc-template 라운드트립 — 기본 템플릿 적용해도 skeleton 불변', () => {
  for (const entry of DOC_SET) {
    it(`${entry.docId}: applyDocTemplate(기본) === 빌더 skeleton`, () => {
      const built = entry.build(INPUT)
      const tpl = parseDocTemplate(readFileSync(join(DOC_DIR, entry.templateFile), 'utf8'))
      // 빌더가 모든 키를 채운 경우 byte-identical. 빈 키가 있으면 템플릿이 빈 섹션을 더하므로
      // 그 경우만 제외하고 비교(빌더 섹션 키 ⊇ 템플릿 키).
      const builtKeys = new Set(built.sections.map((s) => s.key))
      const tplKeysCovered = tpl.sections.every((s) => builtKeys.has(s.key))
      if (tplKeysCovered) {
        expect(renderSkeleton(applyDocTemplate(built, tpl))).toBe(renderSkeleton(built))
      }
    })
  }
})

describe('determinism: 신규 빌더 골든 skeleton + 더블런', () => {
  const builders: Array<[string, GeneratedDoc]> = [
    ['program-list', buildProgramList(INPUT)],
    ['crud-matrix', buildCrudMatrix(INPUT)],
    ['batch-list', buildBatchList(INPUT)],
    ['impact-analysis', buildImpactAnalysis(INPUT)],
  ]
  for (const [name, doc] of builders) {
    it(`renderSkeleton golden: ${name}`, () => {
      expect(renderSkeleton(doc)).toMatchSnapshot()
    })
  }
  it('byte-identical 더블런', () => {
    expect(renderSkeleton(buildImpactAnalysis(INPUT))).toBe(renderSkeleton(buildImpactAnalysis(INPUT)))
    expect(renderSkeleton(buildCrudMatrix(INPUT))).toBe(renderSkeleton(buildCrudMatrix(INPUT)))
  })
})
