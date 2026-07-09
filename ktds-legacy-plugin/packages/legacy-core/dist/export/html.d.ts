import type { DocMeta, GeneratedDoc } from '../doc-generator/types.js';
import type { WikiVault } from '../wiki/wiki.js';
/** HTML 텍스트 노드 escape — & < > " ' (손편, 의존성 0). 순서상 & 먼저. */
export declare function escapeHtml(value: string): string;
/**
 * GeneratedDoc + DocMeta -> 결정론 HTML 문서(완전한 <html>...). meta 는 호출자 주입
 * (timestamp 없음). 모든 텍스트는 escape 된다. 동일 입력 -> byte-identical.
 */
export declare function exportHtml(doc: GeneratedDoc, meta: DocMeta): string;
/**
 * WikiVault -> docId 별 HTML 파일 목록(.html). 각 파일은 vault 파일 path 의 .md 를
 * .html 로 치환. index.md 같은 마크다운 전용 파일은 minimal HTML 로 감싼다.
 * meta 는 호출자가 docId 별로 주입(WikiVault 자체는 meta 를 들고 있지 않음).
 *
 * 주: 이 헬퍼는 vault 의 GeneratedDoc 원본이 아니라 렌더된 마크다운만 받으므로,
 * 본문을 <pre> 로 안전하게 감싸 결정론·escape 를 보장한다(구조화 HTML 은 exportHtml 사용).
 */
export declare function exportVaultHtml(vault: WikiVault): WikiVault;
//# sourceMappingURL=html.d.ts.map