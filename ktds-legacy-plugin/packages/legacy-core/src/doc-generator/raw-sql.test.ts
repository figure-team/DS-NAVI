import { describe, expect, it } from 'vitest'
import { buildRawSqlModel, extractSqlCrud, isRawSqlModelEmpty } from './raw-sql.js'

const KNOWN = new Set(['settlement_run', 'contract', 'correction_ledger', 'common_code'])

describe('extractSqlCrud — SQL 동사 → CRUD', () => {
  it('insert/select/update/delete 를 C/R/U/D 로 판정한다', () => {
    const src = [
      'INSERT INTO settlement_run (id) VALUES (1)',
      'SELECT * FROM contract WHERE id = ?',
      'UPDATE correction_ledger SET amount = 0',
      'DELETE FROM common_code WHERE k = ?',
    ].join('\n')
    const out = extractSqlCrud(src, KNOWN)
    expect(out).toEqual([
      { table: 'common_code', crud: 'D', line: 4 },
      { table: 'contract', crud: 'R', line: 2 },
      { table: 'correction_ledger', crud: 'U', line: 3 },
      { table: 'settlement_run', crud: 'C', line: 1 },
    ])
  })

  it('JOIN 도 R 로 센다', () => {
    const out = extractSqlCrud('SELECT x FROM contract c JOIN common_code cc ON c.k = cc.k', KNOWN)
    expect(out).toEqual([
      { table: 'common_code', crud: 'R', line: 1 },
      { table: 'contract', crud: 'R', line: 1 },
    ])
  })

  it('db-schema 에 없는 테이블명(별칭·LATERAL·서브쿼리)은 버린다 — 노이즈 축 금지', () => {
    const src = 'SELECT * FROM contract c, LATERAL unnest(x) t JOIN sub AS s ON true'
    const out = extractSqlCrud(src, KNOWN)
    // contract 만 실재 테이블 — lateral/unnest/sub 는 KNOWN 에 없어 제외.
    expect(out).toEqual([{ table: 'contract', crud: 'R', line: 1 }])
  })

  it('스키마 접두·따옴표를 걷어내고 소문자로 매칭한다', () => {
    const src = 'SELECT 1 FROM public."Contract"\nINSERT INTO public.SETTLEMENT_RUN VALUES (1)'
    const out = extractSqlCrud(src, KNOWN)
    expect(out).toEqual([
      { table: 'contract', crud: 'R', line: 1 },
      { table: 'settlement_run', crud: 'C', line: 2 },
    ])
  })

  it('멀티라인 SQL 문자열에서도 FROM <table> 을 잡는다', () => {
    const src = 'val q = """\n  SELECT source_hash\n  FROM settlement_run\n  WHERE id = ?\n"""'
    expect(extractSqlCrud(src, KNOWN)).toEqual([{ table: 'settlement_run', crud: 'R', line: 3 }])
  })

  it('같은 (table, crud) 는 최초 등장 라인만 남긴다', () => {
    const src = 'SELECT * FROM contract\nSELECT id FROM contract'
    expect(extractSqlCrud(src, KNOWN)).toEqual([{ table: 'contract', crud: 'R', line: 1 }])
  })

  it('knownTables 가 비면 아무것도 추출하지 않는다(필터 근거 없음)', () => {
    expect(extractSqlCrud('SELECT * FROM contract', new Set())).toEqual([])
  })
})

describe('buildRawSqlModel / isRawSqlModelEmpty', () => {
  it('SQL 있는 파일만 담고, 없으면 빈 모델', () => {
    const model = buildRawSqlModel(
      [
        { relPath: 'a/Store.kt', content: 'INSERT INTO contract VALUES (1)' },
        { relPath: 'b/Nothing.kt', content: 'val x = 1' },
      ],
      KNOWN,
    )
    expect(Object.keys(model.byFile)).toEqual(['a/Store.kt'])
    expect(isRawSqlModelEmpty(model)).toBe(false)
  })

  it('전부 SQL 없으면 빈 모델', () => {
    const model = buildRawSqlModel([{ relPath: 'x.kt', content: 'no sql here' }], KNOWN)
    expect(isRawSqlModelEmpty(model)).toBe(true)
    expect(isRawSqlModelEmpty(null)).toBe(true)
  })
})
