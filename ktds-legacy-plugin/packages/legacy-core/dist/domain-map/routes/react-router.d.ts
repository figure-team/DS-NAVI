/**
 * React Router 라우트 추출(P5) — 파싱된 TS/TSX AST 기준.
 *
 * createBrowserRouter/createHashRouter([{path,children}])·useRoutes([...]) 의 객체
 * 라우트 배열과, JSX `<Route path="...">` 중첩을 처리한다. path/children 경로 조합은
 * 단순 문자열 join(부모+자식, 선행 '/' 절대경로 오버라이드 같은 react-router 런타임
 * 세부규칙은 미반영 — 결정론 스캔 범위 밖). path 가 문자열 리터럴이 아닌 라우트는 건너뛴다.
 * framework 값 'react-router' 는 아직 RouteFrameworkSchema(types.ts)에 없다 —
 * 배선 시 스키마 확장 필요(본 파일은 로컬 타입으로 출력해 컴파일을 우회한다).
 */
import type { Node } from 'web-tree-sitter';
import type { RouteMethod } from '../types.js';
/** RouteEntry 형태의 로컬 출력 타입 — framework 는 아직 스키마 미등재(위 헤더 코멘트 참고). */
export interface ReactRouterRoute {
    routeId: string;
    method: RouteMethod;
    path: string;
    rawPath: string;
    kind: 'page';
    framework: 'react-router';
    filePath: string;
    line: number;
    handler: string | null;
    notes: string[];
}
/**
 * 단일 파일에서 React Router 라우트를 추출한다.
 * @param root 파싱된 program 노드(tsx 그래머 권장 — JSX 포함 가능성)
 * @param filePath census relPath
 */
export declare function extractReactRouterRoutes(root: Node, filePath: string): ReactRouterRoute[];
//# sourceMappingURL=react-router.d.ts.map