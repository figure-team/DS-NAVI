/**
 * 도메인 정책서 — 분기 신호(PD1) 데이터 계약. zod 스키마 + z.infer.
 *
 * 분기 스캐너는 Java 소스의 **결정 지점**(if/else if/switch/삼항)과 **조건식 원문**을
 * file:line + 소속 클래스/메서드와 함께 수집한다. 이 신호의 위치·조건식은 결정론 `[확정]`,
 * 그 분기가 업무 정책인지·의미는 후속(PD4 LLM 보강)에서 `[추정]`으로 판정한다(합성 금지).
 */
import { z } from 'zod'

/** `.spec/map/` 정규 산출물 파일명. */
export const BRANCH_SIGNALS_FILENAME = 'branch-signals.json'

/** 분기 종류 — if(else if 포함)/switch/삼항. */
export const BranchKindSchema = z.enum(['if', 'switch', 'ternary'])
export type BranchKind = z.infer<typeof BranchKindSchema>

/** 단일 분기 신호 — 결정 지점 1개. */
export const BranchSignalSchema = z.object({
  relPath: z.string(),
  line: z.number().int().positive(),
  /** 소속 클래스명(없으면 null — 톱레벨 외 드뭄). */
  className: z.string().nullable(),
  /** 소속 메서드/생성자명(없으면 null — 필드 초기화 등). */
  methodName: z.string().nullable(),
  kind: BranchKindSchema,
  /** 조건식 원문(공백 정규화, 바깥 괄호 제거). 합성 아님 — 소스 그대로. */
  condition: z.string(),
  /**
   * 처리 본문 요약(THEN) — if 의 consequence 블록 / 삼항의 "결과 : 대안" (공백 정규화·중괄호
   * 제거·길이 캡). switch 는 케이스별이라 공란. 의사결정 테이블 THEN 의 결정론 시드(원문 [확정],
   * 업무 의미는 LLM 보강 [추정]). 합성 아님.
   */
  then: z.string(),
})
export type BranchSignal = z.infer<typeof BranchSignalSchema>

/**
 * 도메인 정책서 1개의 조립 입력(PD2/PD3) — PD3 가 confirmed-plan + skeleton + 분기신호로
 * 채우고, domain-policy 방법론(PD2)이 GeneratedDoc 으로 렌더한다. 영속 산출이 아니라
 * 메모리 계약이라 zod 대신 interface(분기는 이미 BranchSignal 로 검증됨).
 */
export interface DomainPolicyInput {
  /** 도메인 키(불변, 파일명 닻 — docId=policy-domain-<key>). */
  key: string
  /** 표시명(confirmed-plan.name). */
  name: string
  /** 멤버 클래스(파일 근거) — §0 관련 산출물·§1 적용 범위. */
  classes: Array<{ className: string; relPath: string }>
  /** 업무 흐름(진입점 file:line) — §1 적용 범위 보강. */
  flows: Array<{ name: string; entry: { file: string; line: number } | null }>
  /** 결정 지점(PD1, 경계 한정) — §4 의사결정 테이블 IF/THEN + §6 처리 흐름의 시드. */
  branches: BranchSignal[]
  /** §2 용어 — DB 주석/enum(없으면 빈 → 스캐폴드). */
  terms?: Array<{ term: string; definition: string; note: string; evidence: { file: string; line: number } | null }>
  /** §3 상태값 — 코드 테이블 행/enum(없으면 빈 → 스캐폴드·미결). */
  statusCodes?: Array<{
    group: string
    code: string
    name: string
    desc: string
    evidence: { file: string; line: number } | null
  }>
}

/** branch-signals.json — 분기 신호 산출물(결정론: relPath/line/kind/condition 정렬). */
export const BranchSignalSetSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /** 스캔한 파일 수. */
  fileCount: z.number().int().nonnegative(),
  signals: z.array(BranchSignalSchema),
})
export type BranchSignalSet = z.infer<typeof BranchSignalSetSchema>
