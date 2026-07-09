/**
 * computeChangeImpact(절차 B) — 요청(REQ) 철회의 영향을 RTM 역추적으로 산정한다. 순수 함수.
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §8(4. 영향 분석). 변경영향분석서(05)의 데이터 소스.
 * 철회 대상 요청의 요구사항 → changeset 기능 → (역추적) 영향 분류 + 다운스트림 의존 끊김 +
 * 인수조건/시험 + 산출물(SI 문서) + 후속조치(데이터 파기·회귀시험)를 결정론으로 모은다.
 *
 * LLM 은 이 구조화 결과를 템플릿에 채울 뿐 — 강제하지 않고 **가시화**(critic 규약).
 */
import type { RtmModel } from './types.js';
/** 영향 기능 분류 — 계획취소(미착수) / 회귀(실 코드 영향) / 타요구로 유지. */
export type ChangeImpactClass = 'cancel-planned' | 'regression' | 'retained-other-req';
export interface ChangeImpactFunction {
    id: string;
    name: string;
    state: string;
    origin: string;
    classification: ChangeImpactClass;
    /** 분류 근거(사람이 읽는 한 줄). */
    reason: string;
}
export interface ChangeImpactReport {
    requestId: string;
    /** 철회 대상 요청에 속한 요구사항(폐기 예정). */
    requirements: {
        id: string;
        text: string;
        category: string;
        status: string;
    }[];
    /** 역추적된 영향 기능(분류 포함). */
    functions: ChangeImpactFunction[];
    /** 폐기 요구를 dependsOn 하던 ACTIVE 요구사항(의존 끊김 — 재검토 필요). */
    downstreamDependents: {
        id: string;
        dependsOn: string[];
    }[];
    /** 폐기 대상 요구의 인수조건(검증 NA 전환 대상). */
    acceptanceCriteria: {
        reqId: string;
        acId: string;
        text: string;
        testCount: number;
    }[];
    /** 영향 기능이 반영된 SI 산출물(개정 대상). */
    deliverables: {
        docId: string;
        anchor: string | null;
    }[];
    /** 후속조치 체크리스트(데이터 파기·회귀시험·문서개정·의존 재검토). */
    followUps: string[];
}
/**
 * 요청 reqId 철회의 영향 리포트. 대상 요구사항(현 상태 무관 — 철회 *예정* 기준)을 모아 역추적한다.
 * functions/deliverables/AC 등 모든 배열은 id ASC 정렬(byte-identical 재실행).
 */
export declare function computeChangeImpact(model: RtmModel, reqId: string): ChangeImpactReport;
//# sourceMappingURL=change-impact.d.ts.map