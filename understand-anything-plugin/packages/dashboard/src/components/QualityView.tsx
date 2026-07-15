import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, ConfBadge, Ev, ProtoTabs, StatTile } from "./proto/Proto";
import TopBarSlot from "../app/shell/TopBarSlot";
import InfoPopover from "./InfoPopover";
import type { BadgeTone } from "./proto/Proto";

/* ────────────────────────── 데이터 타입 (실물 .spec/map/*.json) ────────────────────────── */

type Grade = "상" | "중" | "하";
type CapTier = "full" | "partial" | "none";

interface RiskMetrics {
  complexity: number | null;
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
  /** 실물 risk-report.json 에 존재 — 프로그램 유형(screen·service·dao·common·mapper-xml…) */
  type: string;
  programId: string;
  grade: Grade;
  factors: string[];
  metrics: RiskMetrics;
  normalized: Record<string, number | null>;
  /** [미확인] 마킹 등 — 있으면 미측정 지표 포함(신뢰도 [추정]) */
  notes: string[];
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
interface RiskStats {
  programs?: number;
  excluded?: Record<string, number>;
  measured?: Record<string, number>;
  unreached?: number;
  /** 확장자별 복잡도 미측정 분해(jsp·xml 등) — 침묵 누락 금지 */
  complexityUnmeasured?: Array<{ ext: string; count: number }>;
}
interface RiskReport {
  items: RiskItem[];
  meta: RiskMeta;
  stats?: RiskStats;
}

interface CoverageFiles {
  byLang: Array<{ lang: string; count: number }>;
  total?: number;
  nonJavaPassthrough?: number;
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
interface CoveragePrograms {
  byType: Array<{ type: string; count: number }>;
  total: number;
  unadjustedFp: number;
}
interface Coverage {
  files: CoverageFiles;
  layers: CoverageLayers;
  reachability: CoverageRate;
  edges: CoverageRate;
  langSupport: { byLang: LangSupportEntry[]; partialFiles?: number; unsupportedFiles?: number };
  programs?: CoveragePrograms;
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

/* ────────────────────────── 로딩 상태 ────────────────────────── */

type Loadable<T> = { s: "loading" } | { s: "error"; msg: string } | { s: "ready"; data: T };

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
const GRADE_TEXT: Record<Grade, string> = { 상: "위험 상", 중: "위험 중", 하: "위험 하" };

const LAYER_LABEL: Record<string, string> = {
  api: "API",
  dao: "DAO",
  db: "DB",
  service: "서비스",
  batch: "배치",
  unknown: "미분류",
};
const TYPE_LABEL: Record<string, string> = {
  common: "공통",
  dao: "DAO",
  "mapper-xml": "매퍼XML",
  screen: "화면",
  service: "서비스",
  test: "테스트",
  batch: "배치",
};

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
/** 정확도 기준선 산출물 → 관련 메뉴 딥링크(데이터 없으면 생략) */
const GOLD_ARTIFACT_LINK: Record<string, string> = {
  "domain-graph": "/domains",
  rtm: "/rtm",
};

/* ── sticky 헤더(스크롤 컨테이너 내부 기준) ── */
const STICKY_HEAD: CSSProperties = { position: "sticky", top: 0, background: "var(--color-panel)", zIndex: 2 };

/* ────────────────────────── fetch (DataMapView 관례 — 로딩/에러 분리) ────────────────────────── */

function useQualityData() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [risk, setRisk] = useState<Loadable<RiskReport>>({ s: "loading" });
  const [coverage, setCoverage] = useState<Loadable<Coverage>>({ s: "loading" });
  const [golden, setGolden] = useState<Golden | null>(null);
  const [goldenMissing, setGoldenMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setRisk({ s: "loading" });
    setCoverage({ s: "loading" });
    setGolden(null);
    setGoldenMissing(false);

    fetch(`${dataBase}risk-report.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: RiskReport) => {
        if (!alive) return;
        if (Array.isArray(d?.items)) setRisk({ s: "ready", data: d });
        else setRisk({ s: "error", msg: "risk-report.json 형식 오류" });
      })
      .catch((e) => alive && setRisk({ s: "error", msg: String(e instanceof Error ? e.message : e) }));

    fetch(`${dataBase}coverage.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Coverage) => {
        if (!alive) return;
        if (d?.files) setCoverage({ s: "ready", data: d });
        else setCoverage({ s: "error", msg: "coverage.json 형식 오류" });
      })
      .catch((e) => alive && setCoverage({ s: "error", msg: String(e instanceof Error ? e.message : e) }));

