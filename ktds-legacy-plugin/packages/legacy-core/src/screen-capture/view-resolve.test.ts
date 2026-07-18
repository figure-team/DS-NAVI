import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractReturnViewNames,
  loadViewResolverConfigs,
  resolveScreenViews,
  resolveViewName,
  type ViewResolverConfig,
} from './view-resolve.js'
import type { Screen } from './types.js'

// ── 순수 함수 ──────────────────────────────────────────────────────────────

describe('resolveViewName', () => {
  const configs: ViewResolverConfig[] = [
    { webappRoot: 'src/main/webapp', prefix: '/WEB-INF/jsp/', suffix: '.jsp' },
  ]
  const fs = new Set(['src/main/webapp/WEB-INF/jsp/egovframework/com/a/List.jsp'])
  const existsRel = (rel: string) => fs.has(rel)

  it('prefix/suffix 를 붙여 실존 파일이면 repo 경로를 돌려준다', () => {
    expect(resolveViewName('egovframework/com/a/List', configs, existsRel)).toBe(
      'src/main/webapp/WEB-INF/jsp/egovframework/com/a/List.jsp',
    )
  })
  it('실존하지 않으면 null(지어내지 않음)', () => {
    expect(resolveViewName('egovframework/com/a/None', configs, existsRel)).toBeNull()
  })
  it('redirect:/forward: 류(콜론 포함)는 해석하지 않는다', () => {
    expect(resolveViewName('redirect:/a/List.do', configs, existsRel)).toBeNull()
  })
})

describe('extractReturnViewNames', () => {
  it('선언 라인부터 중괄호 균형으로 본문을 잘라 return 리터럴을 걷는다(중복 제거)', () => {
    const src = [
      'public String list(ModelMap model)', // 1 (선언 — 여는 중괄호는 다음 줄)
      '    throws Exception {',
      '  if (x) { return "com/a/List"; }',
      '  return "com/a/List";',
      '}',
      'public String other() { return "com/b/Other"; }',
    ]
    expect(extractReturnViewNames(src, 1)).toEqual(['com/a/List'])
  })
  it('다음 메서드의 리터럴은 걷지 않고, ModelAndView 리터럴도 잡는다', () => {
    const src = ['String a() {', '  return new ModelAndView("com/a/Mv").toString();', '}']
    expect(extractReturnViewNames(src, 1)).toEqual(['com/a/Mv'])
  })
})

// ── 파일시스템 픽스처(설정 파싱 + 화면 채움 통합) ──────────────────────────

let tmp: string | null = null
afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true })
  tmp = null
})

function screenFx(id: string, over: Partial<Screen> = {}): Screen {
  return {
    id,
    title: '화면',
    url: `http://localhost/${id}`,
    jspFile: over.jspFile ?? null,
    graphNodeId: over.graphNodeId ?? null,
    domain: null,
    scenario: null,
    openedFrom: null,
    contentSignature: null,
    capture: { path: 'screens/x.png', width: 800, height: 600, capturedAt: '2026-07-13T00:00:00.000Z', contentHash: 'h' },
    summary: null,
    annotations: [],
  }
}

async function seedProject(root: string) {
  await mkdir(join(root, 'src/main/webapp/WEB-INF/config'), { recursive: true })
  await mkdir(join(root, 'src/main/webapp/WEB-INF/jsp/com/a'), { recursive: true })
  await mkdir(join(root, 'src/main/java'), { recursive: true })
  await mkdir(join(root, '.spec/map'), { recursive: true })
  await writeFile(
    join(root, 'src/main/webapp/WEB-INF/config/servlet.xml'),
    `<beans><bean class="org.springframework.web.servlet.view.UrlBasedViewResolver" p:prefix="/WEB-INF/jsp/" p:suffix=".jsp"/></beans>`,
  )
  await writeFile(join(root, 'src/main/webapp/WEB-INF/jsp/com/a/List.jsp'), '<html/>')
  await writeFile(join(root, 'src/main/webapp/WEB-INF/jsp/com/a/Branch1.jsp'), '<html/>')
  await writeFile(join(root, 'src/main/webapp/WEB-INF/jsp/com/a/Branch2.jsp'), '<html/>')
  await writeFile(
    join(root, 'src/main/java/AController.java'),
    [
      'public class AController {',
      '  public String list() {',
      '    return "com/a/List";',
      '  }',
      '  public String branch(boolean x) {',
      '    if (x) return "com/a/Branch1";',
      '    return "com/a/Branch2";',
      '  }',
      '}',
    ].join('\n'),
  )
  await writeFile(
    join(root, '.spec/map/routes.json'),
    JSON.stringify({
      schemaVersion: 1,
      gitCommit: null,
      contextPath: null,
      batchEntries: [],
      routes: [
        { routeId: 'route:ANY /a/list.do', framework: 'spring', kind: 'form', method: 'ANY', path: '/a/list.do', rawPath: '/a/list.do', filePath: 'src/main/java/AController.java', line: 2, handler: 'AController#list', notes: [] },
        { routeId: 'route:ANY /a/branch.do', framework: 'spring', kind: 'form', method: 'ANY', path: '/a/branch.do', rawPath: '/a/branch.do', filePath: 'src/main/java/AController.java', line: 5, handler: 'AController#branch', notes: [] },
      ],
    }),
  )
}

describe('loadViewResolverConfigs / resolveScreenViews', () => {
  it('webapp XML 에서 prefix/suffix 를 추출한다', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vr-'))
    await seedProject(tmp)
    expect(loadViewResolverConfigs(tmp)).toEqual([
      { webappRoot: 'src/main/webapp', prefix: '/WEB-INF/jsp/', suffix: '.jsp' },
    ])
  })

  it('뷰 이름 jspFile 치환 + null 은 라우트 리터럴로 채우고, 분기 뷰는 보류한다', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vr-'))
    await seedProject(tmp)
    const screens = [
      screenFx('screen:x', { jspFile: 'com/a/List' }), // 뷰 이름 문자열 → 실경로 치환
      screenFx('screen:a/list.do'), // null → 라우트 리터럴 채움
      screenFx('screen:a/branch.do'), // 분기 2뷰 → fail-open
    ]
    const { screens: out, summary } = resolveScreenViews(screens, tmp)
    expect(out[0].jspFile).toBe('src/main/webapp/WEB-INF/jsp/com/a/List.jsp')
    expect(out[1].jspFile).toBe('src/main/webapp/WEB-INF/jsp/com/a/List.jsp')
    expect(out[2].jspFile).toBeNull()
    expect(summary).toMatchObject({ rewritten: 1, filledFromRoute: 1, ambiguous: 1, configs: 1 })
  })

  it('리졸버 설정이 없으면 전체 no-op(Stripes 류 무해)', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vr-'))
    await mkdir(join(tmp, 'src'), { recursive: true })
    const screens = [screenFx('screen:x', { jspFile: 'webapp/jsp/cart/Cart.jsp' })]
    const { screens: out, summary } = resolveScreenViews(screens, tmp)
    expect(out[0]).toBe(screens[0])
    expect(summary.configs).toBe(0)
  })
})
