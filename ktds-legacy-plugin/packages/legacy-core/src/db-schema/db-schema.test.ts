import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import type { CensusReport } from '../domain-map/types.js'
import type { JpaModel } from '../jpa/types.js'
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

  describe('Tier 3 — code-inferred(.sql 없음, MyBatis/JPA 역추론)', () => {
    const mbDir = join(here, '..', '..', 'fixtures', 'db-schema-mybatis')
    const mbCensus = buildCensus(mbDir)

    /** JPA 엔티티 1개(mcp_user) — 매퍼와 동일 테이블(대소문자 무시)로 우선순위 검증. */
    const jpaModel: JpaModel = {
      schemaVersion: 1,
      gitCommit: null,
      entities: [
        {
          className: 'McpUser',
          relPath: 'src/McpUser.java',
          line: 10,
          tableName: 'mcp_user',
          tableExplicit: true,
          tableConfidence: 'CONFIRMED',
          idField: 'userId',
          columns: [
            { fieldName: 'userId', columnName: 'user_id', explicit: true, line: 12, confidence: 'CONFIRMED' },
            { fieldName: 'userNm', columnName: 'user_nm', explicit: false, line: 13, confidence: 'INFERRED' },
          ],
          relations: [],
        },
      ],
      repositories: [],
      unresolved: [],
    }

    it('tier=code-inferred — 매퍼 테이블 역추론(비매퍼 XML·DUAL 제외)', () => {
      const model = extractDbSchema(mbDir, mbCensus)
      expect(model.tier).toBe('code-inferred')
      expect(model.sqlFileCount).toBe(0)
      // FAKE_TABLE(config.xml 비매퍼)·DUAL(의사 테이블) 제외, name 정렬.
      expect(model.tables.map((t) => t.name)).toEqual(['MCP_USER', 'MSP_RATE_MST', 'NMCP_SNTY_PROD_BAS'])
      expect(model.tables.every((t) => t.origin === 'mybatis')).toBe(true)
    })

    it('컬럼 귀속 — 단일 테이블 문(INSERT/UPDATE SET)만, 다중 테이블 문은 테이블명만', () => {
      const model = extractDbSchema(mbDir, mbCensus)
      const user = table(model, 'MCP_USER')!
      expect(user.relPath).toBe('RateMapper.xml') // 앵커 = 최소 (relPath,line) 문
      expect(user.columns.map((c) => c.name)).toEqual(['STATUS_CD', 'UPD_DT', 'USER_ID', 'USER_NM'])
      expect(user.columns.every((c) => c.type === 'UNKNOWN' && c.nullable && !c.primaryKey)).toBe(true)
      // JOIN 문에서만 등장한 테이블 — 컬럼 소속 불명이라 비움(합성 금지).
      expect(table(model, 'NMCP_SNTY_PROD_BAS')!.columns).toEqual([])
    })

    it('info 안내 — 역추론 사실을 unresolved 로 표면화(침묵 금지)', () => {
      const model = extractDbSchema(mbDir, mbCensus)
      const note = model.unresolved.find((u) => u.ref === '(code-infer)')!
      expect(note.severity).toBe('info')
      expect(note.reason).toContain('역추론')
    })

    it('JPA 엔티티 우선 — 동일 테이블은 jpa origin·컬럼·PK 채택', () => {
      const model = extractDbSchema(mbDir, mbCensus, undefined, jpaModel)
      expect(model.tier).toBe('code-inferred')
      const user = table(model, 'mcp_user')! // JPA 표기 이름 채택(매퍼 MCP_USER 대체)
      expect(user.origin).toBe('jpa')
      expect(user.primaryKey).toEqual(['user_id'])
      expect(user.columns.find((c) => c.name === 'user_id')!.primaryKey).toBe(true)
      expect(model.tables.some((t) => t.name === 'MCP_USER')).toBe(false)
      // 매퍼 전용 테이블은 그대로 mybatis origin 유지.
      expect(table(model, 'MSP_RATE_MST')!.origin).toBe('mybatis')
    })

    it('.sql 존재 시 역추론 미실행 — 상위 tier 게이팅(DDL = 진실 소스)', () => {
      const model = extractDbSchema(fixtureDir, baseCensus, undefined, jpaModel)
      expect(model.tier).toBe('ddl+data')
      expect(model.tables.every((t) => t.origin === 'sql')).toBe(true)
      expect(model.unresolved.some((u) => u.ref === '(code-infer)')).toBe(false)
    })

    it('결정론 — 동일 입력 동일 출력(역추론 경로)', () => {
      const a = extractDbSchema(mbDir, mbCensus, undefined, jpaModel)
      const b = extractDbSchema(mbDir, mbCensus, undefined, jpaModel)
      expect(a).toEqual(b)
    })
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
