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
const { buildRtm, applyRequirements, buildMyBatisModel } = engine

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
        if (content.includes('<mapper') && content.includes('namespace')) {
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

const input = { nodes: graph.nodes, edges: graph.edges, routes, mybatisModel, methodCallGraph }
let model = buildRtm(input, graph.gitCommit ?? null)

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
    `${dropped > 0 ? `(입력 ${reqCount}, 드롭 ${dropped})` : ''} · 추적셀 근거율 ${rate}%`,
)
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