    // 골든셋은 미동결(파일 부재/미채점)이 정상 경로 — 실패/무metrics 를 모두 '미동결'로 취급.
    fetch(`${dataBase}golden-baseline.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Golden) => {
        if (!alive) return;
        if (d?.metrics) setGolden(d);
        else setGoldenMissing(true);
      })
      .catch(() => alive && setGoldenMissing(true));

    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  return { risk, coverage, golden, goldenMissing };
}

/* ────────────────────────── 소자 ────────────────────────── */

function num(n: number | null | undefined): string {
  return n == null ? "—" : String(n);
}
function pct(v: number | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(0)}`;
}

/** 검색어 매치 하이라이트 — 첫 매치 구간만 <mark> 로 강조. */
function mark(text: string, q: string): ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "color-mix(in srgb, var(--color-status-info) 24%, transparent)", color: "inherit", padding: 0 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
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

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
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

/** 정직한 부재/오류/로딩 안내 카드. */
function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[10px] border border-border-subtle bg-panel card-shadow text-text-muted"
      style={{ padding: "28px 26px", fontSize: 13, lineHeight: 1.7 }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────── 위험 모듈 탭 ────────────────────────── */

type SortKey = "score" | "grade" | "complexity" | "fanIn" | "fanOut" | "loc" | "churn";
const SORT_KEYS: SortKey[] = ["score", "grade", "complexity", "fanIn", "fanOut", "loc", "churn"];

function sortVal(it: RiskItem, key: SortKey): number {
  switch (key) {
    case "score":
      return it.score ?? 0;
    case "grade":
      return 2 - GRADE_RANK[it.grade]; // 상=2 → 내림차순이 '상' 먼저
    case "complexity":
      return it.metrics.complexity ?? -1;
    case "fanIn":
      return it.metrics.fanIn;
    case "fanOut":
      return it.metrics.fanOut;
    case "loc":
      return it.metrics.loc;
    case "churn":
      return it.metrics.churnLines;
  }
}

/** 정렬 가능한 헤더 셀 — aria-sort + 클릭 토글. */
function SortTh({
  label,
  col,
  num: isNum,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  num?: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (c: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className={isNum ? "num" : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(col)}
      title="클릭하여 정렬"
      style={{ ...STICKY_HEAD, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      {label}
      <span className="text-text-muted" style={{ marginLeft: 3, fontSize: 10 }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function RiskPanel({ report }: { report: RiskReport }) {
  const { items, meta, stats } = report;
  const hasScore = items.some((it) => typeof it.score === "number");

  const [searchParams, setSearchParams] = useSearchParams();
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);

  const q = searchParams.get("q") ?? "";
  const ql = q.trim().toLowerCase();
  const gradeF = searchParams.get("grade");
  const layerF = searchParams.get("layer");
  const typeF = searchParams.get("type");
  const filterActive = ql !== "" || !!gradeF || !!layerF || !!typeF;

  const rawSort = searchParams.get("sort");
  const sortKey: SortKey = SORT_KEYS.includes(rawSort as SortKey)
    ? (rawSort as SortKey)
    : hasScore
      ? "score"
      : "grade";
  const sortDir: "asc" | "desc" = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const layers = useMemo(() => Array.from(new Set(items.map((i) => i.layer))).sort(), [items]);
  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))).sort(), [items]);

  // 정렬은 항상 적용. hasScore 없으면 등급 기준(하위호환). 동점은 loc desc → filePath asc 결정론.
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const d = (sortVal(a, sortKey) - sortVal(b, sortKey)) * mul;
      if (d !== 0) return d;
      if (b.metrics.loc !== a.metrics.loc) return b.metrics.loc - a.metrics.loc;
      return a.filePath.localeCompare(b.filePath);
    });
  }, [items, sortKey, sortDir]);

