/**
 * 지원 수준 선언 — 변경 시 반드시:
 *  1) 해당 스캐너의 실코드 근거 확인, 2) `qa-coverage-matrix.mjs --write` 로 문서 재생성,
 *  3) 두 타깃 실측 검증 통과.
 */
export const COVERAGE_MATRIX = [
    {
        key: 'routes',
        label: '진입점(라우트)',
        byLang: {
            java: { tier: 'full', note: 'Spring(@RequestMapping 계열·composed·상수 해석)·Stripes' },
            xml: { tier: 'partial', note: 'web.xml 서블릿 매핑만' },
            jsp: { tier: 'partial', note: '페이지 파일 = 진입점(URL 관례)' },
            typescript: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
            tsx: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
            javascript: { tier: 'partial', note: 'Next.js 파일 라우팅(app/pages)' },
        },
    },
    {
        key: 'batch',
        label: '배치 진입점',
        byLang: {
            java: { tier: 'full', note: '@Scheduled·main()·Quartz Java API·Executor·Timer' },
            xml: { tier: 'partial', note: 'Quartz CronTrigger·task:scheduled·spring-batch 잡' },
            sh: { tier: 'partial', note: 'java 실행 라인 탐지' },
            bat: { tier: 'partial', note: 'java 실행 라인 탐지' },
            cmd: { tier: 'partial', note: 'java 실행 라인 탐지' },
        },
        exceptions: 'crontab 은 확장자 무관 경로 관례(crontab*/cron.d/)로 탐지 — 언어 행 없음',
    },
    {
        key: 'edges',
        label: '구조 의존(엣지)',
        byLang: {
            java: { tier: 'full', note: 'import·injection·field-type·ctor-param·extends/implements·impl' },
            xml: { tier: 'partial', note: '*Mapper.xml namespace ↔ 매퍼 인터페이스(MyBatis)' },
        },
    },
    {
        key: 'method-calls',
        label: '메서드 호출 그래프',
        byLang: {
            java: { tier: 'full', note: '8-receiver 해소(field/param/local/self/super/static/return-type/external)' },
        },
    },
    {
        key: 'interfaces',
        label: '대외 인터페이스',
        byLang: {
            java: { tier: 'full', note: '클라이언트 카탈로그(HTTP/WS/MQ/파일/소켓/메일)+config seam' },
            xml: { tier: 'partial', note: 'db-link 신호만' },
            sql: { tier: 'partial', note: 'db-link 신호만' },
        },
        // 리뷰 C8: 산출물에 나타나지 않는 "해석 보조"는 tier 축(산출 기준)과 분리해 각주로.
        exceptions: 'properties 는 ${…} endpoint 플레이스홀더 해석의 입력 보조일 뿐 항목을 생산하지 않음(산출 기준 none)',
    },
    {
        key: 'jpa',
        label: 'JPA/Spring Data',
        byLang: {
            java: { tier: 'full', note: '@Entity 계열·JpaRepository·파생쿼리·@Query(3-Tier 신뢰)' },
        },
    },
    {
        key: 'db-schema',
        label: 'DB 스키마',
        // 산출 스트림 2개: tables(.sql DDL/dataload) + liveDbSignals(빌드/설정 파일의
        // jdbc URL·드라이버 의존성 — discover.ts). java 는 어느 스트림에도 기여하지 않아
        // 행 없음(리뷰 C2 — 실코드 근거 없는 과대 주장 삭제).
        byLang: {
            sql: { tier: 'full', note: 'CREATE TABLE DDL·COMMENT·dataload INSERT(tables)' },
            xml: { tier: 'partial', note: 'liveDbSignals — pom.xml 드라이버 의존성·설정 jdbc URL' },
            properties: { tier: 'partial', note: 'liveDbSignals — 설정 jdbc URL' },
            yaml: { tier: 'partial', note: 'liveDbSignals — 설정 jdbc URL(application.yml 등)' },
            gradle: { tier: 'partial', note: 'liveDbSignals — *.gradle 드라이버 의존성' },
            kts: { tier: 'partial', note: 'liveDbSignals — *.gradle.kts 드라이버 의존성' },
        },
    },
    {
        key: 'complexity',
        label: '복잡도(위험 리포트)',
        byLang: {
            java: { tier: 'full', note: 'AST 결정 포인트 근사(McCabe) — 비 java 는 미측정 null + [미확인] 노트' },
        },
    },
];
/**
 * 계상 **제외** 언어(denylist) — 문서/마크업/자산/데이터/순수 설정.
 * 미지원 판정은 "여기 없는 모든 언어"가 대상이다: 화이트리스트였던 초기 설계는
 * 미등재 레거시 언어(asp·vb·jcl·rpg 등)가 계상 밖으로 새는 새 침묵 사각을 만들었다
 * (리뷰 C3) — 방향을 뒤집어 **모르는 언어일수록 표면화**되게 한다.
 * (census 는 미지 확장자를 확장자 자체로 lang 화하므로 .vb 가 오면 lang='vb' 로 등장
 * → 여기 없음 → 미지원 계상.)
 *
 * 알려진 한계(정직): 확장자 없는 파일(lang='other' — LICENSE/Makefile/Dockerfile/
 * crontab 등)은 소스/비소스가 섞여 계상하지 않는다. crontab 은 batch 가 경로 관례로
 * 별도 탐지(매트릭스 exceptions).
 */
