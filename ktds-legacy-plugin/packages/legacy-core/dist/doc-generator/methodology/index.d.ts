/**
 * 방법론 모듈 시스템(Layer 2, 교체 가능) 진입점 — 보완 C.
 *
 * MethodologyModule 추상화 + as-built(기본)·si-standard 모듈 + 레지스트리.
 * 동일 DocInput 에 다른 모듈을 적용하면 다른 문서 집합이 나온다(AC-23).
 */
export type { MethodologyModule } from './types.js';
export { asBuiltMethodology } from './as-built.js';
export { siStandardMethodology } from './si-standard.js';
export { getMethodology, listMethodologies, DEFAULT_METHODOLOGY } from './registry.js';
//# sourceMappingURL=index.d.ts.map