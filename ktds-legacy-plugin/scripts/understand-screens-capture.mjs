#!/usr/bin/env node
/* global window, document, CSS */
/**
 * /understand-screens Stage A — 결정론 캡처 러너 (playwright).
 * 사용: node understand-screens-capture.mjs [projectRoot]
 *
 * understanding.config.json 의 screens 섹션을 읽어:
 *  1) baseUrl 프로브 → 무응답이면 startCommand 로 앱 자동 기동(우리가 띄운 것만 종료)
 *  2) 비인증 BFS 크롤(GET 만, 폼 제출 없음) + 시나리오(독립 브라우저 컨텍스트) 캡처
 *  3) 화면당 요소 사실 추출($$eval) → 분류/번호(classifyElements) → routes.json 조인(joinRoutes)
 *  4) fullPage PNG + screens.json 기록(buildScreensFile — zod 검증·mechanicalHash)
 *
 * 상황 대응(설계 확정): HTTP 리다이렉트/4xx·5xx → missing 보고, 서버측 forward 는
 * contentSignature 로 별칭 의심 감지, 팝업(window.open) 은 별도 화면(openedFrom),
 * alert/confirm 은 기본 dismiss(스텝 dialog 옵션으로 accept), 크롤·시나리오 세션 격리.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error(
    '엔진(@ktds/legacy-core)이 빌드되지 않았습니다. 먼저 빌드하세요:\n' +
      '  pnpm --filter @ktds/legacy-core build',
  )
  process.exit(2)
}

const projectRoot = process.argv[2] || process.cwd()
const engine = await import(distEntry)
const {
  loadConfig,
  loadPlaywright,
  classifyElements,
  joinRoutes,
  computeContentSignature,
  buildScreensFile,
  serializeScreens,
  validateScreensFile,
  listJspFilesFromGraph,
  detectFragments,
  normalizeUrl,
  screenKey,
  screenIdFor,
  capturePathFor,
  shouldVisit,
  relativePath,
  gitCommitHash,
  triageMissing,
  selectCensusSeeds,
  SCREENS_FILENAME,
  SCREENS_DIRNAME,
} = engine

// ── 설정/입력 로드 ──────────────────────────────────────────────────────────
const cfg = loadConfig(projectRoot)
if (!cfg?.screens) {
  // 섹션 부재 = 진입장벽 — 정적 예시 대신 routes census 로 초안을 자동 생성하고,
  // 사용자 확인 정지(추정 baseUrl/startCommand 로 말없이 캡처를 진행하지 않는다).
  const { scaffoldScreensConfigOnDisk } = engine
  try {
    const r = scaffoldScreensConfigOnDisk(projectRoot)
    const s = r.summary
    console.error('understanding.config.json 에 screens 섹션이 없어 초안을 자동 생성했습니다.')
    console.error(`  ${r.configPath}`)
    console.error(`  라우트 census ${s.routesTotal}건 → 크롤 시드 ${s.seedUrls}건 (GET-safe 목록성)`)
    console.error(`  baseUrl: ${s.baseUrl}`)
    console.error(`  startCommand: ${s.startCommand ? s.startCommand.join(' ') : '(미감지 — 생략)'}`)
    console.error('')
    console.error('확인 필요:')
    for (const n of s.notes) console.error(`  - ${n}`)
    console.error('')
    console.error('초안을 검토·수정한 뒤 capture 를 다시 실행하세요.')
  } catch (err) {
    console.error(`screens 섹션이 없고 초안 생성도 불가합니다: ${err.message}`)
    console.error(
      '직접 작성 예시:\n' +
        JSON.stringify(
          {
            screens: {
              baseUrl: 'http://localhost:8080/앱컨텍스트',
              startCommand: ['./mvnw', 'cargo:run'],
              readyPath: '/',
              scenarios: [],
            },
          },
          null,
          2,
        ),
    )
  }
  process.exit(2)
}
const sc = cfg.screens
const baseURL = new URL(sc.baseUrl.endsWith('/') ? sc.baseUrl : sc.baseUrl + '/')
const ctxPath = baseURL.pathname.replace(/\/$/, '') || null
const uaDir = join(projectRoot, '.understand-anything')
const screensDir = join(uaDir, SCREENS_DIRNAME)

let routesReport = { routes: [] }
const routesPath = join(projectRoot, '.spec', 'map', 'routes.json')
if (existsSync(routesPath)) {
  try {
    routesReport = JSON.parse(readFileSync(routesPath, 'utf8'))
  } catch {
    console.warn('routes.json 파싱 실패 — 핸들러 결정론 조인 없이 진행합니다.')
  }
}

let graphJsps = []
const kgPath = join(uaDir, 'knowledge-graph.json')
if (existsSync(kgPath)) {
  try {
    const kg = JSON.parse(readFileSync(kgPath, 'utf8'))
    graphJsps = listJspFilesFromGraph(kg.nodes ?? [])
  } catch {
    console.warn('knowledge-graph.json 파싱 실패 — JSP 전수 대조 없이 진행합니다.')
  }
}
const fragments = detectFragments(
  graphJsps
    .filter((p) => existsSync(join(projectRoot, p)))
    .map((p) => ({ path: p, content: readFileSync(join(projectRoot, p), 'utf8') })),
)

// ── 앱 라이프사이클 ─────────────────────────────────────────────────────────
const readyUrl = new URL(sc.readyPath.replace(/^\//, ''), baseURL).href
async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' })
    // 4xx 도 "미준비"다 — Tomcat 은 웹앱 배포 전에 포트만 먼저 열고 404 를 내므로,
    // status<500 프로브는 cold-start 레이스로 캡처 전체를 미배포 상태에서 시작시킨다
    // (2026-07-19 egov 실측: 로그인 실패 연쇄로 202건 auth-gated 오염).
    return res.status < 400
  } catch {
    return false
  }
}

let appProc = null
async function ensureAppUp() {
  if (await probe(readyUrl)) {
    console.log(`앱 감지: ${readyUrl} (기동 상태 재사용 — 종료하지 않음)`)
    return
  }
  if (!sc.startCommand?.length) {
    console.error(`앱이 응답하지 않습니다(${readyUrl}). startCommand 설정 또는 수동 기동이 필요합니다.`)
    process.exit(2)
  }
  // screens/ 밖에 둔다 — 메인이 캡처 직전 screens/ 를 rmSync 하므로 안에 두면
  // 기동 로그가 삭제돼 실패 진단이 불가능해진다(2026-07-19 실측).
  mkdirSync(uaDir, { recursive: true })
  const logPath = join(uaDir, 'screens-app.log')
  const logFd = openSync(logPath, 'w')
  console.log(`앱 기동: ${sc.startCommand.join(' ')} (log: ${logPath})`)
  appProc = spawn(sc.startCommand[0], sc.startCommand.slice(1), {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  const deadline = Date.now() + sc.readyTimeoutMs
  while (Date.now() < deadline) {
    if (await probe(readyUrl)) {
      console.log('앱 준비 완료.')
      return
    }
    if (appProc.exitCode !== null) break
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.error(`앱이 ${sc.readyTimeoutMs}ms 내에 준비되지 않았습니다. ${logPath} 를 확인하세요.`)
  stopApp()
  process.exit(2)
}

function stopApp() {
  if (!appProc) return
  console.log('앱 종료(우리가 기동한 프로세스 그룹만).')
  try {
    process.kill(-appProc.pid, 'SIGTERM')
  } catch {
    /* 이미 종료 */
  }
  appProc = null
}

