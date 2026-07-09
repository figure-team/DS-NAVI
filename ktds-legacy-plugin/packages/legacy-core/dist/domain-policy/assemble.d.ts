import type { CandidatesReport, UaGraphEdge, UaGraphNode } from '../domain-map/types.js';
import type { DbSchemaModel } from '../db-schema/index.js';
import type { BranchSignal, DomainPolicyInput } from './types.js';
type Term = NonNullable<DomainPolicyInput['terms']>[number];
type StatusCode = NonNullable<DomainPolicyInput['statusCodes']>[number];
/** emit 된 도메인 그래프(부분) — 흐름/도메인 표시명 출처. */
export interface DomainGraphLite {
    nodes: UaGraphNode[];
    edges: UaGraphEdge[];
}
/**
 * §3 상태값 — 도메인이 참조하는 코드/룩업 테이블의 dataload 행을 코드값으로(결정론).
 * group=테이블 · code=첫 컬럼값 · 명칭=둘째 · 설명=셋째. 근거=행 file:line.
 * (group,code) 중복 제거(여러 .sql 의 동일 INSERT 대비), 값은 HTML 제거.
 */
export declare function deriveStatusCodes(dbSchema: DbSchemaModel | null, text: string): StatusCode[];
/** §2 용어 — 도메인이 참조하는 테이블/컬럼의 DB 주석(있을 때). 합성 아님 — 주석 원문. */
export declare function deriveTerms(dbSchema: DbSchemaModel | null, text: string): Term[];
/**
 * 순수 조립 — candidates(경계/파일) + domain-graph(흐름/표시명) + 도메인별 분기 → 입력[].
 * domainGraph 없으면 흐름 빈 배열·표시명=key 로 우아하게 degrade.
 */
export declare function buildDomainPolicyInputs(candidates: CandidatesReport, domainGraph: DomainGraphLite | null, branchesByKey: Map<string, BranchSignal[]>, termsByKey?: Map<string, Term[]>, statusByKey?: Map<string, StatusCode[]>): DomainPolicyInput[];
/**
 * 정책 토픽 자동 분리 — 한 도메인을 그 도메인의 **상태값 그룹을 참조하는 분기**별 토픽으로 쪼갠다.
 * (실무: 도메인 1개 ≠ 정책 1개. 정책 토픽은 보통 상태값 코드그룹 단위.)
 *
 * 한 분기가 어떤 그룹에 속하는가: 조건/처리 텍스트에 그 그룹의 **코드값**(≥3자)이나
 * **그룹명**(≥4자)이 등장하면 그 그룹 토픽. 어디에도 안 걸리면 잔여(처리 정책) 토픽.
 * **그룹에 걸리는 분기가 하나도 없으면 분리하지 않는다**(단일 유지 — 보수적, 오분리 방지).
 */
export declare function splitByTopic(d: DomainPolicyInput): DomainPolicyInput[];
/**
 * IO 조립 — map 산출물 로드 + 도메인 멤버 .java 분기 스캔(경계 한정) → DomainPolicyInput[].
 * candidates.json 이 없으면 throw(먼저 understand-map scan 필요).
 */
export declare function assembleDomainPolicies(projectRoot: string): Promise<DomainPolicyInput[]>;
export {};
//# sourceMappingURL=assemble.d.ts.map