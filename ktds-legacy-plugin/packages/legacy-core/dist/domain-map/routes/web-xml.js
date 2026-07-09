/**
 * web.xml 서블릿 라우트 추출 — 경량 결정론적 XML 스캔.
 *
 * <servlet> 로 servlet-name -> (servlet-class | jsp-file) 매핑을 만들고,
 * <servlet-mapping> 의 각 <url-pattern> 마다 라우트 1개를 낸다.
 * method ANY, kind "servlet", framework "webxml".
 * handler = servlet-class FQN(없으면 jsp-file 경로). url-pattern 은 verbatim 보존
 * (확장자 매핑 *.do, prefix 매핑 /x/* 를 정규화하지 않는다). CDATA 는 벗기고,
 * 주석은 무시한다. DispatcherServlet 핸들러에는 "dispatcher" 노트를 단다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** XML 주석 영역을 공백으로 치환(줄/오프셋 보존). */
function stripXmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
/** 요소 본문의 첫 자식 텍스트(CDATA 벗김 + trim). null 이면 부재. */
function elementText(body, tag) {
    const m = body.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
    if (!m)
        return null;
    return unwrapCdata(m[1]).trim();
}
/** 요소 본문에서 주어진 태그의 모든 텍스트(선언 순서, CDATA 벗김 + trim). */
function elementTexts(body, tag) {
    const out = [];
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
        out.push(unwrapCdata(m[1]).trim());
    }
    return out;
}
/** <![CDATA[..]]> 래퍼를 제거한다. */
function unwrapCdata(s) {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
/** 줄 번호(1-based). */
function lineAt(text, index) {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++) {
        if (text[i] === '\n')
            line++;
    }
    return line;
}
/** 단일 web.xml 텍스트에서 서블릿 라우트를 추출한다. */
export function extractWebXmlRoutes(rawText, filePath) {
    const text = stripXmlComments(rawText);
    const out = [];
    // 1) <servlet> 정의 수집: servlet-name -> { className, jspFile }.
    const defs = new Map();
    const servletRe = /<servlet\b[^>]*>([\s\S]*?)<\/servlet>/g;
    let sm;
    while ((sm = servletRe.exec(text)) !== null) {
        const body = sm[1];
        const name = elementText(body, 'servlet-name');
        if (!name)
            continue;
        defs.set(name, {
            className: elementText(body, 'servlet-class'),
            jspFile: elementText(body, 'jsp-file'),
        });
    }
    // 2) <servlet-mapping> 별 url-pattern -> 라우트.
    const mappingRe = /<servlet-mapping\b[^>]*>([\s\S]*?)<\/servlet-mapping>/g;
    let mm;
    while ((mm = mappingRe.exec(text)) !== null) {
        const body = mm[1];
        const name = elementText(body, 'servlet-name');
        if (!name)
            continue;
        const def = defs.get(name);
        const handler = def ? def.className ?? def.jspFile : null;
        const isDispatcher = !!def?.className && /DispatcherServlet$/.test(def.className);
        const line = lineAt(text, mm.index);
        for (const pattern of elementTexts(body, 'url-pattern')) {
            if (pattern.length === 0)
                continue;
            out.push({
                routeId: '',
                method: 'ANY',
                // url-pattern 은 verbatim(정규화 금지 — 확장자/prefix 매핑 보존).
                path: pattern,
                rawPath: pattern,
                kind: 'servlet',
                framework: 'webxml',
                filePath,
                line,
                handler,
                notes: isDispatcher ? ['dispatcher'] : [],
            });
        }
    }
    return out;
}
/**
 * census 에서 web.xml 파일을 찾아 서블릿 라우트를 추출한다.
 * @param projectRoot 절대 루트
 * @param census buildCensus 결과
 */
export function extractWebXmlRoutesFromCensus(projectRoot, census) {
    const out = [];
    for (const file of census.files) {
        if (!file.relPath.endsWith('/web.xml') && file.relPath !== 'web.xml')
            continue;
        let text;
        try {
            text = readFileSync(join(projectRoot, file.relPath), 'utf8');
        }
        catch {
            continue;
        }
        out.push(...extractWebXmlRoutes(text, file.relPath));
    }
    return out;
}
//# sourceMappingURL=web-xml.js.map