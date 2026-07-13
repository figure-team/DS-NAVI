/**
 * CONFIRM 게이트(S7) — 확정 플랜에 대한 순수 연산 + 영속화.
 *
 * 자동 도메인 경계는 전문가 일치율 상한이 낮아 사람 게이트를 생략할 수 없다.
 * 결정은 domain-plan.confirmed.json 으로 영속되어 재실행의 결정론 닻이 된다.
 * 모든 순수 함수는 새 플랜 객체를 반환하며 입력을 변형하지 않는다(불변).
 * 모든 도메인/루트/aliasKeys/excludedKeys 는 정렬되어 byte-identical 을 보장한다.
 */
import type { CandidatesReport, ConfirmedPlan, DomainConfidence, PlanOp } from './types.js';
/** 후보를 그대로 수용하는 플랜 — 인터랙티브 세션/--auto-approve 의 시작점. */
export declare function buildAutoPlan(candidates: CandidatesReport, decidedBy?: string): ConfirmedPlan;
/**
 * 그룹 생성·확장(멱등 upsert) — 상단도메인(DOMAIN_HIERARCHY D1)을 plan 에 기록한다.
 * 같은 key 재호출 시 members 합집합 + name 갱신. 불변 규칙:
 * `g:` 접두 필수 / member 는 실존 도메인 / 한 도메인은 최대 1개 그룹(다른 그룹
 * 소속 member 는 오류 — LLM 초안의 중복 배정을 fail-closed 로 잡는다).
 */
export declare function groupDomains(plan: ConfirmedPlan, key: string, name: string, members: string[]): ConfirmedPlan;
/** 그룹 해체 — 그룹만 사라지고 소속 도메인은 잔존(비파괴). 마지막 그룹이면 필드 생략. */
export declare function ungroupDomains(plan: ConfirmedPlan, key: string): ConfirmedPlan;
/** 개명 — 표시명만 바꾼다(key 는 skeleton ID 의 닻이라 불변). AC-31: LLM 제안명 적용 지점. */
export declare function renameDomain(plan: ConfirmedPlan, key: string, newName: string): ConfirmedPlan;
/** 병합 — from 의 루트를 into 로 흡수, from key 를 into.aliasKeys 에 기록 후 from 도메인 제거. */
export declare function mergeDomains(plan: ConfirmedPlan, fromKey: string, intoKey: string): ConfirmedPlan;
/**
 * 이동 — 루트 파일을 다른 도메인으로 옮긴다.
 * 마지막 루트가 빠진 도메인은 사라진다(빈 도메인은 skeleton 에서 무의미).
 */
export declare function moveRoot(plan: ConfirmedPlan, root: string, toKey: string): ConfirmedPlan;
/** 제외 — 도메인을 빼고 key 를 excludedKeys 에 기록(정렬, 감사 추적). */
export declare function excludeDomain(plan: ConfirmedPlan, key: string): ConfirmedPlan;
/**
 * ops 파일 파싱 — 형식 오류는 어떤 항목이 왜 틀렸는지 명확히 던진다(조용한 스킵 금지).
 */
export declare function parsePlanOps(raw: unknown): PlanOp[];
/**
 * 보정 연산 순차 적용 — 자동 플랜 위에 사람 결정을 결정론적으로 재생한다.
 * 각 연산은 기존 순수 함수(merge/move/exclude/rename)로 위임하며, 존재하지 않는
 * key/root 는 해당 함수가 몇 번째 연산인지 식별 가능한 오류로 던진다.
 */
export declare function applyOps(plan: ConfirmedPlan, ops: PlanOp[]): ConfirmedPlan;
/**
 * 드리프트 감지 — confirmed 이후 코드가 변해 후보가 달라진 경우.
 * addedRoots: 현재 후보에 새로 생겼지만 플랜이 모르는 루트(재확정 필요 신호).
 * removedRoots: 플랜이 알지만 현재 후보에 없는 루트(삭제/이동됨).
 */
export declare function detectPlanDrift(plan: ConfirmedPlan, freshCandidates: CandidatesReport): {
    addedRoots: string[];
    removedRoots: string[];
};
/** 게이트 제시용 표 행 — 데이터만 반환(엔진은 콘솔 포매팅을 하지 않는다). */
export interface PlanRow {
    key: string;
    name: string;
    rootCount: number;
    entryCount: number;
    fileCount: number;
    /** 증거 확신도 — 후보(candidates) 소스에서만 존재(확정 플랜은 미보유). */
    confidence?: DomainConfidence;
}
/**
 * 후보 또는 확정 플랜을 결정론적 표 행 배열로 변환한다(key 정렬).
 * 후보는 entryCount/파일수를 직접 안다. 확정 플랜은 도메인 멤버십만 알므로
 * entryCount/fileCount 를 0 으로 둔다(라우트/슬라이스는 재스캔의 책임).
 */
export declare function planTable(source: CandidatesReport | ConfirmedPlan): PlanRow[];
export { writeConfirmedPlan, readConfirmedPlan } from './persist.js';
//# sourceMappingURL=confirm.d.ts.map