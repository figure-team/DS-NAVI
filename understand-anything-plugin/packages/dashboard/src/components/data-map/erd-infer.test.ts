import { describe, expect, it } from "vitest";

import { inferFkEdges } from "./erd-infer";
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

describe("inferFkEdges", () => {
  it("컬럼명 == 타 테이블 단일 PK명이면 추정 관계를 만든다", () => {
    const tables = [
      table("ITEM", [col("itemid", true), col("name")]),
      table("INVENTORY", [col("itemid", true), col("qty")]),
      table("LINEITEM", [col("orderid", true), col("linenum", true), col("itemid")]),
      table("ORDERS", [col("orderid", true)]),
    ];
    const edges = inferFkEdges(tables);
    const keys = edges.map((e) => `${e.source}→${e.target}:${e.column}`).sort();
    // LINEITEM.itemid 는 후보가 ITEM·INVENTORY 둘(둘 다 단일 PK itemid) → 모호 스킵.
    // ITEM↔INVENTORY 상호 추정은 사전순 앞(INVENTORY) 방향만 유지.
    // LINEITEM 은 복합 PK 라 참조 대상은 아니지만 자식으로는 추정 가능(orderid→ORDERS).
    expect(keys).toEqual(["INVENTORY→ITEM:itemid", "LINEITEM→ORDERS:orderid"]);
  });

  it("선언 FK 가 커버하는 컬럼·참조쌍은 제외한다", () => {
    const tables = [
      table("PRODUCT", [col("productid", true)]),
      table("ITEM", [col("itemid", true), col("productid")], {
        foreignKeys: [{ columns: ["productid"], refColumns: ["productid"], refTable: "PRODUCT", line: 1 }],
      }),
    ];
    expect(inferFkEdges(tables)).toEqual([]);
  });

  it("같은 PK명이 여러 테이블에 있으면(자기 제외) 모호 → 스킵", () => {
    const tables = [
      table("A", [col("id", true)]),
      table("B", [col("id", true)]),
      table("C", [col("id")]),
    ];
    // C.id 후보 = A, B 둘 → 스킵. A.id 후보 = B(자기 제외 1개) → A↔B 상호는 dedupe 로 한 방향.
    const edges = inferFkEdges(tables);
    expect(edges.filter((e) => e.source === "C")).toEqual([]);
    expect(edges).toEqual([{ source: "A", target: "B", column: "id", refColumn: "id" }]);
  });

  it("타입이 다르면 우연한 동명으로 보고 스킵한다 — 일반 단어 PK 오탐 가드", () => {
    const seq = table("SEQUENCE", [{ ...col("name", true), type: "varchar(30)" }]);
    const product = table("PRODUCT", [col("productid", true), { ...col("name"), type: "varchar(80)" }]);
    expect(inferFkEdges([seq, product])).toEqual([]);
    // 타입까지 같으면 추정 성립(대소문자·공백 차이는 무시)
    const zip = table("ZIP", [{ ...col("zipcode", true), type: "VARCHAR (20)" }]);
    const addr = table("ADDR", [col("addrid", true), { ...col("zipcode"), type: "varchar(20)" }]);
    expect(inferFkEdges([zip, addr])).toEqual([
      { source: "ADDR", target: "ZIP", column: "zipcode", refColumn: "zipcode" },
    ]);
  });

  it("복합 PK 테이블은 참조 대상으로 삼지 않는다", () => {
    const tables = [
      table("LINEITEM", [col("orderid", true), col("linenum", true)]),
      table("X", [col("orderid")]),
    ];
    expect(inferFkEdges(tables)).toEqual([]);
  });

  it("primaryKey 배열 방식(컬럼 플래그 부재)도 인식한다", () => {
    const tables = [
      table("ORDERS", [col("orderid")], { primaryKey: ["orderid"] }),
      table("ORDERSTATUS", [col("orderid"), col("status")], { primaryKey: ["orderid", "linenum"] }),
    ];
    expect(inferFkEdges(tables)).toEqual([
      { source: "ORDERSTATUS", target: "ORDERS", column: "orderid", refColumn: "orderid" },
    ]);
  });
});
