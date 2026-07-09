/**
 * 09_impact-analysis.md — 영향도/의존성 분석서 빌더(D2). ITO 변경관리용.
 *
 * 두 섹션 모두 그래프 사실(calls 엣지 step→step)에서 파일 단위로 집계 → CONFIRMED.
 * - 고영향 컴포넌트(#impact-hotspots): 파일별 fan-in(피의존)·fan-out(의존)·전이 영향(reach).
 * - 도메인 간 의존(#cross-domain-deps): 도메인 경계를 넘는 calls 의 도메인쌍 집계.
 *
 * 결정론: 정렬(fan-in desc→경로 asc, calls desc→도메인쌍 asc). 합성 없음(grounding 보존).
 */
import type { GeneratedDoc } from '../types.js';
import type { DocInput } from './shared.js';
export declare function buildImpactAnalysis(input: DocInput): GeneratedDoc;
//# sourceMappingURL=impact-analysis.d.ts.map