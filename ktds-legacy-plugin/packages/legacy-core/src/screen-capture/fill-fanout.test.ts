import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { buildScreensFile, serializeScreens, computeMechanicalHash } from './assemble.js'
import {
  prepScreenFill,
  auditScreenFillFragments,
  mergeScreenFillFragments,
  readScreenFillChunkIndex,
  screenFillFragDir,
  ScreenFillChunkSchema,
  ScreenFillFragmentSchema,
  type ScreenFillFragment,
} from './fill-fanout.js'
import type { Annotation, MissingScreen, Screen } from './types.js'
import type { MethodCallGraph } from '../domain-map/types.js'

// fill-fanout.ts(화면설계서 Stage B 팬아웃) — 청크 분해의 결정론(도메인 우선·화면
// 단위 자름), pre-cite 의 기계 검증 통과, 감사 커버리지/신뢰도 판정, 병합의 불변
// 봉인 보존 + 선언 밖 드랍을 검증한다.

const SRC_FOO = `package shop.web;
public class FooActionBean {
  private FooService fooService;
  public Resolution view() {
    return new ForwardResolution("/WEB-INF/jsp/foo/list.jsp");
  }
}
`
const SRC_SERVICE = `package shop.service;
public class FooService {
  public void load() { /* 목록을 조회한다 */ }
}
`

/** 결정론 mechanical 골격 주석 — no/kind/selector/bbox/eventType/mechanical 봉인. */
function ann(over: Partial<Annotation> & Pick<Annotation, 'no' | 'kind'>): Annotation {
  return {
    no: over.no,
    kind: over.kind,
    selector: over.selector ?? `#${over.kind}-${over.no}`,
    bbox: over.bbox ?? { x: 0, y: 0, width: 10, height: 10 },
    label: over.label ?? `요소 ${over.no}`,
    eventType: over.eventType ?? 'none',
    mechanical: over.mechanical ?? {
      tag: 'input',
      inputType: 'text',
      name: `f${over.no}`,
      href: null,
      formAction: null,
      formMethod: null,
      onclick: null,
      required: false,
    },
    handler: over.handler ?? null,
    description: over.description ?? null,
    note: over.note ?? null,
  }
}

function screen(id: string, domain: string | null, annotations: Annotation[], over: Partial<Screen> = {}): Screen {
  return {
    id,
    title: over.title ?? `화면 ${id}`,
    url: over.url ?? `http://localhost/${id}`,
    jspFile: over.jspFile ?? null,
    graphNodeId: over.graphNodeId ?? null,
    domain,
    scenario: over.scenario ?? null,
    openedFrom: over.openedFrom ?? null,
    contentSignature: over.contentSignature ?? null,
    capture: over.capture ?? {
      path: `screens/${id.replace(/[^A-Za-z0-9._-]/g, '_')}.png`,
      width: 800,
      height: 600,
      capturedAt: '2026-07-13T00:00:00.000Z',
      contentHash: 'abc123',
    },
    summary: over.summary ?? null,
    annotations,
  }
}

/** 유효한 screens.json 을 buildScreensFile 로 조립해 디스크에 쓴다(mechanicalHash 정합 보장). */
async function seedScreens(root: string, screens: Screen[], graphJsps: string[] = [], missing: MissingScreen[] = []) {
  const file = buildScreensFile({
    generatedAt: '2026-07-13T00:00:00.000Z',
    gitCommit: 'deadbeef',
    baseUrl: 'http://localhost',
    viewport: { width: 800, height: 600 },
    screens,
    fragments: [],
    graphJsps,
    missing,
  })
  await mkdir(join(root, '.understand-anything'), { recursive: true })
  await writeFile(join(root, '.understand-anything', 'screens.json'), serializeScreens(file), 'utf8')
  return file
}

async function seedSources(root: string) {
  await mkdir(join(root, 'src/main/java/shop/web'), { recursive: true })
  await mkdir(join(root, 'src/main/java/shop/service'), { recursive: true })
  await writeFile(join(root, 'src/main/java/shop/web/FooActionBean.java'), SRC_FOO, 'utf8')
  await writeFile(join(root, 'src/main/java/shop/service/FooService.java'), SRC_SERVICE, 'utf8')
}

