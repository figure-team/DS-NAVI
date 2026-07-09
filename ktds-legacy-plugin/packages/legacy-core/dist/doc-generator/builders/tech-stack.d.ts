/**
 * 01_tech-stack.md — 기술 스택 빌더(template §1).
 *
 * 섹션 순서·헤딩은 doc-templates.md §1(01_tech-stack)을 그대로 따른다(AC-36):
 *   언어 / 프레임워크 / 주요 라이브러리 / 모듈.
 *
 * grounding(§3.4): 언어·프레임워크는 project 메타에서 온 사실이지만 file:line
 * 앵커가 없으므로 INFERRED(근거 미앵커). 모듈 노드는 filePath 보유 시 CONFIRMED.
 */
import type { GeneratedDoc } from '../types.js';
import { type DocInput } from './shared.js';
/** 기술 스택 문서 모델을 조립한다(결정론: 입력 순서 보존 + 노드 id 정렬). */
export declare function buildTechStack(input: DocInput): GeneratedDoc;
//# sourceMappingURL=tech-stack.d.ts.map