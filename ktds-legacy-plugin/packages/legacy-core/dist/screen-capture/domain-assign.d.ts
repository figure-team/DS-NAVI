import { z } from 'zod';
import { type Screen } from './types.js';
/**
 * 화면→도메인 결정론 힌트 파일(결함 3, 축 D) — `.spec/map/` 아래. SPA 처럼 서버 렌더 신호가
 * 없어 ⓪①②③④ 가 전부 0표인 화면을, 사람이 화면 id → 확정 플랜 도메인 키로 직접 매핑한다.
 * assign 이 이걸 *최우선* 축으로 소비하므로 재실행해도 보존된다(과거엔 수동 screens[].domain 을
 * assign 이 미배정으로 덮어써, 우회가 산출물에만 남고 도구엔 안 남는 결함이 있었다).
 * 형식: { "screen:...": "domainKey", ... } — 키는 확정 플랜 도메인 key 여야 의미가 있다(강제 아님).
 */
export declare const SCREEN_DOMAIN_MAP_FILENAME = "screen-domain-map.json";
export declare const ScreenDomainMapSchema: z.ZodRecord<z.ZodString, z.ZodString>;
export type ScreenDomainMap = z.infer<typeof ScreenDomainMapSchema>;
export interface DomainAssignContext {
    /** 진입 루트 파일(relPath) → 확정 도메인 key. */
    domainByRoot: Map<string, string>;
    /** 파일 relPath → 소유 진입 루트 목록(slices.ownership, owners 비어있지 않은 것만). */
    ownersByFile: Map<string, string[]>;
    /** 확정 플랜 도메인 수 — 파생 그룹 상한 계산용(플랜 부재 시 0). */
    planDomainCount: number;
    /** 화면 id → 도메인 key 결정론 힌트(축 D, screen-domain-map.json). 부재는 빈 맵. */
    domainOverrides: Map<string, string>;
}
/** `.spec/map/` 의 확정 플랜·슬라이스에서 조인 컨텍스트를 만든다(부재는 빈 맵). */
export declare function loadDomainAssignContext(projectRoot: string): DomainAssignContext;
/**
 * 경로 목록에서 화면별 그룹 세그먼트를 파생한다(전 화면 공통 컨텍스트 필요 —
 * 화면 1장 단위가 아니라 목록 단위 순수 함수).
 *
 * 공통 디렉터리 접두(LCP)를 걷어낸 "첫 디렉터리 세그먼트"가 후보다. 후보 그룹 수가
 * cap 을 넘거나(폭발) 후보를 받는 화면이 절반 미만이면(접두가 의미 세그먼트를 먹음)
 * 접두를 한 단계씩 되물려 재시도한다. 어떤 접두 길이에서도 못 맞추면 전부 null.
 */
export declare function deriveFolderGroups(paths: Array<string | null>, cap: number): Array<string | null>;
export interface DomainAssignSummary {
    total: number;
    assigned: number;
    byMethod: {
        /** 축 D — screen-domain-map.json 결정론 힌트(최우선). */
        override: number;
        handlerJoin: number;
        viewFileJoin: number;
        viewFolder: number;
        urlFolder: number;
        /** 축 C — 시나리오 접미 토큰 → 플랜 키(SPA 폴백). */
        scenarioToken: number;
        unassigned: number;
    };
}
/**
 * 전 화면 domain 재배정(순수·멱등) — 기존 domain 값은 보지 않고 항상 새로 계산한다
 * (과거 실행·수동 편집의 낡은 값이 남지 않게. 사람 편집은 *-overrides 소관).
 */
export declare function assignScreenDomains(screens: Screen[], ctx: DomainAssignContext): {
    screens: Screen[];
    summary: DomainAssignSummary;
};
/** screens.json 을 읽어 재배정 후 기록한다(단독 op — 백필·confirm 재확정 후 재정합). */
export declare function assignScreenDomainsOnDisk(projectRoot: string): {
    screensPath: string;
    summary: DomainAssignSummary;
};
//# sourceMappingURL=domain-assign.d.ts.map