async function seedMethodCalls(root: string) {
  const graph: MethodCallGraph = {
    schemaVersion: 1,
    gitCommit: 'deadbeef',
    calls: [
      {
        callerClass: 'FooActionBean',
        callerMethod: 'view',
        callerFile: 'src/main/java/shop/web/FooActionBean.java',
        callLine: 4,
        calleeClass: 'FooService',
        calleeMethod: 'load',
        calleeFile: 'src/main/java/shop/service/FooService.java',
        receiverKind: 'field',
        argCount: 0,
        overloadArity: 0,
      },
    ],
  }
  await mkdir(join(root, '.spec/map'), { recursive: true })
  await writeFile(join(root, '.spec/map/method-calls.json'), JSON.stringify(graph), 'utf8')
}

/** 청크 전수를 만족하는 유효 조각을 생성한다(description 만 채우고 handler 는 본체 유지). */
async function fakeFragmentsFromChunks(root: string): Promise<void> {
  const index = await readScreenFillChunkIndex(root)
  await mkdir(screenFillFragDir(root), { recursive: true })
  for (const entry of index.chunks) {
    const chunk = ScreenFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map', 'screens-fill-prep', `${entry.chunkId}.json`), 'utf8')),
    )
    const frag: ScreenFillFragment = {
      schemaVersion: 1,
      chunkId: entry.chunkId,
      screens: chunk.screens.map((s) => ({
        screenId: s.screenId,
        summary: { text: `${s.title} 개요`, confidence: 'INFERRED' as const },
        annotations: s.annotations.map((a) => ({ key: a.key, description: `${a.label} 설명` })),
      })),
    }
    await writeFile(
      join(screenFillFragDir(root), `${entry.chunkId}.json`),
      JSON.stringify(ScreenFillFragmentSchema.parse(frag)),
      'utf8',
    )
  }
}

