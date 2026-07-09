/**
 * 생성예측(보완 A) 생성 코어 — `[변경]`/`[생성]`/`[영향]` 3분류(A-A3/A-A4).
 *
 * 원칙(스펙 T1/T2, AC-13/13b/13c/14):
 *  - net-new(`[생성]`)는 **절대 CONFIRMED 불가** — 최대 `[추정]`(INFERRED). 존재하지
 *    않는 파일은 기계검증 대상이 아니다. 단 *선례 앵커 자체*는 실존 파일이라 CONFIRMED.
 *  - 선례 강/부분: 구체 파일·심볼 + 선례 file:line 앵커(`[추정]`).
 *  - 선례 없음: **역할 단위 스캐폴드** + 프로젝트 관례 앵커(`[확인 필요]`) — **구체
 *    파일명을 지어내지 않는다**(suggestedPath=null).
 *  - `[변경]`(기존 파일)은 앵커 실존 검증 통과 시 CONFIRMED(기존 코드 기계검증).
 *  - read-only 분석물(doc-state DRAFT→APPROVED 밖) — 발행은 doc.ts 가 담당.
 *
 * 결정론: 모든 배열 정렬, 고정 규칙. host 자연어는 받지 않는다(intent 신호만).
 */
import type { Confidence, CitationStatus } from '../types.js';
import type { CensusReport } from '../domain-map/types.js';
import { type PrecedentCandidate, type PrecedentIntent, type PrecedentRole } from './precedents.js';
import type { ImpactResult } from './types.js';
export type PrecedentStrength = 'strong' | 'partial' | 'none';
export interface AnchorRef {
    file: string;
    line: number;
    status: CitationStatus;
    /** 앵커가 실존(ok)이면 그 앵커는 CONFIRMED 로 인용 가능. */
    confirmed: boolean;
}
/** 기존 파일 변경 처방(`[변경]`) — 앵커 실존 시 CONFIRMED 가능. */
export interface ChangeItem {
    relPath: string;
    /** 심볼 단위 처방(AC-14) — 예: "SecurityConfig에 OAuth 필터 등록". */
    symbols: string[];
    anchor: AnchorRef;
    confidence: Confidence;
}
/** 신규 생성 처방(`[생성]`) — net-new, 절대 CONFIRMED 불가. */
export interface CreateItem {
    /** 역할(controller/service/...) 또는 스캐폴드 역할명. */
    role: PrecedentRole | string;
    /** 선례 강/부분: 구체 경로; 선례 없음: null(파일명 지어내지 않음). */
    suggestedPath: string | null;
    /** 심볼 처방(AC-14) — 예: "KakaoLoginController.kakaoCallback()". */
    symbols: string[];
    /** 선례 앵커(실존 파일) — 앵커 자체는 CONFIRMED 가능. */
    precedentAnchors: AnchorRef[];
    /** 관례 앵커(역할의 기존 대표 파일) — 선례 없음 강등 시 grounding. */
    conventionAnchors: AnchorRef[];
    /** strong/partial → INFERRED, none → UNVERIFIED. **CONFIRMED 금지.** */
    confidence: Confidence;
    strength: PrecedentStrength;
}
/** 영향(`[영향]`) — reachability(impact 결과 재사용). */
export interface SuggestionImpactItem {
    ref: string;
    kind: 'upstream' | 'api' | 'flow' | 'domain';
    confidence: Confidence;
}
export interface CreationSuggestion {
    intent: PrecedentIntent;
    entityHint: string;
    strength: PrecedentStrength;
    /** 선택된 선례 흐름(없으면 null). */
    precedentFlowId: string | null;
    change: ChangeItem[];
    create: CreateItem[];
    impact: SuggestionImpactItem[];
    /** L1 하드게이트 위반 사유(있으면 fail) — assertCreationL1 이 검사. */
    l1Violations: string[];
}
export declare class CreationL1Error extends Error {
    violations: string[];
    constructor(violations: string[]);
}
export interface CreationParams {
    intent: PrecedentIntent;
    /** 신규 산출물 명명 토큰(예: "KakaoLogin"). */
    entityHint: string;
    /** 사용자가 선택한 선례(F2). 없으면 선례없음 강등(A-A3). */
    precedent: PrecedentCandidate | null;
    /** host 가 지목한 기존 변경 파일 + 라인 + 심볼 처방. */
    changeTargets?: Array<{
        relPath: string;
        line: number;
        symbols?: string[];
    }>;
    /** 영향 reachability — analyzeImpact 결과. */
    impact: ImpactResult;
    /** 관례 앵커 탐색용 census(선례 없음 강등 시). */
    census: CensusReport;
    /** 신규 생성 역할 순서(선례 없음 스캐폴드 기본값). */
    scaffoldRoles?: PrecedentRole[];
}
/**
 * 3분류 생성예측 제안을 결정론으로 조립한다. confidence 규칙은 위 모듈 주석 참조.
 * L1 위반은 throw 하지 않고 l1Violations 로 수집한다(게이트는 assertCreationL1).
 */
export declare function buildCreationSuggestion(projectRoot: string, params: CreationParams): CreationSuggestion;
/**
 * L1 하드게이트 검사 — 위반 사유 배열(빈 배열 = 통과). CI 가 이 게이트를 하드로 건다.
 *  1) net-new(`[생성]`) 항목은 CONFIRMED 금지(최대 INFERRED).
 *  2) 모든 선례/관례 앵커는 실존(ok)해야 한다(환각 앵커 차단).
 *  3) 선례 없음 강등 항목은 구체 파일명(suggestedPath) 금지.
 *  4) 3버킷(change/create/impact)이 구조적으로 존재.
 */
export declare function checkCreationL1(s: CreationSuggestion): string[];
/** L1 위반이 있으면 throw(fail-closed) — 하드 게이트가 필요한 발행 경로에서 호출. */
export declare function assertCreationL1(s: CreationSuggestion): void;
//# sourceMappingURL=supplement-a.d.ts.map