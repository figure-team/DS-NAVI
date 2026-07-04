/**
 * interface-scan 데이터 계약(W1) — 대외 인터페이스(송신/라우트 외 수신) 산출물 스키마.
 *
 * `.spec/map/interfaces.json` 의 단일 소스. 모든 항목은 callSites(file:line) 근거를
 * 최소 1개 갖는다(증거 없는 항목 금지). items 는 생산자가 (protocol, file, line,
 * clientType) 로 정렬 후 프로토콜별 연번 id 를 부여한다 — 동일 commit byte-diff=0.
 */
import { z } from 'zod'

/** `.spec/map/` 인터페이스 산출물 파일명. */
export const INTERFACES_FILENAME = 'interfaces.json'

/** 연계 프로토콜 분류. */
export const InterfaceProtocolSchema = z.enum([
  'http',
  'ws',
  'mq',
  'file',
  'socket',
  'mail',
  'db-link',
])
export type InterfaceProtocol = z.infer<typeof InterfaceProtocolSchema>

/**
 * 방향 — outbound(송신) | inbound-extra(라우트 추출이 못 덮는 수신: MQ 리스너,
 * ServerSocket 등). 수신 HTTP 라우트는 routes.json 소관이므로 여기 넣지 않는다.
 */
export const InterfaceDirectionSchema = z.enum(['outbound', 'inbound-extra'])
export type InterfaceDirection = z.infer<typeof InterfaceDirectionSchema>

/** 호출 지점 — 1급 근거(file:line + 둘러싼 심볼). */
export const InterfaceCallSiteSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  symbol: z.string(),
})
export type InterfaceCallSite = z.infer<typeof InterfaceCallSiteSchema>

/**
 * 엔드포인트 — raw(코드에 적힌 그대로), resolved(리터럴/프로퍼티 해석 결과),
 * resolvedFrom(해석 근거 "file:line", 리터럴이면 null).
 * 동적 조립 등 해석 불가면 raw/resolved 가 null 일 수 있고 unresolved=true 로 표면화.
 */
export const InterfaceEndpointSchema = z.object({
  raw: z.string().nullable(),
  resolved: z.string().nullable(),
  resolvedFrom: z.string().nullable(),
})
export type InterfaceEndpoint = z.infer<typeof InterfaceEndpointSchema>

/** 인터페이스 항목 1건. */
export const InterfaceItemSchema = z.object({
  /** `IF-<PROTO>-NNN` — 정렬 후 부여(결정론). */
  id: z.string(),
  direction: InterfaceDirectionSchema,
  protocol: InterfaceProtocolSchema,
  /** 탐지된 클라이언트/신호 타입(RestTemplate, FeignClient, JmsTemplate, dblink …). */
  clientType: z.string(),
  endpoint: InterfaceEndpointSchema,
  /** 결정론으로 잡히는 데이터 힌트(HTTP 동사, produce/consume 등). 없으면 null. */
  dataHint: z.string().nullable(),
  callSites: z.array(InterfaceCallSiteSchema).min(1),
  /** endpoint 를 확정하지 못함 — 정의서에 [미확인]으로 노출(침묵 누락 금지). */
  unresolved: z.boolean(),
})
export type InterfaceItem = z.infer<typeof InterfaceItemSchema>

/** interfaces.json 전체. 신호 0건이어도 기록한다("스캔했고 없음"의 증거). */
export const InterfaceReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  items: z.array(InterfaceItemSchema),
  stats: z.object({
    total: z.number().int().nonnegative(),
    unresolvedEndpoints: z.number().int().nonnegative(),
    byProtocol: z.array(
      z.object({
        protocol: InterfaceProtocolSchema,
        count: z.number().int().nonnegative(),
      }),
    ),
  }),
})
export type InterfaceReport = z.infer<typeof InterfaceReportSchema>
