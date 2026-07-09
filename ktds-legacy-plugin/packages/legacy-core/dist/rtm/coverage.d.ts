/**
 * computeCoverage(⑥) — RTM 커버리지/갭 롤업. 순수 함수. 설계: docs/ktds/RTM_TAB_DESIGN.md.
 *
 * RTM 핵심 가치(빈칸=위험)를 요약 수치 + 갭 + 요구사항 단위 진척으로 드러낸다.
 * critic 반영: NFR 은 nfrScope 로 구현 판정(M1), 검증은 AC.tests ↔ 기능 test 셀을 화해(M2).
 * 결정론: 갭 배열은 id ASC. confirmedIds(런타임 확정 기능 집합)는 선택(없으면 0).
 */
import type { RtmCoverage, RtmModel } from './types.js';
export declare function computeCoverage(model: RtmModel, confirmedIds?: Set<string>): RtmCoverage;
//# sourceMappingURL=coverage.d.ts.map