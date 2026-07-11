import { describe, expect, it } from "vitest";

import { fkCardinality } from "./erd-cardinality";
import type { DbColumn, DbTable } from "./types";

const col = (name: string, over: Partial<DbColumn> = {}): DbColumn => ({
  name,
  type: "int",
  nullable: false,
  primaryKey: false,
  unique: false,
  default: null,
  comment: null,
  line: 1,
  ...over,
});

const table = (name: string, columns: DbColumn[], primaryKey: string[] | null = null): DbTable => ({
  name,
  line: 1,
  isCodeTable: false,
  comment: null,
  columns,
  primaryKey,
  foreignKeys: null,
  checks: null,
  uniques: null,
  indexes: null,
  relPath: null,
  rowCount: 0,
  rows: [],
});

describe("fkCardinality", () => {
  it("기본 FK — 0..N 자식, 필수(1) 부모", () => {
    const t = table("orders", [col("order_id", { primaryKey: true }), col("cust_id")]);
    expect(fkCardinality(t, ["cust_id"])).toEqual({ childUnique: false, parentOptional: false });
  });

  it("nullable FK — 부모 선택(0..1)", () => {
    const t = table("orders", [col("order_id", { primaryKey: true }), col("cust_id", { nullable: true })]);
    expect(fkCardinality(t, ["cust_id"])).toEqual({ childUnique: false, parentOptional: true });
  });

  it("unique 단일 FK — 자식 0..1 (1:1 패턴)", () => {
    const t = table("profile", [col("profile_id", { primaryKey: true }), col("user_id", { unique: true })]);
    expect(fkCardinality(t, ["user_id"])).toEqual({ childUnique: true, parentOptional: false });
  });

  it("FK 집합 == PK 집합 — PK 공유 1:1", () => {
    const t = table("detail", [col("order_id", { primaryKey: true })], ["order_id"]);
    expect(fkCardinality(t, ["order_id"])).toEqual({ childUnique: true, parentOptional: false });
  });

  it("복합 FK == 복합 PK — 유니크", () => {
    const t = table(
      "lineitem",
      [col("order_id"), col("line_no")],
      ["order_id", "line_no"],
    );
    expect(fkCardinality(t, ["order_id", "line_no"]).childUnique).toBe(true);
  });

  it("복합 FK가 PK의 부분집합 — 유니크 아님(0..N)", () => {
    const t = table(
      "lineitem",
      [col("order_id"), col("line_no"), col("item_id")],
      ["order_id", "line_no"],
    );
    expect(fkCardinality(t, ["order_id"]).childUnique).toBe(false);
  });

  it("복합 FK — 일부만 nullable 이면 부모 필수 유지", () => {
    const t = table("m", [col("a", { nullable: true }), col("b")], ["x"]);
    expect(fkCardinality(t, ["a", "b"]).parentOptional).toBe(false);
  });

  it("복합 FK — 전부 nullable 이면 부모 선택", () => {
    const t = table("m", [col("a", { nullable: true }), col("b", { nullable: true })]);
    expect(fkCardinality(t, ["a", "b"]).parentOptional).toBe(true);
  });

  it("스키마에 없는 컬럼명 — 보수적으로 기본값", () => {
    const t = table("m", [col("a")]);
    expect(fkCardinality(t, ["ghost"])).toEqual({ childUnique: false, parentOptional: false });
  });

  it("PK 컬럼 플래그만 있는 스캐너 산출물 — primaryKey 배열 없이도 1:1 인식", () => {
    const t = table("detail", [col("order_id", { primaryKey: true })]);
    expect(fkCardinality(t, ["order_id"]).childUnique).toBe(true);
  });
});
