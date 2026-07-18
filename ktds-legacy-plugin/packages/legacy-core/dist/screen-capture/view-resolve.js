/**
 * Spring ViewResolver 해석(결정론) — Stage B 가 뷰 이름만 알아낸(또는 아예 못 채운)
 * 화면의 jspFile 을 repo 실경로로 확정한다.
 *
 * 배경(2026-07-18): jpetstore(Stripes)는 핸들러가 뷰 경로 리터럴을 직반환해 Stage B 가
 * jspFile 을 채울 수 있었지만, egov(Spring MVC)는 컨트롤러가 **뷰 이름**
 * ("egovframework/com/.../EgovTroblReqstList")을 반환하고 UrlBasedViewResolver 의
 * prefix/suffix 가 붙어야 실경로가 된다 — 130화면 중 113장이 jspFile null, 채워진
 * 17장도 뷰 이름 문자열이었다. 이 모듈은 그 규약을 결정론으로 푼다:
 *
 *  ① 설정 추출 — webapp XML 에서 *ViewResolver 빈의 prefix/suffix 를 파싱
 *     (p:prefix 축약형·<property> 전개형 모두). 설정이 없으면 전체 no-op(fail-open,
 *     Stripes 류 프로젝트에 무해).
 *  ② 뷰 이름 해석 — `<webappRoot><prefix><뷰이름><suffix>` 가 repo 에 실존하면 채택.
 *  ③ 화면 채움 — (a) jspFile 이 실파일이 아니면 뷰 이름으로 보고 해석 시도(치환),
 *     (b) jspFile null 이면 화면 URL 을 routes.json 라우트에 대조해 핸들러 메서드
 *     본문에서 `return "리터럴"`/`new ModelAndView("리터럴")` 을 걷어 해석 — 서로
 *     다른 해석 결과가 2개 이상(분기 뷰)이면 채우지 않는다(fail-open, 지어내지 않음).
 *
 * jspFile/graphNodeId 는 채움 필드(mechanical 밖)라 mechanicalHash 불변.
 * graphNodeId 는 KG 에 그 JSP 노드가 실존할 때만 `file:<경로>` 로 세운다(SKILL 규약).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMapArtifact, stableJson, ROUTES_FILENAME } from '../domain-map/persist.js';
import { RoutesReportSchema } from '../domain-map/types.js';
import { listJspFilesFromGraph, reconcileJsps } from './discover.js';
import { ScreensFileSchema, SCREENS_FILENAME } from './types.js';
const WALK_SKIP = new Set(['node_modules', '.git', 'target', 'build', 'dist', 'out', '.spec']);
/** 프로젝트에서 WEB-INF 하위 XML 을 찾는다(깊이 제한 — 대규모 안전). */
function findWebInfXmls(projectRoot, maxDepth = 8) {
    const out = [];
    const walk = (rel, depth) => {
        if (depth > maxDepth)
            return;
        let entries;
        try {
            entries = readdirSync(join(projectRoot, rel));
        }
        catch {
            return;
        }
        for (const name of entries) {
            if (WALK_SKIP.has(name) || name.startsWith('.'))
                continue;
            const childRel = rel ? `${rel}/${name}` : name;
            let st;
            try {
                st = statSync(join(projectRoot, childRel));
            }
            catch {
                continue;
            }
            if (st.isDirectory())
                walk(childRel, depth + 1);
            else if (name.endsWith('.xml') && childRel.includes('WEB-INF/'))
                out.push(childRel);
        }
    };
    walk('', 0);
    return out.sort();
}
/** bean 블록 1개에서 prefix/suffix 를 뽑는다(p: 축약형 + property 전개형). */
function extractAttr(block, name) {
    const short = block.match(new RegExp(`p:${name}="([^"]*)"`));
    if (short)
        return short[1];
    const prop = block.match(new RegExp(`<property\\s+name="${name}"\\s+value="([^"]*)"`));
    if (prop)
        return prop[1];
    return null;
}
/** webapp XML 들에서 ViewResolver prefix/suffix 설정을 결정론 추출한다. */
export function loadViewResolverConfigs(projectRoot) {
    const configs = [];
    const seen = new Set();
    for (const rel of findWebInfXmls(projectRoot)) {
        let text;
        try {
            text = readFileSync(join(projectRoot, rel), 'utf8');
        }
        catch {
            continue;
        }
        if (!text.includes('ViewResolver'))
            continue;
        const webappRoot = rel.slice(0, rel.indexOf('WEB-INF/')).replace(/\/$/, '');
        // bean 블록 단위로 잘라 ViewResolver 클래스가 명시된 블록만 본다.
        for (const block of text.split(/<bean[\s>]/).slice(1)) {
            const body = block.split('</bean>')[0];
            if (!/class="[^"]*ViewResolver"/.test(body))
                continue;
            const prefix = extractAttr(body, 'prefix');
            const suffix = extractAttr(body, 'suffix');
            if (prefix === null || suffix === null)
                continue;
            const key = `${webappRoot}|${prefix}|${suffix}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            configs.push({ webappRoot, prefix, suffix });
        }
    }
    return configs;
}
// ──────────────────────────────────────────────────────────────────────────
// ② 뷰 이름 해석
// ──────────────────────────────────────────────────────────────────────────
/** 뷰 이름 → repo 실경로(실존 파일만). redirect:/forward: 류는 해석하지 않는다. */
export function resolveViewName(viewName, configs, existsRel) {
    if (!viewName || viewName.includes(':'))
        return null;
    const name = viewName.replace(/^\//, '');
    for (const c of configs) {
        const prefix = c.prefix.replace(/^\//, '').replace(/\/$/, '');
        const rel = [c.webappRoot, prefix, `${name}${c.suffix}`].filter(Boolean).join('/');
        if (existsRel(rel))
            return rel;
    }
    return null;
}
// ──────────────────────────────────────────────────────────────────────────
// ③ 핸들러 메서드 본문의 뷰 리터럴 추출
// ──────────────────────────────────────────────────────────────────────────
/**
 * 선언 라인부터 중괄호 균형으로 메서드 본문을 잘라 `return "…"`/`ModelAndView("…")`
 * 리터럴을 걷는다(등장 순서, 중복 제거). 선언~여는 중괄호 사이 간격은 10줄까지 허용.
 */
export function extractReturnViewNames(sourceLines, declLine) {
    const start = Math.max(0, declLine - 1);
    let open = -1;
    for (let i = start; i < Math.min(sourceLines.length, start + 10); i++) {
        if (sourceLines[i].includes('{')) {
            open = i;
            break;
        }
    }
    if (open < 0)
        return [];
    const names = [];
    let depth = 0;
    for (let i = open; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        for (const m of line.matchAll(/return\s+"([^"]+)"/g))
            names.push(m[1]);
        for (const m of line.matchAll(/ModelAndView\(\s*"([^"]+)"/g))
            names.push(m[1]);
        for (const ch of line) {
            if (ch === '{')
                depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0)
                    return [...new Set(names)];
            }
        }
    }
    return [...new Set(names)];
}
/** 화면 id → 라우트 대조용 경로("screen:" 접두·"__변형" 접미 제거, 선행 슬래시 부여). */
function screenRoutePath(screenId) {
    const raw = screenId.replace(/^screen:/, '').split('__')[0];
    if (!raw || raw === '(root)')
        return null;
    return raw.startsWith('/') ? raw : `/${raw}`;
}
export function resolveScreenViews(screens, projectRoot) {
    const configs = loadViewResolverConfigs(projectRoot);
    const summary = {
        total: screens.length,
        rewritten: 0,
        filledFromRoute: 0,
        ambiguous: 0,
        unresolved: 0,
        configs: configs.length,
    };
    if (configs.length === 0) {
        summary.unresolved = screens.filter((s) => !s.jspFile).length;
        return { screens, summary };
    }
    const existsRel = (rel) => existsSync(join(projectRoot, rel));
    const routes = readMapArtifact(projectRoot, ROUTES_FILENAME, RoutesReportSchema);
    const routeByPath = new Map();
    for (const r of routes?.routes ?? []) {
        if (!routeByPath.has(r.path))
            routeByPath.set(r.path, { filePath: r.filePath, line: r.line });
    }
    // KG JSP 목록 — graphNodeId 는 KG 실존 시에만(부재 시 null 유지, SKILL 규약).
    let graphJsps = null;
    try {
        const kg = JSON.parse(readFileSync(join(projectRoot, '.understand-anything', 'knowledge-graph.json'), 'utf8'));
        graphJsps = new Set(listJspFilesFromGraph((kg.nodes ?? [])));
    }
    catch {
        graphJsps = null;
    }
    const fileCache = new Map();
    const readLines = (rel) => {
        if (fileCache.has(rel))
            return fileCache.get(rel);
        let lines;
        try {
            lines = readFileSync(join(projectRoot, rel), 'utf8').split('\n');
        }
        catch {
            lines = null;
        }
        fileCache.set(rel, lines);
        return lines;
    };
    const out = screens.map((s) => {
        let jspFile = s.jspFile;
        if (jspFile && !existsRel(jspFile)) {
            const resolved = resolveViewName(jspFile, configs, existsRel);
            if (resolved) {
                jspFile = resolved;
                summary.rewritten++;
            }
        }
        else if (!jspFile) {
            const path = screenRoutePath(s.id);
            const route = path ? routeByPath.get(path) : undefined;
            const lines = route ? readLines(route.filePath) : null;
            if (route && lines) {
                const resolved = [
                    ...new Set(extractReturnViewNames(lines, route.line)
                        .map((v) => resolveViewName(v, configs, existsRel))
                        .filter((p) => p !== null)),
                ];
                if (resolved.length === 1) {
                    jspFile = resolved[0];
                    summary.filledFromRoute++;
                }
                else if (resolved.length > 1) {
                    summary.ambiguous++;
                }
            }
        }
        if (!jspFile)
            summary.unresolved++;
        if (jspFile === s.jspFile)
            return s;
        return {
            ...s,
            jspFile,
            graphNodeId: jspFile && graphJsps?.has(jspFile) ? `file:${jspFile}` : s.graphNodeId,
        };
    });
    return { screens: out, summary };
}
/** screens.json 을 읽어 뷰 해석 후 기록한다(단독 op) — unmatchedJsps 도 재계산. */
export function resolveScreenViewsOnDisk(projectRoot) {
    const path = join(projectRoot, '.understand-anything', SCREENS_FILENAME);
    const file = ScreensFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    const { screens, summary } = resolveScreenViews(file.screens, projectRoot);
    let unmatchedJsps = file.unmatchedJsps;
    try {
        const kg = JSON.parse(readFileSync(join(projectRoot, '.understand-anything', 'knowledge-graph.json'), 'utf8'));
        unmatchedJsps = reconcileJsps(listJspFilesFromGraph((kg.nodes ?? [])), screens, file.fragments);
    }
    catch {
        // KG 부재 — 본체 값 보존.
    }
    const next = ScreensFileSchema.parse({ ...file, screens, unmatchedJsps });
    writeFileSync(path, stableJson(next), 'utf8');
    return { screensPath: path, summary };
}
//# sourceMappingURL=view-resolve.js.map