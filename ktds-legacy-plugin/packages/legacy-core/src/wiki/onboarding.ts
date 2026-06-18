/**
 * 온보딩 가이드 (P4.5 / AC-27) — "여기부터(start here)" 진입 경로.
 *
 * vault 인덱스/허브 + 가이드 투어 순서를 제공한다. 투어 순서는 도메인 온보딩
 * 우선순위(DomainPriority.rank, E-b/AC-32)가 있으면 그것을, 없으면 노드 순서를 쓴다.
 * vault 로 들어가는 위키링크([[docId]])를 포함하고, U-A `/understand-onboard` 투어를
 * 개념적으로 참조한다(엔진은 U-A 를 호출하지 않음 — 문서 안내만).
 *
 * 결정론: Date.now() 미사용, 모든 목록 정렬/안정, 동일 입력 -> byte-identical.
 * grounding: 코드를 인용할 때만 근거를 단다(우선순위/노드는 file:line 근거가 없으므로 INFERRED).
 */
import { claim } from '../doc-generator/claims.js'
import type { GeneratedDoc, Section } from '../doc-generator/types.js'
import type { DomainPriority } from '../domain-map/types.js'

/** 투어 1 단계 — 표시 라벨 + 들어갈 vault 문서 docId(위키링크 대상, 선택). */
export interface OnboardingStop {
  label: string
  docId?: string
}

/** 온보딩 가이드 입력 — vault 문서 docId 목록 + 선택적 도메인 우선순위/노드 순서. */
export interface OnboardingInput {
  /** vault 에 존재하는 문서 docId 목록(허브 링크 대상). */
  docIds: string[]
  /** 도메인 온보딩 우선순위(E-b/AC-32). 있으면 투어 순서의 1순위 소스. */
  priorities?: DomainPriority[]
  /** 우선순위 미제공 시 폴백 — 노드 표시 순서(예: 도메인 key). */
  nodeOrder?: string[]
}

/** docId ASC 정렬(결정론). */
function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * 가이드 투어 순서 도출 — priorities 가 있으면 rank ASC(동률 key ASC),
 * 없으면 nodeOrder, 둘 다 없으면 docIds 정렬. 각 stop 의 label 은 출처 식별자.
 */
export function tourOrder(input: OnboardingInput): OnboardingStop[] {
  if (input.priorities && input.priorities.length > 0) {
    const sorted = [...input.priorities].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    })
    return sorted.map((p) => ({ label: p.key }))
  }
  if (input.nodeOrder && input.nodeOrder.length > 0) {
    return input.nodeOrder.map((id) => ({ label: id }))
  }
  return sortStrings(input.docIds).map((id) => ({ label: id, docId: id }))
}

/**
 * 온보딩 가이드 GeneratedDoc 생성(AC-27). docId='00_onboarding'.
 *  - "여기부터(start here)" 섹션 — vault 인덱스/허브로 들어가는 위키링크 + 투어 순서.
 *  - "문서 둘러보기" 섹션 — vault 문서 위키링크 목록(정렬).
 *  - U-A `/understand-onboard` 투어를 개념적으로 참조(엔진 비호출).
 * 코드 근거가 없으므로 claim 은 INFERRED(검토 권장) — 합성 사실 금지.
 */
export function buildOnboardingGuide(input: OnboardingInput): GeneratedDoc {
  const docIds = sortStrings(input.docIds)
  const tour = tourOrder(input)

  const startHere: Section = {
    heading: '여기부터(start here)',
    prose: [
      '이 프로젝트를 처음 본다면 위키 허브 [[index]] 에서 시작하세요.',
      '아래 투어 순서대로 도메인을 따라가면 전체 구조를 빠르게 파악할 수 있습니다.',
      'U-A `/understand-onboard` 투어와 함께 보면 코드 단위로 더 깊이 들어갈 수 있습니다(개념 참조).',
    ].join('\n'),
    claims: tour.map((stop, i) => {
      const link = stop.docId ? ` ([[${stop.docId}]])` : ''
      return claim(`${i + 1}. ${stop.label}${link}`, 'INFERRED')
    }),
  }

  const browse: Section = {
    heading: '문서 둘러보기',
    claims:
      docIds.length === 0
        ? [claim('아직 생성된 문서가 없습니다', 'UNVERIFIED')]
        : docIds.map((id) => claim(`[[${id}]]`, 'INFERRED')),
  }

  return {
    docId: '00_onboarding',
    title: '온보딩 가이드 (여기부터)',
    methodology: 'as-built',
    sections: [startHere, browse],
  }
}
