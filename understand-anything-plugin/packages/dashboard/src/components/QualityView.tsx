import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, Ev, PageHead, ProtoTabs, StatTile } from "./proto/Proto";
import type { BadgeTone } from "./proto/Proto";

/* ────────────────────────── 데이터 타입 (실물 .spec/map/*.json) ────────────────────────── */

type Grade = "상" | "중" | "하";
type CapTier = "full" | "partial" | "none";

interface RiskMetrics {
  complexity: number;
  fanIn: number;
  fanOut: number;
  loc: number;
  churnLines: number;
  churnCommits: number;
  unreached: boolean;
}
interface RiskItem {
  name: string;
  filePath: string;
  domain: string;
  layer: string;
  grade: Grade;
  factors: string[];
  metrics: RiskMetrics;
  normalized: Record<string, number>;
  /** 실물 risk-report.json 에 존재 — 백분위 정규화 가중합 (0..1) */
  score?: number;
}
interface RiskMeta {
  weights: Record<string, number>;
  topN: number;
  degenerateMetrics: string[];
  churnAvailable: boolean;
  edgeKinds: string[];
}
interface RiskReport {
  items: RiskItem[];
  meta: RiskMeta;
}

interface CoverageFiles {
  byLang: Array<{ lang: string; count: number }>;
  total?: number;
}
interface CoverageLayers {
  rate: number;
  resolved: number;
  unknown: number;
  byLayer?: Array<{ layer: string; count: number }>;
}
interface CoverageRate {
  rate: number;
  reached?: number;
  unreached?: number;
  resolved?: number;
  unresolved?: number;
}
interface LangSupportEntry {
  lang: string;
  best: CapTier;
  core?: CapTier;
  files: number;
  capabilities: Array<{ key: string; tier: CapTier }>;
}
interface Coverage {
  files: CoverageFiles;
  layers: CoverageLayers;
  reachability: CoverageRate;
  edges: CoverageRate;
  langSupport: { byLang: LangSupportEntry[] };
  droppedSteps?: number;
}

interface GoldenMetric {
  structure: number;
  citations: number;
  recall: number;
  citationCount: number;
  extras: number;
}
interface Golden {
  schemaVersion: number;
  scorerVersion: number;
  metrics: Record<string, GoldenMetric>;
}

/* ────────────────────────── 라벨/매핑 ────────────────────────── */

const FACTOR_LABEL: Record<string, string> = {
  fanIn: "팬인",
  complexity: "복잡도",
  loc: "LOC",
  churn: "변경 빈도",
  fanOut: "팬아웃",
  unreached: "미도달",
};
const GRADE_TONE: Record<Grade, BadgeTone> = { 상: "err", 중: "warn", 하: "mut" };
const GRADE_BAR: Record<Grade, string> = {
  상: "var(--color-status-error)",
  중: "var(--color-status-warn)",
  하: "var(--color-status-ok)",
};
const GRADE_RANK: Record<Grade, number> = { 상: 0, 중: 1, 하: 2 };

const CAP_LABEL: Record<string, string> = {
  routes: "라우트",
  batch: "배치",
  edges: "엣지",
  "method-calls": "콜체인",
  interfaces: "인터페이스",
  jpa: "JPA",
  "db-schema": "DB 스키마",
  complexity: "복잡도",
};
const LANG_LABEL: Record<string, string> = {
  java: "Java",
  jsp: "JSP",
  xml: "XML",
  sql: "SQL",
  cmd: "cmd",
};
const CAP_BADGE: Record<CapTier, { tone: BadgeTone; label: string }> = {
  full: { tone: "ok", label: "지원" },
  partial: { tone: "warn", label: "부분" },
  none: { tone: "err", label: "미지원" },
};
const GOLD_ARTIFACT_LABEL: Record<string, string> = {
  "domain-graph": "도메인 그래프",
  rtm: "RTM",
};

/* ────────────────────────── fetch (ScreenSpecView 관례) ────────────────────────── */

