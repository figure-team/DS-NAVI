import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { extractDbSchema } from '../db-schema/extract.js'
import { scanPolicySignals, buildPolicySignals } from './signal-scanner.js'
import type { PolicySignal, PolicyCategory } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const policyDir = join(here, '..', '..', 'fixtures', 'policy')
const dbDir = join(here, '..', '..', 'fixtures', 'db-schema')

const dbSchema = extractDbSchema(dbDir, buildCensus(dbDir))

const has = (sigs: PolicySignal[], category: PolicyCategory, kind: string, subject: string) =>
  sigs.some((s) => s.category === category && s.kind === kind && s.subject === subject)

describe('정책 신호 스캐너 (P1)', () => {
  describe('scanPolicySignals — 코드+DB 통합', () => {
    it('authz — 메서드 레벨 @PreAuthorize 앵커', async () => {
      const set = await scanPolicySignals(policyDir, buildCensus(policyDir), dbSchema)
      expect(has(set.signals, 'authz', 'method-authz', 'MemberService#deleteMember')).toBe(true)
      const authz = set.signals.find((s) => s.kind === 'method-authz')!
      expect(authz.detail).toBe('@PreAuthorize')
      expect(authz.anchor.file).toBe('src/MemberService.java')
      expect(authz.anchor.line).toBeGreaterThan(0)
      expect(authz.confidence).toBe('CONFIRMED')
      // 권한 없는 메서드는 신호 없음(앵커만 추출, 누락은 P3/후속에서 gap 판정).
      expect(has(set.signals, 'authz', 'method-authz', 'MemberService#viewMember')).toBe(false)
    })

    it('validation — 필드 bean-validation 어노테이션', async () => {
      const set = await scanPolicySignals(policyDir, buildCensus(policyDir), dbSchema)
      const v = set.signals.filter((s) => s.category === 'validation')
      expect(v.map((s) => `${s.subject} ${s.detail}`).sort()).toEqual([
        'MemberService.email @Email',
        'MemberService.email @NotNull',
        'MemberService.legacyName @NotNull',
        'MemberService.legacyName @Size',
        'MemberService.password @Size',
      ])
    })

    it('앵커는 멤버 선언 라인이 아니라 특정 어노테이션 라인(붕괴 금지)', async () => {
      const set = await scanPolicySignals(policyDir, buildCensus(policyDir), dbSchema)
      const line = (subject: string, detail: string) =>
        set.signals.find((s) => s.subject === subject && s.detail === detail)!.anchor.line
      // 다중 어노테이션 필드: @NotNull(L9)/@Email(L10) 이 서로 다른 라인 — 필드 라인(L9)으로 붕괴 금지.
      expect(line('MemberService.email', '@NotNull')).toBe(9)
      expect(line('MemberService.email', '@Email')).toBe(10)
      // 선행 비검증 어노테이션(@Deprecated L23) 을 건너뛰어 @Size(L24)/@NotNull(L25) 에 정확히 앵커.
      // (petclinic 근본원인: @Column 이 필드 선언 시작이라 검증 어노테이션이 그 라인으로 붕괴하던 결함)
      expect(line('MemberService.legacyName', '@Size')).toBe(24)
      expect(line('MemberService.legacyName', '@NotNull')).toBe(25)
      // 메서드 권한: @PreAuthorize(L16) 은 메서드 선언 라인(L17) 아님.
      expect(line('MemberService#deleteMember', '@PreAuthorize')).toBe(16)
    })

    it('glossary — enum + DB 테이블/컬럼주석', async () => {
      const set = await scanPolicySignals(policyDir, buildCensus(policyDir), dbSchema)
      expect(has(set.signals, 'glossary', 'enum', 'MemberStatus')).toBe(true)
      expect(has(set.signals, 'glossary', 'table', 'member')).toBe(true)
      expect(has(set.signals, 'glossary', 'column-comment', 'member.member_id')).toBe(true)
      expect(has(set.signals, 'glossary', 'column-comment', 'common_code.code')).toBe(true)
    })

    it('data — 제약/FK/CHECK 앵커', async () => {
      const set = await scanPolicySignals(policyDir, buildCensus(policyDir), dbSchema)
      expect(has(set.signals, 'data', 'not-null', 'member.email')).toBe(true)
      expect(has(set.signals, 'data', 'primary-key', 'member')).toBe(true)
      expect(has(set.signals, 'data', 'fk', 'member(status_cd)')).toBe(true)
      const check = set.signals.find((s) => s.category === 'data' && s.kind === 'check')!
      expect(check.detail).toBe('balance >= 0')
    })

    it('unresolved 누락 없음 + 결정론', async () => {
      const census = buildCensus(policyDir)
      const a = await scanPolicySignals(policyDir, census, dbSchema)
      const b = await scanPolicySignals(policyDir, census, dbSchema)
      expect(a.unresolved).toEqual([])
      expect(a).toEqual(b)
    })
  })

  describe('buildPolicySignals — 순수 함수', () => {
    it('빈 입력 → 신호 0, 스키마 유효', () => {
      const set = buildPolicySignals({
        javaFacts: [],
        dbSchema: { schemaVersion: 1, gitCommit: null, tier: 'code-only', sqlFileCount: 0, tables: [], unresolved: [] },
        gitCommit: null,
      })
      expect(set.signals).toEqual([])
      expect(set.schemaVersion).toBe(1)
    })
  })
})
