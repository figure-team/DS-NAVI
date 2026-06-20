/**
 * doc-generator (P4.1) — 빌더/렌더/근거율/결정론 게이트 테스트.
 *
 * 전략: 작은 결정론 DocInput 픽스처(domain/flow/step/endpoint/table 노드 + calls
 * 엣지 + routes 리포트)를 in-test 로 만들어 5종 빌더의 섹션/claim/신뢰도/근거를
 * 단언한다. 골든은 renderSkeleton(펜스 내 구조)만 스냅샷한다(§3.3). 모든 단언은
 * 엔진의 실제 산출에 잠근다(추측 금지). 헤딩/순서는 doc-templates.md §1 에 잠근다(AC-36).
 */
import { describe, it, expect } from 'vitest'
import type { RoutesReport, UaGraphEdge, UaGraphNode } from '../domain-map/types.js'
import {
  buildApiSpec,
  buildArchitecture,
  buildDbSpec,
  buildFeatureSpec,
  buildTechStack,
} from './builders/index.js'
import type { DocInput } from './builders/index.js'
import { claimUnits, evidenceRate, inferredRatio } from './claims.js'
import { getMethodology } from './methodology/registry.js'
import {
  CLAIMS_FENCE_CLOSE,
  CLAIMS_FENCE_OPEN,
  EMPTY_SECTION,
  renderMarkdown,
  renderSkeleton,
} from './render.js'
import type { Claim, DocMeta, GeneratedDoc } from './types.js'

// ──────────────────────────────────────────────────────────────────────────
// 결정론 픽스처 — 근거(filePath+lineRange) 보유/미보유를 섞어 신뢰도 분기를 검증.
// ──────────────────────────────────────────────────────────────────────────

