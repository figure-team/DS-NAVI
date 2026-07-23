#!/usr/bin/env node
/**
 * /understand-rtm CLI 래퍼 — 요구사항 추적표(RTM) 구조화 산출물 생성(R1).
 * 사용: node understand-rtm.mjs [projectRoot]
 *
 * 채움 완료 도메인 그래프 + 스캔 산출물(routes/MyBatis/method-calls)에서 AS-IS RTM 모델을
 * 결정론으로 조립해 `.understand-anything/rtm.json` 으로 쓴다(생성물, 불변). 사람 편집/확정은
 * 후속(R3) rtm-overrides.json 오버레이. 모든 추적 셀은 file:line 근거 + 신뢰도(grounding 보존).
 * 설계: docs/ktds/RTM_TAB_DESIGN.md.
 */
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { appendRunLedger, runStartedAt } from './lib/run-ledger.mjs'

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
const runBegan = runStartedAt()
const engine = await import(distEntry)
const { buildRtm, applyRequirements, applyOverlay, attachTestScenarios, buildMyBatisModel, isMapperXmlDocument, collectRtmSignals } = engine
// P1c 근거 게이트 — 배럴(rtm/index.ts)이 동시 편집 중이라 아직 export 를 못 얹었다. 파일 경로
// 직접 import 라 패키지 exports 맵을 타지 않고, Node 가 해석경로로 캐싱하므로 dist/index.js 가
// 쓰는 것과 **동일한 모듈 인스턴스**다. 배럴에 `checkCellGrounding` 이 추가되면 위 구조분해로 합칠 것.
const { checkCellGrounding } = await import(join(here, '..', 'packages', 'legacy-core', 'dist', 'rtm', 'validate.js'))

// 입력은 디스크의 fill 완료 그래프(비파괴). buildMap 호출 금지(채움 소실).
const graphPath = join(projectRoot, '.understand-anything', 'domain-graph.json')
if (!existsSync(graphPath)) {
  console.error('도메인 그래프가 없습니다(.understand-anything/domain-graph.json). 먼저 생성하세요:')
  console.error('  understand-map <project> map  →  (fill 작성)  →  understand-map <project> emit')
  process.exit(2)
}
let graph
try {
  graph = JSON.parse(readFileSync(graphPath, 'utf8'))
} catch (err) {
  console.error(`도메인 그래프 파싱 실패: ${err.message}`)
  process.exit(2)
}
if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
  console.error('도메인 그래프 형식 오류: nodes/edges 배열이 필요합니다.')
  process.exit(2)
}

// 라우트(진입점 매칭) — 없으면 빈 세트.
let routes = { schemaVersion: 1, gitCommit: null, contextPath: null, routes: [], batchEntries: [] }
const routesPath = join(projectRoot, '.spec', 'map', 'routes.json')
if (existsSync(routesPath)) {
  try {
    routes = JSON.parse(readFileSync(routesPath, 'utf8'))
  } catch {
    // 손상 시 빈 세트(진입점 셀은 flow 근거로 폴백).
  }
}

// MyBatis Mapper XML 스캔(데이터 셀 테이블×CRUD grounding) — 없으면 빈 모델.
function findMapperXmls(root) {
  const SKIP = new Set(['node_modules', '.git', 'target', 'build', 'dist', '.understand-anything', '.spec', '.idea'])
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(join(dir, e.name))
      } else if (e.name.endsWith('.xml')) {
        const p = join(dir, e.name)
        let content
        try {
          content = readFileSync(p, 'utf8')
        } catch {
          continue
        }
        // 루트 요소 기준 판별 — 부분 문자열 검사는 문서 코드 예제(maven xdoc)를 오분류(W4).
        if (isMapperXmlDocument(content)) {
          out.push({ relPath: relative(root, p), content })
        }
      }
    }
  }
  walk(root)
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}
const mybatisModel = buildMyBatisModel(findMapperXmls(projectRoot))

