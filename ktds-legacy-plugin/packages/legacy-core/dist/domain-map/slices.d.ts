/**
 * SLICES 단계 — 라우트/배치 루트에서 엣지를 BFS 로 따라가 도달 파일을 모은다.
 *
 * 루트 = 라우트 또는 배치 엔트리를 "선언한" census 파일.
 * entryIds = 그 루트가 선언한 routeId/entryId(정렬).
 * BFS 는 엣지를 source->target 방향(전진)으로 따르며 depthCap 까지 확장한다.
 * ownership = 각 census 파일을 도달하는 루트 집합(정렬), 상태 sole/shared/unreached.
 * 슬라이스는 root, ownership 은 relPath 로 정렬해 결정론을 보장한다.
 */
import type { CensusReport, EdgesReport, RoutesReport, SlicesReport } from './types.js';
/** 기본 BFS 깊이 상한. */
export declare const DEFAULT_DEPTH_CAP = 12;
/**
 * 도메인 시드로 부적격한 진입점/파일 판정 — 업무 도메인이 아닌 것.
 *
 * 도메인 맵은 **생산 애플리케이션**의 업무 구조를 그린다. 다음은 진입점으로
 * 잡히더라도 업무 도메인의 씨앗이 아니다:
 *  - **테스트 소스**(`src/test/`, `src/it/`, `__tests__/`): 프레임워크 자체 테스트·
 *    예제 코드. `main()`/JUnit 이 라우트·배치 스캐너에 진입점으로 잡혀 각자 도메인이
 *    되던 문제(예 eGov TestPingNetwork→ping, NullCheckTest→null)를 원천 차단.
 *  - **정적 뷰 자원**(.jsp/.jspx/.html/.htm/.css): 뷰/정적 파일이지 도메인 로직
 *    진입점이 아니다(예 code404.jsp, index.jsp). 컨트롤러(Java)가 실제 씨앗이다.
 *
 * package-by-layer 앱(jpetstore: src/main/java Java ActionBean)은 영향 없음.
 * .js/.ts 는 제외하지 않는다(JS 프로젝트에선 그게 코드다).
 */
export declare function isDomainIneligibleRoot(relPath: string): boolean;
/** census/routes/edges 로 슬라이스/소유권을 만든다. */
export declare function buildSlices(census: CensusReport, routes: Pick<RoutesReport, 'routes' | 'batchEntries'>, edges: Pick<EdgesReport, 'edges'>, depthCap?: number): SlicesReport;
//# sourceMappingURL=slices.d.ts.map