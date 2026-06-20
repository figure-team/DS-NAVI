/**
 * 01_tech-stack.md — 기술 스택 빌더(template §1).
 *
 * 섹션 순서·헤딩은 doc-templates.md §1(01_tech-stack)을 그대로 따른다(AC-36):
 *   언어 / 프레임워크 / 주요 라이브러리 / 모듈.
 *
 * grounding(§3.4): 언어·프레임워크는 project 메타에서 온 사실이지만 file:line
 * 앵커가 없으므로 INFERRED(근거 미앵커). 모듈 노드는 filePath 보유 시 CONFIRMED.
 */
import type { Claim, GeneratedDoc } from '../types.js'
import { claim } from '../claims.js'
import {
  type DocInput,
  displayName,
  inferred,
  nodeClaim,
  nodesWithTag,
  summarySuffix,
} from './shared.js'

/** 기술 스택 문서 모델을 조립한다(결정론: 입력 순서 보존 + 노드 id 정렬). */
export function buildTechStack(input: DocInput): GeneratedDoc {
  const languages = (input.project?.languages ?? [])
    .slice()
    .sort()
    .map((l): Claim => inferred(`사용 언어: ${l}`))
  // 프레임워크/라이브러리 — 빌드파일(pom.xml 등) 의존성이 있으면 file:line 근거로 CONFIRMED,
  // 없으면 project.frameworks 추론(INFERRED). buildDeps 는 이름 정렬(결정론).
  const frameworks: Claim[] =
    input.buildDeps && input.buildDeps.length > 0
      ? [...input.buildDeps]
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
          .map((d): Claim => claim(`프레임워크/라이브러리: ${d.name}`, 'CONFIRMED', [{ file: d.file, line: d.line }]))
      : (input.project?.frameworks ?? [])
          .slice()
          .sort()
          .map((f): Claim => inferred(`프레임워크/라이브러리: ${f}`))
  const modules = nodesWithTag(input.nodes, 'module').map((n): Claim =>
    nodeClaim(n, `모듈: ${displayName(n)}${summarySuffix(n)}`),
  )

  return {
    docId: '01_tech-stack',
    title: '기술 스택',
    methodology: 'as-built',
    sections: [
      { heading: '언어', key: 'languages', claims: languages },
      { heading: '프레임워크 / 주요 라이브러리', key: 'frameworks', claims: frameworks },
      { heading: '모듈', key: 'modules', claims: modules },
    ],
  }
}
