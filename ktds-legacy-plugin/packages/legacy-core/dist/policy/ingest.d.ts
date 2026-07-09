/**
 * 기존 정책서 ingest(정책서 P4) — 마크다운을 정책 항목(PolicyItem)으로 정규화.
 *
 * 기존 문서는 정형이 아닐 수 있다. 결정론 파서는 **표**(첫 셀=주제, 나머지=진술)와
 * **불릿**(`- 주제: 진술`)을 추출한다. 임의 산문의 의미 정규화는 LLM(SKILL) 영역이다.
 *
 * 결정론: 등장 순서 보존(라인 1-기반). 주제 중복은 첫 항목 유지.
 */
import type { PolicyCategory, PolicyItem } from './types.js';
/**
 * 한 정책서 마크다운을 PolicyItem[] 으로 파싱. category 는 호출자(파일명→카테고리)가 부여.
 */
export declare function parseExistingPolicy(markdown: string, category: PolicyCategory): PolicyItem[];
//# sourceMappingURL=ingest.d.ts.map