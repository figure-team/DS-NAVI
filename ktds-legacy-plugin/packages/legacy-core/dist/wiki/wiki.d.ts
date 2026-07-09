import type { DocMeta, GeneratedDoc } from '../doc-generator/types.js';
/** vault 한 파일 — 상대 경로(.spec/wiki/ 기준) + 마크다운 본문. */
export interface WikiFile {
    path: string;
    content: string;
}
/** wiki vault — 정렬된 파일 목록(문서 .md + index.md). */
export interface WikiVault {
    files: WikiFile[];
}
/**
 * docId -> DocMeta 를 주입하는 콜백(결정론: 호출자가 sourceCommit/evidenceRate/status 공급).
 * meta 가 없으면 문서 자체에서 최소 meta(status=DRAFT, sourceCommit=null, evidenceRate=0)를 합성한다.
 */
export type MetaResolver = (doc: GeneratedDoc) => DocMeta;
/**
 * GeneratedDoc[] -> WikiVault. 문서 1건당 `<docId>.md`(renderMarkdown + 관련 위키링크) +
 * `index.md` 허브. files 는 path 정렬(결정론). resolveMeta 미지정 시 최소 meta 폴백.
 */
export declare function buildWikiVault(docs: GeneratedDoc[], resolveMeta?: MetaResolver): WikiVault;
//# sourceMappingURL=wiki.d.ts.map