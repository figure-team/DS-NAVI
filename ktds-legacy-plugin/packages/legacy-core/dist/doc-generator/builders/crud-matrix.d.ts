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
export declare function buildCrudMatrix(input: DocInput): GeneratedDoc;
//# sourceMappingURL=crud-matrix.d.ts.map