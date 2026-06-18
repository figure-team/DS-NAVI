import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadImpactInputs } from '../impact/engine.js'
import { buildCoverageReport, renderCoverageReport, CoverageReportSchema } from './index.js'
import type { JpaModel } from '../jpa/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const petstore = join(here, '..', '..', 'fixtures', 'impact-recall', 'petstore')

describe('buildCoverageReport (AC-30)', () => {
  it('petstore: 파일/계층/도달성/엣지 신호 집계', () => {
    const i = loadImpactInputs(petstore)
    const r = buildCoverageReport({ census: i.census, routes: i.routes, edges: i.edges, slices: i.slices })
    expect(() => CoverageReportSchema.parse(r)).not.toThrow()
    expect(r.files.total).toBe(i.census.fileCount)
    // java + xml + sql 등 분포
    expect(r.files.byLang.find((l) => l.lang === 'java')!.count).toBeGreaterThan(0)
    expect(r.files.nonJavaPassthrough).toBeGreaterThan(0) // xml/sql
    // 엣지 해소: 강신호 엣지 존재
    expect(r.edges.resolved).toBeGreaterThan(0)
    expect(r.edges.rate).toBeGreaterThanOrEqual(0)
    // 계층 해소율 0~100
    expect(r.layers.rate).toBeGreaterThan(0)
    expect(r.layers.resolved + r.layers.unknown).toBe(i.census.fileCount)
    // JPA 없음(petstore=MyBatis)
    expect(r.jpa.entities).toBe(0)
  })

  it('정직성: 미도달/미해소/cap-dropped/비-Java 패스스루를 노출', () => {
    const i = loadImpactInputs(petstore)
    const r = buildCoverageReport({ census: i.census, routes: i.routes, edges: i.edges, slices: i.slices, skeleton: i.skeleton })
    // 필드가 모두 존재(누락 0)
    expect(r.reachability).toHaveProperty('unreached')
    expect(r).toHaveProperty('droppedSteps')
    expect(r.files).toHaveProperty('nonJavaPassthrough')
    const text = renderCoverageReport(r)
    expect(text).toContain('분석 커버리지 리포트')
    expect(text).toContain('정직성')
  })

  it('JPA 모델 주입 시 entity/repository/Tier C 카운트', () => {
    const i = loadImpactInputs(petstore)
    const jpaModel: JpaModel = {
      schemaVersion: 1,
      gitCommit: null,
      entities: [
        {
          className: 'Owner',
          relPath: 'Owner.java',
          line: 1,
          tableName: 'owners',
          tableExplicit: true,
          tableConfidence: 'CONFIRMED',
          idField: 'id',
          columns: [],
          relations: [],
        },
      ],
      repositories: [
        {
          className: 'OwnerRepository',
          relPath: 'OwnerRepository.java',
          line: 1,
          entityType: 'Owner',
          idType: 'Integer',
          baseInterface: 'JpaRepository',
          derivedQueries: [],
          queries: [{ method: 'nativeQ', native: true, query: 'SELECT *', line: 5, confidence: 'UNVERIFIED' }],
        },
      ],
      unresolved: [],
    }
    const r = buildCoverageReport({ census: i.census, routes: i.routes, edges: i.edges, slices: i.slices, jpaModel })
    expect(r.jpa.entities).toBe(1)
    expect(r.jpa.repositories).toBe(1)
    expect(r.jpa.tierCQueries).toBe(1) // native query
  })

  it('결정론: 동일 입력 → 동일 리포트', () => {
    const i = loadImpactInputs(petstore)
    const a = buildCoverageReport({ census: i.census, routes: i.routes, edges: i.edges, slices: i.slices })
    const b = buildCoverageReport({ census: i.census, routes: i.routes, edges: i.edges, slices: i.slices })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