function node(
  id: string,
  type: UaGraphNode['type'],
  over: Partial<UaGraphNode> = {},
): UaGraphNode {
  return {
    id,
    type,
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
  // 도메인: 근거 보유 -> CONFIRMED + domainMeta(엔터티/규칙).
  node('domain:order', 'domain', {
    name: '주문',
    summary: '주문 처리',
    filePath: 'src/order/OrderService.java',
    lineRange: [10, 80],
    domainMeta: { entities: ['Order', 'OrderItem'], businessRules: ['재고 차감'] },
  }),
  // 흐름: 근거 보유 -> CONFIRMED.
  node('flow:place', 'flow', {
    name: '주문생성',
    summary: '주문 등록',
    filePath: 'src/order/OrderService.java',
    lineRange: [20, 40],
  }),
  // 단계: 근거 없음 -> INFERRED.
  node('step:validate', 'step', { name: '검증' }),
  // 엔드포인트(태그): 근거 보유 -> CONFIRMED.
  node('ep:orders', 'step', {
    name: 'POST /orders',
    tags: ['endpoint'],
    filePath: 'src/web/OrderController.java',
    lineRange: [42, 50],
  }),
  // 테이블(태그): 근거 보유 -> CONFIRMED.
  node('tbl:orders', 'step', {
    name: 'ORDERS',
    tags: ['table'],
    filePath: 'schema/orders.sql',
    lineRange: [1, 30],
  }),
  // 모듈(태그): 근거 없음 -> INFERRED.
  node('mod:core', 'step', { name: 'core', tags: ['module'], summary: '공통 코어' }),
]

const EDGES: UaGraphEdge[] = [
  // 데이터 접근(타겟이 table) + 사이클 후보(A->B->A) 검증용.
  { source: 'flow:place', target: 'tbl:orders', type: 'calls' },
  { source: 'a', target: 'b', type: 'calls' },
  { source: 'b', target: 'a', type: 'calls' },
]

const ROUTES: RoutesReport = {
  schemaVersion: 1,
  gitCommit: null,
  contextPath: null,
  routes: [
    {
      routeId: 'r1',
      method: 'POST',
      path: '/orders',
      rawPath: '/orders',
      kind: 'api',
      framework: 'spring',
      filePath: 'src/web/OrderController.java',
      line: 42,
      handler: 'OrderController.placeOrder',
      notes: [],
    },
  ],
  batchEntries: [],
}

const INPUT: DocInput = {
  project: { languages: ['Java'], frameworks: ['Spring'] },
  nodes: NODES,
  edges: EDGES,
  routes: ROUTES,
}

function section(doc: GeneratedDoc, heading: string) {
  const s = doc.sections.find((x) => x.heading === heading)
  if (!s) throw new Error(`no section: ${heading}`)
  return s
}

function tagsOf(claims: Claim[]): string[] {
  return claims.map((c) => c.confidence)
}

// ──────────────────────────────────────────────────────────────────────────
// 빌더 — 섹션/claim/신뢰도/근거.
// ──────────────────────────────────────────────────────────────────────────

describe('builders: confidence + evidence grounding', () => {
  it('tech-stack: 언어/프레임워크는 INFERRED, 근거 보유 모듈은 CONFIRMED', () => {
    const doc = buildTechStack(INPUT)
    expect(tagsOf(section(doc, '언어').claims)).toEqual(['INFERRED'])
    expect(tagsOf(section(doc, '프레임워크 / 주요 라이브러리').claims)).toEqual(['INFERRED'])
    // mod:core 는 근거 없음 -> INFERRED.
    expect(tagsOf(section(doc, '모듈').claims)).toEqual(['INFERRED'])
  })

  it('architecture: 레이어/의존 INFERRED, 순환 후보 UNVERIFIED, 사이클 탐지', () => {
    const withLayers: DocInput = {
      ...INPUT,
      nodes: [...NODES, node('svc:x', 'step', { layer: 'service' })],
    }
    const doc = buildArchitecture(withLayers)
    expect(section(doc, '레이어').claims.every((c) => c.confidence === 'INFERRED')).toBe(true)
    expect(section(doc, '의존 방향').claims.every((c) => c.confidence === 'INFERRED')).toBe(true)
    const cycles = section(doc, '순환 의존 후보').claims
    expect(cycles.length).toBe(1)
    expect(cycles[0].confidence).toBe('UNVERIFIED')
    expect(cycles[0].text).toContain('순환 의존 후보')
  })

  it('feature-spec: 근거 도메인 CONFIRMED+앵커, 근거 없는 step INFERRED, domainMeta 반영', () => {
    const doc = buildFeatureSpec(INPUT)
    const domain = section(doc, '업무 도메인').claims
    expect(domain[0].confidence).toBe('CONFIRMED')
    expect(domain[0].evidence).toEqual([{ file: 'src/order/OrderService.java', line: 10 }])

    const meta = section(doc, '엔터티 · 업무 규칙').claims
    expect(meta.map((c) => c.text)).toEqual([
      '엔터티: Order',
      '엔터티: OrderItem',
      '업무 규칙: 재고 차감',
    ])
    expect(meta.every((c) => c.confidence === 'CONFIRMED')).toBe(true)

    // 처리 단계: type='step' 인 모든 노드(태그 노드 포함). 근거 없는 step:validate 는 INFERRED.
    const steps = section(doc, '처리 단계').claims
    const validate = steps.find((c) => c.text.includes('검증'))
    expect(validate?.confidence).toBe('INFERRED')
  })

  it('api-spec: endpoint 태그 노드 + routes 리포트 -> CONFIRMED+앵커', () => {
    const doc = buildApiSpec(INPUT)
    const eps = section(doc, '엔드포인트').claims
    expect(eps[0].confidence).toBe('CONFIRMED')
    expect(eps[0].evidence).toEqual([{ file: 'src/web/OrderController.java', line: 42 }])

    const routing = section(doc, '라우팅 / 미들웨어').claims
    expect(routing.length).toBe(1)
    expect(routing[0].confidence).toBe('CONFIRMED')
    expect(routing[0].text).toBe('라우팅/미들웨어: POST /orders → OrderController.placeOrder')
    expect(routing[0].evidence).toEqual([{ file: 'src/web/OrderController.java', line: 42 }])
  })

  it('db-spec: table 태그 노드 CONFIRMED, 데이터 접근(calls->table) INFERRED', () => {
    const doc = buildDbSpec(INPUT)
    const tables = section(doc, '테이블 / 스키마').claims
    expect(tables[0].confidence).toBe('CONFIRMED')
    expect(tables[0].evidence).toEqual([{ file: 'schema/orders.sql', line: 1 }])

    const access = section(doc, '데이터 접근').claims
    expect(access.length).toBe(1)
    expect(access[0].confidence).toBe('INFERRED')
    expect(access[0].text).toBe('데이터 접근: flow:place →접근→ tbl:orders')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// grounding 보강: pom 의존성(buildDeps) → tech-stack CONFIRMED, 도메인 fill 인용 → si CONFIRMED.
// ──────────────────────────────────────────────────────────────────────────

describe('grounding enrichment (buildDeps / domain citations)', () => {
  it('tech-stack: buildDeps 있으면 프레임워크/라이브러리 CONFIRMED + pom 근거', () => {
    const doc = buildTechStack({ ...INPUT, buildDeps: [{ name: 'spring-web', file: 'pom.xml', line: 107 }] })
    const fw = section(doc, '프레임워크 / 주요 라이브러리').claims
    expect(fw).toHaveLength(1)
    expect(fw[0].confidence).toBe('CONFIRMED')
    expect(fw[0].text).toBe('프레임워크/라이브러리: spring-web')
    expect(fw[0].evidence).toEqual([{ file: 'pom.xml', line: 107 }])
  })

  it('tech-stack: buildDeps 없으면 project.frameworks 추론(INFERRED) 유지', () => {
    const fw = section(buildTechStack(INPUT), '프레임워크 / 주요 라이브러리').claims
    expect(fw.every((c) => c.confidence === 'INFERRED')).toBe(true)
  })

  it('architecture: fileEdges 있으면 의존 방향 CONFIRMED + source file:line 근거', () => {
    const doc = buildArchitecture({
      ...INPUT,
      fileEdges: [{ source: 'a/A.java', target: 'b/B.java', kind: 'import', line: 3 }],
    })
    const deps = section(doc, '의존 방향').claims
    expect(deps).toHaveLength(1)
    expect(deps[0].confidence).toBe('CONFIRMED')
    expect(deps[0].text).toBe('의존: a/A.java → b/B.java (import)')
    expect(deps[0].evidence).toEqual([{ file: 'a/A.java', line: 3 }])
  })

  it('architecture: fileEdges 없으면 calls 엣지 추론(INFERRED) 폴백', () => {
    const deps = section(buildArchitecture(INPUT), '의존 방향').claims
    expect(deps.every((c) => c.confidence === 'INFERRED')).toBe(true)
  })

  it('si-기능명세서: 도메인 filePath 없어도 ktdsClaims 인용을 행 근거로 승계(CONFIRMED)', () => {
    const dom = node('domain:x', 'domain', {
      name: 'X',
      domainMeta: { ktdsClaims: [{ kind: 'summary', citations: [{ filePath: 'a/B.java', line: 5 }] }] },
    })
    const si = getMethodology('si-standard')
      .buildDocSet({ nodes: [dom], edges: [] })
      .find((d) => d.docId === 'si-기능명세서')!
    const row = si.sections[0].table!.rows[0]
    expect(row.confidence).toBe('CONFIRMED')
    expect(row.evidence).toEqual([{ file: 'a/B.java', line: 5 }])
  })
})

// ──────────────────────────────────────────────────────────────────────────
// grounding: 근거 없는 CONFIRMED 가 산출되지 않는다(사실 날조 금지).
// ──────────────────────────────────────────────────────────────────────────

describe('grounding invariant', () => {
  const docs = [
    buildTechStack(INPUT),
    buildArchitecture(INPUT),
    buildFeatureSpec(INPUT),
    buildApiSpec(INPUT),
    buildDbSpec(INPUT),
  ]
  it('모든 CONFIRMED claim 은 근거(evidence)≥1 을 보유한다', () => {
    for (const doc of docs) {
      for (const s of doc.sections) {
        for (const c of s.claims) {
          if (c.confidence === 'CONFIRMED') expect(c.evidence.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 근거율 / 추론율.
// ──────────────────────────────────────────────────────────────────────────

describe('evidenceRate / inferredRatio', () => {
  it('feature-spec: evidenceRate = CONFIRMED/전체, inferredRatio = INFERRED/전체', () => {
    const doc = buildFeatureSpec(INPUT)
    // claim 들: 도메인(C)+엔터티2(C)+규칙1(C)+흐름(C) = 5 C, step:validate = 1 I -> 6 total.
    expect(evidenceRate(doc)).toBeCloseTo(5 / 6, 10)
    expect(inferredRatio(doc)).toBeCloseTo(1 / 6, 10)
  })

  it('빈 문서는 0(0/0 NaN 방지)', () => {
    const empty: GeneratedDoc = {
      docId: 'x',
      title: 'x',
      methodology: 'as-built',
      sections: [],
    }
    expect(evidenceRate(empty)).toBe(0)
    expect(inferredRatio(empty)).toBe(0)
  })

  // AC-9 grounding 불변: SI(표 행) 문서도 evidenceRate/inferredRatio 가 실제로 계산되어야
  // 한다(이전 버그: section.claims 만 스캔해 SI 문서는 항상 0). 표 행 = 1급 claim-unit.
  it('SI 문서(표 행)도 근거율/추론율이 0이 아니라 실제 행 신뢰도로 계산된다', () => {
    const si = getMethodology('si-standard').buildDocSet(INPUT)
    const feature = si.find((d) => d.docId === 'si-기능명세서')!
    // claims 는 비어 있지만 표 행은 grounded 행을 포함 -> evidenceRate > 0(버그 아님).
    expect(feature.sections.every((s) => s.claims.length === 0)).toBe(true)
    expect(evidenceRate(feature)).toBeGreaterThan(0)
    // 인터페이스정의서: 단일 CONFIRMED 행 -> evidenceRate === 1.
    const iface = si.find((d) => d.docId === 'si-인터페이스정의서')!
    expect(evidenceRate(iface)).toBe(1)
    expect(inferredRatio(iface)).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// claimUnits — claims + table.rows 를 1급 claim-unit 으로 통합(AC-9).
// ──────────────────────────────────────────────────────────────────────────

describe('claimUnits', () => {
  it('as-built 문서는 claims 만 평탄화(라벨=claim.text)', () => {
    const doc = buildFeatureSpec(INPUT)
    const units = claimUnits(doc)
    // 표가 없으므로 unit 수 = 전체 claim 수, 라벨 = claim.text.
    const totalClaims = doc.sections.reduce((n, s) => n + s.claims.length, 0)
    expect(units.length).toBe(totalClaims)
    expect(units.every((u) => doc.sections.some((s) => s.heading === u.section))).toBe(true)
  })

  it('SI 문서는 table.rows 를 claim-unit 으로 포함(라벨=첫 셀)', () => {
    const iface = getMethodology('si-standard').buildDocSet(INPUT).find(
      (d) => d.docId === 'si-인터페이스정의서',
    )!
    const units = claimUnits(iface)
    expect(units.length).toBe(1)
    expect(units[0].section).toBe('API 목록')
    expect(units[0].label).toBe('API-001') // 첫 셀(API_ID) 을 결정론 라벨로 사용
    expect(units[0].confidence).toBe('CONFIRMED')
    expect(units[0].evidence).toEqual([{ file: 'src/web/OrderController.java', line: 42 }])
  })

  it('claims-only 문서의 evidenceRate 는 변경 전과 동일(회귀 방지)', () => {
    // feature-spec: 5 CONFIRMED + 1 INFERRED = 6 (doc-generator 기존 단언과 동일).
    const doc = buildFeatureSpec(INPUT)
    expect(evidenceRate(doc)).toBeCloseTo(5 / 6, 10)
    expect(inferredRatio(doc)).toBeCloseTo(1 / 6, 10)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 렌더 — 프런트매터 / 펜스 / 태그 / 빈 섹션.
// ──────────────────────────────────────────────────────────────────────────

describe('renderMarkdown', () => {
  const meta: DocMeta = {
    docId: '03_feature-spec',
    title: '기능 명세',
    methodology: 'as-built',
    status: 'DRAFT',
    sourceCommit: 'abc123',
    evidenceRate: 0.83,
  }

  it('프런트매터 + 제목 + 상태문 + 펜스 + 신뢰도 태그를 방출', () => {
    const md = renderMarkdown(buildFeatureSpec(INPUT), meta)
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('docId: 03_feature-spec')
    expect(md).toContain('sourceCommit: abc123')
    expect(md).toContain('evidenceRate: 0.83')
    expect(md).toContain('# 기능 명세')
    expect(md).toContain('> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성')
    expect(md).toContain(CLAIMS_FENCE_OPEN)
    expect(md).toContain(CLAIMS_FENCE_CLOSE)
    expect(md).toContain('- [확정] 업무 도메인: 주문 — 주문 처리. 근거: `src/order/OrderService.java:10`')
    expect(md).toContain('- [추정] 처리 단계: 검증.')
  })

  it('빈 섹션 -> _(항목 없음)_', () => {
    const doc: GeneratedDoc = {
      docId: 'x',
      title: 'x',
      methodology: 'as-built',
      sections: [{ heading: '빈섹션', claims: [] }],
    }
    const md = renderMarkdown(doc, { ...meta, docId: 'x', title: 'x' })
    expect(md).toContain(EMPTY_SECTION)
    expect(md).not.toContain(CLAIMS_FENCE_OPEN)
  })

  it('sourceCommit null -> "null", Date.now 미사용(generatedAt 부재)', () => {
    const md = renderMarkdown(buildTechStack(INPUT), { ...meta, sourceCommit: null })
    expect(md).toContain('sourceCommit: null')
    expect(md).not.toMatch(/generatedAt|generated_at|\d{13}/)
  })

  it('prose 는 펜스 밖에 렌더된다(골든 비대상)', () => {
    const doc = buildTechStack(INPUT)
    doc.sections[0].prose = '이 섹션은 산문입니다.'
    const md = renderMarkdown(doc, meta)
    const proseIdx = md.indexOf('이 섹션은 산문입니다.')
    const fenceIdx = md.indexOf(CLAIMS_FENCE_OPEN)
    expect(proseIdx).toBeGreaterThan(-1)
    expect(proseIdx).toBeLessThan(fenceIdx)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 템플릿 적합성(AC-36) — 섹션 헤딩·순서가 doc-templates.md §1 과 일치.
// ──────────────────────────────────────────────────────────────────────────

describe('template conformance (AC-36)', () => {
  it('각 빌더의 섹션 헤딩/순서가 §1 과 일치', () => {
    expect(buildTechStack(INPUT).sections.map((s) => s.heading)).toEqual([
      '언어',
      '프레임워크 / 주요 라이브러리',
      '모듈',
    ])
    expect(buildArchitecture(INPUT).sections.map((s) => s.heading)).toEqual([
      '레이어',
      '의존 방향',
      '순환 의존 후보',
    ])
    expect(buildFeatureSpec(INPUT).sections.map((s) => s.heading)).toEqual([
      '업무 도메인',
      '엔터티 · 업무 규칙',
      '처리 흐름',
      '처리 단계',
    ])
    expect(buildApiSpec(INPUT).sections.map((s) => s.heading)).toEqual([
      '엔드포인트',
      '라우팅 / 미들웨어',
    ])
    expect(buildDbSpec(INPUT).sections.map((s) => s.heading)).toEqual([
      '테이블 / 스키마',
      '데이터 접근',
    ])
  })

  it('docId/title/methodology 가 §1 규약과 일치', () => {
    expect(buildTechStack(INPUT).docId).toBe('01_tech-stack')
    expect(buildArchitecture(INPUT).docId).toBe('02_architecture')
    expect(buildFeatureSpec(INPUT).docId).toBe('03_feature-spec')
    expect(buildApiSpec(INPUT).docId).toBe('04_api-spec')
    expect(buildDbSpec(INPUT).docId).toBe('05_db-spec')
    for (const b of [buildTechStack, buildArchitecture, buildFeatureSpec, buildApiSpec, buildDbSpec]) {
      expect(b(INPUT).methodology).toBe('as-built')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 결정론 — renderSkeleton 골든 스냅샷(빌더당) + byte-identical 더블런.
// ──────────────────────────────────────────────────────────────────────────

describe('determinism: golden skeleton + double-run', () => {
  const builders: Array<[string, (i: DocInput) => GeneratedDoc]> = [
    ['tech-stack', buildTechStack],
    ['architecture', buildArchitecture],
    ['feature-spec', buildFeatureSpec],
    ['api-spec', buildApiSpec],
    ['db-spec', buildDbSpec],
  ]

  for (const [name, build] of builders) {
    it(`renderSkeleton golden: ${name}`, () => {
      expect(renderSkeleton(build(INPUT))).toMatchSnapshot()
    })
  }

  it('byte-identical 더블런(skeleton + markdown)', () => {
    const meta: DocMeta = {
      docId: '03_feature-spec',
      title: '기능 명세',
      methodology: 'as-built',
      status: 'DRAFT',
      sourceCommit: 'abc123',
      evidenceRate: 0.83,
    }
    for (const [, build] of builders) {
      expect(renderSkeleton(build(INPUT))).toBe(renderSkeleton(build(INPUT)))
      expect(renderMarkdown(build(INPUT), meta)).toBe(renderMarkdown(build(INPUT), meta))
    }
  })
})