// ── 브라우저 내부 추출 함수 ─────────────────────────────────────────────────
const EXTRACT_SELECTOR = 'a[href], button, input, select, textarea, [onclick]'
function extractElements(els) {
  function cssPath(el) {
    const parts = []
    let n = el
    while (n && n.nodeType === 1 && n.tagName !== 'HTML') {
      if (n.id) {
        parts.unshift(`#${CSS.escape(n.id)}`)
        return parts.join(' > ')
      }
      let sel = n.tagName.toLowerCase()
      const parent = n.parentElement
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === n.tagName)
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(n) + 1})`
      }
      parts.unshift(sel)
      n = parent
    }
    return parts.join(' > ')
  }
  return els.map((el) => {
    const r = el.getBoundingClientRect()
    const st = window.getComputedStyle(el)
    const tag = el.tagName.toLowerCase()
    const form = el.form ?? el.closest?.('form') ?? null
    const childImgAlt = el.querySelector?.('img[alt]')?.getAttribute('alt') ?? null
    return {
      tag,
      inputType: tag === 'input' ? el.getAttribute('type') || 'text' : null,
      name: el.getAttribute('name'),
      domId: el.id || null,
      text: (el.innerText || '').trim() || null,
      value: tag === 'input' ? el.getAttribute('value') : null,
      alt: el.getAttribute('alt') ?? childImgAlt,
      title: el.getAttribute('title') ?? el.querySelector?.('img[title]')?.getAttribute('title') ?? null,
      placeholder: el.getAttribute('placeholder'),
      href: el.getAttribute('href'),
      onclick: el.getAttribute('onclick'),
      formAction: form ? (el.getAttribute('formaction') ?? form.getAttribute('action')) : null,
      formMethod: form ? (el.getAttribute('formmethod') ?? form.getAttribute('method')) : null,
      required: el.required === true,
      disabled: el.disabled === true,
      visible:
        r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none',
      bbox: {
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      },
      selector: cssPath(el),
    }
  })
}
function extractSignature() {
  return {
    title: document.title,
    headings: Array.from(document.querySelectorAll('h1,h2'))
      .map((h) => h.innerText.trim())
      .slice(0, 5),
  }
}

// ── 캡처 ────────────────────────────────────────────────────────────────────
const screens = []
const missing = []
const usedIds = new Set()
const visitedKeys = new Set()
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const relUrl = (u) => `${relativePath(u, ctxPath)}${u.search}`
const resolveUrl = (rel) => new URL(rel.replace(/^\//, ''), baseURL).href

async function captureScreen(
  page,
  urlObj,
  { scenario = null, openedFrom = null, seededFrom = null } = {},
) {
  let id = screenIdFor(urlObj, ctxPath)
  if (usedIds.has(id)) {
    if (!scenario) return null
    id = `${id}__s_${scenario}`
    if (usedIds.has(id)) return null
  }
  usedIds.add(id)
  const raw = await page.$$eval(EXTRACT_SELECTOR, extractElements)
  const annotations = joinRoutes(classifyElements(raw), {
    routes: routesReport.routes ?? [],
    contextPath: ctxPath,
  })
  const buf = await page.screenshot({ fullPage: true })
  const capPath = capturePathFor(id)
  writeFileSync(join(uaDir, capPath), buf)
  const sig = await page.evaluate(extractSignature)
  screens.push({
    id,
    title: (await page.title()) || relUrl(urlObj),
    url: relUrl(urlObj),
    jspFile: null,
    graphNodeId: null,
    domain: null,
    scenario,
    openedFrom,
    // census 보조 시드 유래(§3) — 크롤/시나리오 내비게이션 도달 화면은 미기재(해시 하위호환).
    ...(seededFrom ? { seededFrom } : {}),
    contentSignature: computeContentSignature({
      title: sig.title,
      headings: sig.headings,
      annotations,
    }),
    capture: {
      path: capPath,
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      capturedAt: new Date().toISOString(),
      contentHash: sha256(buf),
    },
    summary: null,
    annotations,
  })
  console.log(`  캡처: ${id} (주석 ${annotations.length}건)`)
  return id
}

/** goto + 상태/리다이렉트 검사. 캡처 가능한 최종 URL 을 반환(불가 시 null). */
async function safeGoto(page, targetUrl, requestedU) {
  let resp
  try {
    resp = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 })
  } catch (err) {
    missing.push({ url: relUrl(requestedU), reason: `goto-failed: ${String(err.message).split('\n')[0]}` })
    return null
  }
  if (resp && resp.status() >= 400) {
    missing.push({ url: relUrl(requestedU), reason: `http-${resp.status()}` })
    return null
  }
  const finalU = normalizeUrl(page.url(), baseURL)
  if (!finalU) {
    missing.push({ url: relUrl(requestedU), reason: 'final-url-out-of-origin' })
    return null
  }
  if (screenKey(finalU, ctxPath) !== screenKey(requestedU, ctxPath)) {
    missing.push({ url: relUrl(requestedU), reason: `redirected-to:${relUrl(finalU)}` })
  }
  return finalU
}

async function crawl(browser) {
  console.log('비인증 크롤 시작(GET 만, 폼 제출 없음).')
  const context = await browser.newContext({
    viewport: sc.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('dialog', (d) => {
    console.warn(`  [dialog:크롤] ${d.type()}: ${d.message()} → dismiss`)
    d.dismiss().catch(() => {})
  })
  const queue = ['', sc.readyPath, ...sc.seedUrls].map((r) => resolveUrl(r))
  let captured = 0
  while (queue.length && captured < sc.maxPages) {
    const u = normalizeUrl(queue.shift(), baseURL)
    if (!u || !shouldVisit(u, sc.exclude)) continue
    const key = screenKey(u, ctxPath)
    if (visitedKeys.has(key)) continue
    visitedKeys.add(key)
    const finalU = await safeGoto(page, u.href, u)
    if (!finalU) continue
    const finalKey = screenKey(finalU, ctxPath)
    if (finalKey !== key) {
      if (visitedKeys.has(finalKey)) continue
      visitedKeys.add(finalKey)
    }
    if ((await captureScreen(page, finalU)) !== null) captured++
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
    for (const h of hrefs) {
      const nu = normalizeUrl(h, finalU)
      if (nu && shouldVisit(nu, sc.exclude) && !visitedKeys.has(screenKey(nu, ctxPath))) {
        queue.push(nu.href)
      }
    }
  }
  await context.close()
  console.log(`크롤 완료: ${captured}화면.`)
}

// ── census 보조 시드(§3) — 메뉴가 낡아 못 찾은 실존 화면을 routes.json 으로 회수 ──
let censusSeedDone = false
async function censusSeedPass(page, { scenario = null } = {}) {
  if (censusSeedDone) return
  const cs = sc.censusSeed // 항상 존재(config zod default)
  if (!cs.enabled || cs.maxPages <= 0) return
  const routes = routesReport.routes ?? []
  if (routes.length === 0) return
  censusSeedDone = true
  const toUrl = (p) => normalizeUrl(resolveUrl(p), baseURL)
  const seeds = selectCensusSeeds(routes, {
    isVisited: (p) => {
      const u = toUrl(p)
      return !u || visitedKeys.has(screenKey(u, ctxPath)) || usedIds.has(screenIdFor(u, ctxPath))
    },
    isExcluded: (p) => {
      const u = toUrl(p)
      return !u || !shouldVisit(u, sc.exclude)
    },
  })
  if (seeds.length === 0) {
    console.log('census 보조 시드: 미방문 GET-safe 라우트 없음.')
    return
  }
  const budget = Math.min(seeds.length, cs.maxPages)
  console.log(
    `census 보조 시드 시작(GET-safe 목록성 라우트, ${scenario ? `시나리오 ${scenario} 컨텍스트` : '비인증 컨텍스트'}): ` +
      `후보 ${seeds.length}건 중 ${budget}건 시도` +
      (seeds.length > budget ? ` — ${seeds.length - budget}건은 예산(censusSeed.maxPages) 초과로 미시도` : ''),
  )
  let captured = 0
  for (const seed of seeds.slice(0, budget)) {
    const u = toUrl(seed.path)
    if (!u) continue
    visitedKeys.add(screenKey(u, ctxPath))
    const finalU = await safeGoto(page, u.href, u)
    if (!finalU) continue
    if (usedIds.has(screenIdFor(finalU, ctxPath))) continue
    if ((await captureScreen(page, finalU, { scenario, seededFrom: 'routes-census' })) !== null) {
      captured++
    }
  }
  console.log(`census 보조 시드 완료: ${captured}화면 회수.`)
}

async function runScenario(browser, scenario) {
  console.log(`시나리오 실행: ${scenario.id}${scenario.title ? ` (${scenario.title})` : ''}`)
  const context = await browser.newContext({
    viewport: sc.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  let dialogMode = 'dismiss'
  let lastScreenId = null
  page.on('dialog', (d) => {
    console.warn(`  [dialog:${scenario.id}] ${d.type()}: ${d.message()} → ${dialogMode}`)
    ;(dialogMode === 'accept' ? d.accept() : d.dismiss()).catch(() => {})
  })
  // window.open/새창 → 별도 화면(openedFrom), same-origin 만.
  context.on('page', (np) => {
    np.waitForLoadState('load')
      .then(async () => {
        const nu = normalizeUrl(np.url(), baseURL)
        if (nu) await captureScreen(np, nu, { scenario: scenario.id, openedFrom: lastScreenId })
        await np.close()
      })
      .catch(() => {})
  })
  try {
    for (const step of scenario.steps) {
      dialogMode = step.dialog ?? 'dismiss'
      if (step.action === 'goto') {
        await page.goto(resolveUrl(step.url), { waitUntil: 'load', timeout: 30000 })
      } else if (step.action === 'fill') {
        await page.fill(step.selector, step.value ?? '')
      } else if (step.action === 'click') {
        const nav = page.waitForNavigation({ timeout: 10000 }).catch(() => null)
        await page.click(step.selector)
        await nav
      } else if (step.action === 'waitFor') {
        await page.waitForSelector(step.selector, { timeout: 15000 })
      } else if (step.action === 'capture') {
        if (step.url) {
          const requested = normalizeUrl(resolveUrl(step.url), baseURL)
          const finalU = await safeGoto(page, requested.href, requested)
          if (!finalU) continue
        }
        const u = normalizeUrl(page.url(), baseURL)
        if (u) lastScreenId = (await captureScreen(page, u, { scenario: scenario.id })) ?? lastScreenId
      }
    }
    for (const cu of scenario.captureAfter) {
      const requested = normalizeUrl(resolveUrl(cu), baseURL)
      const finalU = await safeGoto(page, requested.href, requested)
      if (!finalU) continue
      lastScreenId = (await captureScreen(page, finalU, { scenario: scenario.id })) ?? lastScreenId
    }
    // 인증 필요 앱: 이 시나리오의 로그인 상태를 재사용해 census 보조 시드를 수행(§3).
    if (sc.censusSeed?.scenarioId === scenario.id) {
      await censusSeedPass(page, { scenario: scenario.id })
    }
  } catch (err) {
    missing.push({
      url: `scenario:${scenario.id}`,
      reason: `scenario-failed: ${String(err.message).split('\n')[0]}`,
    })
    console.error(`  시나리오 실패(${scenario.id}): ${err.message}`)
  } finally {
    await context.close()
  }
}

// ── 메인 ────────────────────────────────────────────────────────────────────
let exitCode = 0
try {
  await ensureAppUp()
  rmSync(screensDir, { recursive: true, force: true })
  mkdirSync(screensDir, { recursive: true })
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({ headless: true })
  try {
    await crawl(browser)
    for (const scenario of sc.scenarios) await runScenario(browser, scenario)
    // scenarioId 미지정(또는 해당 시나리오 부재) 시 비인증 컨텍스트로 census 보조 시드.
    if (!censusSeedDone) {
      const context = await browser.newContext({
        viewport: sc.viewport,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      page.on('dialog', (d) => d.dismiss().catch(() => {}))
      try {
        await censusSeedPass(page)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  // T1 트리아지(§2) — routes census 가 있을 때만(없으면 미부여, 하위호환).
  const triagedMissing =
    (routesReport.routes ?? []).length > 0
      ? triageMissing(missing, routesReport.routes, { loginPaths: [sc.readyPath] })
      : missing

  const file = buildScreensFile({
    generatedAt: new Date().toISOString(),
    gitCommit: gitCommitHash(projectRoot),
    baseUrl: sc.baseUrl,
    viewport: sc.viewport,
    screens,
    fragments,
    graphJsps,
    missing: triagedMissing,
  })
  writeFileSync(join(uaDir, SCREENS_FILENAME), serializeScreens(file))

  const v = validateScreensFile(file)
  const st = v.stats
  console.log('\n── 캡처 요약 ──')
  console.log(`화면 ${st.screenCount}건, 주석 ${st.annotationCount}건`)
  console.log(
    `핸들러 확정(CONFIRMED) 비율: ${st.confirmedActionRate === null ? '-' : Math.round(st.confirmedActionRate * 100) + '%'} (action/link 기준)`,
  )
  console.log(`fragment ${file.fragments.length}건, 미매핑 JSP ${file.unmatchedJsps.length}건(Stage B 에서 매핑)`)
  if (file.missing.length) {
    console.log(`도달 실패/리다이렉트 보고 ${file.missing.length}건:`)
    for (const m of file.missing) {
      const t = m.triage
        ? ` [${m.triage.class}${m.triage.candidateRoute ? ` → 후보 ${m.triage.candidateRoute.path}` : ''}]`
        : ''
      console.log(`  - ${m.url}: ${m.reason}${t}`)
    }
  }
  const seeded = file.screens.filter((s) => s.seededFrom === 'routes-census').length
  if (seeded > 0) {
    console.log(`census 보조 시드 회수 화면 ${seeded}건(seededFrom: routes-census — 메뉴 링크 없음).`)
  }
  const sigGroups = new Map()
  for (const s of file.screens) {
    if (!s.contentSignature) continue
    sigGroups.set(s.contentSignature, [...(sigGroups.get(s.contentSignature) ?? []), s.id])
  }
  const aliases = [...sigGroups.values()].filter((g) => g.length > 1)
  if (aliases.length) {
    console.log('별칭 의심(동일 콘텐츠 시그니처 — 서버측 forward 가능성):')
    for (const g of aliases) console.log(`  - ${g.join(' ↔ ')}`)
  }
  console.log(`기록: ${join(uaDir, SCREENS_FILENAME)} + ${screensDir}/*.png`)
  if (!v.ok) {
    console.error('검증 이슈:')
    for (const i of v.issues) console.error(`  - [${i.code}] ${i.message}`)
    exitCode = 1
  }
} catch (err) {
  console.error(`캡처 실패: ${err.stack ?? err.message}`)
  exitCode = 1
} finally {
  stopApp()
}
process.exit(exitCode)
