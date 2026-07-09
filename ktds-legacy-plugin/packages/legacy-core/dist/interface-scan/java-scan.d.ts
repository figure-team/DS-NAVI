/**
 * Java 대외 인터페이스 신호 스캔(T1) — tree-sitter 단일 파일 결정론 해석.
 *
 * 탐지 계층:
 *  1) 어노테이션: @FeignClient(인터페이스) / @KafkaListener·@JmsListener·@RabbitListener(메서드)
 *     / @WebServiceClient(클래스)
 *  2) 선언 바인딩: 필드/지역변수/파라미터의 타입이 클라이언트 타입이면 식별자→타입 바인딩
 *     (call-edge Tier1 수신자 해석과 동일 원리 — 파일 밖 타입 추론은 하지 않는다)
 *  3) 생성: new Socket/ServerSocket/SmbFile/HttpGet/JaxWsProxyFactoryBean …
 *  4) 호출: 바인딩된 수신자의 화이트리스트 메서드(restTemplate.exchange, jmsTemplate.send …),
 *     체인 패턴(WebClient…uri(), Request.Builder…url(), HttpRequest.newBuilder…uri(),
 *     new URL(..).openConnection())
 *
 * 엔드포인트 인자: 문자열 리터럴 / 같은 파일 static final String 상수 / 리터럴·상수만의
 * `+` 연결까지 해석. 그 외(동적 조립)는 raw=null → unresolved(침묵 누락 금지).
 * `${...}` 플레이스홀더 해석(T2)은 호출측(index.ts)에서 수행한다.
 */
import type { Node } from 'web-tree-sitter';
import type { InterfaceDirection, InterfaceProtocol } from './types.js';
/** 스캔 원시 항목 — endpoint 는 아직 raw 단계(플레이스홀더 미해석). */
export interface RawInterfaceSignal {
    protocol: InterfaceProtocol;
    direction: InterfaceDirection;
    clientType: string;
    endpointRaw: string | null;
    dataHint: string | null;
    file: string;
    line: number;
    symbol: string;
}
export interface InvocationSpec {
    protocol: InterfaceProtocol;
    clientType: string;
    /** 화이트리스트 메서드명 → dataHint (null 허용). */
    methods: Record<string, string | null>;
    /** endpoint 로 읽을 인자 인덱스(기본 0). */
    endpointArg?: number;
}
/**
 * 단일 Java 파일에서 인터페이스 신호를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 * @param customSpecs 프로젝트 커스텀 클라이언트(understanding.config.json seam) —
 *        내장 카탈로그와 병합하되 내장이 우선(동명 타입 재정의 금지).
 */
export declare function scanJavaInterfaces(root: Node, filePath: string, customSpecs?: Record<string, InvocationSpec>): RawInterfaceSignal[];
//# sourceMappingURL=java-scan.d.ts.map