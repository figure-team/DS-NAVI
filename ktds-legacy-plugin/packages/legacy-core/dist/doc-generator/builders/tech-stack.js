import { claim } from '../claims.js';
import { displayName, inferred, nodeClaim, nodesWithTag, summarySuffix, } from './shared.js';
/** 기술 스택 문서 모델을 조립한다(결정론: 입력 순서 보존 + 노드 id 정렬). */
export function buildTechStack(input) {
    const languages = (input.project?.languages ?? [])
        .slice()
        .sort()
        .map((l) => inferred(`사용 언어: ${l}`));
    // 프레임워크/라이브러리 — 빌드파일(pom.xml 등) 의존성이 있으면 file:line 근거로 CONFIRMED,
    // 없으면 project.frameworks 추론(INFERRED). buildDeps 는 이름 정렬(결정론).
    const frameworks = input.buildDeps && input.buildDeps.length > 0
        ? [...input.buildDeps]
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
            .map((d) => claim(`프레임워크/라이브러리: ${d.name}`, 'CONFIRMED', [{ file: d.file, line: d.line }]))
        : (input.project?.frameworks ?? [])
            .slice()
            .sort()
            .map((f) => inferred(`프레임워크/라이브러리: ${f}`));
    const modules = nodesWithTag(input.nodes, 'module').map((n) => nodeClaim(n, `모듈: ${displayName(n)}${summarySuffix(n)}`));
    return {
        docId: '01_tech-stack',
        title: '기술 스택',
        methodology: 'as-built',
        sections: [
            { heading: '언어', key: 'languages', claims: languages },
            { heading: '프레임워크 / 주요 라이브러리', key: 'frameworks', claims: frameworks },
            { heading: '모듈', key: 'modules', claims: modules },
        ],
    };
}
//# sourceMappingURL=tech-stack.js.map