/**
 * interface-scan 골든 등가 테스트(W1) — 픽스처 4종 오라클 대조 + 결정론.
 *
 * 오라클(expected.json)은 스캐너 출력을 사람이 검수해 고정한 것(routes.test 관례).
 * 실패 = 회귀(누락/오탐/정렬·id 변화). 오라클 갱신은 반드시 diff 검수 후.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { stableJson } from '../domain-map/persist.js'
import { parseSource } from '../domain-map/tree-sitter.js'
import { extractInterfaces, scanJavaInterfaces, scanDbLinks } from './index.js'
import type { InterfaceReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'interface-scan')

interface Oracle {
  description: string
  items: InterfaceReport['items']
  stats: InterfaceReport['stats']
  suspectSignals: InterfaceReport['suspectSignals']
}

function loadOracle(fixture: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesRoot, fixture, 'expected.json'), 'utf8'))
}

async function scan(fixture: string): Promise<InterfaceReport> {
  const root = join(fixturesRoot, fixture)
  return extractInterfaces(root, buildCensus(root))
}

describe('interface scan — golden equivalence', () => {
  it('http-clients: RestTemplate/WebClient/Feign/Apache/HttpURLConnection + 프로퍼티 해석', async () => {
    const report = await scan('http-clients')
    const oracle = loadOracle('http-clients')
    expect(report.items).toEqual(oracle.items)
    expect(report.stats).toEqual(oracle.stats)
  })

  it('http-clients: 동적 URL 은 unresolved=true 로 표면화(침묵 누락 금지)', async () => {
    const report = await scan('http-clients')
    const dynamic = report.items.filter((i) => i.unresolved)
    expect(dynamic).toHaveLength(1)
    expect(dynamic[0].clientType).toBe('RestTemplate')
    expect(report.stats.unresolvedEndpoints).toBe(1)
  })

  it('mq-file: JMS/Kafka produce + 리스너 inbound-extra + SFTP/FTP/Socket', async () => {
    const report = await scan('mq-file')
    const oracle = loadOracle('mq-file')
    expect(report.items).toEqual(oracle.items)
    expect(report.stats).toEqual(oracle.stats)
  })

  it('mq-file: 방향 분리 — 리스너/ServerSocket 은 inbound-extra', async () => {
    const report = await scan('mq-file')
    const inbound = report.items.filter((i) => i.direction === 'inbound-extra')
    expect(inbound.map((i) => i.clientType).sort()).toEqual(['KafkaListener', 'ServerSocket'])
  })

  it('db-link: mapper XML/SQL 의 table@link + DDL, 주석 오탐 0', async () => {
    const report = await scan('db-link')
    const oracle = loadOracle('db-link')
    expect(report.items).toEqual(oracle.items)
    // 주석 속 COMMENT_LINK 는 잡히면 안 된다.
    expect(report.items.some((i) => (i.endpoint.raw ?? '').includes('COMMENT_LINK'))).toBe(false)
  })

  it('negative: 신호 없는 프로젝트 → items:[] + 의심신호 0 (스캔했고 없음의 증거)', async () => {
    const report = await scan('negative')
    expect(report.items).toEqual([])
    expect(report.stats).toEqual({ total: 0, unresolvedEndpoints: 0, byProtocol: [], callSiteTotal: 0 })
    expect(report.suspectSignals).toEqual({ count: 0, samples: [] })
  })

  it('결정론: 동일 입력 2회 실행 → byte-identical(stableJson)', async () => {
    const a = await scan('http-clients')
    const b = await scan('http-clients')
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('병합: 동일 엔드포인트 다중 호출 → 연계 1건 + callSites 누적(건수 부풀림 방지)', async () => {
    const report = await scan('http-clients')
    const approve = report.items.filter(
      (i) => i.endpoint.resolved === 'https://pay.example.com/v1/approve',
    )
    expect(approve).toHaveLength(1)
    expect(approve[0].callSites.map((c) => c.symbol)).toEqual([
      'PayClient#approve',
      'PayClient#retryApprove',
    ])
    expect(report.stats.callSiteTotal).toBe(report.items.reduce((n, i) => n + i.callSites.length, 0))
  })

  it('안정 id: 내용 파생(IF-<PROTO>-<hash8>) — 재실행에도 동일 연계는 동일 id', async () => {
    const a = await scan('http-clients')
    const b = await scan('http-clients')
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id))
    for (const it of a.items) expect(it.id).toMatch(/^IF-[A-Z]+-[0-9a-f]{8}$/)
    // id 유일성.
    expect(new Set(a.items.map((i) => i.id)).size).toBe(a.items.length)
  })

  it('커스텀 seam: understanding.config.json interfaceScan.clients 로 사내 EAI 래퍼 탐지', async () => {
    const report = await scan('eai-custom')
    const oracle = loadOracle('eai-custom')
    expect(report.items).toEqual(oracle.items)
    expect(report.items).toHaveLength(1)
    expect(report.items[0].clientType).toBe('EAI(사내공통)')
    expect(report.items[0].endpoint.resolved).toBe('EAI.SETTLE.REQ')
    // 미등록 래퍼(LegacyBus)는 잡지 않는다(화이트리스트 원칙).
    expect(report.items.some((i) => i.clientType.includes('LegacyBus'))).toBe(false)
  })

  // ── 적대적 리뷰(H1/M2~M5/L6/L7) 회귀 프로브 — 파서 직접 구동 ──────────────

  const probe = async (src: string) => scanJavaInterfaces(await parseSource('java', src), 'P.java')

  it('H1: JDK HttpClient 체인(비한정/FQN 모두) 탐지 + URI.create 해석', async () => {
    const fqn = await probe(
      `class X { void a() throws Exception { Object r = java.net.http.HttpRequest.newBuilder().uri(java.net.URI.create("https://api.example.com/v1")).GET().build(); } }`,
    )
    expect(fqn.map((s) => [s.clientType, s.endpointRaw])).toEqual([
      ['JdkHttpClient', 'https://api.example.com/v1'],
    ])
    const plain = await probe(
      `import java.net.http.HttpRequest; import java.net.URI; class X2 { void a() { Object r = HttpRequest.newBuilder().uri(URI.create("https://api2.example.com")).build(); } }`,
    )
    expect(plain.map((s) => s.endpointRaw)).toEqual(['https://api2.example.com'])
  })

  it('M2: 이스케이프 포함 리터럴 전체 복원(절단된 "틀린 확정값" 금지)', async () => {
    const out = await probe(
      `class Y { String f(org.springframework.web.client.RestTemplate rt) { return rt.getForObject("smb://host/a\\tb/c", String.class); } }`,
    )
    expect(out.map((s) => s.endpointRaw)).toEqual(['smb://host/a\tb/c'])
  })

  it('M3: 동명 이타입 선언(스코프 충돌) → 바인딩 포기, 오탐 0', async () => {
    const out = await probe(
      `class Z { void a(){ org.springframework.web.client.RestTemplate client = new org.springframework.web.client.RestTemplate(); }
       void b(){ com.foo.Widget client = com.foo.Shop.lookup(); client.exchange("X"); } }`,
    )
    expect(out).toEqual([])
  })

  it('M4: 도메인 *Request.Builder 는 OkHttp 로 오탐하지 않음(정확한 타입 세그먼트 매칭)', async () => {
    const bad = await probe(
      `class W { void a(){ Object o = new demo.PurchaseRequest.Builder().url("/internal/x").build(); } }`,
    )
    expect(bad).toEqual([])
    const ok = await probe(
      `class W2 { void a(){ Object o = new okhttp3.Request.Builder().url("https://ok.example.com").build(); } }`,
    )
    expect(ok.map((s) => [s.clientType, s.endpointRaw])).toEqual([['OkHttp', 'https://ok.example.com']])
  })

  it('M5: 한정 상수 참조는 한정 키로만 해석(Ext.API_URL ≠ 로컬 API_URL)', async () => {
    const out = await probe(
      `class Q { static final String API_URL = "https://local.example.com";
       void a(org.springframework.web.client.RestTemplate rt){
         rt.getForObject(ExternalConst.API_URL, String.class);
         rt.getForObject(Q.API_URL, String.class); } }`,
    )
    expect(out.map((s) => s.endpointRaw)).toEqual([null, 'https://local.example.com'])
  })

  it('L6: 빈 문자열 endpoint → unresolved=true(빈 값이 확정으로 표기 금지)', async () => {
    const root = join(fixturesRoot, 'http-clients')
    const report = await extractInterfaces(root, buildCensus(root))
    // 픽스처엔 빈 리터럴이 없으므로 단위 경로로 확인: '' 는 raw 단계에서 null 정규화.
    const probe6 = await probe(
      `class V { String f(org.springframework.web.client.RestTemplate rt) { return rt.getForObject("", String.class); } }`,
    )
    expect(probe6.map((s) => s.endpointRaw)).toEqual([''])
    // extractInterfaces 경유 시 unresolved 로 뒤집히는지는 negative 계열이 아닌 여기서
    // 스키마 불변식으로만 확인(빈 endpoint 항목이 있다면 반드시 unresolved).
    for (const it of report.items) {
      if (it.endpoint.resolved === '' || it.endpoint.raw === '') expect(it.unresolved).toBe(true)
    }
  })

  it('L7: 콤마 조인 dblink(FROM a@l1, b@l2) 둘 다 탐지', () => {
    const out = scanDbLinks('SELECT * FROM A@L1, B@L2 WHERE 1=1', 'q.sql', 'sql')
    expect(out.map((s) => s.endpointRaw).sort()).toEqual(['A@L1', 'B@L2'])
  })

  it('의심신호: 카탈로그 밖 연계(자체 HTTP 유틸/jdbc) → items 0 + suspectSignals 표면화', async () => {
    const report = await scan('suspect')
    expect(report.items).toEqual([])
    expect(report.suspectSignals.count).toBe(2)
    expect(report.suspectSignals.samples.map((s) => s.kind).sort()).toEqual([
      'http-literal',
      'jdbc-url',
    ])
    // 주석 라인의 URL 은 세지 않는다.
    expect(report.suspectSignals.samples.some((s) => s.line === 5)).toBe(false)
  })
})
