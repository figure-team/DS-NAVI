/**
 * interface-scan 오케스트레이션(W1) — census 기반 Java/XML/SQL 스캔 →
 * `${...}` 플레이스홀더 해석(T2) → 동일 연계 병합 → 내용 파생 안정 id → InterfaceReport.
 *
 * 병합: 동일 (direction, protocol, clientType, endpoint) 신호는 1항목으로 합치고
 * callSites 를 누적한다 — "연계 건수"와 "호출 빈도"를 구분(정의서 부풀림 방지).
 * id: 내용 sha256 파생 — 재스캔/코드 추가에도 같은 연계는 같은 id(제출본 참조 보존).
 * 의심 신호: 카탈로그 밖 연계(사내 EAI 래퍼 등) 가능성을 http(s) 리터럴/wsdl/jdbc 로
 * 카운트해 "0건 = 연계 없음" 오독을 커버리지에서 차단한다.
 * 커스텀 seam: understanding.config.json `interfaceScan.clients` 로 공통연계모듈 주입.
 *
 * 결정론: relPath ASC 순회, items (protocol, endpoint, clientType, 첫 callSite) 정렬,
 * callSites (file, line) 정렬. 동일 commit 재실행 byte-diff=0.
 * 정직성: 신호 0건도 items:[] 로 기록, endpoint 해석 실패는 unresolved=true 로 노출.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource } from '../domain-map/tree-sitter.js'
import { gitCommitHash } from '../domain-map/persist.js'
import { loadConfig } from '../config/index.js'
import type { CensusReport } from '../domain-map/types.js'
import { scanJavaInterfaces, type InvocationSpec, type RawInterfaceSignal } from './java-scan.js'
import { scanDbLinks } from './text-scan.js'
import { buildPropertyIndex, resolvePlaceholders } from './properties.js'
import {
  InterfaceReportSchema,
  type CustomClientSpec,
  type InterfaceItem,
  type InterfaceProtocol,
  type InterfaceReport,
} from './types.js'

export * from './types.js'
export { scanJavaInterfaces } from './java-scan.js'
export type { InvocationSpec, RawInterfaceSignal } from './java-scan.js'
export { scanDbLinks } from './text-scan.js'
export { buildPropertyIndex, resolvePlaceholders } from './properties.js'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** id 프리픽스 — 프로토콜 → 표기(정의서 노출용). */
const ID_TAG: Record<InterfaceProtocol, string> = {
  http: 'HTTP',
  ws: 'WS',
  mq: 'MQ',
  file: 'FILE',
  socket: 'SOCK',
  mail: 'MAIL',
  'db-link': 'DBLINK',
}

/** 의심 신호 샘플 상한(리포트 크기 가드 — count 는 전수). */
const SUSPECT_SAMPLE_CAP = 10

/** config 커스텀 클라이언트 → 스캐너 InvocationSpec. */
function toInvocationSpec(c: CustomClientSpec): InvocationSpec {
  const methods: Record<string, string | null> = {}
  for (const m of c.methods) methods[m] = null
  return {
    protocol: c.protocol,
    clientType: c.label ?? c.type,
    methods,
    endpointArg: c.endpointArg,
  }
}

/**
 * Java 파일에서 카탈로그 밖 연계 가능성 신호를 센다(라인 단위, 결정론).
 * 이미 항목으로 탐지된 file:line 은 제외 — "탐지 밖에 남은" 신호만 남긴다.
 */
