/**
 * TS/TSX import 엣지 추출(P5) 단위테스트 — 임시 디렉터리에 m-project 관용구를 본뜬
 * 픽스처를 써서 census 를 직접 구성하고(git 비의존) extractTsImportEdges 를 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractTsImportEdges, resolveRelativeSpec, collectRelativeImportSpecs } from './ts-imports.js'
import { parseSource } from './tree-sitter.js'
import type { CensusReport } from './types.js'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ts-imports-test-'))
  const write = (rel: string, content: string) => {
    const abs = join(root, rel)
    mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }

  // apps/portal 관용구: api 클라이언트(fetch 템플릿) + 화면 + index 배럴 해소.
  write(
    'apps/portal/src/api/applications.ts',
    `
      import { ApiError } from '../errors'
      import type { ApplicationView } from '../types'
      export const BASE = '/api'
    `,
  )
  write('apps/portal/src/errors.ts', `export class ApiError extends Error {}`)
  write('apps/portal/src/types.ts', `export type ApplicationView = { id: string }`)
  write(
    'apps/portal/src/pages/Home.tsx',
    `
      import { submitApplication } from '../api/applications'
      import Layout from '../components'
      import react from 'react'
      export default function Home() { return null }
    `,
  )
  // index 배럴 해소 우선순위 확인: components/index.tsx 존재.
  write('apps/portal/src/components/index.tsx', `export default function Layout() { return null }`)
  // 동적 import + 확장자 명시 스펙.
  write(
    'apps/portal/src/router.tsx',
    `
      const lazyHome = () => import('./pages/Home')
      import data from './data.json'
    `,
  )
  write('apps/portal/src/data.json', `{}`)
  // 자기참조(같은 파일을 스스로 import) — 엣지 미생산 확인용 보조 파일.
  write('apps/portal/src/self.ts', `import './self'`)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const RELPATHS = [
  'apps/portal/src/api/applications.ts',
  'apps/portal/src/errors.ts',
  'apps/portal/src/types.ts',
  'apps/portal/src/pages/Home.tsx',
  'apps/portal/src/components/index.tsx',
  'apps/portal/src/router.tsx',
  'apps/portal/src/data.json',
  'apps/portal/src/self.ts',
]

function makeCensus(): CensusReport {
  return {
    schemaVersion: 1,
    gitCommit: null,
    fileCount: RELPATHS.length,
    files: RELPATHS.map((relPath) => ({
      relPath,
      lang: relPath.endsWith('.tsx') ? 'tsx' : relPath.endsWith('.ts') ? 'typescript' : 'json',
    })),
  }
}

describe('extractTsImportEdges', () => {
  it('상대경로 import 를 census 파일로 해소해 import 엣지를 낸다', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    const has = (source: string, target: string) =>
      edges.some((e) => e.source === source && e.target === target && e.kind === 'import')

    expect(has('apps/portal/src/api/applications.ts', 'apps/portal/src/errors.ts')).toBe(true)
    expect(has('apps/portal/src/api/applications.ts', 'apps/portal/src/types.ts')).toBe(true)
  })

  it('디렉터리 상대 임포트는 index.tsx 로 해소된다(우선순위 규약)', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    expect(
      edges.some(
        (e) =>
          e.source === 'apps/portal/src/pages/Home.tsx' &&
          e.target === 'apps/portal/src/components/index.tsx',
      ),
    ).toBe(true)
  })

  it('비상대(패키지) 임포트("react")는 엣지를 만들지 않는다', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    expect(edges.some((e) => e.source === 'apps/portal/src/pages/Home.tsx' && e.target.includes('react'))).toBe(
      false,
    )
  })

  it('동적 import() 도 상대경로를 해소한다(확장자 없는 파일 -> .tsx)', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    expect(
      edges.some(
        (e) => e.source === 'apps/portal/src/router.tsx' && e.target === 'apps/portal/src/pages/Home.tsx',
      ),
    ).toBe(true)
  })

  it('확장자가 명시된 스펙(.json)은 그대로 census 존재 여부만 확인한다', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    expect(
      edges.some(
        (e) => e.source === 'apps/portal/src/router.tsx' && e.target === 'apps/portal/src/data.json',
      ),
    ).toBe(true)
  })

  it('자기참조 임포트는 엣지를 만들지 않는다', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    expect(edges.some((e) => e.source === 'apps/portal/src/self.ts')).toBe(false)
  })

  it('산출은 (source,target,kind,line) 순 결정론 정렬', async () => {
    const edges = await extractTsImportEdges(root, makeCensus())
    const sorted = [...edges].sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target) ||
        a.kind.localeCompare(b.kind) ||
        (a.line ?? -1) - (b.line ?? -1),
    )
    expect(edges).toEqual(sorted)
  })
})

describe('resolveRelativeSpec 우선순위', () => {
  const fileSet = new Set([
    'a/x.ts',
    'a/x.tsx',
    'a/y.js',
    'a/z/index.ts',
  ])

  it('x.ts 와 x.tsx 가 둘 다 있으면 x.ts 를 우선한다', () => {
    expect(resolveRelativeSpec('a/from.ts', './x', fileSet)).toBe('a/x.ts')
  })

  it('ts/tsx 없고 js 만 있으면 js 를 해소한다', () => {
    expect(resolveRelativeSpec('a/from.ts', './y', fileSet)).toBe('a/y.js')
  })

  it('디렉터리는 index.ts 로 해소된다', () => {
    expect(resolveRelativeSpec('a/from.ts', './z', fileSet)).toBe('a/z/index.ts')
  })

  it('census 에 없는 경로는 null(누락 없이 조용히 제외)', () => {
    expect(resolveRelativeSpec('a/from.ts', './nope', fileSet)).toBeNull()
  })
})

describe('collectRelativeImportSpecs', () => {
  it('보간 포함 템플릿(동적 import)은 정적 해소 불가로 제외된다', async () => {
    const src = `const mod = () => import(\`./pages/\${name}\`)`
    const root2 = await parseSource('typescript', src)
    expect(collectRelativeImportSpecs(root2)).toEqual([])
  })

  it('export * from / export { x } from 도 스펙으로 수집된다', async () => {
    const src = `export { a } from './a'\nexport * from './b'`
    const root2 = await parseSource('typescript', src)
    expect(collectRelativeImportSpecs(root2).map((r) => r.spec)).toEqual(['./a', './b'])
  })
})
