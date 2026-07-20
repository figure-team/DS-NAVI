import { describe, expect, it } from 'vitest'
import { parseSource } from './tree-sitter.js'
import { extractWrapperApiCalls } from './ts-api-wrappers.js'

/** m-project 실전 관용구 축약 — BASE 상수 + request/post 래퍼 + 리터럴 호출. */
const WRAPPER_SRC = `
const BASE = import.meta.env.VITE_API_BASE ?? "/api";
async function request(path, init) {
  const res = await fetch(\`\${BASE}\${path}\`, { ...init, headers });
  return res.json();
}
function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}
export const listMembers = () => request("/trust/members");
export const conclude = (id) => post(\`/trust/members/\${id}/conclude\`);
export const remove = (id) => request(\`/trust/members/\${id}\`, { method: "DELETE" });
`

describe('ts-api-wrappers — 파일-로컬 래퍼 해소', () => {
  it('BASE 상수(?? 폴백)와 fetch 템플릿 래퍼를 거쳐 리터럴 호출을 결합한다', async () => {
    const root = await parseSource('typescript', WRAPPER_SRC)
    const calls = extractWrapperApiCalls(root, 'apps/bo/src/api/trust.ts')
    const byPath = Object.fromEntries(calls.map((c) => [c.path, c]))
    expect(byPath['/api/trust/members']).toBeTruthy()
    expect(byPath['/api/trust/members'].method).toBeNull() // request 자체는 메서드 미상.
    // 전이 래퍼(post) — method: "POST" 리터럴에서 판정 + 보간 꼬리는 '*'.
    expect(byPath['/api/trust/members/*']).toBeTruthy()
    const starCalls = calls.filter((c) => c.path === '/api/trust/members/*')
    expect(starCalls.map((c) => c.method).sort()).toEqual(['DELETE', 'POST'])
  })

  it('래퍼 없는 파일·상수 없는 파일은 빈 배열(오탐 없음)', async () => {
    const a = await parseSource('typescript', 'export const x = fetch("/api/direct")\n')
    expect(extractWrapperApiCalls(a, 'a.ts')).toEqual([])
    const b = await parseSource(
      'typescript',
      'const BASE = "/api"\nconst helper = (s) => s.trim()\nhelper("/not/an/endpoint")\n',
    )
    expect(extractWrapperApiCalls(b, 'b.ts')).toEqual([])
  })

  it('맨앞 보간이 상수·경로 순이 아니면 래퍼로 오인하지 않는다', async () => {
    const root = await parseSource(
      'typescript',
      'const BASE = "/api"\nfunction f(path) { return fetch(`${path}${BASE}`) }\nf("/x")\n',
    )
    expect(extractWrapperApiCalls(root, 'c.ts')).toEqual([])
  })

  it('HTTP 동사명 함수는 이름으로 메서드를 판정한다(3단 전이)', async () => {
    const root = await parseSource(
      'typescript',
      [
        'const ROOT = "/v1";',
        'function core(p) { return fetch(`${ROOT}${p}`) }',
        'function send(p, init) { return core(p) }',
        'function put(p) { return send(p) }',
        'export const save = () => put("/items/save");',
      ].join('\n'),
    )
    const calls = extractWrapperApiCalls(root, 'd.ts')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ path: '/v1/items/save', method: 'PUT' })
  })
})
