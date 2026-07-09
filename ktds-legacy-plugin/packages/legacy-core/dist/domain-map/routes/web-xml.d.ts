import type { CensusReport, RouteEntry } from '../types.js';
/** 단일 web.xml 텍스트에서 서블릿 라우트를 추출한다. */
export declare function extractWebXmlRoutes(rawText: string, filePath: string): RouteEntry[];
/**
 * census 에서 web.xml 파일을 찾아 서블릿 라우트를 추출한다.
 * @param projectRoot 절대 루트
 * @param census buildCensus 결과
 */
export declare function extractWebXmlRoutesFromCensus(projectRoot: string, census: CensusReport): RouteEntry[];
//# sourceMappingURL=web-xml.d.ts.map