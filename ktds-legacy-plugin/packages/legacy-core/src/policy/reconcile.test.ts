import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExistingPolicy } from './ingest.js'
import { reconcilePolicy, scanPolicyReconcile } from './reconcile.js'
import type { PolicySignal, ReconcileEntry } from './types.js'

const SIGNALS: PolicySignal[] = [
  { category: 'glossary', kind: 'table', subject: 'member', detail: '회원 마스터', anchor: { file: 'ddl.sql', line: 4 }, confidence: 'CONFIRMED' },
  { category: 'glossary', kind: 'column-comment', subject: 'member.email', detail: '로그인 이메일', anchor: { file: 'ddl.sql', line: 6 }, confidence: 'CONFIRMED' },
  { category: 'authz', kind: 'method-authz', subject: 'MemberService#deleteMember', detail: '@PreAuthorize', anchor: { file: 'M.java', line: 16 }, confidence: 'CONFIRMED' },
]

const find = (es: ReconcileEntry[], subject: string) => es.find((e) => e.subject === subject)
const tmps: string[] = []
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('정책서 ingest·대조 (P4)', () => {
  describe('parseExistingPolicy — 표 + 불릿', () => {
    it('표(신뢰도/근거 열 제외) + 불릿을 항목으로', () => {
      const md = [
        '---',
        'docId: x',
        '---',
        '## 용어',
        '',
        '| 용어 | 정의 | 신뢰도 | 근거 |',
        '| --- | --- | --- | --- |',
        '| member | 회원 마스터 | [확정] | `ddl.sql:4` |',
        '| order | 주문 | [추정] | |',
        '',
        '- **member.email**: 로그인 이메일',
      ].join('\n')
      const items = parseExistingPolicy(md, 'glossary')
      expect(items.map((i) => i.subject)).toEqual(['member', 'order', 'member.email'])
      // 신뢰도/근거 열은 진술에서 제외.
      expect(items[0].statement).toBe('회원 마스터')
      expect(items.every((i) => i.category === 'glossary')).toBe(true)
    })
  })

  describe('reconcilePolicy — 커버리지 판정', () => {
    it('준수 / 문서에만 / 미정의', () => {
      const items = parseExistingPolicy(
        ['| 용어 | 정의 |', '| --- | --- |', '| member | 회원 |', '| order | 주문 |'].join('\n'),
        'glossary',
      )
      const r = reconcilePolicy(items, SIGNALS)
      expect(find(r.entries, 'member')!.status).toBe('준수')
      expect(find(r.entries, 'member')!.anchor).toEqual({ file: 'ddl.sql', line: 4 })
      expect(find(r.entries, 'order')!.status).toBe('문서에만')
      // 문서가 안 덮은 신호 → 미정의(glossary member.email + authz 메서드).
      expect(find(r.entries, 'member.email')!.status).toBe('미정의')
      expect(find(r.entries, 'MemberService#deleteMember')!.status).toBe('미정의')
      expect(r.summary).toEqual({ 준수: 1, 위반: 0, 미정의: 2, 문서에만: 1 })
    })

    it('위반은 결정론 reconcile 이 부여하지 않음(LLM 영역)', () => {
      const items = parseExistingPolicy(['| 용어 |', '| --- |', '| member |'].join('\n'), 'glossary')
      expect(reconcilePolicy(items, SIGNALS).summary.위반).toBe(0)
    })

    it('결정론 — 동일 입력 동일 출력', () => {
      const items = parseExistingPolicy(['| 용어 |', '| --- |', '| member |'].join('\n'), 'glossary')
      expect(reconcilePolicy(items, SIGNALS)).toEqual(reconcilePolicy(items, SIGNALS))
    })
  })

  describe('scanPolicyReconcile — policy-input/*.md IO', () => {
    it('파일명→카테고리 매핑 + 대조', () => {
      const root = mkdtempSync(join(tmpdir(), 'policy-recon-'))
      tmps.push(root)
      const dir = join(root, '.understand-anything', 'policy-input')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'glossary.md'), ['| 용어 | 정의 |', '| --- | --- |', '| member | 회원 |', '| order | 주문 |'].join('\n'))
      const r = scanPolicyReconcile(root, SIGNALS)
      expect(find(r.entries, 'member')!.status).toBe('준수')
      expect(find(r.entries, 'order')!.status).toBe('문서에만')
      expect(r.unresolved).toEqual([])
    })

    it('"없을 때" — policy-input 부재 → 신호 전부 미정의', () => {
      const root = mkdtempSync(join(tmpdir(), 'policy-recon-'))
      tmps.push(root)
      const r = scanPolicyReconcile(root, SIGNALS)
      expect(r.summary).toEqual({ 준수: 0, 위반: 0, 미정의: 3, 문서에만: 0 })
    })

    it('미지원 파일명 → unresolved 보고(누락 금지)', () => {
      const root = mkdtempSync(join(tmpdir(), 'policy-recon-'))
      tmps.push(root)
      const dir = join(root, '.understand-anything', 'policy-input')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'random.md'), '| a |\n| --- |\n| x |')
      const r = scanPolicyReconcile(root, SIGNALS)
      expect(r.unresolved).toHaveLength(1)
      expect(r.unresolved[0].ref).toBe('random.md')
    })
  })
})
