import type { GeneratedDoc } from '../types.js';
import type { UaGraphEdge } from '../../domain-map/types.js';
import { type DocInput } from './shared.js';
/**
 * `calls` 엣지(단계 호출) 위 사이클 — 도메인 그래프 폴백용.
 * byte-identical 재실행을 위해 인접/진입 순서를 정렬한다.
 */
export declare function detectCycles(edges: UaGraphEdge[]): string[][];
/** 아키텍처 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export declare function buildArchitecture(input: DocInput): GeneratedDoc;
//# sourceMappingURL=architecture.d.ts.map