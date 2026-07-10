import type { DbTable } from "./types";

/**
 * 이름 기반 추정 FK (ERD 3차) — 선언 FK가 없는 레거시 DB 대응(egov 실측: 190테이블 중
 * 선언 FK 보유 52개뿐). 추정 규칙은 보수적으로:
 *   컬럼명 == 다른 테이블의 단일 PK 컬럼명(대소문자 무시) 이면 그 테이블을 참조로 추정.
 * 정밀도 가드:
 *   - 같은 PK 컬럼명을 가진 후보 테이블이 (자기 자신 제외) 2개 이상이면 모호 → 전부 스킵
 *   - 컬럼 타입 != 참조 PK 타입이면 스킵 — 'name' 같은 일반 단어 PK 오탐 차단
 *     (jpetstore 실증: SEQUENCE.name varchar(30) 가 PRODUCT.name varchar(80) 을 끌어당김)
 *   - 이미 선언 FK 가 있는 (테이블, 컬럼) / (테이블→참조) 쌍은 제외
 *   - 상호 추정(A→B, B→A — PK 공유 1:1 패턴)은 사전순 앞 테이블 방향 하나만 유지
 * 결과는 화면 표기 전용(점선·추정 배지) — 산출물(md 등)에는 싣지 않는다.
 */

export interface InferredFk {
  /** 자식(컬럼 보유) 테이블명. */
  source: string;
  /** 참조로 추정된 테이블명. */
  target: string;
  /** 자식 쪽 컬럼명 — 소문자. */
  column: string;
  /** 참조 쪽 PK 컬럼명 — 소문자(단일 PK 규칙이라 항상 1개). */
  refColumn: string;
}

/** 테이블의 PK 컬럼명(소문자) — primaryKey 배열 또는 컬럼 플래그. */
function pkCols(t: DbTable): string[] {
  const declared = t.primaryKey?.length
    ? t.primaryKey
    : t.columns.filter((c) => c.primaryKey).map((c) => c.name);
  return declared.map((c) => c.toLowerCase());
}

/** 타입 비교용 정규화 — 대소문자·공백 차이만 무시(varchar(10) != varchar(80) 은 유지). */
const normType = (t: string): string => t.toLowerCase().replace(/\s+/g, "");

export function inferFkEdges(tables: DbTable[]): InferredFk[] {
  // 단일 PK 컬럼명 → 소유 테이블들 (복합 PK 테이블은 참조 대상에서 제외 — 이름만으로 복합 매칭은 과추정).
  const pkOwners = new Map<string, { table: string; type: string }[]>();
  for (const t of tables) {
    const pks = pkCols(t);
    if (pks.length !== 1) continue;
    const pkCol = t.columns.find((c) => c.name.toLowerCase() === pks[0]);
    pkOwners.set(pks[0], [
      ...(pkOwners.get(pks[0]) ?? []),
      { table: t.name, type: normType(pkCol?.type ?? "") },
    ]);
  }

  // 선언 FK 가 이미 커버하는 (테이블:컬럼) 과 (테이블→참조) 쌍.
  const declaredCol = new Set<string>();
  const declaredPair = new Set<string>();
  for (const t of tables) {
    for (const fk of t.foreignKeys ?? []) {
      for (const c of fk.columns) declaredCol.add(`${t.name}:${c.toLowerCase()}`);
      declaredPair.add(`${t.name}→${fk.refTable.toLowerCase()}`);
    }
  }

  const out: InferredFk[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      const col = c.name.toLowerCase();
      const candidates = (pkOwners.get(col) ?? []).filter((o) => o.table !== t.name);
      if (candidates.length !== 1) continue; // 무매치 또는 모호
      const target = candidates[0];
      if (normType(c.type) !== target.type) continue; // 타입 불일치 = 우연한 동명
      if (declaredCol.has(`${t.name}:${col}`)) continue;
      if (declaredPair.has(`${t.name}→${target.table.toLowerCase()}`)) continue;
      out.push({ source: t.name, target: target.table, column: col, refColumn: col });
    }
  }

  // 상호 추정 dedupe — A→B 와 B→A 가 모두 나오면(PK 공유 1:1) 사전순 앞 source 만 유지.
  const keys = new Set(out.map((e) => `${e.source}→${e.target}`));
  return out.filter(
    (e) => !(keys.has(`${e.target}→${e.source}`) && e.source > e.target),
  );
}
