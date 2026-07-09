import type { WikiVault } from './wiki.js';
/** `.spec/wiki/` 디렉터리 경로 — wiki vault 산출물이 사는 곳. */
export declare function specWikiDir(projectRoot: string): string;
/**
 * WikiVault 를 `.spec/wiki/` 하위에 기록. 각 파일의 부모 디렉터리를 mkdir -p 후
 * 안정 기록한다(내용은 buildWikiVault 가 보장하는 결정론 본문). 기록 경로(정렬) 반환.
 */
export declare function writeWikiVault(projectRoot: string, vault: WikiVault): string[];
//# sourceMappingURL=persist.d.ts.map