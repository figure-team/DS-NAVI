/**
 * requirement-templates — 요구사항 문서 3종(목록표/정의서/명세서)의 빈 템플릿 로더.
 *
 * RTM 단계화(docs/ktds/RTM_STEP_FLOW_DESIGN.md) ②③④ 단계가 보고 채우는 템플릿이다.
 * doc-generator(templates/doc)와 달리 바인딩키 파싱을 하지 않는다 — LLM(claude -p)이
 * 템플릿 **구조만** 보고 마크다운을 직접 채운다(examples 정답지는 참조하지 않음).
 *
 * 로드 우선순위: 프로젝트 override(.understand-anything/templates/requirements/) → 플러그인 동봉
 * (node-template/doc-template 의 override→plugin 규약과 동형).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ②③④ 각 단계가 생성하는 문서 종류. */
export type RequirementDocKind = 'list' | 'definition' | 'spec'

/** 한 문서 종류의 메타 — 템플릿 파일명 + 표시 제목 + 산출 단계. */
export interface RequirementTemplateEntry {
  kind: RequirementDocKind
  /** templates/requirements/ 기준 상대 파일명. */
  file: string
  title: string
  /** 가이드 단계 번호(②③④). */
  step: 2 | 3 | 4
}

/** 요구사항 문서 템플릿 레지스트리(단계 순서). */
export const REQUIREMENT_TEMPLATES: readonly RequirementTemplateEntry[] = [
  { kind: 'list', file: '01_요구사항목록표.md', title: '요구사항 목록표', step: 2 },
  { kind: 'definition', file: '02_요구사항정의서.md', title: '요구사항정의서', step: 3 },
  { kind: 'spec', file: '03_요구사항명세서.md', title: '요구사항명세서', step: 4 },
] as const

/** kind → 레지스트리 항목(없으면 throw). */
export function requirementTemplateEntry(kind: RequirementDocKind): RequirementTemplateEntry {
  const entry = REQUIREMENT_TEMPLATES.find((e) => e.kind === kind)
  if (!entry) throw new Error(`알 수 없는 요구사항 문서 종류: ${kind}`)
  return entry
}

/** kind → 템플릿 파일명(예: '01_요구사항목록표.md'). */
export function requirementTemplateFile(kind: RequirementDocKind): string {
  return requirementTemplateEntry(kind).file
}

export interface RequirementTemplateDirs {
  /** 프로젝트 override 디렉터리(.understand-anything/templates/requirements). 없으면 생략. */
  projectDir?: string
  /** 플러그인 동봉 디렉터리(ktds-legacy-plugin/templates/requirements). */
  pluginDir: string
}

export interface ResolvedRequirementTemplate {
  path: string
  source: 'project' | 'plugin'
}

/**
 * 템플릿 경로 해석 — 프로젝트 override 우선, 없으면 플러그인 동봉. 둘 다 없으면 null.
 */
export function resolveRequirementTemplatePath(
  kind: RequirementDocKind,
  dirs: RequirementTemplateDirs,
): ResolvedRequirementTemplate | null {
  const file = requirementTemplateFile(kind)
  if (dirs.projectDir) {
    const p = join(dirs.projectDir, file)
    if (existsSync(p)) return { path: p, source: 'project' }
  }
  const pluginPath = join(dirs.pluginDir, file)
  if (existsSync(pluginPath)) return { path: pluginPath, source: 'plugin' }
  return null
}

export interface LoadedRequirementTemplate extends ResolvedRequirementTemplate {
  text: string
}

/**
 * 템플릿 본문 로드(override→plugin). 찾지 못하면 throw(조용한 빈 산출 방지).
 */
export function loadRequirementTemplate(
  kind: RequirementDocKind,
  dirs: RequirementTemplateDirs,
): LoadedRequirementTemplate {
  const resolved = resolveRequirementTemplatePath(kind, dirs)
  if (!resolved) {
    const file = requirementTemplateFile(kind)
    throw new Error(
      `요구사항 템플릿을 찾지 못했습니다(${file}). ` +
        `plugin=${dirs.pluginDir}${dirs.projectDir ? `, project=${dirs.projectDir}` : ''}`,
    )
  }
  return { ...resolved, text: readFileSync(resolved.path, 'utf8') }
}
