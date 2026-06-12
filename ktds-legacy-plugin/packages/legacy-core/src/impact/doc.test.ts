import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAIMS_FENCE_OPEN, CONFIDENCE_TAG } from "../types.js";
import { DEFAULT_STATUS_LINE, renderMarkdown } from "../doc-generator/index.js";
import type { ImpactResult } from "./types.js";
import type { ImpactVerifyReport } from "./verify.js";
import {
  aggregateImpactCounts,
  buildChangeImpact,
  CHANGE_IMPACT_FILENAME,
  IMPACT_STATUS_LINE,
  publishChangeImpact,
} from "./doc.js";

// T7 DoD: 7 섹션, CLAIMS_FENCE, 읽기전용 statusLine, confidence 태그 매핑,
// 빈 섹션 (항목 없음), 발행(registerDraft 미호출).

const RESULT: ImpactResult = {
  schemaVersion: 1,
  gitCommit: null,
  depthCap: 12,
  edgeKinds: ["field-type"],
  fanInThreshold: 24,
  seeds: [{ relPath: "src/Svc.java", origin: "path", confidence: "CONFIRMED_HUMAN" }],
  upstream: {
    files: [{ relPath: "src/Ctrl.java", viaKinds: ["field-type"], minDepth: 1, citation: { filePath: "src/Ctrl.java", line: 5 } }],
    api: [{ targetKind: "route", id: "route:GET /a", filePath: "src/Ctrl.java", line: 5, handler: "Ctrl", via: "both", confidence: "CONFIRMED_AI" }],
    persistence: {
      mappers: [{ relPath: "src/M.xml", namespace: "org.M", owners: ["src/Ctrl.java"], citation: { filePath: "src/Svc.java", line: 9 } }],
      sqlFiles: [],
      tableCandidateSlots: [{ mapperRelPath: "src/M.xml", sqlSlice: { filePath: "src/M.xml", startLine: 1, endLine: 40 } }],
      kgTableCatalog: [{ name: "ACCOUNT", filePath: "schema.sql", startLine: 1, endLine: 10 }],
      note: "SQL 도달성 밖 안내",
    },
    flows: [{ flowId: "flow:GET /a", routeId: "route:GET /a", domainId: "domain:acct", domainKey: "acct", domainName: "계정", viaStepId: "step:GET /a:src/Svc.java", via: "step", confidence: "INFERRED" }],
    domains: [{ domainId: "domain:acct", key: "acct", name: "계정", confidence: "INFERRED" }],
  },
  downstream: {
    files: [{ relPath: "src/M.xml", viaKinds: ["mapper-xml"], minDepth: 1, citation: { filePath: "src/Svc.java", line: 9 } }],
  },
  overEdges: { hubNodes: [], importOnlyCount: 0, crossCheckDiff: [] },
  needsReview: [{ ref: "src/Other.java", reason: "비-Java 시드 빈약" }],
};

const VERIFY: ImpactVerifyReport = {
  schemaVersion: 1,
  gitCommit: null,
  items: [
    { kind: "api", ref: "route:GET /a", text: "t", citations: [], verdict: "GROUNDED" },
    { kind: "upstream", ref: "src/Ctrl.java", text: "t", citations: [], verdict: "GROUNDED" },
    { kind: "mapper", ref: "src/M.xml", text: "t", citations: [], verdict: "NEEDS_REVIEW" },
  ],
  overall: { itemTotal: 3, itemGrounded: 2, citationTotal: 0, citationOk: 0, groundedPct: 66.7, uncitedClaims: 0 },
};

