/**
 * NODE DETAIL 템플릿 (P2) — step 노드 상세를 풍부하게 채우는 섹션 정의.
 *
 * 플러그인 탑재 + 사람 편집 가능(방법론 템플릿과 동형). 템플릿이 상세 섹션을
 * 정의하면 bundle 이 promptHint 를 호스트(Claude)에게 전달하고, 호스트는 섹션별
 * 의미 주장을 근거(slice)와 함께 fill/<key>.json 의 steps[].detail 에 작성한다.
 * verify/emit 은 섹션 주장을 도메인 주장과 동일하게 인용 기계검증한다.
 *
 * v1: 유일한 섹션 = role(역할) — 흐름에서 이 클래스/파일이 맡는 역할(LLM 의미 주장).
 * 메서드·호출관계는 결정론(엔진이 calls 엣지로 보유)이라 템플릿 섹션이 아니다.
 */
import { z } from 'zod'
import { FlowLayerSchema } from './types.js'

export const NodeDetailSectionSchema = z.object({
  /** 섹션 id — fill steps[].detail 의 key 이자 ktdsClaims kind 의 'detail:<id>' 접미. */
  id: z.string().min(1),
  /** 표시명(대시보드 모달 섹션 헤더). */
  label: z.string().min(1),
  /** LLM 채움 지시 — 번들 slice 근거로 작성하게 안내. */
  promptHint: z.string().min(1),
  /** 선택: 특정 계층 노드에만 적용(예: dataTouched 는 dao/db). 미지정 = 전 계층. */
  layers: z.array(FlowLayerSchema).optional(),
})
export type NodeDetailSection = z.infer<typeof NodeDetailSectionSchema>

export const NodeDetailTemplateSchema = z.object({
  version: z.literal(1),
  sections: z.array(NodeDetailSectionSchema),
})
export type NodeDetailTemplate = z.infer<typeof NodeDetailTemplateSchema>

/**
 * v1 기본 템플릿 — role 섹션 1개. 추후 사용자 커스텀(P4)으로 교체 가능.
 * promptHint 는 호스트가 step slice + calls 신호를 근거로 역할 한 문단을 쓰게 한다.
 */
export const DEFAULT_NODE_DETAIL_TEMPLATE: NodeDetailTemplate = {
  version: 1,
  sections: [
    {
      id: 'role',
      label: '역할',
      promptHint:
        '이 흐름에서 이 클래스/파일이 맡는 역할을 한 문단으로. 무엇을 입력받아 무엇을 ' +
        '하고 다음 단계로 무엇을 넘기는지. 근거는 step slice(클래스 선언/핵심 메서드)에서 인용.',
    },
  ],
}

/**
 * 주어진 노드 계층에 적용되는 템플릿 섹션만 거른다(layers 미지정 섹션은 전 계층).
 * 결정론: 입력 섹션 순서 보존(템플릿이 표시/채움 순서를 정의).
 */
export function sectionsForLayer(
  template: NodeDetailTemplate,
  layer: z.infer<typeof FlowLayerSchema> | undefined,
): NodeDetailSection[] {
  return template.sections.filter(
    (s) => !s.layers || (layer !== undefined && s.layers.includes(layer)),
  )
}
