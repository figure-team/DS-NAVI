/**
 * React Router 라우트 추출(P5) 단위테스트 — 객체 라우트 배열(중첩 children)과
 * JSX <Route> 중첩, useRoutes, path 비리터럴 스킵을 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { parseSource } from '../tree-sitter.js'
import { extractReactRouterRoutes } from './react-router.js'

async function run(src: string, filePath = 'src/App.tsx') {
  const root = await parseSource('tsx', src)
  return extractReactRouterRoutes(root, filePath)
}

describe('extractReactRouterRoutes', () => {
  it('createBrowserRouter — 객체 라우트 배열(중첩 children 경로 조합)', async () => {
    const routes = await run(`
      const router = createBrowserRouter([
        { path: '/', element: <Home /> },
        {
          path: '/trust',
          element: <TrustLayout />,
          children: [
            { path: 'members', element: <Members /> },
            { path: 'members/:id', element: <MemberDetail /> },
          ],
        },
      ])
    `)
    const paths = routes.map((r) => r.path).sort()
    expect(paths).toEqual(['/', '/trust', '/trust/members', '/trust/members/:id'])
    expect(routes.every((r) => r.method === 'GET' && r.kind === 'page' && r.framework === 'react-router')).toBe(
      true,
    )
    const members = routes.find((r) => r.path === '/trust/members')!
    expect(members.notes).toEqual(['element:Members'])
  })

  it('index: true 자식은 부모 경로 그대로(세그먼트 추가 없음)', async () => {
    const routes = await run(`
      const router = createBrowserRouter([
        { path: '/dash', children: [{ index: true, element: <Idx /> }] },
      ])
    `)
    expect(routes.map((r) => r.path)).toEqual(['/dash'])
  })

  it('pathless layout route(경로/인덱스 없이 children만)는 부모 경로를 그대로 물려준다', async () => {
    const routes = await run(`
      const router = createBrowserRouter([
        { element: <Layout />, children: [{ path: 'a', element: <A /> }] },
      ])
    `)
    expect(routes.map((r) => r.path)).toEqual(['/a'])
  })

  it('useRoutes 도 동일 객체 배열 형태를 처리한다', async () => {
    const routes = await run(`
      function App() {
        const el = useRoutes([{ path: '/x', element: <X /> }])
        return el
      }
    `)
    expect(routes.map((r) => r.path)).toEqual(['/x'])
  })

  it('JSX <Route> 중첩 — 자식 경로가 부모와 조합된다', async () => {
    const routes = await run(`
      function App() {
        return (
          <Routes>
            <Route path="/x">
              <Route path="y" element={<Y />} />
            </Route>
          </Routes>
        )
      }
    `)
    const paths = routes.map((r) => r.path).sort()
    expect(paths).toEqual(['/x', '/x/y'])
    const y = routes.find((r) => r.path === '/x/y')!
    expect(y.notes).toEqual(['element:Y'])
  })

  it('path 가 문자열 리터럴이 아니면(변수) 해당 라우트는 건너뛴다', async () => {
    const routes = await run(`
      const p = '/dynamic'
      const router = createBrowserRouter([
        { path: p, element: <Dyn /> },
        { path: '/static', element: <Static /> },
      ])
    `)
    expect(routes.map((r) => r.path)).toEqual(['/static'])
  })

  it('라우트 팩토리/Route 가 없는 평범한 컴포넌트는 빈 배열', async () => {
    const routes = await run(`function Hello() { return <div>hi</div> }`)
    expect(routes).toEqual([])
  })
})
