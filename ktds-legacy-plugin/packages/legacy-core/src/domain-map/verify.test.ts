import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyFills } from "./verify.js";
import type { DomainFill } from "./fill.js";

// 17.3 기계 검증기 — 인용 실존/interval/텍스트 일치, M3 환각 검출율 100%.

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ktds-verify-"));
  const file = join(root, "src/OrderService.java");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    [
      "package shop;",
      "",
      "public class OrderService {",
      "  /** 주문은 회원만 생성할 수 있다. */",
      "  public void create(Order order) {}",
      "}",
    ].join("\n"),
    "utf-8",
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fillWith(
  citations: Array<{ filePath: string; line: number; snippet: string }>,
): DomainFill {
  return {
    schemaVersion: 1,
    domainId: "domain:order",
    name: "주문",
    summary: { text: "주문 처리", citations },
    entities: [],
    businessRules: [],
    crossDomainInteractions: [],
    flows: [],
    steps: [],
  };
}

test("정상 인용: 공백 정규화 후 라인 텍스트 포함이면 ok", async () => {
  const report = await verifyFills(
    root,
    [
      fillWith([
        { filePath: "src/OrderService.java", line: 5, snippet: "public void create(Order order)" },
        // 들여쓰기/연속 공백 차이는 일치
        { filePath: "src/OrderService.java", line: 4, snippet: "주문은   회원만 생성할" },
      ]),
    ],
    null,
  );
  const item = report.domains[0].items[0];
  expect(item.citations.map((c) => c.status)).toEqual(["ok", "ok"]);
  expect(item.verdict).toBe("GROUNDED");
  expect(report.overall.groundedPct).toBe(100);
});

test("M3: 환각 인용 주입 → 검출율 100% (4가지 실패 모드 전부)", async () => {
  const report = await verifyFills(
    root,
    [
      fillWith([
        { filePath: "src/Ghost.java", line: 1, snippet: "anything here" },         // no-file
        { filePath: "src/OrderService.java", line: 999, snippet: "public class" }, // line-out-of-range
        { filePath: "src/OrderService.java", line: 3, snippet: "회원 등급 할인 70%" }, // text-mismatch
        { filePath: "../../etc/passwd", line: 1, snippet: "root entry" },          // path-escape
      ]),
    ],
    null,
  );
  const statuses = report.domains[0].items[0].citations.map((c) => c.status);
  expect(statuses).toEqual(["no-file", "line-out-of-range", "text-mismatch", "path-escape"]);
  expect(statuses.filter((s) => s === "ok")).toHaveLength(0); // 검출율 100%
  expect(report.domains[0].items[0].verdict).toBe("NEEDS_REVIEW");
  expect(report.overall.citationOk).toBe(0);
});

test("사소 스니펫은 실재해도 근거 효력 없음 — trivial-snippet (게이밍 차단, 리뷰 반영)", async () => {
  const report = await verifyFills(
    root,
    [
      fillWith([
        // 8자 미만 — 정규화 후 "}" 1자
        { filePath: "src/OrderService.java", line: 6, snippet: "}       " },
        // 8자 이상이지만 식별자성 토큰 없음 — 어디에나 일치하는 구두점 토막
        { filePath: "src/OrderService.java", line: 5, snippet: ") {} ( ) ;" },
        // 한글 2자 단어는 유효한 근거다 (한글 오판 방지)
        { filePath: "src/OrderService.java", line: 4, snippet: "주문은 회원만" },
      ]),
    ],
    null,
  );
  const statuses = report.domains[0].items[0].citations.map((c) => c.status);
  expect(statuses[0]).toBe("trivial-snippet");
  expect(statuses[1]).toBe("trivial-snippet");
  expect(statuses[2]).toBe("ok");
});

test("강등 규칙: ok 인용 1개라도 있으면 GROUNDED, 0개면 NEEDS_REVIEW(삭제 아님)", async () => {
  const report = await verifyFills(
    root,
    [
      fillWith([
        { filePath: "src/Ghost.java", line: 1, snippet: "hallucinated" },
        { filePath: "src/OrderService.java", line: 3, snippet: "public class OrderService" },
      ]),
    ],
    null,
  );
  const item = report.domains[0].items[0];
  expect(item.verdict).toBe("GROUNDED");
  expect(item.text).toBe("주문 처리"); // 텍스트 보존
  expect(report.overall).toMatchObject({ citationTotal: 2, citationOk: 1 });
});

test("리포트 결정론: 도메인 정렬 + 동일 입력 동일 출력", async () => {
  const fills = [fillWith([{ filePath: "src/OrderService.java", line: 3, snippet: "OrderService" }])];
  const a = JSON.stringify(await verifyFills(root, fills, "x".repeat(40)));
  const b = JSON.stringify(await verifyFills(root, fills, "x".repeat(40)));
  expect(a).toBe(b);
});