function useQualityData() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [golden, setGolden] = useState<Golden | null>(null);
  const [goldenMissing, setGoldenMissing] = useState(false);

  useEffect(() => {
    fetch(`${dataBase}risk-report.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: RiskReport) => {
        if (Array.isArray(d?.items)) setRisk(d);
      })
      .catch(() => {});
    fetch(`${dataBase}coverage.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Coverage) => {
        if (d?.files) setCoverage(d);
      })
      .catch(() => {});
    fetch(`${dataBase}golden-baseline.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Golden) => {
        if (d?.metrics) setGolden(d);
        else setGoldenMissing(true);
      })
      .catch(() => setGoldenMissing(true));
  }, [dataBase, tokenQ]);

  return { risk, coverage, golden, goldenMissing };
}

/* ────────────────────────── 소자 ────────────────────────── */

function num(n: number | undefined): string {
  return n == null ? "—" : String(n);
}
function pct(v: number | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(0)}`;
}

/** btn-outline 스타일의 라우터 링크 */
function LinkBtn({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold no-underline"
      style={{ padding: "7px 14px", fontSize: 13 }}
    >
      {children}
    </Link>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap text-text-secondary"
      style={{
        fontSize: 11,
        padding: "1px 7px",
        marginRight: 4,
        borderRadius: 5,
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      {children}
    </span>
  );
}

/* ────────────────────────── 위험 모듈 탭 ────────────────────────── */

function RiskPanel({ report }: { report: RiskReport }) {
  const { items, meta } = report;
  const hasScore = items.some((it) => typeof it.score === "number");

  const sorted = useMemo(() => {
    const copy = [...items];
    if (hasScore) {
      copy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else {
      copy.sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || b.metrics.loc - a.metrics.loc);
    }
    return copy;
  }, [items, hasScore]);

  const topN = meta.topN ?? 20;
  const rows = sorted.slice(0, topN);
  const remaining = items.length - rows.length;

  const gradeCount = (g: Grade) => items.filter((it) => it.grade === g).length;
  const unreachedCount = items.filter((it) => it.metrics.unreached).length;

  const shortPath = (p: string) => {
    const parts = p.split("/");
    return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : p;
  };

  const weightList = Object.entries(meta.weights ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `${k} ${w}`)
    .join(" · ");

  return (
    <>
      <section
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", marginBottom: 14 }}
      >
        <StatTile label="등급 상" value={gradeCount("상")} valueColor="var(--color-status-error)" />
        <StatTile label="등급 중" value={gradeCount("중")} valueColor="var(--color-status-warn)" />
        <StatTile label="등급 하" value={gradeCount("하")} />
        <StatTile label="미도달 코드" value={unreachedCount} small="파일" />
      </section>

      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
        <div className="overflow-x-auto">
          <table className="proto-tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>파일</th>
                {hasScore && <th>점수</th>}
                <th>등급</th>
                <th>주요 요인</th>
                <th className="num">복잡도</th>
                <th className="num">팬인</th>
                <th className="num">LOC</th>
                <th className="num">변경(줄)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={it.filePath}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <b className="text-text-primary">{it.name}</b>
                    <div style={{ marginTop: 2 }}>
                      <Ev>
                        {shortPath(it.filePath)} · {it.domain}
                      </Ev>
                    </div>
                  </td>
                  {hasScore && (
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: 90,
                            height: 6,
                            borderRadius: 3,
                            background: "var(--color-elevated)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round((it.score ?? 0) * 100)}%`,
                              height: "100%",
                              background: GRADE_BAR[it.grade],
                            }}
                          />
                        </div>
                        <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                          {(it.score ?? 0).toFixed(3)}
                        </span>
                      </div>
                    </td>
                  )}
                  <td>
                    <Badge tone={GRADE_TONE[it.grade]}>{it.grade}</Badge>
                  </td>
                  <td>
                    {it.factors.map((f) => (
                      <Chip key={f}>{FACTOR_LABEL[f] ?? f}</Chip>
                    ))}
                  </td>
                  <td className="num">{num(it.metrics.complexity)}</td>
                  <td className="num">{num(it.metrics.fanIn)}</td>
                  <td className="num">{num(it.metrics.loc)}</td>
                  <td className="num">{num(it.metrics.churnLines)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {remaining > 0 && (
          <div className="text-text-muted" style={{ fontSize: 12, padding: "8px 4px 0" }}>
            상위 {rows.length}건 표시 · 외 {remaining}건
          </div>
        )}

        <div
          className="flex items-center flex-wrap"
          style={{ gap: 10, padding: "12px 4px 0", fontSize: 12.5 }}
        >
          <Link to="/structure?overlay=risk" className="no-underline" style={{ color: "var(--color-status-info)" }}>
            구조 그래프에서 위험 오버레이로 보기 →
          </Link>
          {weightList && (
            <span className="text-text-muted">· 점수 = {weightList} 가중 합산(백분위 정규화)</span>
          )}
          {meta.degenerateMetrics?.length > 0 && (
            <span className="text-text-muted">
              · 퇴화 지표: {meta.degenerateMetrics.join(", ")}(변별력 없음)
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────── 커버리지 탭 ────────────────────────── */

function CoveragePanel({ cov }: { cov: Coverage }) {
  const scanned = cov.files.byLang.reduce((s, b) => s + b.count, 0);

  // capability 열 순서 = 등장 순서 union
  const capKeys = useMemo(() => {
    const seen: string[] = [];
    for (const l of cov.langSupport.byLang) {
      for (const c of l.capabilities) {
        if (!seen.includes(c.key)) seen.push(c.key);
      }
    }
    return seen;
  }, [cov]);

  const dropped = cov.droppedSteps ?? 0;
  const unknownLayers = cov.layers.unknown ?? 0;

  return (
    <>
      <section
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 14 }}
      >
        <StatTile label="스캔 파일" value={scanned} small="파일" />
        <StatTile label="레이어 해석률" value={cov.layers.rate} small="%" />
        <StatTile label="도달성" value={cov.reachability.rate} small="%" />
        <StatTile label="엣지 해석률" value={cov.edges.rate} small="%" />
      </section>

      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
        <div className="overflow-x-auto">
          <table className="proto-tbl">
            <thead>
              <tr>
                <th>언어 / 프레임워크</th>
                {capKeys.map((k) => (
                  <th key={k}>{CAP_LABEL[k] ?? k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cov.langSupport.byLang.map((l) => {
                const byKey = new Map(l.capabilities.map((c) => [c.key, c.tier]));
                return (
                  <tr key={l.lang}>
                    <td>
                      <b className="text-text-primary">{LANG_LABEL[l.lang] ?? l.lang}</b>
                      <div style={{ marginTop: 2 }}>
                        <Ev>{l.files}파일</Ev>
                      </div>
                    </td>
                    {capKeys.map((k) => {
                      const tier = byKey.get(k);
                      if (tier == null) return <td key={k}>—</td>;
                      const b = CAP_BADGE[tier];
                      return (
                        <td key={k}>
                          <Badge tone={b.tone}>{b.label}</Badge>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-text-muted flex flex-wrap items-center" style={{ fontSize: 12.5, gap: 10, padding: "12px 4px 0" }}>
          {dropped > 0 && (
            <span>
              드랍된 스텝 <b style={{ color: "var(--color-status-warn)" }}>{dropped}</b> — 침묵 누락 대신 카운트로 표면화
            </span>
          )}
          {unknownLayers > 0 && (
            <span>
              · 레이어 미해석 <b className="text-text-primary">{unknownLayers}</b>파일
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────── 정확도 기준선 탭 ────────────────────────── */

function GoldenPanel({ golden, missing }: { golden: Golden | null; missing: boolean }) {
  if (!golden) {
    return (
      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "22px 20px" }}>
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          {missing
            ? "골든셋 미동결 — qa-golden-score.mjs 로 사람 확정본을 동결/채점한 뒤 기준선이 표시됩니다."
            : "골든 기준선을 불러오는 중입니다."}
        </p>
      </div>
    );
  }

  const artifacts = Object.entries(golden.metrics);

  return (
    <>
      {artifacts.map(([key, m]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 8 }}>
            <h3 className="font-heading text-text-primary font-bold" style={{ fontSize: 14 }}>
              {GOLD_ARTIFACT_LABEL[key] ?? key}
            </h3>
            {m.extras > 0 && <Badge tone="warn">초과 단위 {m.extras} — 수동 리뷰</Badge>}
          </div>
          <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <StatTile label="구조 일치율" value={pct(m.structure)} small="%" />
            <StatTile label="근거 유효율" value={pct(m.citations)} small={`% · 인용 ${m.citationCount}`} />
            <StatTile label="핵심 재현율" value={pct(m.recall)} small="%" />
          </section>
        </div>
      ))}

      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
        <h3 className="font-heading text-text-primary font-bold" style={{ fontSize: 14, marginBottom: 6 }}>
          골든셋 회귀 (사람 확정본 대비)
        </h3>
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>
          LLM 보강 산출물(정책서 서술·RTM 분해·도메인 요약)을 사람 확정 골든셋과 채점 비교합니다. 기준선(scorer v
          {golden.scorerVersion}) 대비 하락 시 릴리스 게이트에서 차단됩니다.
        </p>
        <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
          ※ 근거 유효율은 인용(file:line)의 실존성 검증이지 서술 진위 검증이 아닙니다.
        </p>
      </div>
    </>
  );
}

/* ────────────────────────── 메인 ────────────────────────── */

type QualTab = "risk" | "cov" | "gold";

export default function QualityView() {
  const { risk, coverage, golden, goldenMissing } = useQualityData();
  const [tab, setTab] = useState<QualTab>("risk");

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="품질 · 위험"
        meta="risk-report · coverage · 골든셋 회귀 — PM 주간보고용 정량 지표"
        actions={
          <LinkBtn to="/deliverables/si-위험모듈리포트">md 리포트</LinkBtn>
        }
      />

      <ProtoTabs<QualTab>
        tabs={[
          { key: "risk", label: "위험 모듈", count: risk?.items.length },
          { key: "cov", label: "분석 커버리지" },
          { key: "gold", label: "정확도 기준선" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "risk" &&
        (risk ? (
          <RiskPanel report={risk} />
        ) : (
          <p className="text-text-muted" style={{ fontSize: 13 }}>
            risk-report.json 을 불러올 수 없습니다.
          </p>
        ))}

      {tab === "cov" &&
        (coverage ? (
          <CoveragePanel cov={coverage} />
        ) : (
          <p className="text-text-muted" style={{ fontSize: 13 }}>
            coverage.json 을 불러올 수 없습니다.
          </p>
        ))}

      {tab === "gold" && <GoldenPanel golden={golden} missing={goldenMissing} />}
    </div>
  );
}
