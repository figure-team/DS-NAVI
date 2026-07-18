import { type Screen } from './types.js';
export interface ViewResolverConfig {
    /** WEB-INF 를 품은 웹앱 루트(repo 상대, 예 "src/main/webapp"). */
    webappRoot: string;
    prefix: string;
    suffix: string;
}
/** webapp XML 들에서 ViewResolver prefix/suffix 설정을 결정론 추출한다. */
export declare function loadViewResolverConfigs(projectRoot: string): ViewResolverConfig[];
/** 뷰 이름 → repo 실경로(실존 파일만). redirect:/forward: 류는 해석하지 않는다. */
export declare function resolveViewName(viewName: string, configs: ViewResolverConfig[], existsRel: (rel: string) => boolean): string | null;
/**
 * 선언 라인부터 중괄호 균형으로 메서드 본문을 잘라 `return "…"`/`ModelAndView("…")`
 * 리터럴을 걷는다(등장 순서, 중복 제거). 선언~여는 중괄호 사이 간격은 10줄까지 허용.
 */
export declare function extractReturnViewNames(sourceLines: string[], declLine: number): string[];
export interface ViewResolveSummary {
    total: number;
    /** 뷰 이름 문자열이던 jspFile 을 실경로로 치환한 화면 수. */
    rewritten: number;
    /** null 이던 jspFile 을 라우트→메서드 리터럴로 채운 화면 수. */
    filledFromRoute: number;
    /** 분기 뷰(해석 결과 2+)라 채우지 않은 화면 수(fail-open). */
    ambiguous: number;
    /** 여전히 jspFile 이 없는 화면 수. */
    unresolved: number;
    /** 발견한 리졸버 설정 수(0 이면 전체 no-op). */
    configs: number;
}
export declare function resolveScreenViews(screens: Screen[], projectRoot: string): {
    screens: Screen[];
    summary: ViewResolveSummary;
};
/** screens.json 을 읽어 뷰 해석 후 기록한다(단독 op) — unmatchedJsps 도 재계산. */
export declare function resolveScreenViewsOnDisk(projectRoot: string): {
    screensPath: string;
    summary: ViewResolveSummary;
};
//# sourceMappingURL=view-resolve.d.ts.map