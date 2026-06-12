import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Claim, Confidence, DocSection, Evidence, GeneratedDoc } from "../types.js";
import { renderMarkdown } from "../doc-generator/index.js";
import type { CensusFile, ConfirmedPlan, FileOwnership } from "../domain-map/types.js";
import type { ImpactResult } from "./types.js";
import type { ImpactVerifyReport } from "./verify.js";

// T7 — 문서 빌더 + 발행 (ADR-002 ID2). ImpactResult(+verify)를 5종 문서와 동일한
// GeneratedDoc 모델로 변환하고 renderMarkdown(읽기전용 statusLine)을 재사용해
// docs/09_release/change-impact-analysis.md로 발행한다. registerDraft는 호출하지
// 않는다 — doc-state 상태기계 밖 읽기전용 분석물(ID2 사용자 확정). BUILDERS 배열
// (5종 파이프라인)에는 등록하지 않아 orchestrator·U-A 무수정 유지.
//
// confidence: 기계 검증(verify)이 GROUNDED면 CONFIRMED_AI(인용 근거), NEEDS_REVIEW
// 면 그대로, 미검증(인용 없음)은 INFERRED. 흐름/도메인은 file:line 근거가 없어
// INFERRED(step 입도=라우트-선언-파일, 실 호출 아님).

export const CHANGE_IMPACT_FILENAME = "change-impact-analysis.md";
export const IMPACT_STATUS_LINE =
  "분석 산출물 · 읽기전용(검토·승인 상태기계 밖) · ktds /understand-impact";

function evidence(filePath: string, line?: number | null): Evidence {
  return line != null ? { path: filePath, line } : { path: filePath };
}

function claim(
  text: string,
  confidence: Confidence,
  ev: Evidence[] = [],
): Claim {
  return {
    claim: text,
    confidence,
    evidence: ev,
    requires_human_review: confidence === "INFERRED" || confidence === "NEEDS_REVIEW",
  };
}

// ── 영향 규모 집계 (T11 — 공수 산정 입력) ────────────────────────────────────
// 도달 폐포의 파일 수를 도메인×방향, 언어×방향으로 집계한다. 공수 자체가
// 아니라 산정 "입력"이다(파일 수=규모 신호). 도메인 귀속은 **슬라이스
// ownership 기반**: ConfirmedDomain.roots는 디렉터리가 아니라 라우트/배치
// 엔트리 '파일 경로'다(slices entryIdsByRoot=route.filePath → classify →
// confirm 그대로 복사) — prefix 매칭은 실데이터에서 전건 미분류로 쏠리는
// 오답이라 기각(리뷰 critical). 규칙: 루트 자신=그 도메인 / 단일 도메인
// owners=해당 도메인 / 복수 도메인=(공용) / 미도달·confirmed 밖=(미분류).
// ownership·roots 모두 정렬 산출물이라 결정론 유지.

export interface ImpactAggregateRow {
  label: string;
  upstream: number;
  downstream: number;
}

export interface ImpactAggregate {
  byDomain: ImpactAggregateRow[] | null; // confirmed 부재 시 null (도메인 미확정)
  byLang: ImpactAggregateRow[];
}

export interface ImpactAggregateInputs {
  census: readonly CensusFile[];
  confirmed: ConfirmedPlan | null;
  /** slices.json ownership — 도메인 귀속의 유일 근거 (relPath→owner root 파일들). */
  ownership: readonly FileOwnership[];
}

function tally(
  upPaths: readonly string[],
  downPaths: readonly string[],
  labelOf: (relPath: string) => string,
): ImpactAggregateRow[] {
  const rows = new Map<string, { upstream: number; downstream: number }>();
  const bump = (relPath: string, dir: "upstream" | "downstream") => {
    const label = labelOf(relPath);
    const row = rows.get(label) ?? { upstream: 0, downstream: 0 };
    row[dir] += 1;
    rows.set(label, row);
  };
  for (const p of upPaths) bump(p, "upstream");
  for (const p of downPaths) bump(p, "downstream");
  return [...rows.entries()]
    .map(([label, r]) => ({ label, ...r }))
    .sort(
      (a, b) =>
        b.upstream + b.downstream - (a.upstream + a.downstream) ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    );
}

