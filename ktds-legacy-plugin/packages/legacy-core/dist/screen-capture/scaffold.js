/**
 * ktds legacy-core — screens 설정 스캐폴딩(초안 자동 생성).
 *
 * `/understand-screens` 진입장벽 해소: `understanding.config.json` 에 `screens` 섹션이
 * 없을 때 `.spec/map/routes.json`(understand-map 산출)에서 결정론 초안을 생성한다.
 *  - baseUrl: routes.json 의 contextPath 로 추정(포트는 8080 기본 — 사람이 확인).
 *  - startCommand: 빌드 파일 신호(pom.xml 플러그인·wrapper 존재)로 감지 — 미감지 시 생략.
 *  - seedUrls: census GET-safe 목록성 라우트(selectCensusSeeds 재사용) — 크롤 직접 시드.
 *  - scenarios: 빈 배열 — 로그인 계정·셀렉터는 코드에서 유추 불가(사람 몫). auth-gated
 *    트리아지가 뜨면 시나리오를 채우는 후속 루프는 SKILL 이 안내한다.
 *
 * 초안은 "말없이 진행"하지 않는다 — 생성 후 사용자 확인 정지가 계약이다(호출부 소관).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME, ScreensConfigSchema, configPath, loadConfig, writeConfig, } from '../config/index.js';
import { selectCensusSeeds } from './triage.js';
/** pom.xml 플러그인 → 실행 goal 매핑(위→아래 첫 매치, 결정론). */
const MAVEN_RUN_GOALS = [
    { token: 'cargo-maven', goal: 'cargo:run' },
    { token: 'spring-boot-maven-plugin', goal: 'spring-boot:run' },
    { token: 'tomcat7-maven-plugin', goal: 'tomcat7:run' },
    { token: 'jetty-maven-plugin', goal: 'jetty:run' },
];
/** 빌드 신호 → startCommand 감지. 확신 없으면 null(생략) — 오추정보다 공백이 낫다. */
export function detectStartCommand(build) {
    if (build.pomXml) {
        const hit = MAVEN_RUN_GOALS.find((g) => build.pomXml.includes(g.token));
        if (hit) {
            const runner = build.hasMvnw ? './mvnw' : 'mvn';
            return {
                command: [runner, hit.goal],
                source: `pom.xml ${hit.token}${build.hasMvnw ? ' + mvnw' : ''}`,
            };
        }
    }
    if (build.buildGradle && build.hasGradlew && build.buildGradle.includes('org.springframework.boot')) {
        return { command: ['./gradlew', 'bootRun'], source: 'build.gradle spring-boot + gradlew' };
    }
    return { command: null, source: null };
}
/** contextPath 정규화 — ""/"/" 는 루트, 나머지는 선행 슬래시 보장·후행 슬래시 제거. */
function normalizeContextPath(contextPath) {
    if (!contextPath)
        return '';
    const trimmed = contextPath.replace(/\/+$/, '');
    if (trimmed === '')
        return '';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
/**
 * 순수 스캐폴딩 — routes census + 빌드 신호에서 screens 초안을 만든다.
 * 반환 screens 는 스키마 통과분(zod 기본값 미평가 상태 아님 — 호출부가 parse 로 실체화).
 */
export function scaffoldScreensConfig(input) {
    const ctx = normalizeContextPath(input.contextPath);
    const baseUrl = `http://localhost:8080${ctx}`;
    const { command, source } = detectStartCommand(input.build);
    const seeds = selectCensusSeeds(input.routes);
    const notes = [
        `baseUrl 은 추정입니다(포트 8080 기본${ctx ? `, 컨텍스트 ${ctx} = routes.json contextPath` : ''}) — 실제 기동 포트로 확인하세요.`,
    ];
    if (command) {
        notes.push(`startCommand 감지: ${command.join(' ')} (근거: ${source}) — 실행이 안 되면 수정하세요.`);
    }
    else {
        notes.push('startCommand 미감지 — 앱 기동 명령을 직접 채우거나, 앱을 띄워둔 채 capture 를 실행하세요(README/CI 워크플로에 실행 방법이 있는 경우가 많습니다).');
    }
    notes.push('로그인이 필요한 앱이면 scenarios 에 테스트 계정 로그인 스텝을 채우세요(계정·셀렉터는 코드에서 유추 불가 — 첫 capture 의 auth-gated 트리아지가 대상 화면을 알려줍니다).');
    const screens = ScreensConfigSchema.parse({
        baseUrl,
        ...(command ? { startCommand: command } : {}),
        seedUrls: seeds.map((r) => r.path),
        scenarios: [],
    });
    return {
        screens,
        summary: {
            routesTotal: input.routes.length,
            seedUrls: seeds.length,
            baseUrl,
            startCommand: command,
            startCommandSource: source,
            notes,
        },
    };
}
/** build.gradle / build.gradle.kts 중 존재하는 첫 파일 원문. */
function readGradle(projectRoot) {
    for (const name of ['build.gradle', 'build.gradle.kts']) {
        const p = join(projectRoot, name);
        if (existsSync(p))
            return readFileSync(p, 'utf8');
    }
    return null;
}
/**
 * 디스크 스캐폴딩 — routes.json 을 읽어 초안을 만들고 understanding.config.json 에 기록.
 * 선행 부재(config·routes.json)와 기존 섹션 덮어쓰기(force 없이)는 throw — fail-closed.
 */
export function scaffoldScreensConfigOnDisk(projectRoot, opts = {}) {
    const config = loadConfig(projectRoot);
    if (!config) {
        throw new Error(`${CONFIG_FILENAME} 이 없습니다 — /understand-init 을 먼저 실행하세요.`);
    }
    if (config.screens && !opts.force) {
        throw new Error('screens 섹션이 이미 있습니다 — 다시 만들려면 scaffold --force 를 쓰세요.');
    }
    const routesPath = join(projectRoot, '.spec', 'map', 'routes.json');
    if (!existsSync(routesPath)) {
        throw new Error(`${routesPath} 이 없습니다 — /understand-map 스캔을 먼저 실행하세요(초안 재료: 라우트 census).`);
    }
    const report = JSON.parse(readFileSync(routesPath, 'utf8'));
    const pomPath = join(projectRoot, 'pom.xml');
    const { screens, summary } = scaffoldScreensConfig({
        routes: report.routes ?? [],
        contextPath: report.contextPath ?? null,
        build: {
            hasMvnw: existsSync(join(projectRoot, 'mvnw')),
            hasGradlew: existsSync(join(projectRoot, 'gradlew')),
            pomXml: existsSync(pomPath) ? readFileSync(pomPath, 'utf8') : null,
            buildGradle: readGradle(projectRoot),
        },
    });
    writeConfig(projectRoot, { ...config, screens });
    return { configPath: configPath(projectRoot), summary };
}
//# sourceMappingURL=scaffold.js.map