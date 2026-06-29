/**
 * domain-policy 방법론(PD2) — 한 업무 도메인의 흐름과 그 안의 조건 분기를 정책서로 묶는다.
 *
 * 카테고리별 정책서(policy: 용어/데이터/검증/권한)와 달리, 도메인당 1문서를 동적으로 산출한다
 * (buildDocSet 이 input.domainPolicies 를 매핑). 각 문서 구조:
 *   §1 도메인 구성(멤버 클래스) · §2 업무 흐름 · §3 조건 분기(위치·조건식=확정)
 * 분기의 **위치·조건식은 결정론 [확정]**, 그게 권한/상태/계산 중 무엇인지·업무 의미는
 * PD4 LLM 보강에서 [추정]으로 판정한다(여기선 분류·합성하지 않는다). 분기 0이면 "조건 없음"을
 * 근거와 함께 단정(가치 있는 발견).
 */
import type { DocInput } from '../builders/index.js'
import { inferred } from '../builders/shared.js'
import type { GeneratedDoc, Section, TableRow } from '../types.js'
import type { MethodologyModule } from './types.js'
import type { DomainPolicyInput } from '../../domain-policy/types.js'

const BRANCH_KIND_KO: Record<string, string> = {
  if: 'if 조건',
  switch: 'switch 분기',
  ternary: '삼항(조건부 값/계산)',
}

/** §1 도메인 구성 — 멤버 클래스(파일 근거). */
function compositionSection(d: DomainPolicyInput): Section {
  const rows: TableRow[] = d.classes.map((c) => ({
    cells: [c.className, c.relPath],
    confidence: 'CONFIRMED',
    evidence: [{ file: c.relPath, line: null }],
  }))
  return {
    heading: '도메인 구성',
    key: 'domain-composition',
    claims: rows.length === 0 ? [inferred('도메인 멤버 클래스가 확인되지 않았습니다(경계 확정 필요).')] : [],
    table: { columns: ['클래스', '파일'], rows },
  }
}

/** §2 업무 흐름 — skeleton flow 진입점. */
function flowSection(d: DomainPolicyInput): Section {
  const rows: TableRow[] = d.flows.map((f) => ({
    cells: [f.name, f.entry ? `${f.entry.file}:${f.entry.line}` : '—'],
    confidence: f.entry ? 'CONFIRMED' : 'INFERRED',
    evidence: f.entry ? [{ file: f.entry.file, line: f.entry.line }] : [],
  }))
  return {
    heading: '업무 흐름',
    key: 'domain-flows',
    claims: rows.length === 0 ? [inferred('확정된 흐름이 없습니다(skeleton 미생성 또는 단순 도메인).')] : [],
    table: { columns: ['흐름', '진입점'], rows },
  }
}

/**
 * §3 조건 분기 — 도메인 경계 안 결정 지점. 위치·조건식·종류(if/switch/삼항)는 [확정],
 * 업무 분류(권한/상태/계산)·의미는 PD4 보강 [추정]. 분기 0이면 "조건 없음" 단정.
 */
function branchSection(d: DomainPolicyInput): Section {
  const rows: TableRow[] = d.branches.map((b) => ({
    cells: [b.methodName ?? '—', b.condition, BRANCH_KIND_KO[b.kind] ?? b.kind],
    confidence: 'CONFIRMED',
    evidence: [{ file: b.relPath, line: b.line }],
  }))
  return {
    heading: '조건 분기 (위치·조건식 = 확정 · 업무분류 = PD4 보강)',
    key: 'domain-branches',
    claims:
      rows.length === 0
        ? [inferred('조건 분기가 발견되지 않음 — 이 도메인은 무조건 흐름(조건부 정책 부재). 분기 없음을 코드 근거로 단정.')]
        : [],
    table: { columns: ['메서드', '조건식', '분기 종류'], rows },
  }
}

/** 한 도메인의 정책서를 조립한다(docId=policy-domain-<key>). */
export function buildDomainPolicyDoc(d: DomainPolicyInput): GeneratedDoc {
  return {
    docId: `policy-domain-${d.key}`,
    title: `도메인 정책 — ${d.name}`,
    methodology: 'domain-policy',
    sections: [compositionSection(d), flowSection(d), branchSection(d)],
  }
}

/** domain-policy 모듈 — 도메인당 1문서를 동적 산출(결정론: 입력 순서 = PD3 가 키 정렬). */
export const domainPolicyMethodology: MethodologyModule = {
  id: 'domain-policy',
  title: '도메인 정책서(domain-policy)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return (input.domainPolicies ?? []).map(buildDomainPolicyDoc)
  },
}
