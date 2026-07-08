import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import type { CensusReport } from '../domain-map/types.js'
import { extractDbSchema } from './extract.js'
import type { DbTable } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(here, '..', '..', 'fixtures', 'db-schema')

/** fixture census 에서 일부 .sql 만 남긴 파생 census(중복 fixture 없이 tier 분기 테스트). */
function censusWith(base: CensusReport, keep: (relPath: string) => boolean): CensusReport {
  const files = base.files.filter((f) => f.lang !== 'sql' || keep(f.relPath))
  return { ...base, files, fileCount: files.length }
}

const baseCensus = buildCensus(fixtureDir)
const table = (m: { tables: DbTable[] }, name: string) => m.tables.find((t) => t.name === name)

describe('db-schema 스캐너 (P0)', () => {
  describe('Tier 1+2 — DDL + dataload', () => {
    const model = extractDbSchema(fixtureDir, baseCensus)

    it('tier=ddl+data, 테이블 2개, sqlFileCount=2', () => {
      expect(model.tier).toBe('ddl+data')
      expect(model.sqlFileCount).toBe(2)
      expect(model.tables.map((t) => t.name)).toEqual(['common_code', 'member']) // name 정렬
    })

    it('컬럼 제약 — NOT NULL/PK/DEFAULT/타입(콤마 포함 파싱)', () => {
      const member = table(model, 'member')!
      const balance = member.columns.find((c) => c.name === 'balance')!
      expect(balance.type).toBe('DECIMAL(15,2)')
      expect(balance.nullable).toBe(false)
      expect(balance.default).toBe('0')
      const pk = member.columns.find((c) => c.name === 'member_id')!
      expect(pk.primaryKey).toBe(true)
      expect(pk.nullable).toBe(false)
      expect(member.primaryKey).toEqual(['member_id'])
      const status = member.columns.find((c) => c.name === 'status_cd')!
      expect(status.default).toBe("'ACTIVE'")
      const created = member.columns.find((c) => c.name === 'created_at')!
      expect(created.default).toBe('CURRENT_TIMESTAMP')
    })

    it('테이블 제약 — FK/CHECK/UNIQUE/INDEX', () => {
      const member = table(model, 'member')!
      expect(member.foreignKeys).toEqual([
        { columns: ['status_cd'], refTable: 'common_code', refColumns: ['code'], line: expect.any(Number) },
      ])
      expect(member.checks[0].expression).toBe('balance >= 0')
      expect(member.uniques.some((u) => u.join(',') === 'email')).toBe(true)
      expect(member.indexes.some((i) => i.columns.join(',') === 'status_cd' && !i.unique)).toBe(true)
      expect(member.indexes.some((i) => i.columns.join(',') === 'email' && i.unique)).toBe(true)
    })

    it('주석 — MySQL inline COMMENT + COMMENT= + Oracle COMMENT ON', () => {
      const member = table(model, 'member')!
      expect(member.comment).toBe('회원 마스터')
      expect(member.columns.find((c) => c.name === 'member_id')!.comment).toBe('회원 고유 ID')
      const cc = table(model, 'common_code')!
      expect(cc.comment).toBe('공통 코드 정의') // COMMENT ON TABLE
      expect(cc.columns.find((c) => c.name === 'code')!.comment).toBe('코드 값') // COMMENT ON COLUMN
    })

    it('코드테이블 인식 + dataload 행(상태값 근거)', () => {
      const cc = table(model, 'common_code')!
      expect(cc.isCodeTable).toBe(true)
      expect(cc.codeTableReason).toBe("테이블명 패턴 'common'") // 판정 사유 표면화(개편 ④)
      expect(table(model, 'member')!.isCodeTable).toBe(false)
      expect(table(model, 'member')!.codeTableReason).toBeNull()
      expect(cc.rowCount).toBe(4) // 다중 VALUES 3 + 단일 1
      expect(cc.rows.map((r) => r.values.code)).toEqual(['ACTIVE', 'DORMANT', 'WITHDRAWN', 'BRONZE'])
      expect(cc.rows[0].values).toMatchObject({ code: 'ACTIVE', code_name: '활성', grp: 'MEMBER_STATUS' })
    })

    it('unresolved 누락 없음', () => {
      expect(model.unresolved).toEqual([])
    })
  })

  describe('Tier 1 — DDL 만(dataload 없음)', () => {
    it('tier=ddl, 행 0', () => {
      const census = censusWith(baseCensus, (p) => p.endsWith('ddl.sql'))
      const model = extractDbSchema(fixtureDir, census)
      expect(model.tier).toBe('ddl')
      expect(model.sqlFileCount).toBe(1)
      expect(table(model, 'common_code')!.rowCount).toBe(0)
      expect(table(model, 'common_code')!.isCodeTable).toBe(true) // 명명만으로 인식
    })
  })

  describe('Tier 3 — .sql 없음(코드 폴백)', () => {
    it('tier=code-only, 테이블 0', () => {
      const census = censusWith(baseCensus, () => false)
      const model = extractDbSchema(fixtureDir, census)
      expect(model.tier).toBe('code-only')
      expect(model.sqlFileCount).toBe(0)
      expect(model.tables).toEqual([])
    })
  })

  it('결정론 — 동일 입력 동일 출력', () => {
    const a = extractDbSchema(fixtureDir, baseCensus)
    const b = extractDbSchema(fixtureDir, baseCensus)
    expect(a).toEqual(b)
  })

  describe('중복 CREATE TABLE 구조 diff (데이터 맵 개편 ①)', () => {
    const dupDir = join(here, '..', '..', 'fixtures', 'db-schema-dup')
    const model = extractDbSchema(dupDir, buildCensus(dupDir))

    it('동일 정의 중복 → severity info(경고 아님)', () => {
      const u = model.unresolved.find((x) => x.ref === 'second.sql:t_order')!
      expect(u.reason).toBe('중복 CREATE TABLE(동일 정의·첫 정의 유지)')
      expect(u.severity).toBe('info')
    })

    it('상이 정의 중복 → severity warn + diff 요약', () => {
      const u = model.unresolved.find((x) => x.ref === 'second.sql:t_pay')!
      expect(u.severity).toBe('warn')
      expect(u.reason).toContain('정의 상이·첫 정의 유지')
      expect(u.reason).toContain("컬럼 상이 'method'(type VARCHAR(10)≠varchar(20))")
      expect(u.reason).toContain("컬럼 추가 'approved_at'")
    })

    it('첫 정의 유지 — 채택 테이블 구조는 첫 파일 기준', () => {
      const pay = table(model, 't_pay')!
      expect(pay.relPath).toBe('first.sql')
      expect(pay.columns.map((c) => c.name)).toEqual(['pay_id', 'method'])
      expect(model.unresolved).toHaveLength(2)
    })

    it('코드성 판정 사유 — 컬럼 조합(코드+라벨)', () => {
      const reason = table(model, 't_reason')!
      expect(reason.isCodeTable).toBe(true)
      expect(reason.codeTableReason).toBe("코드컬럼 'item_cd' + 라벨컬럼 'item_nm'")
    })
  })
})
