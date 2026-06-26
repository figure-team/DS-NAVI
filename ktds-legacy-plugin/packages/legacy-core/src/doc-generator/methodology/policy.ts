/**
 * policy 방법론 모듈(Layer 2) — 정책 신호(PolicySignal, P1)를 카테고리별 정책서로 묶는다.
 *
 * 기존 9종(as-built/si-standard)이 코드 100% 추출인 반면, 정책서는 규범 문서다. 이 모듈은
 * 결정론으로 확보한 **앵커(file:line)** 만 표 행으로 싣는다. 역할 표현식·규범 의미 같은 값은
 * 후속(P3)에서 LLM 이 앵커 소스를 읽어 보강하고 [추정] 표기한다(여기선 지어내지 않는다).
 *
 * PoC 4종: glossary(용어) / data(데이터 제약) / validation(업무규칙) / authz(권한). 신호가
 * 없으면 빈 표 + INFERRED 안내 claim(신호 스캐너 미실행 또는 부재 — P3 보강 대상).
 */
import type { DocInput } from '../builders/index.js'
import { inferred } from '../builders/shared.js'
import type { GeneratedDoc, Section, TableRow } from '../types.js'
import type { MethodologyModule } from './types.js'
import type { PolicyCategory, PolicySignal } from '../../policy/types.js'

/** 입력에서 한 카테고리의 신호만 필터(정렬은 신호 스캐너가 보장). */
function signalsOf(input: DocInput, category: PolicyCategory): PolicySignal[] {
  const set = input.policySignals
  if (!set) return []
  return set.signals.filter((s) => s.category === category)
}

/** 단일 표 섹션 정책서 생성 — 신호 0이면 빈 표 + 안내 claim. */
function policyDoc(
  docId: string,
  title: string,
  key: string,
  heading: string,
  columns: string[],
  rows: TableRow[],
): GeneratedDoc {
  const section: Section = {
    heading,
    key,
    claims:
      rows.length === 0
        ? [inferred('수집된 정책 신호가 없습니다 — 신호 스캐너(P1) 미실행 또는 해당 신호 부재. P3 LLM 보강 대상.')]
        : [],
    table: { columns, rows },
  }
  return { docId, title, methodology: 'policy', sections: [section] }
}

/** 권한 정책 — 클래스/메서드 authz 어노테이션 통제 지점. */
function buildPolicyAuthz(input: DocInput): GeneratedDoc {
  const rows: TableRow[] = signalsOf(input, 'authz').map((s) => ({
    cells: [s.subject, s.detail, s.kind === 'method-authz' ? '메서드' : '클래스'],
    confidence: s.confidence,
    evidence: [s.anchor],
  }))
  return policyDoc('policy-authz', '권한 정책', 'authz-points', '권한 통제 지점', ['대상', '권한 어노테이션', '범위'], rows)
}

/** 업무 규칙(Validation) — 필드 bean-validation 어노테이션. */
function buildPolicyValidation(input: DocInput): GeneratedDoc {
  const rows: TableRow[] = signalsOf(input, 'validation').map((s) => ({
    cells: [s.subject, s.detail],
    confidence: s.confidence,
    evidence: [s.anchor],
  }))
  return policyDoc('policy-validation', '업무 규칙(Validation) 정책', 'validation-rules', '입력 검증 규칙', ['대상 필드', '검증 어노테이션'], rows)
}

/** 데이터 정책 — DDL 제약(NOT NULL/PK/UNIQUE/FK/CHECK). */
const DATA_KIND_KO: Record<string, string> = {
  'not-null': 'NOT NULL',
  'primary-key': '기본키(PK)',
  unique: '유니크(UNIQUE)',
  fk: '외래키(FK)',
  check: 'CHECK',
}
function buildPolicyData(input: DocInput): GeneratedDoc {
  const rows: TableRow[] = signalsOf(input, 'data').map((s) => ({
    cells: [s.subject, DATA_KIND_KO[s.kind] ?? s.kind, s.detail],
    confidence: s.confidence,
    evidence: [s.anchor],
  }))
  return policyDoc('policy-data', '데이터 정책', 'data-constraints', '데이터 제약', ['대상', '제약', '내용'], rows)
}

/** 용어/도메인 사전 — DB 테이블/컬럼주석 + Java enum. */
const GLOSSARY_SRC_KO: Record<string, string> = {
  table: 'DB 테이블',
  'column-comment': 'DB 컬럼주석',
  enum: 'Java enum',
}
function buildPolicyGlossary(input: DocInput): GeneratedDoc {
  const rows: TableRow[] = signalsOf(input, 'glossary').map((s) => ({
    cells: [s.subject, s.detail, GLOSSARY_SRC_KO[s.kind] ?? s.kind],
    confidence: s.confidence,
    evidence: [s.anchor],
  }))
  return policyDoc('policy-glossary', '용어/도메인 사전', 'glossary-terms', '용어 정의', ['용어', '정의/주석', '출처'], rows)
}

/** policy 모듈 — PoC 4종 정책서를 고정 순서로 산출(결정론). */
export const policyMethodology: MethodologyModule = {
  id: 'policy',
  title: '정책서(policy)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return [
      buildPolicyGlossary(input),
      buildPolicyData(input),
      buildPolicyValidation(input),
      buildPolicyAuthz(input),
    ]
  },
}
