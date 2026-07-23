/**
 * 테스트 → 기능(프로덕션 클래스) 결정론 링크(RTM 테스트 축).
 *
 * 배경(2026-07-23): m-project 처럼 Kotlin 테스트가 257개 실재하는데 RTM 테스트 축이 전 기능
 * UNVERIFIED·evidence 0 으로 나왔다(축 신호 미배선). map-scan 이 test↔기능 연결을 안 만든다.
 *
 * 언어 무관 접근(Java/Kotlin/Scala 공통): 테스트 파일이 참조하는 **프로덕션 클래스 basename**
 * (그래프의 flow/step 파일명)을 whole-word 로 대조해 링크한다. 합성 금지 — 근거(테스트 file:line)가
 * 실재할 때만 링크하고, 파일명 관례(`XxxTest`→`Xxx`)면 CONFIRMED, 참조-only 면 INFERRED.
 *
 * 결정론: 입력 정렬 보존, (table, crud) 대신 (prodClass, testFile) 최초 등장 라인만 근거로 남긴다.
 */
/** 파일명 관례로 테스트인가(경로 또는 이름). */
export declare function isTestFile(relPath: string): boolean;
/** 테스트 → 프로덕션 클래스 링크 1건. */
export interface TestLink {
    /** 테스트 파일 relPath. */
    testFile: string;
    /** 테스트 클래스(파일 basename). */
    testClass: string;
    /** 링크된 프로덕션 클래스 basename. */
    prodClass: string;
    /** 테스트 파일에서 prodClass 최초 참조 라인(1-기반). */
    line: number;
    /** 파일명 관례(`<prodClass>Test` 등) 일치 — CONFIRMED 판정 근거. */
    convention: boolean;
}
/** 프로덕션 클래스 basename → 테스트 링크 목록. */
export interface TestLinkModel {
    byProdClass: Record<string, TestLink[]>;
}
/**
 * 테스트 파일들 → TestLinkModel. knownProdClasses(그래프 flow/step 파일 basename, 테스트 제외)를
 * 테스트 파일이 whole-word 로 참조하면 링크한다. 참조 없으면 링크 없음(합성 금지).
 * 자기 자신(테스트 클래스명)이 knownProdClasses 에 없으므로 자기참조는 자연 배제된다.
 */
export declare function buildTestLinkModel(testFiles: Array<{
    relPath: string;
    content: string;
}>, knownProdClasses: ReadonlySet<string>): TestLinkModel;
/** 모델이 비었나(테스트 링크 신호 전무). */
export declare function isTestLinkModelEmpty(model: TestLinkModel | null | undefined): boolean;
//# sourceMappingURL=test-links.d.ts.map