export function aggregateImpactCounts(
  result: ImpactResult,
  inputs: ImpactAggregateInputs,
): ImpactAggregate {
  const upPaths = result.upstream.files.map((f) => f.relPath);
  const downPaths = result.downstream.files.map((f) => f.relPath);

  let byDomain: ImpactAggregateRow[] | null = null;
  if (inputs.confirmed) {
    // 엔트리 root 파일 → 표시 라벨. confirm 게이트가 root 배타 소유를 보장하고
    // 병합은 roots를 합집합 승계하므로(aliasKeys 불필요) 함수 매핑이 성립.
    const rootLabel = new Map<string, string>();
    for (const d of inputs.confirmed.domains) {
      const label = d.name === d.key ? d.key : `${d.name} (${d.key})`;
      for (const root of d.roots) rootLabel.set(root, label);
    }
    const ownersByFile = new Map(inputs.ownership.map((o) => [o.relPath, o.owners]));
    const domainOf = (relPath: string): string => {
      const direct = rootLabel.get(relPath);
      if (direct !== undefined) return direct; // 루트 파일 자신 = 그 도메인의 닻
      const owners = ownersByFile.get(relPath);
      if (!owners || owners.length === 0) return "(미분류)"; // 미도달/ownership 밖
      const labels = new Set<string>();
      for (const o of owners) {
        const l = rootLabel.get(o);
        if (l !== undefined) labels.add(l);
      }
      if (labels.size === 0) return "(미분류)"; // owners 전원이 confirmed 밖(게이트 제외)
      if (labels.size > 1) return "(공용)"; // 복수 도메인 도달
      return [...labels][0];
    };
    byDomain = tally(upPaths, downPaths, domainOf);
  }

  const langByFile = new Map(inputs.census.map((f) => [f.relPath, f.lang]));
  const byLang = tally(upPaths, downPaths, (p) => langByFile.get(p) ?? "(census 밖)");

  return { byDomain, byLang };
}

function aggregateTable(heading: string, rows: readonly ImpactAggregateRow[]): string {
  const lines = [`**${heading}**`, "", "| 구분 | 상류 | 하류 | 계 |", "| --- | ---: | ---: | ---: |"];
  let up = 0;
  let down = 0;
  for (const r of rows) {
    lines.push(`| ${r.label} | ${r.upstream} | ${r.downstream} | ${r.upstream + r.downstream} |`);
    up += r.upstream;
    down += r.downstream;
  }
  lines.push(`| **계** | ${up} | ${down} | ${up + down} |`);
  return lines.join("\n");
}

function buildAggregateSection(
  result: ImpactResult,
  inputs: ImpactAggregateInputs,
): DocSection {
  const agg = aggregateImpactCounts(result, inputs);
  const parts = [
    "도달 폐포의 **파일 수 기준 규모 신호**다 — 공수 그 자체가 아니라 산정 입력. " +
      "상류=영향받는 호출자, 하류=의존 협력자(시드 제외, 양쪽 도달 파일은 양쪽에 계상). " +
      "도메인 귀속=슬라이스 ownership: (공용)=복수 도메인이 도달하는 파일, (미분류)=도달성 밖이거나 확정 도메인 밖.",
  ];
  if (agg.byDomain) parts.push(aggregateTable("도메인별", agg.byDomain));
  else parts.push("_도메인 미확정(/understand-map confirm 전) — 언어별 집계만 제공._");
  parts.push(aggregateTable("언어별", agg.byLang));
  return { heading: "영향 규모 집계 (공수 산정 입력)", claims: [], prose: parts.join("\n\n") };
}

