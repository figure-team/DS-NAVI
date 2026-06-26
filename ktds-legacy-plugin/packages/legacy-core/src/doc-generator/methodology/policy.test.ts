import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { getMethodology } from './registry.js'
import { parseDocTemplate, applyDocTemplate } from '../doc-template.js'
import type { DocInput } from '../builders/index.js'
import type { PolicySignalSet } from '../../policy/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(here, '..', '..', '..', '..', '..', 'templates', 'doc', 'policy')

const SET: PolicySignalSet = {
  schemaVersion: 1,
  gitCommit: null,
  signals: [
    { category: 'glossary', kind: 'table', subject: 'member', detail: '회원 마스터', anchor: { file: 'ddl.sql', line: 3 }, confidence: 'CONFIRMED' },
    { category: 'data', kind: 'not-null', subject: 'member.email', detail: 'NOT NULL', anchor: { file: 'ddl.sql', line: 5 }, confidence: 'CONFIRMED' },
    { category: 'validation', kind: 'bean-validation', subject: 'MemberService.email', detail: '@NotNull', anchor: { file: 'M.java', line: 9 }, confidence: 'CONFIRMED' },
    { category: 'authz', kind: 'method-authz', subject: 'MemberService#deleteMember', detail: '@PreAuthorize', anchor: { file: 'M.java', line: 14 }, confidence: 'CONFIRMED' },
  ],
  unresolved: [],
}

const inputWith = (set?: PolicySignalSet | null): DocInput => ({ nodes: [], edges: [], policySignals: set })

describe('policy 방법론 모듈 (P2)', () => {
  it('신호 → 카테고리별 정책서 행(근거·신뢰도 보존)', () => {
    const docs = getMethodology('policy').buildDocSet(inputWith(SET))
    const byId = Object.fromEntries(docs.map((d) => [d.docId, d]))

    const authz = byId['policy-authz'].sections[0].table!
    expect(authz.rows).toHaveLength(1)
    expect(authz.rows[0].cells).toEqual(['MemberService#deleteMember', '@PreAuthorize', '메서드'])
    expect(authz.rows[0].confidence).toBe('CONFIRMED')
    expect(authz.rows[0].evidence).toEqual([{ file: 'M.java', line: 14 }])

    expect(byId['policy-data'].sections[0].table!.rows[0].cells).toEqual(['member.email', 'NOT NULL', 'NOT NULL'])
    expect(byId['policy-validation'].sections[0].table!.rows[0].cells).toEqual(['MemberService.email', '@NotNull'])
    expect(byId['policy-glossary'].sections[0].table!.rows[0].cells).toEqual(['member', '회원 마스터', 'DB 테이블'])
  })

  it('신호 없음 → 빈 표 + INFERRED 안내 claim', () => {
    const docs = getMethodology('policy').buildDocSet(inputWith(null))
    for (const d of docs) {
      expect(d.sections[0].table!.rows).toEqual([])
      expect(d.sections[0].claims).toHaveLength(1)
      expect(d.sections[0].claims[0].confidence).toBe('INFERRED')
    }
  })

  it('템플릿 바인딩 — {#key} 매칭으로 헤딩/컬럼 override', () => {
    const docs = getMethodology('policy').buildDocSet(inputWith(SET))
    const authz = docs.find((d) => d.docId === 'policy-authz')!
    const tpl = parseDocTemplate(readFileSync(join(templatesDir, 'authz.md'), 'utf8'))
    const applied = applyDocTemplate(authz, tpl)
    expect(applied.sections[0].heading).toBe('권한 통제 지점')
    expect(applied.sections[0].table!.columns).toEqual(['대상', '권한 어노테이션', '범위'])
    expect(applied.sections[0].table!.rows[0].cells[1]).toBe('@PreAuthorize') // 데이터 보존
  })

  it('결정론 — 동일 입력 동일 출력', () => {
    expect(getMethodology('policy').buildDocSet(inputWith(SET))).toEqual(
      getMethodology('policy').buildDocSet(inputWith(SET)),
    )
  })
})
