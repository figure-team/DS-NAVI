import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { writeMapArtifact } from "./persist.js";
import type { Citation, DomainFill } from "./fill.js";

// 17.3 기계 검증기 — S9.
// U-A /understand-domain의 구조적 결함("validateGraph에 파일시스템 접근
// 0줄", ADR §1.2)을 정확히 메우는 모듈: 인용 경로 실존 → lineRange
// interval → 스니펫↔실파일 텍스트 일치(정규화 후). 실패 항목은 삭제가
// 아니라 NEEDS_REVIEW 강등 — 텍스트는 보존되고 근거 없음이 표시된다.
// per-domain 근거율 리포트가 M3("인용 실존율 100%")의 측정기다.

export const VERIFY_REPORT_FILENAME = "verify-report.json";

export const CITATION_STATUS = [
  "ok",
  /** 경로가 프로젝트 밖을 가리킴 (탈출 시도/환각/심볼릭 링크 우회). */
  "path-escape",
  "no-file",
  "line-out-of-range",
  "text-mismatch",
  /** 스니펫이 너무 사소해 어디에나 일치 — 근거 효력 없음 (게이밍 차단). */
  "trivial-snippet",
] as const;
export type CitationStatus = (typeof CITATION_STATUS)[number];

export const VerifiedCitationSchema = z.object({
  filePath: z.string(),
  line: z.number().int().positive(),
  snippet: z.string(),
  status: z.enum(CITATION_STATUS),
});
export type VerifiedCitation = z.infer<typeof VerifiedCitationSchema>;

export const VerifiedItemSchema = z.object({
  kind: z.enum(["summary", "entity", "businessRule", "crossDomain", "flow", "step"]),
  /** 항목 식별자: domainId/flowId/stepId 또는 "<domainId>#<kind>[i]". */
  ref: z.string(),
  text: z.string(),
  citations: z.array(VerifiedCitationSchema),
  /** ok 인용 ≥1 → "GROUNDED", 아니면 "NEEDS_REVIEW" (삭제 금지). */
  verdict: z.enum(["GROUNDED", "NEEDS_REVIEW"]),
});
export type VerifiedItem = z.infer<typeof VerifiedItemSchema>;

export const DomainVerifyResultSchema = z.object({
  domainId: z.string(),
  items: z.array(VerifiedItemSchema),
  citationTotal: z.number().int().nonnegative(),
  citationOk: z.number().int().nonnegative(),
  /** GROUNDED 항목 비율 (%) — per-doc 근거율의 도메인 분해. */
  groundedPct: z.number(),
});
export type DomainVerifyResult = z.infer<typeof DomainVerifyResultSchema>;

export const VerifyReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domains: z.array(DomainVerifyResultSchema),
  overall: z.object({
    itemTotal: z.number().int().nonnegative(),
    itemGrounded: z.number().int().nonnegative(),
    citationTotal: z.number().int().nonnegative(),
    citationOk: z.number().int().nonnegative(),
    groundedPct: z.number(),
  }),
});
export type VerifyReport = z.infer<typeof VerifyReportSchema>;

/** 공백 정규화 — 들여쓰기/연속 공백 차이는 일치로 본다 (텍스트 자체가 기준). */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 스니펫 효력 기준: ") {", "px;", "return" 같은 도처 일치 토막은 실재해도
 * 근거가 못 된다(리뷰 반영 — M3는 날조 인용만이 아니라 공허 인용도 막아야
 * 한다). 정규화 8자 이상 + 식별자성 토큰(영문/한글 3자 이상) 1개 이상.
 */
function isTrivialSnippet(normalized: string): boolean {
  // 유효 길이: 한글은 글자당 정보량이 높아 2로 센다 ("주문은 회원만" = 7자지만 유효 13)
  let effective = 0;
  for (const ch of normalized) effective += /[가-힣]/.test(ch) ? 2 : 1;
  if (effective < 8) return true;
  // 라틴 식별자 3자+ 또는 한글 단어 2자+ (한글은 2자가 한 단어다)
  return !/[A-Za-z_$][\w$]{2,}|[가-힣]{2,}/.test(normalized);
}

interface FileCache {
  lines: string[] | null; // null = 읽기 실패
  /** 심볼릭 링크 실경로가 루트 밖 — path-escape로 보고. */
  escaped?: boolean;
}

