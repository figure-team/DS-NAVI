/**
 * interface-scan 데이터 계약(W1) — 대외 인터페이스(송신/라우트 외 수신) 산출물 스키마.
 *
 * `.spec/map/interfaces.json` 의 단일 소스. 모든 항목은 callSites(file:line) 근거를
 * 최소 1개 갖는다(증거 없는 항목 금지). items 는 생산자가 (protocol, file, line,
 * clientType) 로 정렬 후 프로토콜별 연번 id 를 부여한다 — 동일 commit byte-diff=0.
 */
import { z } from 'zod';
/** `.spec/map/` 인터페이스 산출물 파일명. */
export const INTERFACES_FILENAME = 'interfaces.json';
/**
 * 프로젝트 커스텀 연계 클라이언트(understanding.config.json `interfaceScan.clients`).
 * 사내 공통 EAI 래퍼(예: EaiClient.send) 등 카탈로그 밖 타입을 화이트리스트에 주입하는
 * seam — 실 SI 의 공통연계모듈 recall 절벽 대응(플러그인 소스 수정 없이 등록).
 */
export const CustomClientSpecSchema = z.object({
    /** 바인딩 타입 단순명(제네릭/패키지 제외) — 예: "EaiClient". */
    type: z.string().min(1),
    protocol: z.enum(['http', 'ws', 'mq', 'file', 'socket', 'mail', 'db-link']),
    /** 신호로 볼 메서드명 화이트리스트 — 예: ["send", "call"]. */
    methods: z.array(z.string().min(1)).min(1),
    /** endpoint 로 읽을 인자 인덱스(기본 0). */
    endpointArg: z.number().int().nonnegative().default(0),
    /** 정의서 표기 라벨(기본 type). */
    label: z.string().optional(),
});
/** 연계 프로토콜 분류. */
export const InterfaceProtocolSchema = z.enum([
    'http',
    'ws',
    'mq',
    'file',
    'socket',
    'mail',
    'db-link',
]);
/**
 * 방향 — outbound(송신) | inbound-extra(라우트 추출이 못 덮는 수신: MQ 리스너,
 * ServerSocket 등). 수신 HTTP 라우트는 routes.json 소관이므로 여기 넣지 않는다.
 */
export const InterfaceDirectionSchema = z.enum(['outbound', 'inbound-extra']);
/** 호출 지점 — 1급 근거(file:line + 둘러싼 심볼). */
export const InterfaceCallSiteSchema = z.object({
    file: z.string(),
    line: z.number().int().positive(),
    symbol: z.string(),
});
/**
 * 엔드포인트 — raw(코드에 적힌 그대로), resolved(리터럴/프로퍼티 해석 결과),
 * resolvedFrom(해석 근거 "file:line", 리터럴이면 null).
 * 동적 조립 등 해석 불가면 raw/resolved 가 null 일 수 있고 unresolved=true 로 표면화.
 */
export const InterfaceEndpointSchema = z.object({
    raw: z.string().nullable(),
    resolved: z.string().nullable(),
    resolvedFrom: z.string().nullable(),
});
/** 인터페이스 항목 1건 — 동일 (방향,프로토콜,클라이언트,엔드포인트) 신호는 1건으로 병합. */
export const InterfaceItemSchema = z.object({
    /**
     * `IF-<PROTO>-<hash8>` — 내용 파생 안정 id(방향|프로토콜|클라이언트|엔드포인트 sha256).
     * 위치(정렬 연번)가 아니라 내용에서 나오므로 재스캔·코드 추가에도 같은 연계는 같은 id
     * (제출된 정의서의 IF_ID 참조가 깨지지 않는다). 미해석 엔드포인트는 첫 callSite 로
     * 파생(라인 이동 시 변할 수 있음 — [미확인] 항목의 알려진 한계).
     */
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
});
/** interfaces.json 전체. 신호 0건이어도 기록한다("스캔했고 없음"의 증거). */
export const InterfaceReportSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    items: z.array(InterfaceItemSchema),
    stats: z.object({
        total: z.number().int().nonnegative(),
        unresolvedEndpoints: z.number().int().nonnegative(),
        byProtocol: z.array(z.object({
            protocol: InterfaceProtocolSchema,
            count: z.number().int().nonnegative(),
        })),
        /** 병합 전 원시 호출 지점 수(연계 건수와 호출 빈도를 구분해 보고). */
        callSiteTotal: z.number().int().nonnegative(),
    }),
    /**
     * 의심 신호 — 스캐너 카탈로그가 못 잡는 연계(사내 EAI 래퍼 등)의 존재 가능성 지표.
     * items 0건인데 suspects>0 이면 "연계 없음"이 아니라 "탐지 못함"일 수 있다(커버리지 경고).
     * http(s):// 문자열 리터럴 / *.wsdl 파일 / jdbc URL 을 결정론 카운트(중복 라인 1회).
     */
    suspectSignals: z.object({
        count: z.number().int().nonnegative(),
        samples: z.array(z.object({ file: z.string(), line: z.number().int().positive(), kind: z.string() })),
    }),
});
//# sourceMappingURL=types.js.map