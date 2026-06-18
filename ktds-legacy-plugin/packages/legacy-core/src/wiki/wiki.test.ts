import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GeneratedDoc, DocMeta } from '../doc-generator/types.js'
import { buildWikiVault } from './wiki.js'
import { writeWikiVault, specWikiDir } from './persist.js'
import { buildOnboardingGuide, tourOrder } from './onboarding.js'

function doc(docId: string, title: string): GeneratedDoc {
  return {
    docId,
    title,
    methodology: 'as-built',
    sections: [
      {
        heading: 'Overview',
        claims: [
          {
            text: 'grounded claim',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/a.ts', line: 10 }],
            requiresHumanReview: false,
          },
        ],
      },
    ],
  }
}

function meta(d: GeneratedDoc): DocMeta {
  return {
    docId: d.docId,
    title: d.title,
    methodology: d.methodology,
    status: 'APPROVED',
    sourceCommit: 'abc123',
    evidenceRate: 1,
  }
}

const docs = (): GeneratedDoc[] => [
  doc('03_feature-spec', '기능 명세'),
  doc('04_api-spec', 'API 명세'),
  doc('05_db-spec', 'DB 명세'),
]

describe('buildWikiVault', () => {
  it('produces one .md per doc plus index.md hub', () => {
    const vault = buildWikiVault(docs(), meta)
    const paths = vault.files.map((f) => f.path)
    expect(paths).toEqual([
      '03_feature-spec.md',
      '04_api-spec.md',
      '05_db-spec.md',
      'index.md',
    ])
  })

  it('index.md hub has 여기부터 + wikilinks grouped by methodology', () => {
    const vault = buildWikiVault(docs(), meta)
    const index = vault.files.find((f) => f.path === 'index.md')!.content
    expect(index).toContain('여기부터(start here)')
    expect(index).toContain('## as-built')
    expect(index).toContain('[[03_feature-spec]]')
    expect(index).toContain('[[04_api-spec]]')
    expect(index).toContain('[[05_db-spec]]')
    // start-here points at first doc by docId order
    expect(index).toContain('먼저 [[03_feature-spec]] 부터 보세요.')
  })

  it('adds related-doc wikilinks where a relationship exists (feature-spec -> api-spec)', () => {
    const vault = buildWikiVault(docs(), meta)
    const feature = vault.files.find((f) => f.path === '03_feature-spec.md')!.content
    expect(feature).toContain('## 관련 문서')
    expect(feature).toContain('[[04_api-spec]]')
    // api-spec relates to db-spec
    const api = vault.files.find((f) => f.path === '04_api-spec.md')!.content
    expect(api).toContain('[[05_db-spec]]')
    // db-spec has no outgoing relation -> no 관련 문서 section
    const db = vault.files.find((f) => f.path === '05_db-spec.md')!.content
    expect(db).not.toContain('## 관련 문서')
  })

  it('does not link a relationship when the target doc is absent', () => {
    // only feature-spec, no api-spec in vault
    const vault = buildWikiVault([doc('03_feature-spec', '기능')], meta)
    const feature = vault.files.find((f) => f.path === '03_feature-spec.md')!.content
    expect(feature).not.toContain('## 관련 문서')
  })

  it('is deterministic (byte-identical) regardless of input order', () => {
    const a = buildWikiVault(docs(), meta)
    const shuffled = [docs()[2], docs()[0], docs()[1]]
    const b = buildWikiVault(shuffled, meta)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('falls back to a minimal meta when no resolver is supplied', () => {
    const vault = buildWikiVault([doc('01_tech-stack', '기술')])
    const md = vault.files.find((f) => f.path === '01_tech-stack.md')!.content
    expect(md).toContain('status: DRAFT')
    expect(md).toContain('sourceCommit: null')
  })

  it('writeWikiVault round-trips file contents under .spec/wiki/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ktds-wiki-'))
    try {
      const vault = buildWikiVault(docs(), meta)
      const written = writeWikiVault(dir, vault)
      expect(written.length).toBe(vault.files.length)
      for (const file of vault.files) {
        const abs = join(specWikiDir(dir), file.path)
        expect(existsSync(abs)).toBe(true)
        expect(readFileSync(abs, 'utf8')).toBe(file.content)
      }
      // re-write -> byte-identical
      writeWikiVault(dir, vault)
      const indexAbs = join(specWikiDir(dir), 'index.md')
      expect(readFileSync(indexAbs, 'utf8')).toBe(
        vault.files.find((f) => f.path === 'index.md')!.content,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cleans orphan files on methodology switch (as-built -> si-standard)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ktds-wiki-'))
    try {
      // 1) as-built vault 기록 — 05_db-spec.md 등이 존재.
      const asBuilt = buildWikiVault(docs(), meta)
      writeWikiVault(dir, asBuilt)
      expect(existsSync(join(specWikiDir(dir), '05_db-spec.md'))).toBe(true)

      // 2) si-standard 로 전환(다른 docId 집합) -> 이전 as-built .md 는 orphan.
      const siDocs: GeneratedDoc[] = [
        doc('si-기능명세서', 'SI 기능명세서'),
        doc('si-인터페이스정의서', 'SI 인터페이스정의서'),
      ]
      const si = buildWikiVault(siDocs, meta)
      writeWikiVault(dir, si)

      // 새 파일은 존재.
      expect(existsSync(join(specWikiDir(dir), 'si-기능명세서.md'))).toBe(true)
      expect(existsSync(join(specWikiDir(dir), 'si-인터페이스정의서.md'))).toBe(true)
      // orphan as-built .md 는 모두 제거됨(index.md 와 어긋나지 않음).
      expect(existsSync(join(specWikiDir(dir), '03_feature-spec.md'))).toBe(false)
      expect(existsSync(join(specWikiDir(dir), '04_api-spec.md'))).toBe(false)
      expect(existsSync(join(specWikiDir(dir), '05_db-spec.md'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('only removes the wiki dir, preserving sibling .spec artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ktds-wiki-'))
    try {
      // .spec/other.txt 형제 산출물 — wiki 정리가 건드리면 안 된다.
      const sibling = join(dir, '.spec', 'other.txt')
      mkdirSync(join(dir, '.spec'), { recursive: true })
      writeFileSync(sibling, 'keep-me', 'utf8')

      writeWikiVault(dir, buildWikiVault(docs(), meta))
      expect(existsSync(sibling)).toBe(true)
      expect(readFileSync(sibling, 'utf8')).toBe('keep-me')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildOnboardingGuide', () => {
  it('yields a start-here ordering with wikilinks into the vault', () => {
    const guide = buildOnboardingGuide({
      docIds: ['04_api-spec', '03_feature-spec'],
    })
    expect(guide.docId).toBe('00_onboarding')
    const startHere = guide.sections.find((s) => s.heading === '여기부터(start here)')!
    expect(startHere.prose).toContain('[[index]]')
    // tour order falls back to sorted docIds with wikilinks
    expect(startHere.claims[0].text).toContain('[[03_feature-spec]]')
    const browse = guide.sections.find((s) => s.heading === '문서 둘러보기')!
    expect(browse.claims.map((c) => c.text)).toEqual(['[[03_feature-spec]]', '[[04_api-spec]]'])
  })

  it('uses domain priority (rank ASC) for tour order when supplied', () => {
    const stops = tourOrder({
      docIds: [],
      priorities: [
        { key: 'billing', sizeScore: 1, complexityScore: 1, couplingScore: 1, priorityScore: 5, rank: 2 },
        { key: 'auth', sizeScore: 1, complexityScore: 1, couplingScore: 1, priorityScore: 9, rank: 1 },
      ],
    })
    expect(stops.map((s) => s.label)).toEqual(['auth', 'billing'])
  })

  it('falls back to nodeOrder when no priorities', () => {
    const stops = tourOrder({ docIds: ['x'], nodeOrder: ['n1', 'n2'] })
    expect(stops.map((s) => s.label)).toEqual(['n1', 'n2'])
  })
})
