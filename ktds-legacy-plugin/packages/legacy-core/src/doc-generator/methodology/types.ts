/**
 * 방법론 모듈 추상화(Layer 2, 교체 가능) — 보완 C.
 *
 * 방법론 모듈은 "어떤 문서를, 어떤 섹션 문법/양식으로" 산출하는지를 정의한다.
 * 동일한 DocInput(같은 그래프)에 다른 모듈을 적용하면 다른 문서 집합이 나온다(AC-23).
 * 데이터(노드/엣지)는 공유하고, 모듈은 템플릿만 바꾼다(template §3.5, grounding 보존).
 */
import type { DocInput } from '../builders/index.js'
import type { GeneratedDoc } from '../types.js'

/**
 * MethodologyModule — 교체 가능한 방법론(Layer 2).
 *  - id: 안정 식별자('as-built' | 'si-standard'). registry 의 키.
 *  - title: 표시용 한글 명칭.
 *  - buildDocSet: 동일 DocInput 에서 모듈 고유의 문서 집합을 산출.
 */
export interface MethodologyModule {
  id: string
  title: string
  buildDocSet(input: DocInput): GeneratedDoc[]
}
