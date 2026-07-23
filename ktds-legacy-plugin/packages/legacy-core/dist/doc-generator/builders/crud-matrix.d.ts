/**
 * 07_crud-matrix.md — CRUD 매트릭스 빌더(D2 + Tier B).
 *
 * mybatisModel 이 있으면 **기능×테이블**: flow→dao step(매퍼)→사용 메서드→매퍼 문(statement)
 * 으로 테이블과 CRUD 를 SQL 문 종류에서 직접 판정([확정], 근거=Mapper XML file:line).
 * 없으면 폴백 **기능×DAO(매퍼)**: 메서드명 접두 규칙으로 CRUD 추론([추정]).
 *
 * 결정론: 열=테이블/DAO basename asc, 행=flow id asc.
 */
import type { GeneratedDoc } from '../types.js';
import { type DocInput } from './shared.js';
import type { JpaRepository } from '../../jpa/types.js';
/** 메서드명 → CRUD 글자(접두 규칙, 폴백 경로). 미상이면 null. */
export declare function crudOf(method: string): string | null;
/**
 * JPA/Spring Data 리포지토리 메서드 → CRUD 글자. crud-matrix(기능×테이블 JPA 경로)와
 * RTM 데이터 축(build-rtm)이 **동일 규약**을 쓰도록 단일 소스로 export 한다(드리프트 차단).
 *
 * @Query 명시 쿼리면 본문 선두 동사(JPQL/native)로 판정 — 이름 규칙보다 우선. 파생쿼리(findByX)는
 * 조회. save/persist 는 업서트라 **C+U**(crudOf 는 save→C 로만 봐 수정 흐름을 전부 Create 로 오표기).
 */
export declare function jpaCrud(method: string, repo: JpaRepository): string | null;
export declare function buildCrudMatrix(input: DocInput): GeneratedDoc;
//# sourceMappingURL=crud-matrix.d.ts.map