export const NON_ANALYSIS_LANGS = new Set([
    // 문서/마크업
    'md',
    'markdown',
    'html',
    'htm',
    'css',
    'scss',
    'less',
    'txt',
    'rst',
    'adoc',
    // 데이터/스키마 텍스트(코드 아님)
    'json',
    'jsonc',
    'csv',
    'tsv',
    'xsd',
    'dtd',
    // 순수 설정(매트릭스에 산출 행이 있으면 그 행으로 다뤄짐 — yaml/properties 는
    // db-schema liveDbSignals partial 로 등재돼 있어 "미지원" 아님. 계상 축(소스 지원
    // 헤드라인)에서는 제외해 설정 파일 수가 소스 지표를 흐리지 않게 한다)
    'yaml',
    'properties',
    'ini',
    'toml',
    'conf',
    'env',
    // 자산/바이너리/생성물
    'svg',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'ico',
    'webp',
    'pdf',
    'woff',
    'woff2',
    'ttf',
    'eot',
    'map',
    'lock',
    'jar',
    'class',
    'war',
    'zip',
    // 확장자 없음(소스/비소스 혼재 — 상단 한계 참조)
    'other',
]);
/** 핵심 구조분석 기능 — 전부 none 인 언어의 파일이 "핵심 미지원" 카운트 대상. */
export const CORE_CAPABILITIES = ['routes', 'edges', 'complexity'];
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** (capability, lang) tier 조회 — 명시 없으면 none. */
export function tierOf(capability, lang) {
    const cap = COVERAGE_MATRIX.find((c) => c.key === capability);
    return cap?.byLang[lang]?.tier ?? 'none';
}
/** tier 서열(요약용): full > partial > none. */
const TIER_RANK = { full: 2, partial: 1, none: 0 };
/** 언어의 핵심(CORE_CAPABILITIES) 요약 tier — 최고 tier. */
export function coreTierOf(lang) {
    let best = 'none';
    for (const cap of CORE_CAPABILITIES) {
        const t = tierOf(cap, lang);
        if (TIER_RANK[t] > TIER_RANK[best])
            best = t;
    }
    return best;
}
/** 언어의 전 기능 통틀어 최고 tier — none 이면 "어떤 스캐너도 안 덮는" 언어. */
export function bestTierOf(lang) {
    let best = 'none';
    for (const c of COVERAGE_MATRIX) {
        const t = c.byLang[lang]?.tier ?? 'none';
        if (TIER_RANK[t] > TIER_RANK[best])
            best = t;
    }
    return best;
}
/** census × 매트릭스 → 언어 지원 현황(결정론: lang 정렬). */
export function computeLangSupport(census) {
    const counts = new Map();
    for (const f of census.files) {
        // denylist — 여기 없는 모든 언어(미지 확장자 포함)가 계상 대상(리뷰 C3).
        if (NON_ANALYSIS_LANGS.has(f.lang))
            continue;
        counts.set(f.lang, (counts.get(f.lang) ?? 0) + 1);
    }
    const byLang = [...counts.entries()]
        .map(([lang, files]) => ({
        lang,
        files,
        best: bestTierOf(lang),
        core: coreTierOf(lang),
        capabilities: COVERAGE_MATRIX.map((c) => ({ key: c.key, tier: tierOf(c.key, lang) })),
    }))
        .sort((a, b) => cmp(a.lang, b.lang));
    const unsupportedFiles = byLang
        .filter((r) => r.best === 'none')
        .reduce((n, r) => n + r.files, 0);
    const partialFiles = byLang
        .filter((r) => r.best === 'partial')
        .reduce((n, r) => n + r.files, 0);
    return { unsupportedFiles, partialFiles, byLang };
}
const TIER_MARK = { full: '●', partial: '◐', none: '—' };
/**
 * 사람용 매트릭스 문서(`docs/ktds/COVERAGE_MATRIX.md`) 렌더 — 결정론.
 * 갱신: `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write`.
 */
