import { type ScreensConfig } from '../config/index.js';
import { type CensusRoute } from './triage.js';
/** 빌드 시스템 관측 신호 — OnDisk 가 수집, 순수 함수는 이것만 본다. */
export interface BuildSignals {
    /** ./mvnw 존재 여부. */
    hasMvnw: boolean;
    /** ./gradlew 존재 여부. */
    hasGradlew: boolean;
    /** pom.xml 원문(없으면 null). */
    pomXml: string | null;
    /** build.gradle(.kts) 원문(없으면 null). */
    buildGradle: string | null;
}
export interface ScaffoldInput {
    routes: CensusRoute[];
    /** routes.json 의 contextPath(없으면 null) — baseUrl 경로 추정 근거. */
    contextPath: string | null;
    build: BuildSignals;
}
export interface ScaffoldSummary {
    routesTotal: number;
    seedUrls: number;
    baseUrl: string;
    /** 감지된 기동 명령(미감지 = null — 설정에서 생략됨). */
    startCommand: string[] | null;
    /** 감지 근거 한 줄(예: "pom.xml cargo-maven3-plugin + mvnw"). */
    startCommandSource: string | null;
    /** 클라이언트 라우팅 SPA 의심(결함 1) — 라우트 존재 + GET-safe 시드 0건. */
    spaSuspected: boolean;
    /** 사람이 확인해야 하는 항목(한국어) — 호출부가 그대로 출력한다. */
    notes: string[];
}
/** 빌드 신호 → startCommand 감지. 확신 없으면 null(생략) — 오추정보다 공백이 낫다. */
export declare function detectStartCommand(build: BuildSignals): {
    command: string[] | null;
    source: string | null;
};
/**
 * 순수 스캐폴딩 — routes census + 빌드 신호에서 screens 초안을 만든다.
 * 반환 screens 는 스키마 통과분(zod 기본값 미평가 상태 아님 — 호출부가 parse 로 실체화).
 */
export declare function scaffoldScreensConfig(input: ScaffoldInput): {
    screens: ScreensConfig;
    summary: ScaffoldSummary;
};
/**
 * 디스크 스캐폴딩 — routes.json 을 읽어 초안을 만들고 understanding.config.json 에 기록.
 * 선행 부재(config·routes.json)와 기존 섹션 덮어쓰기(force 없이)는 throw — fail-closed.
 */
export declare function scaffoldScreensConfigOnDisk(projectRoot: string, opts?: {
    force?: boolean;
}): {
    configPath: string;
    summary: ScaffoldSummary;
};
//# sourceMappingURL=scaffold.d.ts.map