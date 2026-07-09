import type { DocState } from './index.js';
/** `.spec/docs/` 디렉터리 경로 — doc-state 산출물이 사는 곳. */
export declare function specDocsDir(projectRoot: string): string;
/** `.spec/docs/<docId>.state.json` 파일 경로. */
export declare function docStatePath(projectRoot: string, docId: string): string;
/**
 * DocState 를 `.spec/docs/<docId>.state.json` 에 안정 JSON 으로 기록
 * (`.spec/docs/` mkdir -p 선행). 기록한 파일의 절대 경로를 반환한다.
 */
export declare function writeDocState(projectRoot: string, docId: string, state: DocState): string;
/**
 * `.spec/docs/<docId>.state.json` 을 읽어 DocState 로 반환. 파일이 없으면 null.
 * 권한/IO 오류는 던진다(fail-closed). zod parse 로 스키마를 검증한다.
 */
export declare function readDocState(projectRoot: string, docId: string): DocState | null;
//# sourceMappingURL=persist.d.ts.map