export function renderCoverageMatrixMd() {
    // 표 열 = 매트릭스에 한 번이라도 명시된 언어(정렬) — none 뿐인 언어는 열로 싣지 않는다
    // (분석 유관 미등재 언어의 "전부 —" 행 폭발 방지; 그들은 langSupport 로 계상).
    const langs = [
        ...new Set(COVERAGE_MATRIX.flatMap((c) => Object.keys(c.byLang))),
    ].sort(cmp);
    const L = [
        '# 언어 커버리지 매트릭스 (W9)',
        '',
        '> **생성물 — 손편집 금지.** 단일 소스는 `legacy-core/src/coverage-report/matrix.ts` 이며,',
        '> 이 문서는 `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write` 로 재생성한다.',
        '> drift(선언≠문서)는 CI(coverage-matrix.test.ts)와 검증 스크립트가 잡는다.',
        '',
        '## degrade 정의',
        '',
        '- ● full — 그 언어의 일반 코드에서 동작(남는 한계는 비고에 명기)',
        '- ◐ partial — 특정 관용구/프레임워크/파일 관례만(범위를 비고에 명기)',
        '- — none — 산출물에 절대 나타나지 않아야 함(두 타깃 실측 검증 대상). 표에 없는 언어의 기본값',
        '',
        '미지원 표면화: 문서/자산/순수 설정(denylist)을 제외한 **모든** 소스 언어가 계상 대상이다 —',
        '미지 확장자(asp·vb·jcl·rpg 등 미등재 레거시 포함)일수록 표면화된다. 어떤 기능도 덮지 않는',
        '언어(best=none)는 coverage.json `langSupport.unsupportedFiles` 로 "미지원 N건 [미확인]",',
        '좁은 관용구만 스캔되는 언어(best=partial)는 `partialFiles` 로 "부분 지원 N건" 이 계상되고',
        '스캔 출력·커버리지 리포트에 노출된다. 구조분석(routes·edges·complexity) 요약은 행별',
        '`core` tier — 예: sql 은 db-schema 로 덮여 미지원은 아니지만 core=none.',
        '알려진 한계: 확장자 없는 파일(lang=other, LICENSE/Makefile 등)은 소스/비소스 혼재로 계상하지 않는다.',
        '',
        '## 기능 × 언어',
        '',
        `| 기능 | ${langs.join(' | ')} |`,
        `|---|${langs.map(() => '---').join('|')}|`,
        ...COVERAGE_MATRIX.map((c) => `| ${c.label} | ${langs.map((l) => TIER_MARK[c.byLang[l]?.tier ?? 'none']).join(' | ')} |`),
        '',
        '## 비고(범위·한계 근거)',
        '',
        ...COVERAGE_MATRIX.flatMap((c) => [
            `### ${c.label} (\`${c.key}\`)`,
            '',
            ...Object.entries(c.byLang)
                .sort((a, b) => cmp(a[0], b[0]))
                .map(([lang, v]) => `- ${lang}: ${TIER_MARK[v.tier]} ${v.tier} — ${v.note}`),
            ...(c.exceptions ? [`- (예외) ${c.exceptions}`] : []),
            '',
        ]),
    ];
    return L.join('\n');
}
//# sourceMappingURL=matrix.js.map