function collectSuspects(
  projectRoot: string,
  census: CensusReport,
  detectedLines: Set<string>,
): { count: number; samples: Array<{ file: string; line: number; kind: string }> } {
  const samples: Array<{ file: string; line: number; kind: string }> = []
  let count = 0
  // 테스트 코드는 제외 — IT/단위테스트의 localhost·목 URL 이 상시 오경보를 만든다.
  // (탐지 items 는 테스트 포함 전체 스캔 — 이 제외는 의심 "경고" 정밀도용.)
  const isTestPath = (p: string) => p.split('/').some((seg) => seg === 'test' || seg === 'tests')
  const javaFiles = census.files
    .filter((f) => f.lang === 'java' && !isTestPath(f.relPath))
    .map((f) => f.relPath)
    .sort(cmp)
  for (const relPath of javaFiles) {
    let text: string
    try {
      text = readFileSync(join(projectRoot, relPath), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // 주석 라인은 제외(문서 링크 오탐 억제).
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      let kind: string | null = null
      if (/["']https?:\/\/[^"']+["']/.test(line)) kind = 'http-literal'
      else if (/["']jdbc:[^"']+["']/.test(line)) kind = 'jdbc-url'
      if (!kind) continue
      if (detectedLines.has(`${relPath}:${i + 1}`)) continue
      count++
      if (samples.length < SUSPECT_SAMPLE_CAP) samples.push({ file: relPath, line: i + 1, kind })
    }
  }
  // wsdl 파일 존재(census 전체에서).
  const wsdls = census.files.filter((f) => f.relPath.toLowerCase().endsWith('.wsdl'))
  for (const w of wsdls.sort((a, b) => cmp(a.relPath, b.relPath))) {
    count++
    if (samples.length < SUSPECT_SAMPLE_CAP) samples.push({ file: w.relPath, line: 1, kind: 'wsdl-file' })
  }
  return { count, samples }
}

/** 프로젝트 전체에서 인터페이스 신호를 추출해 InterfaceReport 를 만든다(파일 기록 없음). */
export async function extractInterfaces(
  projectRoot: string,
  census: CensusReport,
): Promise<InterfaceReport> {
  const props = buildPropertyIndex(projectRoot, census)

  // 커스텀 클라이언트 seam(understanding.config.json). 손상 config 는 loadConfig 가 throw
  // (fail-closed — 조용히 기본 카탈로그로 폴백해 recall 착시를 만들지 않는다).
  const customSpecs: Record<string, InvocationSpec> = {}
  const cfgClients = loadConfig(projectRoot)?.interfaceScan?.clients ?? []
  for (const c of cfgClients) customSpecs[c.type] = toInvocationSpec(c)

  const raw: RawInterfaceSignal[] = []
  const byLang = (lang: string) =>
    census.files
      .filter((f) => f.lang === lang)
      .map((f) => f.relPath)
      .sort(cmp)

  // Java(T1) — 파싱 실패 파일은 제외(증거 없는 항목 금지, routes 추출과 동일 원칙).
  for (const relPath of byLang('java')) {
    let root
    try {
      const src = readFileSync(join(projectRoot, relPath), 'utf8')
      root = await parseSource('java', src)
    } catch {
      continue
    }
    raw.push(...scanJavaInterfaces(root, relPath, customSpecs))
  }

  // XML/SQL(db-link).
  for (const lang of ['xml', 'sql'] as const) {
    for (const relPath of byLang(lang)) {
      let text: string
      try {
        text = readFileSync(join(projectRoot, relPath), 'utf8')
      } catch {
        continue
      }
      raw.push(...scanDbLinks(text, relPath, lang))
    }
  }

  // T2 해석. 빈 문자열 endpoint 는 "없음"으로 정규화 — ""가 해석 성공(확정)으로
  // 표기되는 것을 막는다(unresolved=true 로 표면화).
  const resolvedSignals = raw.map((s) => {
    const sig = s.endpointRaw === '' ? { ...s, endpointRaw: null } : s
    let resolved: string | null = null
    let resolvedFrom: string | null = null
    if (sig.endpointRaw !== null) {
      const r = resolvePlaceholders(sig.endpointRaw, props)
      resolved = r.resolved === '' ? null : r.resolved
      resolvedFrom = resolved === null ? null : r.resolvedFrom
    }
    return { sig, resolved, resolvedFrom }
  })

  // 병합 — 동일 (direction, protocol, clientType, endpointKey) = 연계 1건.
  // endpointKey: 해석값 우선(리터럴/프로퍼티 표기가 달라도 같은 연계면 병합).
  // 미해석(null)은 병합하지 않는다(서로 다른 동적 호출을 뭉개지 않음 — 첫 callSite 로 구분).
  const groups = new Map<
    string,
    {
      direction: InterfaceItem['direction']
      protocol: InterfaceProtocol
      clientType: string
      endpoint: InterfaceItem['endpoint']
      dataHints: Set<string>
      callSites: InterfaceItem['callSites']
      unresolved: boolean
      idSeed: string
    }
  >()
  for (const { sig, resolved, resolvedFrom } of resolvedSignals) {
    const endpointKey = resolved ?? sig.endpointRaw
    const idSeed =
      endpointKey !== null
        ? `${sig.direction}|${sig.protocol}|${sig.clientType}|${endpointKey}`
        : `${sig.direction}|${sig.protocol}|${sig.clientType}|${sig.file}:${sig.line}`
    const groupKey = idSeed
    let g = groups.get(groupKey)
    if (!g) {
      g = {
        direction: sig.direction,
        protocol: sig.protocol,
        clientType: sig.clientType,
        endpoint: { raw: sig.endpointRaw, resolved, resolvedFrom },
        dataHints: new Set<string>(),
        callSites: [],
        unresolved: resolved === null,
        idSeed,
      }
      groups.set(groupKey, g)
    }
    if (sig.dataHint) g.dataHints.add(sig.dataHint)
    g.callSites.push({ file: sig.file, line: sig.line, symbol: sig.symbol })
  }

  const items: InterfaceItem[] = [...groups.values()].map((g) => {
    const callSites = g.callSites
      .sort((a, b) => cmp(a.file, b.file) || a.line - b.line || cmp(a.symbol, b.symbol))
      // 같은 지점 중복 방지(동일 라인 다중 신호는 이미 java-scan 에서 dedup).
      .filter((c, i, arr) => i === 0 || !(c.file === arr[i - 1].file && c.line === arr[i - 1].line))
    const hash = createHash('sha256').update(g.idSeed).digest('hex').slice(0, 8)
    const dataHint = [...g.dataHints].sort(cmp).join('/') || null
    return {
      id: `IF-${ID_TAG[g.protocol]}-${hash}`,
      direction: g.direction,
      protocol: g.protocol,
      clientType: g.clientType,
      endpoint: g.endpoint,
      dataHint,
      callSites,
      unresolved: g.unresolved,
    }
  })

  // 정렬(결정론 전순서) — 프로토콜 → 엔드포인트 → 클라이언트 → 첫 callSite.
  items.sort(
    (a, b) =>
      cmp(a.protocol, b.protocol) ||
      cmp(a.endpoint.resolved ?? a.endpoint.raw ?? '￿', b.endpoint.resolved ?? b.endpoint.raw ?? '￿') ||
      cmp(a.clientType, b.clientType) ||
      cmp(a.callSites[0].file, b.callSites[0].file) ||
      a.callSites[0].line - b.callSites[0].line,
  )

  const protoCounts = new Map<InterfaceProtocol, number>()
  for (const item of items) protoCounts.set(item.protocol, (protoCounts.get(item.protocol) ?? 0) + 1)
  const byProtocol = [...protoCounts.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => cmp(a.protocol, b.protocol))

  // 의심 신호 — 탐지된 callSite 라인은 제외하고 남은 연계 흔적을 센다.
  const detectedLines = new Set<string>()
  for (const item of items) for (const c of item.callSites) detectedLines.add(`${c.file}:${c.line}`)
  const suspectSignals = collectSuspects(projectRoot, census, detectedLines)

  return InterfaceReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit ?? gitCommitHash(projectRoot),
    items,
    stats: {
      total: items.length,
      unresolvedEndpoints: items.filter((i) => i.unresolved).length,
      byProtocol,
      callSiteTotal: items.reduce((n, i) => n + i.callSites.length, 0),
    },
    suspectSignals,
  })
}
