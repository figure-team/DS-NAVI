import type { MethodologyModule } from './types.js';
/** 기본 방법론 id — 현행 5종(as-built). */
export declare const DEFAULT_METHODOLOGY = "as-built";
/** id 로 방법론 모듈을 조회. 미등록이면 throw(fail-closed). */
export declare function getMethodology(id: string): MethodologyModule;
/** 등록된 방법론 id 목록(정렬, 결정론). */
export declare function listMethodologies(): string[];
//# sourceMappingURL=registry.d.ts.map