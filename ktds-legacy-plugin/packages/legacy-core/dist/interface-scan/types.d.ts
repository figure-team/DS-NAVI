/**
 * interface-scan 데이터 계약(W1) — 대외 인터페이스(송신/라우트 외 수신) 산출물 스키마.
 *
 * `.spec/map/interfaces.json` 의 단일 소스. 모든 항목은 callSites(file:line) 근거를
 * 최소 1개 갖는다(증거 없는 항목 금지). items 는 생산자가 (protocol, file, line,
 * clientType) 로 정렬 후 프로토콜별 연번 id 를 부여한다 — 동일 commit byte-diff=0.
 */
import { z } from 'zod';
/** `.spec/map/` 인터페이스 산출물 파일명. */
export declare const INTERFACES_FILENAME = "interfaces.json";
/**
 * 프로젝트 커스텀 연계 클라이언트(understanding.config.json `interfaceScan.clients`).
 * 사내 공통 EAI 래퍼(예: EaiClient.send) 등 카탈로그 밖 타입을 화이트리스트에 주입하는
 * seam — 실 SI 의 공통연계모듈 recall 절벽 대응(플러그인 소스 수정 없이 등록).
 */
export declare const CustomClientSpecSchema: z.ZodObject<{
    type: z.ZodString;
    protocol: z.ZodEnum<{
        file: "file";
        http: "http";
        ws: "ws";
        mq: "mq";
        socket: "socket";
        mail: "mail";
        "db-link": "db-link";
    }>;
    methods: z.ZodArray<z.ZodString>;
    endpointArg: z.ZodDefault<z.ZodNumber>;
    label: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CustomClientSpec = z.infer<typeof CustomClientSpecSchema>;
/** 연계 프로토콜 분류. */
export declare const InterfaceProtocolSchema: z.ZodEnum<{
    file: "file";
    http: "http";
    ws: "ws";
    mq: "mq";
    socket: "socket";
    mail: "mail";
    "db-link": "db-link";
}>;
export type InterfaceProtocol = z.infer<typeof InterfaceProtocolSchema>;
/**
 * 방향 — outbound(송신) | inbound-extra(라우트 추출이 못 덮는 수신: MQ 리스너,
 * ServerSocket 등). 수신 HTTP 라우트는 routes.json 소관이므로 여기 넣지 않는다.
 */
export declare const InterfaceDirectionSchema: z.ZodEnum<{
    outbound: "outbound";
    "inbound-extra": "inbound-extra";
}>;
export type InterfaceDirection = z.infer<typeof InterfaceDirectionSchema>;
/** 호출 지점 — 1급 근거(file:line + 둘러싼 심볼). */
export declare const InterfaceCallSiteSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    symbol: z.ZodString;
}, z.core.$strip>;
export type InterfaceCallSite = z.infer<typeof InterfaceCallSiteSchema>;
/**
 * 엔드포인트 — raw(코드에 적힌 그대로), resolved(리터럴/프로퍼티 해석 결과),
 * resolvedFrom(해석 근거 "file:line", 리터럴이면 null).
 * 동적 조립 등 해석 불가면 raw/resolved 가 null 일 수 있고 unresolved=true 로 표면화.
 */
export declare const InterfaceEndpointSchema: z.ZodObject<{
    raw: z.ZodNullable<z.ZodString>;
    resolved: z.ZodNullable<z.ZodString>;
    resolvedFrom: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type InterfaceEndpoint = z.infer<typeof InterfaceEndpointSchema>;
/** 인터페이스 항목 1건 — 동일 (방향,프로토콜,클라이언트,엔드포인트) 신호는 1건으로 병합. */
export declare const InterfaceItemSchema: z.ZodObject<{
    id: z.ZodString;
    direction: z.ZodEnum<{
        outbound: "outbound";
        "inbound-extra": "inbound-extra";
    }>;
    protocol: z.ZodEnum<{
        file: "file";
        http: "http";
        ws: "ws";
        mq: "mq";
        socket: "socket";
        mail: "mail";
        "db-link": "db-link";
    }>;
    clientType: z.ZodString;
    endpoint: z.ZodObject<{
        raw: z.ZodNullable<z.ZodString>;
        resolved: z.ZodNullable<z.ZodString>;
        resolvedFrom: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    dataHint: z.ZodNullable<z.ZodString>;
    callSites: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        symbol: z.ZodString;
    }, z.core.$strip>>;
    unresolved: z.ZodBoolean;
}, z.core.$strip>;
export type InterfaceItem = z.infer<typeof InterfaceItemSchema>;
/** interfaces.json 전체. 신호 0건이어도 기록한다("스캔했고 없음"의 증거). */
export declare const InterfaceReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        direction: z.ZodEnum<{
            outbound: "outbound";
            "inbound-extra": "inbound-extra";
        }>;
        protocol: z.ZodEnum<{
            file: "file";
            http: "http";
            ws: "ws";
            mq: "mq";
            socket: "socket";
            mail: "mail";
            "db-link": "db-link";
        }>;
        clientType: z.ZodString;
        endpoint: z.ZodObject<{
            raw: z.ZodNullable<z.ZodString>;
            resolved: z.ZodNullable<z.ZodString>;
            resolvedFrom: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        dataHint: z.ZodNullable<z.ZodString>;
        callSites: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            symbol: z.ZodString;
        }, z.core.$strip>>;
        unresolved: z.ZodBoolean;
    }, z.core.$strip>>;
    stats: z.ZodObject<{
        total: z.ZodNumber;
        unresolvedEndpoints: z.ZodNumber;
        byProtocol: z.ZodArray<z.ZodObject<{
            protocol: z.ZodEnum<{
                file: "file";
                http: "http";
                ws: "ws";
                mq: "mq";
                socket: "socket";
                mail: "mail";
                "db-link": "db-link";
            }>;
            count: z.ZodNumber;
        }, z.core.$strip>>;
        callSiteTotal: z.ZodNumber;
    }, z.core.$strip>;
    suspectSignals: z.ZodObject<{
        count: z.ZodNumber;
        samples: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            kind: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type InterfaceReport = z.infer<typeof InterfaceReportSchema>;
//# sourceMappingURL=types.d.ts.map