// 메서드 호출그래프(데이터 셀 정밀 귀속) — 있으면.
let methodCallGraph = null
const mcgPath = join(projectRoot, '.spec', 'map', 'method-calls.json')
if (existsSync(mcgPath)) {
  try {
    methodCallGraph = JSON.parse(readFileSync(mcgPath, 'utf8'))
  } catch {
    // 손상 시 null(폴백: flow_step dao 스텝 사용메서드).
  }
}

// 데이터·테스트 축 신호(비-MyBatis Kotlin/JDBC 대응) — 코드 SQL(rawSqlModel) + 테스트 링크.
// MyBatis 프로젝트면 rawSqlModel 은 비어도 무방(build-rtm 이 MyBatis 경로를 우선한다).
let rtmSignals = { rawSqlModel: { byFile: {} }, testLinks: { byProdClass: {} }, diag: { knownTables: 0, sqlLinkedFiles: 0, testFiles: 0, prodClasses: 0 } }
try {
  rtmSignals = collectRtmSignals(projectRoot, graph.nodes)
} catch (err) {
  console.error(`데이터/테스트 축 신호 수집 실패(무시): ${err.message}`)
}

const input = {
  nodes: graph.nodes,
  edges: graph.edges,
  routes,
  mybatisModel,
  methodCallGraph,
  rawSqlModel: rtmSignals.rawSqlModel,
  testLinks: rtmSignals.testLinks,
}
// domain-graph.json 은 최상위 gitCommit 을 갖지 않는다 — 스탬프는 ktdsMap.generatedFromCommit
// (emit 이 skeleton.gitCommit 에서 투영, 없으면 빈 문자열)과 project.gitCommitHash 에 있다.
// `||` 인 이유: emit.ts 가 `?? ''` 로 쓰므로 빈 문자열을 유효값으로 받으면 안 된다.
const graphCommit = graph.ktdsMap?.generatedFromCommit || graph.project?.gitCommitHash || null
let model = buildRtm(input, graphCommit)

// 요구사항 오버레이(.understand-anything/rtm-requirements.json) — 있으면 적용해 기능 상태/이력 재계산.
// { requirements: RtmRequirement[], functions?: RtmFunctionRow[](신규 TO-BE 행) }. 수동 작성(R4) 또는
// 인테이크(R5, claude -p)가 쓴다. 없으면 AS-IS 그대로.
let reqCount = 0
const reqPath = join(projectRoot, '.understand-anything', 'rtm-requirements.json')
if (existsSync(reqPath)) {
  try {
    const overlay = JSON.parse(readFileSync(reqPath, 'utf8'))
    const requirements = Array.isArray(overlay.requirements) ? overlay.requirements : []
    const newFunctions = Array.isArray(overlay.functions) ? overlay.functions : []
    model = applyRequirements(model, requirements, newFunctions)
    reqCount = requirements.length
  } catch (err) {
    console.error(`rtm-requirements.json 파싱 실패(무시): ${err.message}`)
  }
}

// W5: 단위테스트 시나리오 초안 — 결정론 템플릿 생성(정상/예외/경계, 전부 [추정]).
// applyRequirements 뒤(rules=AC 역참조가 채워진 뒤)·applyOverlay 앞(확정 병합 전).
model = attachTestScenarios(model)

// 사람 오버레이(.understand-anything/rtm-overrides.json) — 셀 교정·lifecycle·검수·시험결과·
// 시나리오 확정(_scenarios)·사용자 필드(_fields) 입력을 모델에 반영(검증 스파인 입력 경로).
// 적용 후 coverage 가 실데이터를 반영한다. 없으면 무변경.
let overlayCount = 0
const overlayPath = join(projectRoot, '.understand-anything', 'rtm-overrides.json')
if (existsSync(overlayPath)) {
  try {
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'))
    if (overlay && typeof overlay === 'object' && !Array.isArray(overlay)) {
      model = applyOverlay(model, overlay)
      overlayCount = Object.keys(overlay).filter((k) => k !== '_requirements').length + Object.keys(overlay._requirements ?? {}).length
    }
  } catch (err) {
    console.error(`rtm-overrides.json 파싱 실패(무시): ${err.message}`)
  }
}

