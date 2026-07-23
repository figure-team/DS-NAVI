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
/** 테스트 파일 판별 — src/test 소스루트 또는 파일명 관례. */
const TEST_PATH_RE = /(^|\/)(src\/)?tests?\//i;
const TEST_NAME_RE = /(Test|Tests|Spec|IT|ITCase|TestCase)\.(kt|java|scala|groovy)$/;
/** 소스 확장자. */
const SOURCE_EXT_RE = /\.(kt|java|scala|groovy)$/;
/** 파일명 관례로 테스트인가(경로 또는 이름). */
export function isTestFile(relPath) {
    return SOURCE_EXT_RE.test(relPath) && (TEST_PATH_RE.test(relPath) || TEST_NAME_RE.test(relPath));
}
/** 확장자 제거한 basename. */
function baseName(relPath) {
    return (relPath.split('/').pop() ?? relPath).replace(/\.[^.]+$/, '');
}
/** 테스트 파일명 basename 이 `<prodClass>(Test|Tests|Spec|IT|ITCase|TestCase)` 관례에 맞나. */
function matchesConvention(testClass, prodClass) {
    return new RegExp(`^${prodClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(Test|Tests|Spec|IT|ITCase|TestCase)$`).test(testClass);
}
/** 소스에서 식별자별 최초 등장 라인 맵(1-기반). */
function firstLineByIdentifier(content) {
    const out = new Map();
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const ids = lines[i].match(/[A-Za-z_][A-Za-z0-9_]*/g);
        if (!ids)
            continue;
        for (const id of ids)
            if (!out.has(id))
                out.set(id, i + 1);
    }
    return out;
}
/**
 * 테스트 파일들 → TestLinkModel. knownProdClasses(그래프 flow/step 파일 basename, 테스트 제외)를
 * 테스트 파일이 whole-word 로 참조하면 링크한다. 참조 없으면 링크 없음(합성 금지).
 * 자기 자신(테스트 클래스명)이 knownProdClasses 에 없으므로 자기참조는 자연 배제된다.
 */
export function buildTestLinkModel(testFiles, knownProdClasses) {
    const byProdClass = {};
    if (knownProdClasses.size === 0)
        return { byProdClass };
    // relPath ASC 로 링크 순서 결정론 고정.
    for (const { relPath, content } of [...testFiles].sort((a, b) => (a.relPath < b.relPath ? -1 : 1))) {
        const testClass = baseName(relPath);
        const firstLine = firstLineByIdentifier(content);
        for (const prodClass of knownProdClasses) {
            const line = firstLine.get(prodClass);
            if (line === undefined)
                continue;
            const link = {
                testFile: relPath,
                testClass,
                prodClass,
                line,
                convention: matchesConvention(testClass, prodClass),
            };
            (byProdClass[prodClass] ??= []).push(link);
        }
    }
    return { byProdClass };
}
/** 모델이 비었나(테스트 링크 신호 전무). */
export function isTestLinkModelEmpty(model) {
    return !model || Object.keys(model.byProdClass).length === 0;
}
//# sourceMappingURL=test-links.js.map