describe('screen fill-fanout', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'screens-fanout-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('prep: 도메인 우선 그룹핑 + 화면 단위 자름 + 핸들러 pre-cite 가 실파일과 일치', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const handler = {
      target: 'FooActionBean#view',
      chain: [],
      evidence: [{ file: 'src/main/java/shop/web/FooActionBean.java', line: 4 }],
      confidence: 'CONFIRMED' as const,
    }
    const screens = [
      screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'action', handler }), ann({ no: 1, kind: 'field' })]),
      screen('screen:foo/b', 'foo', [ann({ no: 1, kind: 'field' })]),
      screen('screen:bar/c', 'bar', [ann({ no: 1, kind: 'field' })]),
    ]
    await seedScreens(root, screens)

    const { index } = await prepScreenFill(root, { chunkScreens: 2 })
    // 도메인 우선 그룹핑(도메인 키 사전순: bar → foo), 화면 단위 자름·혼합 금지.
    expect(index.totals.chunks).toBe(2)
    expect(index.chunks.map((c) => c.domain)).toEqual(['bar', 'foo'])
    expect(index.chunks[0].screenIds).toEqual(['screen:bar/c'])
    expect(index.chunks[1].screenIds).toEqual(['screen:foo/a', 'screen:foo/b'])
    expect(index.totals.screens).toBe(3)
    expect(index.totals.annotations).toBe(4)

    // FooActionBean 핸들러는 foo 청크(scr-001)에 실린다.
    const fooChunk = ScreenFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map/screens-fill-prep/scr-001.json'), 'utf8')),
    )
    const dict = fooChunk.handlerDict.find((d) => d.target === 'FooActionBean#view')
    expect(dict).toBeDefined()
    // routeEvidence 스니펫은 실파일(4행)에서 결정론 추출 — verbatim 검증.
    expect(dict!.routeEvidence).not.toBeNull()
    const foo = SRC_FOO.split('\n')
    expect(dict!.routeEvidence!.snippet).toBe(foo[dict!.routeEvidence!.line - 1].trim())
    // 체인 후보: FooActionBean#view → FooService#load (method-calls 결정론 조인).
    expect(dict!.chainCandidates.map((c) => c.callee)).toContain('FooService#load')
    const chain = dict!.chainCandidates.find((c) => c.callee === 'FooService#load')!
    expect(chain.preCite!.snippet).toBe(foo[chain.preCite!.line - 1].trim())
  })

  it('audit: 완결 조각은 complete, 주석 누락과 CONFIRMED-무근거는 incomplete', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const screens = [screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'field' }), ann({ no: 2, kind: 'field' })])]
    await seedScreens(root, screens)
    await prepScreenFill(root, { chunkScreens: 6 })

    // (1) 완결 조각.
    await fakeFragmentsFromChunks(root)
    let audit = await auditScreenFillFragments(root)
    expect(audit.complete).toEqual(['scr-000'])
    expect(audit.incomplete).toEqual([])

    // (2) 주석 key 누락 → incomplete.
    await writeFile(
      join(screenFillFragDir(root), 'scr-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-000',
        screens: [{ screenId: 'screen:foo/a', annotations: [{ key: 'field:1', description: 'x' }] }],
      }),
      'utf8',
    )
    audit = await auditScreenFillFragments(root, ['scr-000'])
    expect(audit.complete).toEqual([])
    expect(audit.incomplete[0].reason).toMatch(/coverage/)

    // (3) CONFIRMED handler 인데 evidence 비어 있음 → incomplete(fail-closed).
    await writeFile(
      join(screenFillFragDir(root), 'scr-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-000',
        screens: [
          {
            screenId: 'screen:foo/a',
            annotations: [
              { key: 'field:1', description: 'x', handler: { target: 'X#y', chain: [], evidence: [], confidence: 'CONFIRMED' } },
              { key: 'field:2', description: 'y' },
            ],
          },
        ],
      }),
      'utf8',
    )
    audit = await auditScreenFillFragments(root)
    expect(audit.incomplete[0].reason).toMatch(/evidence/)
  })

  it('merge: 채움 필드만 반영·불변 봉인 보존·선언 밖 항목 드랍·해시 불변', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const screens = [screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'field', label: '이메일' })])]
    const seeded = await seedScreens(root, screens)
    await prepScreenFill(root, { chunkScreens: 6 })

    // 유효 채움 + 선언 밖 화면/주석 key 를 섞어 넣는다(드랍 검증).
    await mkdir(screenFillFragDir(root), { recursive: true })
    await writeFile(
      join(screenFillFragDir(root), 'scr-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-000',
        screens: [
          {
            screenId: 'screen:foo/a',
            jspFile: 'src/main/webapp/WEB-INF/jsp/foo/list.jsp',
            summary: { text: '목록 화면', confidence: 'INFERRED' },
            annotations: [
              { key: 'field:1', description: '이메일 입력란' },
              { key: 'field:9', description: '유령 주석(청크 밖)' },
            ],
          },
          { screenId: 'screen:ghost', annotations: [{ key: 'field:1', description: '유령 화면' }] },
        ],
      }),
      'utf8',
    )

    const result = await mergeScreenFillFragments(root)
    expect(result.screensFilled).toBe(1)
    expect(result.droppedItems).toBe(2) // 유령 화면 1 + 유령 주석 1
    expect(result.validation.ok).toBe(true)

    const merged = JSON.parse(await readFile(join(root, '.understand-anything/screens.json'), 'utf8'))
    const s = merged.screens.find((x: Screen) => x.id === 'screen:foo/a')
    expect(s.jspFile).toBe('src/main/webapp/WEB-INF/jsp/foo/list.jsp')
    expect(s.summary.text).toBe('목록 화면')
    expect(s.annotations[0].description).toBe('이메일 입력란')
    // 불변 봉인 필드 보존.
    expect(s.annotations[0].selector).toBe('#field-1')
    expect(s.annotations[0].mechanical.name).toBe('f1')
    // mechanicalHash 는 채움으로 바뀌지 않는다.
    expect(merged.mechanicalHash).toBe(seeded.mechanicalHash)
    expect(computeMechanicalHash(merged.screens)).toBe(seeded.mechanicalHash)
  })

  it('merge: 조작된 조각 인용은 실파일 대조로 제거·CONFIRMED→INFERRED 강등, 본체 인용은 보존', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const FILE = 'src/main/java/shop/web/FooActionBean.java'
    // field:1 = 본체 핸들러 없음(조각이 CONFIRMED 신규 인용 — 조작). field:2 = 본체
    // CONFIRMED(Stage A) 를 조각이 그대로 echo(같은 file:line — 검증 면제·보존).
    const bodyHandler = {
      target: 'FooActionBean#view',
      chain: [],
      evidence: [{ file: FILE, line: 4 }],
      confidence: 'CONFIRMED' as const,
    }
    const screens = [
      screen('screen:foo/a', 'foo', [
        ann({ no: 1, kind: 'action' }),
        ann({ no: 2, kind: 'action', handler: bodyHandler }),
      ]),
    ]
    const seeded = await seedScreens(root, screens)
    await prepScreenFill(root, { chunkScreens: 6 })
    await mkdir(screenFillFragDir(root), { recursive: true })
    await writeFile(
      join(screenFillFragDir(root), 'scr-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-000',
        screens: [
          {
            screenId: 'screen:foo/a',
            annotations: [
              {
                key: 'action:1',
                description: '조작된 핸들러',
                handler: {
                  target: 'Ghost#x',
                  chain: ['Ghost#x'],
                  // 실파일에 없는 스니펫 → text-mismatch → 제거 → evidence 0 → 강등.
                  evidence: [{ file: FILE, line: 2, snippet: '존재하지 않는 스니펫 XYZ 라인' }],
                  confidence: 'CONFIRMED',
                },
              },
              {
                key: 'action:2',
                description: '기존 핸들러 유지',
                // 본체와 동일 file:line(스니펫 없음) — 검증 면제·보존.
                handler: { target: 'FooActionBean#view', chain: [], evidence: [{ file: FILE, line: 4 }], confidence: 'CONFIRMED' },
              },
            ],
          },
        ],
      }),
      'utf8',
    )

    const result = await mergeScreenFillFragments(root)
    expect(result.citationsRemoved).toBe(1)
    expect(result.handlersDemoted).toBe(1)
    expect(result.validation.ok).toBe(true)

    const merged = JSON.parse(await readFile(join(root, '.understand-anything/screens.json'), 'utf8'))
    const s = merged.screens.find((x: Screen) => x.id === 'screen:foo/a')
    const a1 = s.annotations.find((a: Annotation) => a.kind === 'action' && a.no === 1)
    const a2 = s.annotations.find((a: Annotation) => a.kind === 'action' && a.no === 2)
    // 조작 인용 → evidence 제거 + INFERRED 강등.
    expect(a1.handler.confidence).toBe('INFERRED')
    expect(a1.handler.evidence).toEqual([])
    // 본체 Stage A 인용 echo → CONFIRMED 유지·evidence 보존.
    expect(a2.handler.confidence).toBe('CONFIRMED')
    expect(a2.handler.evidence).toEqual([{ file: FILE, line: 4 }])
    // 강등이 봉인 해시를 바꾸지 않는다.
    expect(computeMechanicalHash(merged.screens)).toBe(seeded.mechanicalHash)
  })

  it('merge(m2 문서화): 조각이 봉인 필드(selector 등)를 실어 보내도 mechanicalHash 불변', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const screens = [screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'field', label: '이메일' })])]
    const seeded = await seedScreens(root, screens)
    await prepScreenFill(root, { chunkScreens: 6 })
    await mkdir(screenFillFragDir(root), { recursive: true })
    // 조각이 봉인 필드(selector/bbox/mechanical)를 변조해 실어 보낸다 — 병합은 무시해야.
    await writeFile(
      join(screenFillFragDir(root), 'scr-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-000',
        screens: [
          {
            screenId: 'screen:foo/a',
            annotations: [
              {
                key: 'field:1',
                description: '이메일 입력란',
                selector: '#HACKED',
                bbox: { x: 999, y: 999, width: 1, height: 1 },
                mechanical: { tag: 'HACKED', inputType: null, name: 'HACKED', href: null, formAction: null, formMethod: null, onclick: null, required: true },
              },
            ],
          },
        ],
      }),
      'utf8',
    )
    const result = await mergeScreenFillFragments(root)
    expect(result.validation.ok).toBe(true)
    const merged = JSON.parse(await readFile(join(root, '.understand-anything/screens.json'), 'utf8'))
    const a = merged.screens[0].annotations[0]
    // 봉인 필드는 본체 값 유지, 채움 필드만 반영.
    expect(a.selector).toBe('#field-1')
    expect(a.mechanical.name).toBe('f1')
    expect(a.description).toBe('이메일 입력란')
    expect(merged.mechanicalHash).toBe(seeded.mechanicalHash)
    expect(computeMechanicalHash(merged.screens)).toBe(seeded.mechanicalHash)
  })

  it('merge: 미완결 조각 화면은 미반영(부분 병합)으로 보고', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const screens = [
      screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'field' })]),
      screen('screen:bar/b', 'bar', [ann({ no: 1, kind: 'field' })]),
    ]
    await seedScreens(root, screens)
    await prepScreenFill(root, { chunkScreens: 6 })
    // 도메인 사전순 bar(scr-000) → foo(scr-001). foo 청크만 채운다(bar 청크는 조각 없음 → missing).
    await mkdir(screenFillFragDir(root), { recursive: true })
    await writeFile(
      join(screenFillFragDir(root), 'scr-001.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'scr-001',
        screens: [{ screenId: 'screen:foo/a', annotations: [{ key: 'field:1', description: 'ok' }] }],
      }),
      'utf8',
    )
    const result = await mergeScreenFillFragments(root)
    expect(result.screensFilled).toBe(1)
    expect(result.missingScreens).toEqual(['screen:bar/b'])
  })

  it('결정론: prep 두 번 실행 시 청크 바이트 동일', async () => {
    await seedSources(root)
    await seedMethodCalls(root)
    const screens = [screen('screen:foo/a', 'foo', [ann({ no: 1, kind: 'field' })])]
    await seedScreens(root, screens)
    await prepScreenFill(root)
    const first = await readFile(join(root, '.spec/map/screens-fill-prep/scr-000.json'), 'utf8')
    await prepScreenFill(root)
    const second = await readFile(join(root, '.spec/map/screens-fill-prep/scr-000.json'), 'utf8')
    expect(second).toBe(first)
  })
})

