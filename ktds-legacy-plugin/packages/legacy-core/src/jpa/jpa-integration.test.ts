import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { buildLayerSignals, deriveStepLayer } from '../domain-map/step-layer.js'
import { computePersistenceImpact } from '../impact/persistence.js'
import { buildDbSpec } from '../doc-generator/builders/db-spec.js'
import { renderSkeleton } from '../doc-generator/render.js'
import { extractJpaModel } from './extract.js'
import type { JpaModel } from './types.js'
import type { EdgesReport, RoutesReport } from '../domain-map/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const petclinic = join(here, '..', '..', 'fixtures', 'jpa', 'petclinic')

const EMPTY_ROUTES: RoutesReport = {
  schemaVersion: 1,
  gitCommit: null,
  contextPath: null,
  routes: [],
  batchEntries: [],
}
const EMPTY_EDGES: EdgesReport = { schemaVersion: 1, gitCommit: null, edges: [], unresolved: [] }

let model: JpaModel
beforeAll(async () => {
  const census = buildCensus(petclinic)
  model = await extractJpaModel(petclinic, census)
})

function relOf(className: string): string {
  return (
    model.entities.find((e) => e.className === className)?.relPath ??
    model.repositories.find((r) => r.className === className)?.relPath ??
    ''
  )
}

describe('step-layer JPA 신호 (AC-35)', () => {
  it('repository → dao 레일, @Entity → db 레일', () => {
    const signals = buildLayerSignals(EMPTY_ROUTES, EMPTY_EDGES, model)
    const ownerRepo = relOf('OwnerRepository')
    const owner = relOf('Owner')
    expect(signals.daoFiles.has(ownerRepo)).toBe(true)
    expect(signals.dbFiles.has(owner)).toBe(true)
    expect(deriveStepLayer(ownerRepo, 'OwnerRepository', signals)).toBe('dao')
    expect(deriveStepLayer(owner, 'Owner', signals)).toBe('db')
  })

  it('jpaModel 없으면 기존 동작 유지(엔티티 → unknown)', () => {
    const signals = buildLayerSignals(EMPTY_ROUTES, EMPTY_EDGES, null)
    // Owner 는 이름/엣지 신호가 없어 unknown (JPA 신호 부재 시)
    expect(deriveStepLayer('owner/Owner.java', 'Owner', signals)).toBe('unknown')
  })
})

describe('impact jpaTables db-grounding (AC-16)', () => {
  it('dataImpactSet 의 @Entity → entity↔table, 명시=CONFIRMED, 암묵 컬럼=INFERRED', () => {
    const owner = relOf('Owner')
    const out = computePersistenceImpact(new Set([owner]), [], [], { jpaModel: model })
    expect(out.jpaTables).toHaveLength(1)
    const t = out.jpaTables[0]
    expect(t.entityClass).toBe('Owner')
    expect(t.tableName).toBe('owners')
    expect(t.tableExplicit).toBe(true)
    expect(t.confidence).toBe('CONFIRMED')
    expect(t.citation.filePath).toBe(owner)
    // city 컬럼은 @Column 부재 → 암묵 명명전략 INFERRED
    const city = t.columns.find((c) => c.column === 'city')
    expect(city?.confidence).toBe('INFERRED')
  })

  it('암묵 테이블(PetType, @Table 부재) → INFERRED', () => {
    const petType = relOf('PetType')
    const out = computePersistenceImpact(new Set([petType]), [], [], { jpaModel: model })
    const t = out.jpaTables.find((x) => x.entityClass === 'PetType')!
    expect(t.tableName).toBe('pet_type')
    expect(t.tableExplicit).toBe(false)
    expect(t.confidence).toBe('INFERRED')
  })

  it('dataSet 의 리포지토리 → 관리 엔티티 테이블(제네릭 상위타입 forward 엣지 부재 보완)', () => {
    const ownerRepo = relOf('OwnerRepository')
    const owner = relOf('Owner')
    // 리포지토리만 dataSet 에(엔티티 파일은 없음) — 리포/DAO 시드 시나리오.
    const out = computePersistenceImpact(new Set([ownerRepo]), [], [], { jpaModel: model })
    expect(out.jpaTables).toHaveLength(1)
    const t = out.jpaTables[0]
    expect(t.entityClass).toBe('Owner')
    expect(t.tableName).toBe('owners')
    // 테이블 근거는 리포가 아니라 실제 @Entity 선언(grounding=엔티티).
    expect(t.citation.filePath).toBe(owner)
  })

  it('엔티티와 리포가 둘 다 dataSet 에 있어도 테이블은 1건(중복 제거)', () => {
    const ownerRepo = relOf('OwnerRepository')
    const owner = relOf('Owner')
    const out = computePersistenceImpact(new Set([ownerRepo, owner]), [], [], { jpaModel: model })
    expect(out.jpaTables.filter((t) => t.entityClass === 'Owner')).toHaveLength(1)
  })

  it('jpaModel 없으면 jpaTables=[](MyBatis 전용 회귀 안전)', () => {
    const out = computePersistenceImpact(new Set(['x']), [], [], {})
    expect(out.jpaTables).toEqual([])
  })
})

describe('db-spec JPA 섹션 (AC-16 문서)', () => {
  it('jpaModel 주입 시 엔티티↔테이블/컬럼/FK 섹션 추가(grounding 보존)', () => {
    const doc = buildDbSpec({ nodes: [], edges: [], jpaModel: model })
    const headings = doc.sections.map((s) => s.heading)
    expect(headings).toContain('엔티티↔테이블 매핑 (JPA)')
    expect(headings).toContain('컬럼 매핑 (JPA)')
    expect(headings).toContain('관계 / FK (JPA)')
    const rendered = renderSkeleton(doc)
    expect(rendered).toContain('Owner → owners')
    expect(rendered).toContain('[암묵 명명전략]') // PetType
    expect(rendered).toMatch(/FK owner_id/) // Pet.owner @JoinColumn
  })

  it('jpaModel 없으면 JPA 섹션 없음(기존 5종 골든 안전)', () => {
    const doc = buildDbSpec({ nodes: [], edges: [] })
    expect(doc.sections.map((s) => s.heading)).toEqual(['테이블 / 스키마', '데이터 접근'])
  })
})

describe('MyBatis+JPA 공존 (AC-16b)', () => {
  it('MyBatis 매퍼 인터페이스는 JPA repository 로 추출되지 않는다', () => {
    expect(model.repositories.find((r) => r.className === 'AuditLogMapper')).toBeUndefined()
    expect(model.repositories.map((r) => r.className).sort()).toEqual(['OwnerRepository', 'VetRepository'])
  })
})
