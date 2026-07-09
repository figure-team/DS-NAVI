import type { CensusReport, RouteEntry } from '../types.js';
/**
 * census 파일 목록에서 Next.js 라우트를 추출한다.
 * @param projectRoot 절대 루트(route.ts 파싱용)
 * @param census buildCensus 결과
 */
export declare function extractNextjsRoutes(projectRoot: string, census: CensusReport): Promise<RouteEntry[]>;
//# sourceMappingURL=nextjs.d.ts.map