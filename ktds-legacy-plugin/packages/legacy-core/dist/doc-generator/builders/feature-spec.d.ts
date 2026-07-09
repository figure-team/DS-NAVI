/**
 * 03_feature-spec.md — 기능 명세 빌더(template §1).
 *
 * 섹션 순서·헤딩(AC-36): 업무 도메인 / 엔터티 · 업무 규칙 / 처리 흐름 / 처리 단계.
 *
 * grounding(§3.4): domain/flow/step 노드는 filePath+lineRange 보유 시 CONFIRMED
 * (file:line 앵커), 아니면 INFERRED. domainMeta(entities/businessRules/entryPoint)는
 * 노드 메타에서 그대로 재구성할 뿐 새 사실을 지어내지 않는다(없으면 빈 섹션).
 */
import type { GeneratedDoc } from '../types.js';
import { type DocInput } from './shared.js';
/** 기능 명세 문서 모델을 조립한다(결정론: 노드 id 정렬 + meta 정렬). */
export declare function buildFeatureSpec(input: DocInput): GeneratedDoc;
//# sourceMappingURL=feature-spec.d.ts.map