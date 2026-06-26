/**
 * 방법론 레지스트리 — id -> MethodologyModule 조회(Layer 2 교체 지점).
 *
 * 기본(DEFAULT)은 'as-built'(현행 5종). getMethodology 는 미등록 id 에 throw 하여
 * 잘못된 방법론이 조용히 통과하지 않게 한다(fail-closed). listMethodologies 는
 * 등록 id 를 정렬해 반환(결정론).
 */
import { asBuiltMethodology } from './as-built.js'
import { siStandardMethodology } from './si-standard.js'
import { policyMethodology } from './policy.js'
import type { MethodologyModule } from './types.js'

/** 기본 방법론 id — 현행 5종(as-built). */
export const DEFAULT_METHODOLOGY = 'as-built'

/** 등록된 방법론 모듈(id -> module). */
const REGISTRY: Record<string, MethodologyModule> = {
  [asBuiltMethodology.id]: asBuiltMethodology,
  [siStandardMethodology.id]: siStandardMethodology,
  [policyMethodology.id]: policyMethodology,
}

/** id 로 방법론 모듈을 조회. 미등록이면 throw(fail-closed). */
export function getMethodology(id: string): MethodologyModule {
  const mod = REGISTRY[id]
  if (!mod) {
    throw new Error(`unknown methodology: ${id} (등록: ${listMethodologies().join(', ')})`)
  }
  return mod
}

/** 등록된 방법론 id 목록(정렬, 결정론). */
export function listMethodologies(): string[] {
  return Object.keys(REGISTRY).slice().sort()
}
