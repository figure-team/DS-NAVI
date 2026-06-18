/**
 * ktds legacy-core 공통 타입 — 단일 소스(single source of truth).
 *
 * grounding 신뢰도 등급(CONFIDENCE_VALUES)과 정규 노드(CanonicalNode)의 유일 정의처.
 * 모든 ktds 오버레이/산출물은 이 모듈에서만 신뢰도 등급을 가져온다(중복 정의 금지).
 */

/** 신뢰도 등급 — 근거 강도 순(강함 → 약함). 모든 ktds 산출물 claim 태깅의 단일 소스. */
export const CONFIDENCE_VALUES = [
  'CONFIRMED', // 코드 증거(file:line)로 직접 확인
  'CONFIRMED_AI', // AI 합성이나 근거 앵커 보유
  'INFERRED', // 구조/관례 기반 추론 ([추정])
  'UNVERIFIED', // 근거 미확보 ([확인필요])
] as const

export type Confidence = (typeof CONFIDENCE_VALUES)[number]

/** 임의 값이 유효한 신뢰도 등급인지 좁히는 타입 가드. */
export function isConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value)
}

/** file:line 앵커 — 모든 grounding 주장의 근거 위치. */
export interface SourceAnchor {
  file: string
  line: number
  endLine?: number
}

/**
 * 정규 노드(CanonicalNode) — ktds 오버레이가 다루는 노드의 식별 단위.
 *
 * UA KG 노드와 ktds skeleton 노드를 잇는 안정 키(`id`)를 보유한다.
 * `id`는 오버레이 전 과정에서 불변(immutable)이며 rename/merge 시에도 보존된다.
 */
export interface CanonicalNode {
  /** 안정 식별자 — 오버레이/confirm 과정에서 불변. */
  id: string
  /** 노드 종류(domain/flow/step/method/route/table 등). */
  kind: string
  /** 표시용 이름(LLM 제안으로 바뀔 수 있으나 `id`는 불변). */
  name: string
  /** 근거 위치(있을 때만). */
  anchor?: SourceAnchor
  /** 이 노드 주장의 신뢰도 등급. */
  confidence: Confidence
}