export function buildChangeImpact(
  result: ImpactResult,
  verify: ImpactVerifyReport,
  /** 제공 시 "영향 규모 집계" 섹션 추가 (CLI 경로 — 미제공 호출은 기존 7섹션 그대로). */
  aggregate?: ImpactAggregateInputs,
): GeneratedDoc {
  // 기계 검증 평결 인덱스 (kind|ref → verdict). 불변식: engine.buildClaimItems가
  // api/mapper/upstream/downstream 항목을 1:1로 verify에 넣으므로, 그 종류의
  // confFor INFERRED 분기는 정상 경로가 아니라 "verify 항목 누락" 안전망이다.
  const verdict = new Map<string, "GROUNDED" | "NEEDS_REVIEW">();
  for (const it of verify.items) verdict.set(`${it.kind}|${it.ref}`, it.verdict);
  const confFor = (kind: string, ref: string): Confidence => {
    const v = verdict.get(`${kind}|${ref}`);
    if (v === "GROUNDED") return "CONFIRMED_AI";
    if (v === "NEEDS_REVIEW") return "NEEDS_REVIEW";
    return "INFERRED"; // 인용 없음(미검증)
  };

  // 변경 대상 (seeds)
  const seedClaims = result.seeds.map((s) =>
    claim(`변경 시드: ${s.relPath} (origin: ${s.origin})`, s.confidence, [evidence(s.relPath)]),
  );

  // API 영향 (upstream)
  const apiClaims = result.upstream.api.map((a) => {
    const h = a.handler ? `, handler ${a.handler}` : "";
    return claim(
      `진입점 영향: ${a.id}${h} (검출 ${a.via})`,
      confFor("api", a.id),
      [evidence(a.filePath, a.line)],
    );
  });

  // 업무 흐름 · 도메인 영향
  const flowClaims = result.upstream.flows.map((f) =>
    claim(
      `흐름 영향: ${f.flowId} → 도메인 ${f.domainName ?? f.domainKey ?? "(미상)"} (검출 ${f.via})`,
      f.confidence,
    ),
  );
  const domainClaims = result.upstream.domains.map((d) =>
    claim(`도메인 영향: ${d.name ?? d.key}`, d.confidence),
  );

  // DB · 영속성 영향 (downstream)
  const mapperClaims = result.upstream.persistence.mappers.map((m) => {
    const ns = m.namespace ? ` [namespace ${m.namespace}]` : "";
    const owners = m.owners.length ? ` · 진입점 ${m.owners.length}개` : "";
    return claim(
      `영속성 영향(매퍼): ${m.relPath}${ns}${owners}`,
      confFor("mapper", m.relPath),
      m.citation ? [evidence(m.citation.filePath, m.citation.line)] : [],
    );
  });
  const sqlClaims = result.upstream.persistence.sqlFiles.map((s) =>
    claim(`영속성 영향(SQL): ${s.relPath}`, "INFERRED", [evidence(s.relPath)]),
  );
  const dbProse = [
    result.upstream.persistence.note,
    `host 인용 추출 대상 매퍼 슬라이스 ${result.upstream.persistence.tableCandidateSlots.length}개` +
      ` · KG 테이블 카탈로그 ${result.upstream.persistence.kgTableCatalog.length}개(테이블명→DDL 근거).`,
  ].join("\n\n");

  // 연관 모듈 (upstream) / 연관 협력 (downstream 보조)
  const upstreamClaims = result.upstream.files.map((f) =>
    claim(
      `연관 모듈(상류): ${f.relPath} (via ${f.viaKinds.join(",")}, 깊이 ${f.minDepth})`,
      f.citation ? confFor("upstream", f.relPath) : "INFERRED",
      f.citation ? [evidence(f.citation.filePath, f.citation.line)] : [],
    ),
  );
  const downstreamClaims = result.downstream.files.map((f) =>
    claim(
      `연관 협력(하류): ${f.relPath} (via ${f.viaKinds.join(",")}, 깊이 ${f.minDepth})`,
      f.citation ? confFor("downstream", f.relPath) : "INFERRED",
      f.citation ? [evidence(f.citation.filePath, f.citation.line)] : [],
    ),
  );

  // 검토 필요 (needsReview + 과도전파)
  const reviewClaims = result.needsReview.map((n) =>
    claim(`${n.ref}: ${n.reason}`, "NEEDS_REVIEW"),
  );

  const sections: DocSection[] = [
    { heading: "변경 대상 (시드)", claims: seedClaims },
    ...(aggregate ? [buildAggregateSection(result, aggregate)] : []),
    { heading: "API · 진입점 영향", claims: apiClaims },
    { heading: "업무 흐름 · 도메인 영향", claims: [...flowClaims, ...domainClaims] },
    { heading: "DB · 영속성 영향", claims: [...mapperClaims, ...sqlClaims], prose: dbProse },
    { heading: "연관 모듈 (상류 영향)", claims: upstreamClaims },
    { heading: "연관 협력 (하류 의존 · 보조)", claims: downstreamClaims },
    { heading: "검토 필요", claims: reviewClaims },
  ];

  return { filename: CHANGE_IMPACT_FILENAME, title: "변경 영향도 분석", sections };
}

/** docs/09_release/change-impact-analysis.md 발행 (읽기전용 — registerDraft 미호출). */
export async function publishChangeImpact(
  projectRoot: string,
  doc: GeneratedDoc,
): Promise<string> {
  const dir = path.join(projectRoot, "docs", "09_release");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, CHANGE_IMPACT_FILENAME);
  await fs.writeFile(file, renderMarkdown(doc, IMPACT_STATUS_LINE), "utf-8");
  return file;
}
