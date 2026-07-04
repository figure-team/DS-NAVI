/**
 * interface-scan 오케스트레이션(W1) — census 기반 Java/XML/SQL 스캔 →
 * `${...}` 플레이스홀더 해석(T2) → 정렬·id 부여 → InterfaceReport.
 *
 * 결정론: relPath ASC 순회, items (protocol, file, line, clientType, raw) 정렬,
 * 프로토콜별 연번 id. 동일 commit 재실행 byte-diff=0.
 * 정직성: 신호 0건도 items:[] 로 기록, endpoint 해석 실패는 unresolved=true 로 노출.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource } from '../domain-map/tree-sitter.js'
import { gitCommitHash } from '../domain-map/persist.js'
import type { CensusReport } from '../domain-map/types.js'
import { scanJavaInterfaces, type RawInterfaceSignal } from './java-scan.js'
import { scanDbLinks } from './text-scan.js'
import { buildPropertyIndex, resolvePlaceholders } from './properties.js'
import {
  InterfaceReportSchema,
  type InterfaceItem,
  type InterfaceProtocol,
  type InterfaceReport,
} from './types.js'

export * from './types.js'
export { scanJavaInterfaces } from './java-scan.js'
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

/** 프로젝트 전체에서 인터페이스 신호를 추출해 InterfaceReport 를 만든다(파일 기록 없음). */
export async function extractInterfaces(
  projectRoot: string,
  census: CensusReport,
): Promise<InterfaceReport> {
  const props = buildPropertyIndex(projectRoot, census)
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
    raw.push(...scanJavaInterfaces(root, relPath))
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

  // T2 해석 + 항목화.
  const items: InterfaceItem[] = raw.map((sig) => {
    let resolved: string | null = null
    let resolvedFrom: string | null = null
    if (sig.endpointRaw !== null) {
      const r = resolvePlaceholders(sig.endpointRaw, props)
      resolved = r.resolved
      resolvedFrom = r.resolvedFrom
    }
    return {
      id: '', // 정렬 후 부여
      direction: sig.direction,
      protocol: sig.protocol,
      clientType: sig.clientType,
      endpoint: { raw: sig.endpointRaw, resolved, resolvedFrom },
      dataHint: sig.dataHint,
      callSites: [{ file: sig.file, line: sig.line, symbol: sig.symbol }],
      unresolved: resolved === null,
    }
  })

  // 정렬(결정론 전순서) → 프로토콜별 연번 id.
  items.sort(
    (a, b) =>
      cmp(a.protocol, b.protocol) ||
      cmp(a.callSites[0].file, b.callSites[0].file) ||
      a.callSites[0].line - b.callSites[0].line ||
      cmp(a.clientType, b.clientType) ||
      cmp(a.endpoint.raw ?? '', b.endpoint.raw ?? ''),
  )
  const counters = new Map<string, number>()
  for (const item of items) {
    const n = (counters.get(item.protocol) ?? 0) + 1
    counters.set(item.protocol, n)
    item.id = `IF-${ID_TAG[item.protocol]}-${String(n).padStart(3, '0')}`
  }

  const protoCounts = new Map<InterfaceProtocol, number>()
  for (const item of items) protoCounts.set(item.protocol, (protoCounts.get(item.protocol) ?? 0) + 1)
  const byProtocol = [...protoCounts.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => cmp(a.protocol, b.protocol))

  return InterfaceReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit ?? gitCommitHash(projectRoot),
    items,
    stats: {
      total: items.length,
      unresolvedEndpoints: items.filter((i) => i.unresolved).length,
      byProtocol,
    },
  })
}