async function verifyCitation(
  projectRoot: string,
  citation: Citation,
  cache: Map<string, FileCache>,
): Promise<CitationStatus> {
  const snippet = normalize(citation.snippet);
  if (isTrivialSnippet(snippet)) return "trivial-snippet";

  const abs = path.resolve(projectRoot, citation.filePath);
  const rootAbs = path.resolve(projectRoot);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return "path-escape";

  let entry = cache.get(abs);
  if (!entry) {
    try {
      // 심볼릭 링크가 루트 밖을 가리키는 우회 차단(리뷰 반영): 실경로로
      // 다시 격리 검사한다. realpath는 존재하는 파일에만 성공 — 실패는 no-file.
      const real = await fs.realpath(abs);
      const realRoot = await fs.realpath(rootAbs);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        entry = { lines: null, escaped: true };
      } else {
        entry = { lines: (await fs.readFile(real, "utf-8")).split("\n") };
      }
    } catch {
      entry = { lines: null };
    }
    cache.set(abs, entry);
  }
  if (entry.escaped) return "path-escape";
  if (entry.lines === null) return "no-file";
  if (citation.line > entry.lines.length) return "line-out-of-range";

  const fileLine = normalize(entry.lines[citation.line - 1]);
  if (fileLine.length === 0 || !fileLine.includes(snippet)) return "text-mismatch";
  return "ok";
}

async function verifyClaim(
  projectRoot: string,
  kind: VerifiedItem["kind"],
  ref: string,
  claim: { text: string; citations: Citation[] },
  cache: Map<string, FileCache>,
): Promise<VerifiedItem> {
  const citations: VerifiedCitation[] = [];
  for (const c of claim.citations) {
    citations.push({ ...c, status: await verifyCitation(projectRoot, c, cache) });
  }
  return {
    kind,
    ref,
    text: claim.text,
    citations,
    verdict: citations.some((c) => c.status === "ok") ? "GROUNDED" : "NEEDS_REVIEW",
  };
}

/** fill 전체를 실파일과 대조 — 결과는 .spec/map/verify-report.json. */
export async function verifyFills(
  projectRoot: string,
  fills: DomainFill[],
  gitCommit: string | null,
): Promise<VerifyReport> {
  const cache = new Map<string, FileCache>();
  const domains: DomainVerifyResult[] = [];

  for (const fill of [...fills].sort((a, b) => cmp(a.domainId, b.domainId))) {
    const items: VerifiedItem[] = [];
    items.push(
      await verifyClaim(projectRoot, "summary", fill.domainId, fill.summary, cache),
    );
    for (const [kind, claims] of [
      ["entity", fill.entities],
      ["businessRule", fill.businessRules],
      ["crossDomain", fill.crossDomainInteractions],
    ] as const) {
      for (let i = 0; i < claims.length; i++) {
        items.push(
          await verifyClaim(
            projectRoot,
            kind,
            `${fill.domainId}#${kind}[${i}]`,
            claims[i],
            cache,
          ),
        );
      }
    }
    for (const f of fill.flows) {
      items.push(await verifyClaim(projectRoot, "flow", f.flowId, f.summary, cache));
    }
    for (const s of fill.steps) {
      items.push(await verifyClaim(projectRoot, "step", s.stepId, s.summary, cache));
    }

    const citationTotal = items.reduce((n, i) => n + i.citations.length, 0);
    const citationOk = items.reduce(
      (n, i) => n + i.citations.filter((c) => c.status === "ok").length,
      0,
    );
    const grounded = items.filter((i) => i.verdict === "GROUNDED").length;
    domains.push({
      domainId: fill.domainId,
      items,
      citationTotal,
      citationOk,
      groundedPct: pct(grounded, items.length),
    });
  }

  const itemTotal = domains.reduce((n, d) => n + d.items.length, 0);
  const itemGrounded = domains.reduce(
    (n, d) => n + d.items.filter((i) => i.verdict === "GROUNDED").length,
    0,
  );
  return {
    schemaVersion: 1,
    gitCommit,
    domains,
    overall: {
      itemTotal,
      itemGrounded,
      citationTotal: domains.reduce((n, d) => n + d.citationTotal, 0),
      citationOk: domains.reduce((n, d) => n + d.citationOk, 0),
      groundedPct: pct(itemGrounded, itemTotal),
    },
  };
}

export async function writeVerifyReport(
  projectRoot: string,
  report: VerifyReport,
): Promise<string> {
  return writeMapArtifact(projectRoot, VERIFY_REPORT_FILENAME, VerifyReportSchema.parse(report));
}

function pct(num: number, den: number): number {
  return den === 0 ? 100 : Math.round((num / den) * 1000) / 10;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