test("7 섹션 + CLAIMS_FENCE + 읽기전용 statusLine", () => {
  const doc = buildChangeImpact(RESULT, VERIFY);
  expect(doc.filename).toBe(CHANGE_IMPACT_FILENAME);
  expect(doc.sections.map((s) => s.heading)).toEqual([
    "변경 대상 (시드)",
    "API · 진입점 영향",
    "업무 흐름 · 도메인 영향",
    "DB · 영속성 영향",
    "연관 모듈 (상류 영향)",
    "연관 협력 (하류 의존 · 보조)",
    "검토 필요",
  ]);
  const md = renderMarkdown(doc, IMPACT_STATUS_LINE);
  expect(md).toContain(`> ${IMPACT_STATUS_LINE}`);
  expect(md).not.toContain(DEFAULT_STATUS_LINE); // 5종 DRAFT 헤더 아님 (상수 바인딩)
  expect(IMPACT_STATUS_LINE).not.toBe(DEFAULT_STATUS_LINE);
  expect(md).toContain(CLAIMS_FENCE_OPEN);
});

test("confidence 태그 매핑: api GROUNDED→[확정(AI)], mapper NEEDS_REVIEW→[확인 필요], flow→[추정]", () => {
  const md = renderMarkdown(buildChangeImpact(RESULT, VERIFY), IMPACT_STATUS_LINE);
  expect(md).toContain(`${CONFIDENCE_TAG.CONFIRMED_AI} 진입점 영향: route:GET /a`);
  expect(md).toMatch(new RegExp(`${escapeRe(CONFIDENCE_TAG.NEEDS_REVIEW)} 영속성 영향\\(매퍼\\): src/M\\.xml`));
  expect(md).toContain(`${CONFIDENCE_TAG.INFERRED} 흐름 영향: flow:GET /a`);
  // 근거 cite 형식 (5종과 동일)
  expect(md).toContain("근거: `src/Ctrl.java:5`");
});

test("빈 섹션 → (항목 없음)", () => {
  const empty: ImpactResult = {
    ...RESULT,
    upstream: { files: [], api: [], persistence: { mappers: [], sqlFiles: [], tableCandidateSlots: [], kgTableCatalog: [], note: "n" }, flows: [], domains: [] },
    downstream: { files: [] },
    needsReview: [],
  };
  const md = renderMarkdown(buildChangeImpact(empty, { ...VERIFY, items: [] }), IMPACT_STATUS_LINE);
  expect(md).toContain("_(항목 없음)_");
});

