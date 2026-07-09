import type { Node } from 'web-tree-sitter';
export type LangId = 'java' | 'typescript' | 'tsx';
/**
 * 소스를 파싱해 루트 노드를 반환한다.
 * 호출자는 더 이상 필요 없을 때 `tree.delete()` 로 해제할 수 있다(선택).
 */
export declare function parseSource(lang: LangId, source: string): Promise<Node>;
/** 노드의 1-based 시작 줄 번호(에디터/citation 기준). */
export declare function startLine(node: Node): number;
/** 첫 번째 자손 중 주어진 타입에 해당하는 노드(깊이우선, 결정론적). */
export declare function firstDescendantOfType(node: Node, type: string): Node | null;
/** 직계 named children 중 주어진 타입들에 해당하는 노드 목록(선언 순서 유지). */
export declare function childrenOfType(node: Node, ...types: string[]): Node[];
//# sourceMappingURL=tree-sitter.d.ts.map