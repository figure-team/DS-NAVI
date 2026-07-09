import type { RtmModel, RtmTestScenario } from './types.js';
/**
 * 시나리오 안정 id — **fnId(flow 노드 id) 파생**(리뷰 C1). featureId(FN-###)는 위치값
 * (도메인/flow 증감 시 시프트)이라 확정 오버레이가 무음 오귀속된다. fnId 는 공백/경로가
 * 섞인 긴 문자열이라 sha256 8hex 로 축약(program-inventory PGM-id 관례), 예외 축은 seq
 * 대신 (reqId, acId) 를 박아 AC 추가/삭제에도 안정. 대상 기능은 fnId 필드로 역참조.
 *   정상 TS-<h8>-N · 경계 TS-<h8>-B · 예외(AC) TS-<h8>-E:<reqId>:<acId> · 예외(일반형) TS-<h8>-E
 */
export declare function scenarioId(fnId: string, suffix: string): string;
/** 전 기능 행의 시나리오 초안(순수·결정론 — 행 순서 × N→E→B). */
export declare function buildTestScenarios(model: RtmModel): RtmTestScenario[];
/**
 * 시나리오를 모델에 부착하고 coverage/diagnostics 재계산(understand-rtm 파이프라인:
 * applyRequirements 뒤·applyOverlay 앞 — rules(AC 역참조)가 채워진 뒤여야 예외 AC 시드 유효).
 */
export declare function attachTestScenarios(model: RtmModel): RtmModel;
//# sourceMappingURL=test-scenarios.d.ts.map