// jpetstore 데모 데이터(있으면)로 실제 규모(22화면·369주석) prep→가짜 frag→audit→merge
// 라운드트립을 검증한다 — 소스 없이 tmp 로 복사하므로 pre-cite 는 null(정직 보고)이나
// 청크 분해·커버리지·불변 봉인 병합은 실 데이터 형태로 검증된다.
describe('screen fill-fanout — jpetstore 데모 라운드트립', () => {
  const DEMO = fileURLToPath(
    new URL('../../../../../examples/jpetstore-6/.understand-anything/screens.json', import.meta.url),
  )
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'screens-demo-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it.runIf(existsSync(DEMO))('전 화면 커버리지 + 병합 후 mechanicalHash 불변', async () => {
    const demo = JSON.parse(await readFile(DEMO, 'utf8'))
    await mkdir(join(root, '.understand-anything'), { recursive: true })
    await writeFile(join(root, '.understand-anything/screens.json'), JSON.stringify(demo), 'utf8')

    const { index } = await prepScreenFill(root)
    const chunkedIds = new Set(index.chunks.flatMap((c) => c.screenIds))
    expect(chunkedIds.size).toBe(demo.screens.length)
    expect(index.totals.screens).toBe(demo.screens.length)

    await fakeFragmentsFromChunks(root)
    const audit = await auditScreenFillFragments(root)
    expect(audit.incomplete).toEqual([])
    expect(audit.complete.length).toBe(index.chunks.length)

    const result = await mergeScreenFillFragments(root)
    expect(result.screensFilled).toBe(demo.screens.length)
    expect(result.droppedItems).toBe(0)
    const merged = JSON.parse(await readFile(join(root, '.understand-anything/screens.json'), 'utf8'))
    expect(computeMechanicalHash(merged.screens)).toBe(demo.mechanicalHash)
  })
})