test("발행: docs/09_release/에 쓰고 경로 반환 (registerDraft 미호출 — 읽기전용)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ktds-impact-doc-"));
  try {
    const file = await publishChangeImpact(dir, buildChangeImpact(RESULT, VERIFY));
    expect(file).toBe(join(dir, "docs/09_release", CHANGE_IMPACT_FILENAME));
    const content = await readFile(file, "utf-8");
    expect(content).toContain("# 변경 영향도 분석");
    // doc-status.json이 생기지 않는다 (상태기계 밖)
    await expect(readFile(join(dir, ".spec/doc-status.json"), "utf-8")).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── T11: 영향 규모 집계 (공수 산정 입력) ─────────────────────────────────────

// 실형상 픽스처 (리뷰 critical 반영): ConfirmedDomain.roots는 디렉터리가 아니라
// 라우트/배치 엔트리 **파일 경로**다. 귀속은 slices ownership(relPath→owner
// root 파일들)으로만 결정한다.
const AGG_RESULT: ImpactResult = {
  ...RESULT,
  upstream: {
    ...RESULT.upstream,
    files: [
      { relPath: "src/order/OrderSvc.java", viaKinds: ["field-type"], minDepth: 1, citation: null }, // sole → 주문
      { relPath: "src/common/Util.java", viaKinds: ["field-type"], minDepth: 2, citation: null }, // 복수 도메인 → (공용)
      { relPath: "src/acct/AcctCtrl.java", viaKinds: ["field-type"], minDepth: 1, citation: null }, // 루트 자신 → 계정
      { relPath: "src/legacy/LegacySvc.java", viaKinds: ["field-type"], minDepth: 3, citation: null }, // owners 전원 confirmed 밖 → (미분류)
      { relPath: "src/dead/Unreached.java", viaKinds: ["field-type"], minDepth: 4, citation: null }, // ownership 밖 → (미분류)
    ],
  },
  downstream: {
    // 같은 도메인의 root 2개가 공유 — 도메인 단위론 단일 → 주문
    files: [{ relPath: "src/order/M.xml", viaKinds: ["mapper-xml"], minDepth: 1, citation: null }],
  },
};

const AGG_CENSUS = [
  { relPath: "src/order/OrderSvc.java", lang: "java" },
  { relPath: "src/common/Util.java", lang: "java" },
  { relPath: "src/acct/AcctCtrl.java", lang: "java" },
  { relPath: "src/legacy/LegacySvc.java", lang: "java" },
  { relPath: "src/order/M.xml", lang: "xml" },
  // src/dead/Unreached.java는 census 밖 — "(census 밖)" 라벨 검증용
];

const AGG_CONFIRMED = {
  schemaVersion: 1 as const,
  gitCommit: null,
  decidedBy: "pl",
  domains: [
    { key: "order", name: "주문", roots: ["src/order/OrderCtrl.java", "src/order/OrderBatch.java"], aliasKeys: [] },
    { key: "acct", name: "계정", roots: ["src/acct/AcctCtrl.java"], aliasKeys: [] },
  ],
  excludedKeys: ["legacy"],
};

const AGG_OWNERSHIP = [
  { relPath: "src/order/OrderSvc.java", status: "sole" as const, owners: ["src/order/OrderCtrl.java"] },
  { relPath: "src/order/M.xml", status: "shared" as const, owners: ["src/order/OrderBatch.java", "src/order/OrderCtrl.java"] },
  { relPath: "src/common/Util.java", status: "shared" as const, owners: ["src/acct/AcctCtrl.java", "src/order/OrderCtrl.java"] },
  { relPath: "src/legacy/LegacySvc.java", status: "sole" as const, owners: ["src/legacy/Old.java"] },
];

const AGG_INPUTS = { census: AGG_CENSUS, confirmed: AGG_CONFIRMED, ownership: AGG_OWNERSHIP };

test("aggregateImpactCounts — ownership 귀속: sole/루트 자신/도메인 내 공유→도메인, 교차→(공용), 밖→(미분류)", () => {
  const agg = aggregateImpactCounts(AGG_RESULT, AGG_INPUTS);
  expect(agg.byDomain).toEqual([
    // 계 내림차순, 동률은 라벨 코드포인트 오름차순("(" < 한글)
    { label: "(미분류)", upstream: 2, downstream: 0 },
    { label: "주문 (order)", upstream: 1, downstream: 1 },
    { label: "(공용)", upstream: 1, downstream: 0 },
    { label: "계정 (acct)", upstream: 1, downstream: 0 },
  ]);
  expect(agg.byLang).toEqual([
    { label: "java", upstream: 4, downstream: 0 },
    { label: "(census 밖)", upstream: 1, downstream: 0 },
    { label: "xml", upstream: 0, downstream: 1 },
  ]);
});

test("aggregate 제공 시 8섹션(2번째=집계, 표+합계), 미제공 시 기존 7섹션 불변", () => {
  const doc = buildChangeImpact(AGG_RESULT, VERIFY, AGG_INPUTS);
  expect(doc.sections).toHaveLength(8);
  expect(doc.sections[1].heading).toBe("영향 규모 집계 (공수 산정 입력)");
  expect(doc.sections[1].claims).toEqual([]); // 확정 대상 아님 (파생 집계)
  const prose = doc.sections[1].prose!;
  expect(prose).toContain("| 주문 (order) | 1 | 1 | 2 |");
  expect(prose).toContain("| **계** | 5 | 1 | 6 |");
  expect(prose).toContain("**언어별**");

  expect(buildChangeImpact(AGG_RESULT, VERIFY).sections).toHaveLength(7);
});

test("aggregate — confirmed 부재면 도메인 미확정 안내 + 언어별만", () => {
  const doc = buildChangeImpact(AGG_RESULT, VERIFY, { ...AGG_INPUTS, confirmed: null });
  const prose = doc.sections[1].prose!;
  expect(prose).toContain("도메인 미확정");
  expect(prose).not.toContain("**도메인별**");
  expect(prose).toContain("**언어별**");
});
