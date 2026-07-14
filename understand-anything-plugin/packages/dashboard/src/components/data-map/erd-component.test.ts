import { describe, expect, it } from "vitest";

import { fkComponent, fkEdgePairs } from "./erd-component";
import type { DbColumn, DbTable } from "./types";

const col = (name: string, primaryKey = false): DbColumn => ({
  name,
  type: "varchar(10)",
  nullable: !primaryKey,
  primaryKey,
  unique: false,
  default: null,
  comment: null,
  line: 1,
});

const table = (
  name: string,
  cols: DbColumn[],
  opts: Partial<Pick<DbTable, "primaryKey" | "foreignKeys">> = {},
): DbTable => ({
  name,
  line: 1,
  isCodeTable: false,
  comment: null,
  columns: cols,
  primaryKey: opts.primaryKey ?? null,
  foreignKeys: opts.foreignKeys ?? null,
  checks: null,
  uniques: null,
  indexes: null,
  relPath: null,
  rowCount: 0,
  rows: [],
});

const fk = (refTable: string, columns: string[]) => ({
  columns,
  refColumns: [],
  refTable,
  line: 1,
});

describe("fkEdgePairs", () => {
  it("선언 FK — 참조 대상 부재·자기참조는 제외", () => {
    const tables = [
      table("T1", [col("a", true)]),
      table("T2", [col("b", true), col("a")], { foreignKeys: [fk("t1", ["a"]), fk("T2", ["b"]), fk("GHOST", ["b"])] }),
    ];
    // t1 참조는 대소문자 무시 해소, 자기참조 T2→T2·미존재 GHOST 는 제외.
    // T2.a 는 선언 FK 가 커버하므로 추정(erd-infer)도 중복 생성 안 함.
    expect(fkEdgePairs(tables)).toEqual([{ source: "T2", target: "T1" }]);
  });

  it("추정 FK(erd-infer)도 탐색 엣지에 포함", () => {
    const tables = [
      table("ORDERS", [col("orderid", true)]),
      table("LINEITEM", [col("lineid", true), col("orderid")]),
    ];
    expect(fkEdgePairs(tables)).toEqual([{ source: "LINEITEM", target: "ORDERS" }]);
  });
});

describe("fkComponent", () => {
  const e = (source: string, target: string) => ({ source, target });

  it("전이 연결 전부 — T1 선택 시 T1-T2-T3 체인이 다 나온다(무향)", () => {
    const edges = [e("T2", "T1"), e("T2", "T3"), e("X", "Y")];
    const c = fkComponent("T1", edges);
    expect([...c.tables].sort()).toEqual(["T1", "T2", "T3"]);
    expect(c.capped).toBe(false);
  });

  it("고립 테이블 — 자기 자신만", () => {
    const c = fkComponent("ALONE", [e("A", "B")]);
    expect([...c.tables]).toEqual(["ALONE"]);
    expect(c.capped).toBe(false);
  });

  it("CAP 초과 시 홉 제한 폴백 — capped=true, 시작점에서 3홉까지만", () => {
    // 체인 C0-C1-…-C70 (컴포넌트 71 > CAP 60) → C0 기준 3홉 = C0~C3.
    const edges = Array.from({ length: 70 }, (_, i) => e(`C${i}`, `C${i + 1}`));
    const c = fkComponent("C0", edges);
    expect(c.capped).toBe(true);
    expect([...c.tables].sort()).toEqual(["C0", "C1", "C2", "C3"]);
  });

  it("결정론 — 같은 입력 같은 결과", () => {
    const edges = [e("B", "A"), e("C", "B"), e("D", "C")];
    expect([...fkComponent("A", edges).tables].sort()).toEqual([...fkComponent("A", edges).tables].sort());
  });
});