// ★ P1c 근거 게이트 — ⑥ 재bake 표면(rtm-requirements.json 이 투영된 기능 셀)을 db-schema 와 대조한다.
//
// 실측 `OAUTH_ACCOUNT` 는 identified.json 을 거치지 않아(intakeFnStub 이 4축 셀을 빈 값으로 만든다)
// P1 게이트(rtm-intake.mjs validate)가 보는 표면 밖이다 — 여기가 그 구멍을 막는 자리다.
// 규칙은 P1b 확정분 재사용: 신규 테이블 제안은 정당(warn·표면화만), `[확정]` 단언은 위반(error).
//
// **차단하지 않는다**(진단만) — validate.ts 의 dangling-changeset-fn 주석 참조. 요약하면 재bake 실패는
// fail-closed 가 아니라 fail-stale(낡은 rtm.json 이 무신호로 남는다)이라, 재생성하고 error 를 남기는
// 편이 엄격히 낫다. 차단은 생산자(P1 게이트, exit 2)의 몫이다.
//
// db-schema.json 이 없으면 인벤토리를 주입하지 않는다 → 이 축의 대조는 생략된다(하위호환).
let dbTables = null
const dbSchemaPath = join(projectRoot, '.spec', 'map', 'db-schema.json')
if (existsSync(dbSchemaPath)) {
  try {
    const dbSchema = JSON.parse(readFileSync(dbSchemaPath, 'utf8'))
    if (Array.isArray(dbSchema.tables)) {
      dbTables = dbSchema.tables.map((t) => t?.name).filter((n) => typeof n === 'string' && n.length > 0)
    }
  } catch (err) {
    // 손상 시 미주입(축 생략) — 파싱 실패를 "테이블 0개"로 읽으면 전건이 신규 제안으로 오탐된다.
    console.error(`db-schema.json 파싱 실패(테이블 대조 생략): ${err.message}`)
  }
}
// 정렬된 진단 블록을 뒤에 잇는다(apply-overlay.ts 의 `[...computeDiagnostics(merged), ...warns]` 관례).
// 각 블록이 결정론 정렬이라 재실행 byte-identical 이 유지된다.
const cellDiags = dbTables ? checkCellGrounding(model, { tables: dbTables }) : []
if (cellDiags.length > 0) model = { ...model, diagnostics: [...(model.diagnostics ?? []), ...cellDiags] }

const OUTPUT_DIR = join(projectRoot, '.understand-anything')
mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(join(OUTPUT_DIR, 'rtm.json'), JSON.stringify(model, null, 2) + '\n', 'utf8')

// 근거율 — 4축 셀 중 CONFIRMED 비율(테스트 셀은 정보 부재로 보통 UNVERIFIED).
const cells = model.functions.flatMap((f) => [f.entryPoint, f.implementation, f.data, f.test])
const confirmed = cells.filter((c) => c.confidence === 'CONFIRMED').length
const rate = cells.length > 0 ? Math.round((confirmed / cells.length) * 100) : 0
const myb = mybatisModel.mappers.length > 0 ? ` · MyBatis ${mybatisModel.mappers.length}매퍼` : ''

