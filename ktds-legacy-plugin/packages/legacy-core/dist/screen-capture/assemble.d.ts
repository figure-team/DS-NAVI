import { type Annotation, type MissingScreen, type Screen, type ScreensFile } from './types.js';
/**
 * 관측 콘텐츠 시그니처 — 서버측 forward(다른 URL, 같은 렌더) 감지용.
 * title/헤딩만으로는 판별력이 없어(전 페이지 title 동일한 레거시 흔함)
 * 주석의 기계 사실(kind|name|href/formAction|label) 집합을 함께 해시한다.
 */
export declare function computeContentSignature(input: {
    title: string;
    headings: string[];
    annotations: Annotation[];
}): string;
/** mechanical 사실 투영 — Stage B 가 수정할 수 없는 부분만 추출. */
export declare function mechanicalProjection(screens: Screen[]): Array<{
    id: string;
    annotations: unknown[];
}>;
/**
 * mechanical 투영의 sha256 — Stage B 변조 기계검증 앵커.
 * missing 트리아지(§2.1)도 Stage A 기계 사실이라 해시 범위에 포함하되, 트리아지가
 * 하나도 없는 파일(구버전 산출물)은 기존 투영 그대로 해시해 하위호환을 지킨다.
 */
export declare function computeMechanicalHash(screens: Screen[], missing?: MissingScreen[]): string;
export interface BuildScreensInput {
    generatedAt: string;
    gitCommit: string | null;
    baseUrl: string;
    viewport: {
        width: number;
        height: number;
    };
    screens: Screen[];
    fragments: string[];
    graphJsps: string[];
    missing: MissingScreen[];
}
/** screens.json 조립 — id ASC 정렬, unmatchedJsps 대조, zod 검증 후 반환. */
export declare function buildScreensFile(input: BuildScreensInput): ScreensFile;
/** 안정 직렬화 — 파일 기록용(byte-identical 결정론). */
export declare function serializeScreens(file: ScreensFile): string;
export interface ScreensValidationIssue {
    screenId: string | null;
    code: 'schema' | 'mechanical-hash-mismatch' | 'confirmed-without-evidence' | 'duplicate-screen-id' | 'duplicate-annotation-key';
    message: string;
}
export interface ScreensValidationStats {
    screenCount: number;
    annotationCount: number;
    /** action/link 주석 중 CONFIRMED handler 비율(0~1, 분모 0 이면 null). */
    confirmedActionRate: number | null;
    /** description 채움률(전체 주석 대비, 분모 0 이면 null). */
    descriptionRate: number | null;
    /** jspFile 매핑된 화면 비율(분모 0 이면 null). */
    jspMappedRate: number | null;
    unmatchedJspCount: number;
}
export interface ScreensValidationResult {
    ok: boolean;
    issues: ScreensValidationIssue[];
    stats: ScreensValidationStats | null;
}
/** Stage B 이후 게이트 검증 — 스키마/불변/근거 규칙 + 채움률 통계. */
export declare function validateScreensFile(raw: unknown): ScreensValidationResult;
//# sourceMappingURL=assemble.d.ts.map