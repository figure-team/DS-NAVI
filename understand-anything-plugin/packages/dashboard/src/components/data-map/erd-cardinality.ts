import type { DbTable } from "./types";

/**
 * 선언 FK의 crow's foot 카디널리티 유도 (ERD 2차) — 스키마 제약에서 결정론으로만 읽는다.
 *   자식(FK) 끝: 기본 0..N(까마귀발). FK 컬럼이 유니크(단일 컬럼 unique, 또는 FK 집합 == PK 집합)면
 *     한 부모에 자식이 최대 하나 → 0..1(원+바)로 승격.
 *   부모(참조) 끝: 기본 1(바). FK 컬럼이 전부 nullable 이면 부모 없는 자식 행이 허용 → 0..1(원+바).
 * 추정 FK(erd-infer)는 제약 근거가 없으므로 이 함수를 태우지 않는다 — 카디널리티 무표기(점선만).
 */

export interface FkCardinality {
  /** 자식 FK가 유니크 → 관계가 1:0..1 (까마귀발 대신 원+바). */
  childUnique: boolean;
  /** FK 컬럼 전부 nullable → 부모 참조가 선택(부모 끝 원+바). */
  parentOptional: boolean;
}

/** 테이블 PK 컬럼명(소문자) — primaryKey 배열 또는 컬럼 플래그(스캐너에 따라 한쪽만 채워짐). */
function pkCols(t: DbTable): string[] {
  const declared = t.primaryKey?.length
    ? t.primaryKey
    : t.columns.filter((c) => c.primaryKey).map((c) => c.name);
  return declared.map((c) => c.toLowerCase());
}

/** @param fkColumns 자식 쪽 FK 컬럼명(소문자). */
export function fkCardinality(child: DbTable, fkColumns: string[]): FkCardinality {
  const cols = fkColumns.map((c) => child.columns.find((cc) => cc.name.toLowerCase() === c));
  const pk = pkCols(child);
  const fkIsPk =
    fkColumns.length > 0 &&
    fkColumns.length === pk.length &&
    fkColumns.every((c) => pk.includes(c));
  const childUnique =
    fkIsPk || (fkColumns.length === 1 && (cols[0]?.unique ?? false));
  const parentOptional = cols.length > 0 && cols.every((c) => c?.nullable ?? false);
  return { childUnique, parentOptional };
}