console.log(`understand-rtm 완료 — ${projectRoot}${myb}`)
console.log(`  RTM → .understand-anything/rtm.json`)
const dropped = reqCount - model.requirements.length
console.log(
  `  도메인 ${model.domains.length} · 기능 ${model.functions.length} · 요구사항 ${model.requirements.length}` +
    `${dropped > 0 ? `(입력 ${reqCount}, 드롭 ${dropped})` : ''} · 시나리오 ${model.testScenarios.length}건(확정 ${model.coverage?.scenarios?.confirmed ?? 0}) · 추적셀 근거율 ${rate}%` +
    `${overlayCount > 0 ? ` · 사람 오버레이 ${overlayCount} 적용` : ''}`,
)
// 축별 근거 + 정직 degrade(C) — 데이터·테스트 축 0% 가 "없음"으로 오독되지 않게 신호원 상태를 표기한다.
{
  const total = model.functions.length
  const dataGrounded = model.functions.filter((f) => f.data.evidence.length > 0).length
  const testGrounded = model.functions.filter((f) => f.test.value.trim() !== '').length
  const d = rtmSignals.diag
  const dataSource = mybatisModel.mappers.length > 0 ? 'MyBatis' : d.sqlLinkedFiles > 0 ? '코드 SQL' : '없음'
  console.log(
    `  축별 근거 — 진입점·구현 100% · 데이터 ${dataGrounded}/${total}(출처: ${dataSource}) · 테스트 ${testGrounded}/${total}(테스트 파일 ${d.testFiles}개 스캔)`,
  )
  if (dataGrounded === 0 && mybatisModel.mappers.length === 0) {
    console.log(
      d.knownTables === 0
        ? `  ⚠️ 데이터 축 미지원 — db-schema.json 부재로 코드 SQL 을 테이블로 매핑 불가('검증 0' 아님). understand-map DB 스키마 스캔을 먼저 실행하세요.`
        : `  ⚠️ 데이터 축 미검출 — MyBatis 매퍼·코드 SQL 신호 없음(손수 영속화). '없음'이 아니라 '축 미지원' — 수동 확인 필요.`,
    )
  }
  if (testGrounded === 0) {
    console.log(
      d.testFiles === 0
        ? `  ⚠️ 테스트 축 미검출 — 테스트 소스 파일 0개(테스트 미배치 또는 스캔 경로 밖).`
        : `  ⚠️ 테스트 축 미링크 — 테스트 ${d.testFiles}개를 스캔했으나 기능 링크 0(프로덕션 클래스 참조 매칭 실패). '검증 0' 아님 — 수동 확인.`,
    )
  }
}
const cov = model.coverage
if (cov) {
  console.log(
    `  커버리지 — 요구 구현 ${cov.requirements.implemented}/${cov.requirements.total} · 검증 ${cov.requirements.verified}/${cov.requirements.total}` +
      ` · 기능 구현 ${cov.functions.implemented} 미구현 ${cov.functions.planned} 고아 ${cov.functions.orphaned}` +
      ` · 시험 통과 ${cov.tests.pass}/${cov.tests.total}`,
  )
  if (cov.gaps.unimplemented.length || cov.gaps.orphanCode.length) {
    console.log(`  갭 — 미구현 요구 ${cov.gaps.unimplemented.length} · 고아 코드 ${cov.gaps.orphanCode.length} · 미검증 기능 ${cov.gaps.unverified.length}`)
  }
}
// 무결성 진단(C1/C2/M4/M5) — 조용한 손실 금지: 댕글링 참조·드롭·순환을 표면화한다.
const diags = model.diagnostics ?? []
if (diags.length > 0) {
  const errs = diags.filter((d) => d.level === 'error').length
  const warns = diags.length - errs
  console.log(`  ⚠ 무결성 진단 — error ${errs} · warn ${warns} (rtm.json diagnostics[] 참조):`)
  for (const d of diags.slice(0, 12)) console.log(`    [${d.level}] ${d.code}: ${d.message}`)
  if (diags.length > 12) console.log(`    … 외 ${diags.length - 12}건`)
}
console.log('모든 추적 셀은 file:line 근거 + 신뢰도 태그를 갖는다(grounding 보존). 요구사항/이력/편집·확정은 후속(R3~R5).')

// 실행 원장 — rtm.json 은 결정론(byte-diff=0)이라 시각을 못 싣는다. 실행 사실은 원장에만.
appendRunLedger(projectRoot, {
  tool: 'understand-rtm',
  action: 'bake',
  startedAt: runBegan,
  summary: `도메인 ${model.domains.length} · 기능 ${model.functions.length} · 근거율 ${rate}%`,
})
