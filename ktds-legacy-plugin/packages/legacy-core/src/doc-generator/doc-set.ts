/**
 * 문서 세트 레지스트리(D2) — 템플릿 기반 산출물 9종의 docId ↔ 빌더 ↔ 템플릿 파일 매핑.
 *
 * understand-docs 가 이 세트를 돌며 각 문서의 템플릿(.md, `templates/doc/`)을 로드해
 * 빌더 산출에 입힌다(applyDocTemplate). 템플릿 미로드 시 빌더 기본 구조 그대로(폴백).
 * 근거 가능 9종: as-built 6 + SI 3. (방법론 모듈과 별개의 "전체 세트" 진입점.)
 */
import type { DocInput } from './builders/index.js'
import {
  buildTechStack,
  buildArchitecture,
  buildProgramList,
  buildCrudMatrix,
  buildBatchList,
  buildImpactAnalysis,
} from './builders/index.js'
import {
  buildSiFeatureSpec,
  buildSiInterfaceSpec,
  buildSiTableSpec,
} from './methodology/si-standard.js'
import type { GeneratedDoc } from './types.js'

/** 한 문서의 빌더 + 템플릿 파일명. templateFile 은 `templates/doc/` 기준 상대명. */
export interface DocSetEntry {
  docId: string
  templateFile: string
  build: (input: DocInput) => GeneratedDoc
}

/** 근거 가능 9종(고정 순서). docId 는 빌더 산출/템플릿 frontmatter 와 일치. */
export const DOC_SET: DocSetEntry[] = [
  { docId: '01_tech-stack', templateFile: 'tech-stack.md', build: buildTechStack },
  { docId: '02_architecture', templateFile: 'architecture.md', build: buildArchitecture },
  { docId: 'si-기능명세서', templateFile: 'feature-spec.md', build: buildSiFeatureSpec },
  { docId: 'si-인터페이스정의서', templateFile: 'interface-spec.md', build: buildSiInterfaceSpec },
  { docId: 'si-테이블정의서', templateFile: 'table-spec.md', build: buildSiTableSpec },
  { docId: '06_program-list', templateFile: 'program-list.md', build: buildProgramList },
  { docId: '07_crud-matrix', templateFile: 'crud-matrix.md', build: buildCrudMatrix },
  { docId: '08_batch-list', templateFile: 'batch-list.md', build: buildBatchList },
  { docId: '09_impact-analysis', templateFile: 'impact-analysis.md', build: buildImpactAnalysis },
]

/** 전체 세트를 빌더 기본 구조로 생성(템플릿 미적용). IO 호출자가 템플릿을 입힌다. */
export function buildDocSet(input: DocInput): GeneratedDoc[] {
  return DOC_SET.map((e) => e.build(input))
}
