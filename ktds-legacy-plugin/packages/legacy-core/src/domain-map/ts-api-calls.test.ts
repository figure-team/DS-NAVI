/**
 * fetch/axios API 호출 추출 + 라우트 조인(P5) 단위테스트.
 * m-project 관용구(백틱 템플릿 fetch, axios 계열, 조인 매칭 규칙) 본뜬 픽스처.
 */
import { describe, it, expect } from 'vitest'
import { parseSource } from './tree-sitter.js'
import { extractTsApiCalls, joinApiCallsToRoutes } from './ts-api-calls.js'

async function calls(src: string, relPath = 'src/api/applications.ts') {
  const root = await parseSource('typescript', src)
  return extractTsApiCalls(root, relPath)
}

describe('extractTsApiCalls', () => {
  it('fetch(문자열 리터럴) — method 미지정 -> null', async () => {
    const out = await calls(`async function f() { await fetch('/api/applications') }`)
    expect(out).toEqual([{ relPath: 'src/api/applications.ts', method: null, path: '/api/applications', line: 1 }])
  })

  it('fetch(템플릿, 옵션객체 method) — 보간은 접두+"*"로, method 는 대문자화', async () => {
    const out = await calls(`
      async function submit(req) {
        return fetch(\`/api/applications/\${req.id}\`, { method: 'post' })
      }
    `)
    expect(out).toHaveLength(1)
    expect(out[0].path).toBe('/api/applications/*')
    expect(out[0].method).toBe('POST')
  })

  it('axios.get/post/put/delete/patch — 메서드명에서 판정', async () => {
    const out = await calls(`
      axios.get('/api/x')
      axios.post('/api/y')
      axios.put('/api/z')
      axios.delete('/api/w')
      axios.patch('/api/v')
    `)
    expect(out.map((c) => [c.method, c.path])).toEqual([
      ['GET', '/api/x'],
      ['POST', '/api/y'],
      ['PUT', '/api/z'],
      ['DELETE', '/api/w'],
      ['PATCH', '/api/v'],
    ])
  })

  it('axios(url) 단독 호출 — method 판정 불가 시 null(GET 추정 금지)', async () => {
    const out = await calls(`axios('/api/bare')`)
    expect(out).toEqual([{ relPath: 'src/api/applications.ts', method: null, path: '/api/bare', line: 1 }])
  })

  it("'/'로 시작하지 않는 경로/보간 접두는 수집하지 않는다", async () => {
    const out = await calls(`
      fetch('relative/no-slash')
      fetch(\`\${BASE}/applications\`)
      fetch(somePath)
    `)
    expect(out).toEqual([])
  })

  it('여러 줄에 걸친 호출은 line 오름차순으로 정렬된다', async () => {
    const out = await calls(`
      fetch('/api/second')

      fetch('/api/first-by-line-not-alpha')
    `)
    expect(out.map((c) => c.line)).toEqual([2, 4])
  })
})

describe('joinApiCallsToRoutes', () => {
  const routes = [
    { path: '/api/trust/members', method: 'GET' as const },
    { path: '/api/trust/members/{id}', method: 'GET' as const },
    { path: '/api/trust/members/{id}', method: 'PUT' as const },
    { path: '/api/applications', method: 'POST' as const },
    { path: '/api/reports/{year}/{month}', method: 'ANY' as const },
  ]

  it('와일드카드(*)는 route 의 남은 세그먼트(파라미터 포함)를 흡수한다', async () => {
    const c = await calls(`fetch(\`/api/trust/members/\${id}\`)`)
    const links = joinApiCallsToRoutes(c, routes)
    expect(links.map((l) => l.toRoute)).toEqual(['/api/trust/members/{id}', '/api/trust/members/{id}'])
  })

  it('method 가 지정되면 호환되는 라우트만 조인된다', async () => {
    const c = await calls(`fetch(\`/api/trust/members/\${id}\`, { method: 'PUT' })`)
    const links = joinApiCallsToRoutes(c, routes)
    expect(links).toEqual([
      { from: 'src/api/applications.ts', toRoute: '/api/trust/members/{id}', method: 'PUT', line: 1 },
    ])
  })

  it('리터럴 경로가 정확히 일치하는 라우트에 조인된다', async () => {
    const c = await calls(`fetch('/api/trust/members')`)
    const links = joinApiCallsToRoutes(c, routes)
    expect(links).toEqual([
      { from: 'src/api/applications.ts', toRoute: '/api/trust/members', method: 'GET', line: 1 },
    ])
  })

  it('route 가 ANY 이고 call method 가 null 이면 method 는 null 로 보고된다', async () => {
    const c = await calls(`fetch('/api/reports/2026/07')`)
    const links = joinApiCallsToRoutes(c, routes)
    expect(links).toEqual([
      { from: 'src/api/applications.ts', toRoute: '/api/reports/{year}/{month}', method: null, line: 1 },
    ])
  })

  it('매칭되는 라우트가 없으면 빈 배열', async () => {
    const c = await calls(`fetch('/api/nope')`)
    expect(joinApiCallsToRoutes(c, routes)).toEqual([])
  })
})
