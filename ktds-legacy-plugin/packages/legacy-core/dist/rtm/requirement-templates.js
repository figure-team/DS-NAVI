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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/** 요구사항 문서 템플릿 레지스트리(단계 순서). */
export const REQUIREMENT_TEMPLATES = [
    { kind: 'list', file: '01_요구사항목록표.md', title: '요구사항 목록표', step: 2 },
    { kind: 'definition', file: '02_요구사항정의서.md', title: '요구사항정의서', step: 3 },
    { kind: 'spec', file: '03_요구사항명세서.md', title: '요구사항명세서', step: 4 },
];
/** 변경관리 문서 템플릿 레지스트리(절차 B). */
export const CHANGE_TEMPLATES = [
    { kind: 'change-request', file: '04_과업내용변경요청서.md', title: '과업내용변경요청서' },
    { kind: 'change-impact', file: '05_변경영향분석서.md', title: '변경영향분석서' },
];
/** kind → 레지스트리 항목(없으면 throw). */
export function requirementTemplateEntry(kind) {
    const entry = REQUIREMENT_TEMPLATES.find((e) => e.kind === kind);
    if (!entry)
        throw new Error(`알 수 없는 요구사항 문서 종류: ${kind}`);
    return entry;
}
/** kind → 변경관리 레지스트리 항목(없으면 throw). */
export function changeTemplateEntry(kind) {
    const entry = CHANGE_TEMPLATES.find((e) => e.kind === kind);
    if (!entry)
        throw new Error(`알 수 없는 변경관리 문서 종류: ${kind}`);
    return entry;
}
/** kind → 템플릿 파일명(예: '01_요구사항목록표.md'). */
export function requirementTemplateFile(kind) {
    return requirementTemplateEntry(kind).file;
}
/** kind → 변경관리 템플릿 파일명(예: '04_과업내용변경요청서.md'). */
export function changeTemplateFile(kind) {
    return changeTemplateEntry(kind).file;
}
/** 파일명 기준 경로 해석(override→plugin). 요구사항·변경관리 템플릿 공통 토대. */
function resolveTemplateFilePath(file, dirs) {
    if (dirs.projectDir) {
        const p = join(dirs.projectDir, file);
        if (existsSync(p))
            return { path: p, source: 'project' };
    }
    const pluginPath = join(dirs.pluginDir, file);
    if (existsSync(pluginPath))
        return { path: pluginPath, source: 'plugin' };
    return null;
}
/**
 * 템플릿 경로 해석 — 프로젝트 override 우선, 없으면 플러그인 동봉. 둘 다 없으면 null.
 */
export function resolveRequirementTemplatePath(kind, dirs) {
    return resolveTemplateFilePath(requirementTemplateFile(kind), dirs);
}
/** 파일명 기준 본문 로드(override→plugin). 못 찾으면 throw(조용한 빈 산출 방지). */
function loadTemplateFile(file, dirs, label) {
    const resolved = resolveTemplateFilePath(file, dirs);
    if (!resolved) {
        throw new Error(`${label} 템플릿을 찾지 못했습니다(${file}). ` +
            `plugin=${dirs.pluginDir}${dirs.projectDir ? `, project=${dirs.projectDir}` : ''}`);
    }
    return { ...resolved, text: readFileSync(resolved.path, 'utf8') };
}
/**
 * 템플릿 본문 로드(override→plugin). 찾지 못하면 throw(조용한 빈 산출 방지).
 */
export function loadRequirementTemplate(kind, dirs) {
    return loadTemplateFile(requirementTemplateFile(kind), dirs, '요구사항');
}
/**
 * 변경관리(절차 B) 템플릿 본문 로드(override→plugin). 찾지 못하면 throw.
 */
export function loadChangeTemplate(kind, dirs) {
    return loadTemplateFile(changeTemplateFile(kind), dirs, '변경관리');
}
//# sourceMappingURL=requirement-templates.js.map