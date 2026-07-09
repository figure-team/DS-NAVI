/**
 * ktds legacy-core — playwright-core 로더.
 *
 * 브라우저 구동 코드는 scripts/*.mjs 러너에 있지만, playwright-core 의존성은
 * 이 패키지(legacy-core)에 있으므로 dynamic import 를 여기서 수행해야
 * 워크스페이스 심링크/vendored(node_modules 자급) 양쪽에서 해석이 보장된다.
 */
/** playwright-core 모듈 로드. 실패 시 설치 안내 포함 에러. */
export declare function loadPlaywright(): Promise<typeof import('playwright-core')>;
//# sourceMappingURL=playwright-loader.d.ts.map