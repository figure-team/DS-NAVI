import { buildTechStack, buildArchitecture, buildProgramList, buildCrudMatrix, buildBatchList, buildImpactAnalysis, } from './builders/index.js';
import { buildSiBatchSpec, buildSiProgramList, buildSiFeatureSpec, buildSiInterfaceSpec, buildSiTableSpec, buildSiRiskReport, buildSiTestScenarios, buildSiWorkSummary, } from './methodology/si-standard.js';
/** 근거 가능 14종(고정 순서). docId 는 빌더 산출/템플릿 frontmatter 와 일치. */
export const DOC_SET = [
    { docId: '01_tech-stack', templateFile: 'tech-stack.md', build: buildTechStack },
    { docId: '02_architecture', templateFile: 'architecture.md', build: buildArchitecture },
    { docId: 'si-기능명세서', templateFile: 'feature-spec.md', build: buildSiFeatureSpec },
    { docId: 'si-인터페이스정의서', templateFile: 'interface-spec.md', build: buildSiInterfaceSpec },
    { docId: 'si-테이블정의서', templateFile: 'table-spec.md', build: buildSiTableSpec },
    { docId: 'si-배치정의서', templateFile: 'batch-spec.md', build: buildSiBatchSpec },
    { docId: 'si-프로그램목록', templateFile: 'program-inventory.md', build: buildSiProgramList },
    { docId: 'si-위험모듈리포트', templateFile: 'risk-report.md', build: buildSiRiskReport },
    { docId: 'si-단위테스트시나리오', templateFile: 'test-scenarios.md', build: buildSiTestScenarios },
    { docId: 'si-실적요약보고서', templateFile: 'work-summary.md', build: buildSiWorkSummary },
    { docId: '06_program-list', templateFile: 'program-list.md', build: buildProgramList },
    { docId: '07_crud-matrix', templateFile: 'crud-matrix.md', build: buildCrudMatrix },
    { docId: '08_batch-list', templateFile: 'batch-list.md', build: buildBatchList },
    { docId: '09_impact-analysis', templateFile: 'impact-analysis.md', build: buildImpactAnalysis },
];
/** 전체 세트를 빌더 기본 구조로 생성(템플릿 미적용). IO 호출자가 템플릿을 입힌다. */
export function buildDocSet(input) {
    return DOC_SET.map((e) => e.build(input));
}
//# sourceMappingURL=doc-set.js.map