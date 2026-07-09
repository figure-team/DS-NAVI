import { type JavaFileFacts } from './java-facts.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { CensusReport, MethodCallGraph } from './types.js';
/**
 * javaFacts(단일 파싱 결과) + ClassIndex 로 프로젝트 전역 메서드 호출 그래프를 만든다.
 * 순수 함수(I/O 없음). calls 는 (callerFile, callLine, calleeMethod) 정렬.
 */
export declare function buildGraphFromFacts(javaFacts: Map<string, JavaFileFacts>, gitCommit: string | null): MethodCallGraph;
/**
 * 프로젝트 루트에서 메서드 단위 호출 그래프를 만든다.
 * census 의 java 파일을 1회씩 파싱해 facts 를 모은 뒤 buildGraphFromFacts 로 해소한다.
 */
export declare function buildMethodCallGraph(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<MethodCallGraph>;
/**
 * flow 의 핸들러 메서드에서 시작해 해소된 호출(ResolvedCall)을 BFS 로 따라가며
 * 실제로 도달하는 프로젝트 파일을 호출-깊이 순으로 모은다(rootRelPath 가 첫 step).
 * external/unresolved callee 는 건너뛴다. self 호출(같은 파일)은 따라가되 새 파일은 아님.
 *
 * 핸들러의 호출이 어떤 프로젝트 파일로도 해소되지 않으면 root 만 반환 — 호출자는
 * 그 경우 기존 파일 단위(slices) 폴백을 쓴다.
 */
export declare function reachableFlowFiles(graph: MethodCallGraph, rootRelPath: string, handlerMethod: string): string[];
/**
 * 핸들러 메서드에서 도달하는 (callee 파일, 메서드) 쌍을 BFS 로 모은다 — reachableFlowFiles 의
 * 메서드-정밀 버전. CRUD 매트릭스가 흐름별로 **실제 호출하는 매퍼 메서드만** 귀속하도록 쓴다
 * (파일 단위 사용메서드 라벨의 과다귀속 해소). external/unresolved callee 는 건너뛴다.
 * 결정론: (file, method) 사전순 정렬 후 반환.
 */
export declare function reachableMethods(graph: MethodCallGraph, rootRelPath: string, handlerMethod: string): Array<{
    file: string;
    method: string;
}>;
//# sourceMappingURL=method-calls.d.ts.map