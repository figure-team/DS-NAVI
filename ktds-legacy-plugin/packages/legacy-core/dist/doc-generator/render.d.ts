import type { DocMeta, GeneratedDoc } from './types.js';
/** claim 펜스 열기/닫기 마커(template §0) — prose 불릿과 claim 영역을 구분. */
export declare const CLAIMS_FENCE_OPEN = "<!-- claims:FENCE:OPEN -->";
export declare const CLAIMS_FENCE_CLOSE = "<!-- claims:FENCE:CLOSE -->";
/** 빈 섹션 표기(template §0). */
export declare const EMPTY_SECTION = "_(\uD56D\uBAA9 \uC5C6\uC74C)_";
/**
 * GeneratedDoc + DocMeta -> 발행용 Markdown.
 * 프런트매터 + 제목 + 상태문 + 섹션(선택 prose + claim 펜스). prose 는 claim 펜스
 * 밖(§3.3)이며 골든 비대상이다.
 */
export declare function renderMarkdown(doc: GeneratedDoc, meta: DocMeta): string;
/**
 * 결정론 skeleton 렌더 — 펜스 내 claim 내용만(헤딩 + claim 라인). prose/프런트매터
 * 없음. GOLDEN 스냅샷 대상(§3.3): 동일 입력 -> byte-identical.
 */
export declare function renderSkeleton(doc: GeneratedDoc): string;
//# sourceMappingURL=render.d.ts.map