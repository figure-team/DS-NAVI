/** ②③④ 각 단계가 생성하는 문서 종류. */
export type RequirementDocKind = 'list' | 'definition' | 'spec';
/** 변경관리(절차 B) 문서 종류 — 과업내용변경요청서·변경영향분석서. */
export type ChangeDocKind = 'change-request' | 'change-impact';
/** 한 문서 종류의 메타 — 템플릿 파일명 + 표시 제목 + 산출 단계. */
export interface RequirementTemplateEntry {
    kind: RequirementDocKind;
    /** templates/requirements/ 기준 상대 파일명. */
    file: string;
    title: string;
    /** 가이드 단계 번호(②③④). */
    step: 2 | 3 | 4;
}
/** 변경관리 문서 메타(단계 없음 — 별개 트리거 절차 B). */
export interface ChangeTemplateEntry {
    kind: ChangeDocKind;
    file: string;
    title: string;
}
/** 요구사항 문서 템플릿 레지스트리(단계 순서). */
export declare const REQUIREMENT_TEMPLATES: readonly RequirementTemplateEntry[];
/** 변경관리 문서 템플릿 레지스트리(절차 B). */
export declare const CHANGE_TEMPLATES: readonly ChangeTemplateEntry[];
/** kind → 레지스트리 항목(없으면 throw). */
export declare function requirementTemplateEntry(kind: RequirementDocKind): RequirementTemplateEntry;
/** kind → 변경관리 레지스트리 항목(없으면 throw). */
export declare function changeTemplateEntry(kind: ChangeDocKind): ChangeTemplateEntry;
/** kind → 템플릿 파일명(예: '01_요구사항목록표.md'). */
export declare function requirementTemplateFile(kind: RequirementDocKind): string;
/** kind → 변경관리 템플릿 파일명(예: '04_과업내용변경요청서.md'). */
export declare function changeTemplateFile(kind: ChangeDocKind): string;
export interface RequirementTemplateDirs {
    /** 프로젝트 override 디렉터리(.understand-anything/templates/requirements). 없으면 생략. */
    projectDir?: string;
    /** 플러그인 동봉 디렉터리(ktds-legacy-plugin/templates/requirements). */
    pluginDir: string;
}
export interface ResolvedRequirementTemplate {
    path: string;
    source: 'project' | 'plugin';
}
/**
 * 템플릿 경로 해석 — 프로젝트 override 우선, 없으면 플러그인 동봉. 둘 다 없으면 null.
 */
export declare function resolveRequirementTemplatePath(kind: RequirementDocKind, dirs: RequirementTemplateDirs): ResolvedRequirementTemplate | null;
export interface LoadedRequirementTemplate extends ResolvedRequirementTemplate {
    text: string;
}
/**
 * 템플릿 본문 로드(override→plugin). 찾지 못하면 throw(조용한 빈 산출 방지).
 */
export declare function loadRequirementTemplate(kind: RequirementDocKind, dirs: RequirementTemplateDirs): LoadedRequirementTemplate;
/**
 * 변경관리(절차 B) 템플릿 본문 로드(override→plugin). 찾지 못하면 throw.
 */
export declare function loadChangeTemplate(kind: ChangeDocKind, dirs: RequirementTemplateDirs): LoadedRequirementTemplate;
//# sourceMappingURL=requirement-templates.d.ts.map