/**
 * GeneratedDoc / RTM → xlsx 시트 변환(W7 P4-b).
 *
 * 열 구성은 md 렌더(render.ts)와 1:1 — 도메인 열 + 신뢰도 + 근거. 근거 셀은 md 의
 * 백틱 없이 `f:l, f2:l2`(엑셀 가독). 집계 행(INFERRED + '집계' 시작, W3 리뷰 L5)은
 * 강조행 스타일로 데이터 행과 시각 구분. 표 없는 섹션(prose/claims 전용)은 시트를
 * 만들지 않는다. 0행 표도 헤더는 출력(스캔했고 없음의 증거).
 */
import type { GeneratedDoc } from '../doc-generator/types.js';
import type { XlsxSheet } from './xlsx.js';
/** 문서정보 시트에 실을 메타(W7 비평 반영 — 표지·지위·태그 의미 안내). */
export interface XlsxDocMeta {
    sourceCommit?: string | null;
}
/** GeneratedDoc → 시트 목록(문서정보 + 표 보유 섹션당 1시트). 표 섹션 없으면 빈 배열. */
export declare function docToSheets(doc: GeneratedDoc, meta?: XlsxDocMeta): XlsxSheet[];
/** rtm.json 의 요구사항 1건(내보내기에 필요한 필드만 — 스키마는 rtm 모듈 소유). */
interface RtmRequirementLike {
    id: string;
    text: string;
    type?: string | null;
    nfrCategory?: string | null;
    priority?: string | null;
    lifecycle?: string | null;
    status?: string | null;
    dependsOn?: string[];
    source?: {
        kind?: string;
        raw?: string;
    } | null;
    acceptanceCriteria?: unknown[];
    /** 검수 사인오프(검증 스파인) — null 이면 미검수. */
    signoff?: {
        approver?: string | null;
        at?: string | null;
    } | null;
}
/** rtm.json 의 기능 1건(내보내기 필드만). entryPoint/implementation 은 grounded 값. */
interface RtmGroundedLike {
    value?: string | null;
    confidence?: string;
    evidence?: Array<{
        file: string;
        line: number | null;
    }>;
}
interface RtmFunctionLike {
    id?: string;
    featureId?: string;
    name?: string;
    domainName?: string;
    entryPoint?: RtmGroundedLike | null;
    implementation?: RtmGroundedLike | null;
    /** 시험 근거(검증 스파인) — value 비면 미시험. */
    test?: RtmGroundedLike | null;
    state?: string;
    requirementHistory?: string[];
    /** R7 사용자 정의 필드 값(key = custom:<id>). */
    custom?: Record<string, string>;
}
/** W5 테스트 시나리오 1건(내보내기 필드만). */
interface RtmScenarioLike {
    id?: string;
    fnId?: string;
    reqId?: string | null;
    acId?: string | null;
    kind?: string;
    title?: string;
    given?: string;
    when?: string;
    then?: string;
    confidence?: string;
    evidence?: Array<{
        file: string;
        line: number | null;
    }>;
    notes?: string[];
}
export interface RtmLike {
    requirements?: RtmRequirementLike[];
    functions?: RtmFunctionLike[];
    /** W5 단위테스트 시나리오(있으면 §4 시트). */
    testScenarios?: RtmScenarioLike[];
    /** R7 사용자 정의 필드 정의 — 기능 원장 동적 열. */
    customFields?: Array<{
        id?: string;
        label?: string;
    }>;
    /** 커버리지 요약(현황 뷰) — 있는 그대로 §3 시트로 평탄화. */
    coverage?: {
        requirements?: Record<string, unknown>;
        functions?: Record<string, unknown>;
        tests?: Record<string, unknown>;
        gaps?: Record<string, unknown>;
    } | null;
}
/**
 * RTM 원장 → 시트 5개(문서정보 + §1 요구사항 원장 + §2 기능(AS-IS) 원장 + §3 테스트
 * 시나리오(W5) + §4 커버리지 현황). 기능 원장에는 R7 사용자 정의 필드가 동적 열로 붙는다.
 * 검증 스파인(검수 signoff·시험 test)을 열로 승계 — 감리의 "검수 근거" 질의에 xlsx 로
 * 답할 수 있어야 한다(W7 비평 반영). 빈 원장도 헤더는 출력(빈 원장 결정과 정합).
 * 주: 대시보드 행단위 오버레이(rtm-overrides)는 미반영 — 문서정보 시트에 지위 명시,
 * 오버레이 병합은 백로그(설계 §10).
 */
export declare function rtmToSheets(rtm: RtmLike, meta?: XlsxDocMeta): XlsxSheet[];
export {};
//# sourceMappingURL=xlsx-docs.d.ts.map