  const matched = useMemo(() => {
    return sorted.filter((it) => {
      if (gradeF && it.grade !== gradeF) return false;
      if (layerF && it.layer !== layerF) return false;
      if (typeF && it.type !== typeF) return false;
      if (ql) {
        const hay = `${it.name} ${it.filePath} ${it.domain} ${it.layer} ${it.type} ${it.programId}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [sorted, ql, gradeF, layerF, typeF]);

  const topN = meta.topN ?? 20;
  // 기본 뷰는 Top N 절단, 검색·필터 활성 시 절단 해제(매치 전건).
  const rows = filterActive ? matched : matched.slice(0, topN);
  const remaining = matched.length - rows.length;

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

  const unmeasured = stats?.complexityUnmeasured ?? [];
  const unmeasuredText = unmeasured
    .map((u) => `${LANG_LABEL[u.ext] ?? u.ext.toUpperCase()} ${u.count}`)
    .join(" · ");

  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set(k, v);
        else prev.delete(k);
        return prev;
      },
      { replace },
    );

  const onSort = (col: SortKey) =>
    setSearchParams(
      (prev) => {
        const cur = prev.get("sort") ?? (hasScore ? "score" : "grade");
        const curDir = prev.get("dir") === "asc" ? "asc" : "desc";
        if (cur === col) prev.set("dir", curDir === "asc" ? "desc" : "asc");
        else {
          prev.set("sort", col);
          prev.set("dir", "desc");
        }
        return prev;
      },
      { replace: true },
    );

  const selectCls = "rounded-lg border border-border-medium bg-panel text-text-secondary";
  const selectStyle: CSSProperties = { padding: "6px 10px", fontSize: 12.5 };

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

      {/* 툴바 — 검색 · 등급/레이어/유형 필터 · 표시 카운트 */}
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setParam("q", e.target.value || null, true)}
          placeholder="파일·도메인·프로그램ID 검색"
          className="rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
          style={{ padding: "6px 12px", fontSize: 12.5, width: 220 }}
        />
        <select value={gradeF ?? ""} onChange={(e) => setParam("grade", e.target.value || null)} className={selectCls} style={selectStyle}>
          <option value="">등급 전체</option>
          <option value="상">상</option>
          <option value="중">중</option>
          <option value="하">하</option>
        </select>
        <select value={layerF ?? ""} onChange={(e) => setParam("layer", e.target.value || null)} className={selectCls} style={selectStyle}>
          <option value="">레이어 전체</option>
          {layers.map((l) => (
            <option key={l} value={l}>
              {LAYER_LABEL[l] ?? l}
            </option>
          ))}
        </select>
        <select value={typeF ?? ""} onChange={(e) => setParam("type", e.target.value || null)} className={selectCls} style={selectStyle}>
          <option value="">유형 전체</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <span className="text-text-muted" style={{ fontSize: 12 }}>
          {filterActive ? `${matched.length}건 표시 (전체 ${items.length})` : `상위 ${rows.length}건 · 외 ${remaining}건`}
        </span>
      </div>

      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 380px)" }}>
          <table className="proto-tbl">
            <thead>
              <tr>
                <th style={STICKY_HEAD}>#</th>
                <th style={STICKY_HEAD}>파일</th>
                {hasScore && <SortTh label="점수" col="score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />}
                <SortTh label="등급" col="grade" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th style={STICKY_HEAD}>신뢰도</th>
                <th style={STICKY_HEAD}>주요 요인</th>
                <SortTh label="복잡도" col="complexity" num sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="팬인" col="fanIn" num sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="팬아웃" col="fanOut" num sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="LOC" col="loc" num sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="변경(줄)" col="churn" num sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => {
                const inferred = it.notes.some((n) => n.includes("[미확인]"));
                const confTitle = inferred
                  ? `${it.notes.join(" · ")} — 기계 판정`
                  : "전 지표 측정 — 기계 판정";
                const normTitle = Object.entries(it.normalized)
                  .filter(([, v]) => v != null)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([k, v]) => `${FACTOR_LABEL[k] ?? k} ${(v as number).toFixed(2)}`)
                  .join(" · ");
                return (
                  <tr key={it.filePath} style={{ contentVisibility: "auto", containIntrinsicBlockSize: "52px" }}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <b className="text-text-primary">{mark(it.name, ql)}</b>
                      <div style={{ marginTop: 2 }}>
                        <button
                          type="button"
                          onClick={() => openCodeViewerAt(it.filePath, 1)}
                          className="cursor-pointer bg-transparent border-0 text-left"
                          style={{ font: "inherit", fontFamily: "var(--font-mono)", fontSize: 11, padding: 0, color: "var(--color-status-info)" }}
                          title={it.filePath}
                        >
                          {mark(shortPath(it.filePath), ql)}
                        </button>
                        <span className="text-text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                          {it.domain}
                        </span>
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <Chip title={`레이어: ${it.layer}`}>{LAYER_LABEL[it.layer] ?? it.layer}</Chip>
                        <Chip title={`유형: ${it.type}`}>{TYPE_LABEL[it.type] ?? it.type}</Chip>
                        {it.metrics.unreached && <Chip title="호출그래프 미도달(뷰 forward 미추적 오탐 가능)">미도달</Chip>}
                      </div>
                    </td>
                    {hasScore && (
                      <td title={normTitle ? `정규화 분해 — ${normTitle}` : undefined}>
                        <div className="flex items-center gap-2">
                          <div
                            style={{ width: 90, height: 6, borderRadius: 3, background: "var(--color-elevated)", overflow: "hidden" }}
                          >
                            <div style={{ width: `${Math.round((it.score ?? 0) * 100)}%`, height: "100%", background: GRADE_BAR[it.grade] }} />
                          </div>
                          <span className="tabular-nums" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                            {(it.score ?? 0).toFixed(3)}
                          </span>
                        </div>
                      </td>
                    )}
                    <td>
                      <Badge tone={GRADE_TONE[it.grade]} title={GRADE_TEXT[it.grade]}>
                        {it.grade}
                      </Badge>
                    </td>
                    <td>
                      <ConfBadge kind={inferred ? "est" : "fix"} title={confTitle} />
                    </td>
                    <td>
                      {it.factors.map((f) => (
                        <Chip key={f}>{FACTOR_LABEL[f] ?? f}</Chip>
                      ))}
                    </td>
                    <td className="num">{num(it.metrics.complexity)}</td>
                    <td className="num">{num(it.metrics.fanIn)}</td>
                    <td className="num">{num(it.metrics.fanOut)}</td>
                    <td className="num">{num(it.metrics.loc)}</td>
                    <td className="num">{num(it.metrics.churnLines)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={hasScore ? 11 : 10} className="text-text-muted" style={{ padding: "18px 8px", fontSize: 12.5 }}>
                    검색·필터 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!filterActive && remaining > 0 && (
          <div className="text-text-muted" style={{ fontSize: 12, padding: "8px 4px 0" }}>
            상위 {rows.length}건 표시 · 외 {remaining}건 — 검색·필터 시 전건 표시
          </div>
        )}

        <div className="flex items-center flex-wrap" style={{ gap: 10, padding: "12px 4px 0", fontSize: 12.5 }}>
          <Link to="/domains?tab=structure&overlay=risk" className="no-underline" style={{ color: "var(--color-status-info)" }}>
            구조 그래프에서 위험 오버레이로 보기 →
          </Link>
          {weightList && <span className="text-text-muted">· 점수 = {weightList} 가중 합산(백분위 정규화)</span>}
          <span className="text-text-muted">· 점수는 절대 판정이 아닌 서수(순위) 해석</span>
          {meta.degenerateMetrics?.length > 0 && (
            <span className="text-text-muted">· 퇴화 지표: {meta.degenerateMetrics.join(", ")}(변별력 없음)</span>
          )}
          {!meta.churnAvailable && <span className="text-text-muted">· 변경 빈도 미수집(git 없음/shallow)</span>}
          {unmeasuredText && <span className="text-text-muted">· 복잡도 미측정({unmeasuredText}) — Java 전용 근사, 해당 행 [추정]</span>}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────── 커버리지 탭 ────────────────────────── */

function LayerBars({ byLayer }: { byLayer: Array<{ layer: string; count: number }> }) {
  const total = byLayer.reduce((s, l) => s + l.count, 0) || 1;
  const sorted = [...byLayer].sort((a, b) => b.count - a.count);
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "14px 16px" }}>
      <div className="text-text-muted font-medium" style={{ fontSize: 12, marginBottom: 10 }}>
        레이어 분포
      </div>
      <div className="flex flex-col" style={{ gap: 7 }}>
        {sorted.map((l) => (
          <div key={l.layer} className="flex items-center" style={{ gap: 10 }}>
            <span className="text-text-secondary" style={{ fontSize: 12, width: 64 }}>
              {LAYER_LABEL[l.layer] ?? l.layer}
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--color-elevated)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${((l.count / total) * 100).toFixed(1)}%`,
                  height: "100%",
                  background: l.layer === "unknown" ? "var(--color-text-muted)" : "var(--color-status-info)",
                }}
              />
            </div>
            <span className="tabular-nums text-text-muted" style={{ fontSize: 11.5, width: 36, textAlign: "right" }}>
              {l.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoveragePanel({ cov }: { cov: Coverage }) {
  const scanned = cov.files.byLang.reduce((s, b) => s + b.count, 0);

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
  const reached = cov.reachability.reached;
  const unreached = cov.reachability.unreached;
  const reachSmall = reached != null && unreached != null ? `% · 도달 ${reached}/${reached + unreached}` : "%";
  const partialFiles = cov.langSupport.partialFiles ?? 0;
  const nonJavaPassthrough = cov.files.nonJavaPassthrough ?? 0;
  const byLayer = cov.layers.byLayer ?? [];
  const programs = cov.programs;

  return (
    <>
      <section
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 14 }}
      >
        <StatTile label="스캔 파일" value={scanned} small="파일" />
        <StatTile label="레이어 해석률" value={cov.layers.rate} small={`% · 해석 ${cov.layers.resolved}/${scanned}`} />
        <StatTile label="도달성" value={cov.reachability.rate} small={reachSmall} />
        <StatTile label="엣지 해석률" value={cov.edges.rate} small={`% · 해석 ${cov.edges.resolved ?? "?"}/${(cov.edges.resolved ?? 0) + (cov.edges.unresolved ?? 0)}`} />
      </section>

      {byLayer.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <LayerBars byLayer={byLayer} />
        </div>
      )}

      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 420px)" }}>
          <table className="proto-tbl">
            <thead>
              <tr>
                <th style={STICKY_HEAD}>언어 / 프레임워크</th>
                {capKeys.map((k) => (
                  <th key={k} style={STICKY_HEAD}>
                    {CAP_LABEL[k] ?? k}
                  </th>
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

        {partialFiles > 0 && (
          <div
            className="rounded-lg border border-border-subtle"
            style={{ marginTop: 12, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.65 }}
          >
            <b className="text-text-primary">부분 지원 {partialFiles}파일</b>
            <span className="text-text-muted">
              {" "}
              — 부분 지원 언어(JSP·XML 등)는 <b>좁은 관용구만 스캔</b>하고 전체 구문을 해석하지 않습니다. 미탐지 가능성을 감안해 해석하세요.
            </span>
          </div>
        )}

        {programs && (
          <div className="flex flex-wrap items-center text-text-muted" style={{ gap: 10, fontSize: 12.5, padding: "12px 4px 0" }}>
            <span>
              프로그램 <b className="text-text-primary">{programs.total}</b>본
            </span>
            <span>
              · 유형별{" "}
              {[...programs.byType]
                .sort((a, b) => b.count - a.count)
                .map((t) => `${TYPE_LABEL[t.type] ?? t.type} ${t.count}`)
                .join(" · ")}
            </span>
            <span>
              · 미보정 기능점수(FP) <b className="text-text-primary">{programs.unadjustedFp}</b>
            </span>
          </div>
        )}

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
          {nonJavaPassthrough > 0 && (
            <span>
              · 비 Java 패스스루 <b className="text-text-primary">{nonJavaPassthrough}</b>파일(구조 인용만, 콜그래프 미참여)
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
      <EmptyCard>
        {missing
          ? "골든셋 미동결 — qa-golden-score.mjs 로 사람 확정본을 동결/채점한 뒤 기준선이 표시됩니다."
          : "골든 기준선을 불러오는 중입니다."}
      </EmptyCard>
    );
  }

  const artifacts = Object.entries(golden.metrics);

  return (
    <>
      {artifacts.map(([key, m]) => {
        const link = GOLD_ARTIFACT_LINK[key];
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 8 }}>
              <h3 className="font-heading text-text-primary font-bold" style={{ fontSize: 14 }}>
                {GOLD_ARTIFACT_LABEL[key] ?? key}
              </h3>
              {m.extras > 0 && <Badge tone="warn">초과 단위 {m.extras} — 수동 리뷰</Badge>}
              {link && (
                <Link to={link} className="no-underline" style={{ color: "var(--color-status-info)", fontSize: 12.5 }}>
                  해당 산출물 보기 →
                </Link>
              )}
            </div>
            <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <StatTile label="구조 일치율" value={pct(m.structure)} small="%" />
              <StatTile label="근거 유효율" value={pct(m.citations)} small={`% · 인용 ${m.citationCount}`} />
              <StatTile label="핵심 재현율" value={pct(m.recall)} small="%" />
            </section>
          </div>
        );
      })}

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
const TAB_KEYS: QualTab[] = ["risk", "cov", "gold"];

export default function QualityView() {
  const { risk, coverage, golden, goldenMissing } = useQualityData();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: QualTab = TAB_KEYS.includes(tabParam as QualTab) ? (tabParam as QualTab) : "risk";

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {/* 메뉴 헤더 제거(2026-07-15) — 정보는 TopBar 정보 팝오버(ⓘ), md 리포트 링크는 액션 슬롯으로. */}
      <TopBarSlot>
        <InfoPopover
          title="품질 정보"
          rows={[
            { label: "산출물", value: "risk-report · coverage" },
            { label: "용도", value: "골든셋 회귀 · PM 주간보고 정량 지표" },
          ]}
        />
      </TopBarSlot>
      <TopBarSlot slot="actions">
        <LinkBtn to="/deliverables/si-위험모듈리포트">md 리포트</LinkBtn>
      </TopBarSlot>

      <ProtoTabs<QualTab>
        tabs={[
          { key: "risk", label: "위험 모듈", count: risk.s === "ready" ? risk.data.items.length : undefined },
          { key: "cov", label: "분석 커버리지" },
          { key: "gold", label: "정확도 기준선" },
        ]}
        active={tab}
        onChange={(k) =>
          setSearchParams((prev) => {
            prev.set("tab", k);
            return prev;
          })
        }
      />

      {tab === "risk" &&
        (risk.s === "loading" ? (
          <EmptyCard>risk-report.json 을 불러오는 중…</EmptyCard>
        ) : risk.s === "error" ? (
          <EmptyCard>
            <b className="text-text-primary">risk-report.json 을 불러올 수 없습니다.</b>
            <br />
            <span style={{ fontSize: 12 }}>({risk.msg})</span>
          </EmptyCard>
        ) : (
          <RiskPanel report={risk.data} />
        ))}

      {tab === "cov" &&
        (coverage.s === "loading" ? (
          <EmptyCard>coverage.json 을 불러오는 중…</EmptyCard>
        ) : coverage.s === "error" ? (
          <EmptyCard>
            <b className="text-text-primary">coverage.json 을 불러올 수 없습니다.</b>
            <br />
            <span style={{ fontSize: 12 }}>({coverage.msg})</span>
          </EmptyCard>
        ) : (
          <CoveragePanel cov={coverage.data} />
        ))}

      {tab === "gold" && <GoldenPanel golden={golden} missing={goldenMissing} />}
    </div>
  );
}
