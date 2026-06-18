/**
 * as-built 방법론 모듈(기본) — 현행 5종 빌더를 문서 집합으로 묶는다(AC-23).
 *
 * 이 모듈은 기존 5 빌더(01_tech-stack..05_db-spec)가 곧 DEFAULT 방법론임을 증명한다.
 * 새 사실을 추가하지 않으며, 빌더 출력을 docId 정렬 순서로 그대로 모은다(결정론).
 */
import {
  buildApiSpec,
  buildArchitecture,
  buildDbSpec,
  buildFeatureSpec,
  buildTechStack,
} from '../builders/index.js'
import type { DocInput } from '../builders/index.js'
import type { GeneratedDoc } from '../types.js'
import type { MethodologyModule } from './types.js'

/** as-built 모듈 — 현행 5종 빌더를 docId(01..05) 순서로 산출. */
export const asBuiltMethodology: MethodologyModule = {
  id: 'as-built',
  title: '현행 추출(as-built)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return [
      buildTechStack(input),
      buildArchitecture(input),
      buildFeatureSpec(input),
      buildApiSpec(input),
      buildDbSpec(input),
    ]
  },
}
