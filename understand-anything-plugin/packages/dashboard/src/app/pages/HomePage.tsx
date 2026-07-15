import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router";
import { useDashboardStore } from "../../store";
import { dataUrl } from "../../shared/api/client";
import { useI18n } from "../../contexts/I18nContext";
import { Badge } from "../../components/proto/Proto";
import type { ShellContext } from "../Root";

interface RtmSummary {
  functions: number;
  requirements: number;
  implemented: number;
  changed: number;
  planned: number;
}

interface DocEntry {
  docId: string;
  title: string;
  methodology: string | null;
  confirmed: boolean;
  approver: string | null;
  at: string | null;
  hasXlsx?: boolean;
}

interface MetaInfo {
  lastAnalyzedAt: string | null;
  gitCommitHash: string | null;
}

/** 이번 주 실적 카드 — work-summary.json 요약(존재 필드만). */
interface WorkSummaryLite {
  fromIso: string;
  toIso: string;
  commits: number;
  files: number;
}

/** 위험 모듈 카드 — risk-report.json 요약. */
interface RiskLite {
  high: number;
  mid: number;
  topName: string | null;
  topScore: number | null;
}

interface FeedItem {
  at: string; // ISO
  dot: string; // CSS color
  title: ReactNode;
  sub: string;
}

/**
 * 홈 (FRONT_REDESIGN §5.1) — P0 승인 시안(mockup-shell-home.html)과 1:1 정합.
 * 헤더(제목+분석 메타+내보내기), 스탯 타일 5, 여정 카드 3(아이콘·레이어 카운트·상태 요약),
 * 하단 산출물+최근 활동. 시안의 "재분석 실행" 버튼은 대시보드에서 실행 수단이 없어 제외.
 */
export default function HomePage() {
  const { accessToken } = useOutletContext<ShellContext>();
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const impactOverlay = useDashboardStore((s) => s.impactOverlayData);
  const diffOverlay = useDashboardStore((s) => s.diffOverlayData);
  const { t } = useI18n();
  const [rtm, setRtm] = useState<RtmSummary | null>(null);
  const [docs, setDocs] = useState<DocEntry[] | null>(null);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [programTotal, setProgramTotal] = useState<number | null>(null);
  const [work, setWork] = useState<WorkSummaryLite | null>(null);
  const [risk, setRisk] = useState<RiskLite | null>(null);

  // 홈 전용 요약 데이터 — 없으면(404) 해당 카드/타일만 숨긴다.
  useEffect(() => {
    fetch(dataUrl("meta.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && typeof m === "object") {
          setMeta({
            lastAnalyzedAt: typeof m.lastAnalyzedAt === "string" ? m.lastAnalyzedAt : null,
            gitCommitHash: typeof m.gitCommitHash === "string" ? m.gitCommitHash : null,
          });
        }
      })
      .catch(() => {});
    fetch(dataUrl("rtm.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.functions)) {
          const states = data.functions.map((f: { state?: string }) => f.state);
          setRtm({
            functions: data.functions.length,
            requirements: Array.isArray(data.requirements) ? data.requirements.length : 0,
            implemented: states.filter((s: string) => s === "IMPLEMENTED").length,
            changed: states.filter((s: string) => s === "CHANGED").length,
            planned: states.filter((s: string) => s === "PLANNED").length,
          });
        }
      })
      .catch(() => {});
    fetch(dataUrl("doc-list.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.docs)) setDocs(data.docs as DocEntry[]);
      })
      .catch(() => {});
    // 신설 메뉴 요약(메뉴 개편 2차) — 프로그램 타일 + 이번 주 실적·위험 모듈 카드.
    // 부재(404)면 해당 타일/카드만 숨긴다(정직한 degrade).
    fetch(dataUrl("program-inventory.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const total = data?.stats?.total;
        if (typeof total === "number") setProgramTotal(total);
      })
      .catch(() => {});
    fetch(dataUrl("work-summary.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const t = data?.totals;
        const range = data?.range;
        if (
          typeof t?.commits === "number" &&
          typeof t?.files === "number" &&
          typeof range?.fromIso === "string" &&
          typeof range?.toIso === "string"
        ) {
          setWork({ fromIso: range.fromIso, toIso: range.toIso, commits: t.commits, files: t.files });
        }
      })
      .catch(() => {});
    fetch(dataUrl("risk-report.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const items = data?.items;
        if (!Array.isArray(items) || items.length === 0) return;
        const top = items[0] as { name?: unknown; score?: unknown };
        setRisk({
          high: items.filter((it: { grade?: string }) => it.grade === "상").length,
          mid: items.filter((it: { grade?: string }) => it.grade === "중").length,
          topName: typeof top.name === "string" ? top.name : null,
          topScore: typeof top.score === "number" ? top.score : null,
        });
      })
      .catch(() => {});
  }, [accessToken]);

  const stats = useMemo(() => {
    const count = (type: string) => (graph ? graph.nodes.filter((n) => n.type === type).length : 0);
    return {
      files: count("file"),
      classes: count("class"),
      domains: domainGraph ? domainGraph.nodes.filter((n) => n.type === "domain").length : 0,
      flows: domainGraph ? domainGraph.nodes.filter((n) => n.type === "flow").length : 0,
    };
  }, [graph, domainGraph]);

  const domainChips = useMemo(
    () =>
      domainGraph
        ? domainGraph.nodes.filter((n) => n.type === "domain").map((n) => ({ id: n.id, name: n.name }))
        : [],
    [domainGraph],
  );

  // 구조 카드 푸터 — 시안: 레이어별 파일 수 상위 4개.
  const layerCounts = useMemo(() => {
    if (!graph) return [];
    return graph.layers
      .map((l) => ({
        name: l.name.replace(/\s*레이어\s*/g, " ").replace(/\(.*?\)/g, "").trim() || l.name,
        count: l.nodeIds.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [graph]);

  // 산출물 진행 카드 집계 — doc-list 실데이터(확정/초안/xlsx 보유 종수).
  const docCounts = useMemo(() => {
    if (!docs || docs.length === 0) return null;
    return {
      total: docs.length,
      confirmed: docs.filter((d) => d.confirmed).length,
      draft: docs.filter((d) => !d.confirmed).length,
      xlsx: docs.filter((d) => d.hasXlsx).length,
    };
  }, [docs]);

  // 최근 활동 — 타임스탬프가 실재하는 이벤트만(문서 확정, 오버레이 생성, 분석 실행).
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const d of docs ?? []) {
      if (d.confirmed && d.at) {
        items.push({
          at: d.at,
          dot: "var(--color-status-ok)",
          title: (
            <>
              「{d.title}」 <b className="font-semibold">확정</b>
            </>
          ),
          sub: d.approver ? `${fmtWhen(d.at)} · ${d.approver}` : fmtWhen(d.at),
        });
      }
    }
    if (impactOverlay?.generatedAt) {
      items.push({
        at: impactOverlay.generatedAt,
        dot: "var(--color-accent)",
        title: <>영향도 분석 완료</>,
        sub: `${fmtWhen(impactOverlay.generatedAt)} · 영향 노드 ${impactOverlay.affected.length}`,
      });
    }
    if (diffOverlay?.generatedAt) {
      items.push({
        at: diffOverlay.generatedAt,
        dot: "var(--color-status-info)",
        title: <>변경 diff 오버레이 갱신</>,
        sub: fmtWhen(diffOverlay.generatedAt),
      });
    }
    if (meta?.lastAnalyzedAt) {
      items.push({
        at: meta.lastAnalyzedAt,
        dot: "var(--color-text-muted)",
        title: <>프로젝트 분석 실행</>,
        sub: fmtWhen(meta.lastAnalyzedAt),
      });
    }
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 4);
  }, [docs, impactOverlay, diffOverlay, meta]);

  if (!graph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        {t.common.appName}
      </div>
    );
  }

  const metaLine = [
    meta?.lastAnalyzedAt ? `분석 ${meta.lastAnalyzedAt.slice(0, 10)}` : null,
    meta?.gitCommitHash ? `commit ${meta.gitCommitHash.slice(0, 7)}` : null,
    graph.project.languages.slice(0, 4).join(" / ") || null,
  ].filter(Boolean);

  return (
    <div className="h-full w-full overflow-auto bg-root text-text-primary">
      <div className="px-6 sm:px-7 py-6 pb-16">
        {/* 페이지 헤더 — 시안: 1행 = 제목·분석 메타·우측 액션, 2행 = 설명(2줄 클램프) */}
        <div className="mb-5">
          <div className="flex items-end gap-3.5">
            <h1 className="text-[22px] font-bold tracking-[-0.3px] leading-none">
              {graph.project.name}
            </h1>
            {metaLine.length > 0 && (
              <div className="text-[13px] text-text-muted pb-px truncate">
                {metaLine.join(" · ")}
              </div>
            )}
            <div className="flex-1" />
            <a
              href={dataUrl("knowledge-graph.json", accessToken)}
              download="knowledge-graph.json"
              className="shrink-0 rounded-lg border border-border-medium bg-panel px-3.5 py-[7px] text-[13px] font-semibold text-text-secondary hover:bg-elevated transition-colors"
            >
              지식그래프 내보내기
            </a>
            {/* 프로토 pg-home: 우측 액센트 = 이번 주 보고서 → /report (실적 데이터 있을 때만) */}
            {work && (
              <Link
                to="/report"
                className="shrink-0 rounded-lg border border-accent bg-panel px-3.5 py-[7px] text-[13px] font-semibold text-accent hover:bg-elevated transition-colors"
              >
                이번 주 보고서
              </Link>
            )}
          </div>
          {graph.project.description && (
            <div
              className="mt-2 text-[13px] text-text-muted leading-relaxed max-w-[820px] overflow-hidden"
              style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
            >
              {graph.project.description}
            </div>
          )}
        </div>

        {/* 스탯 타일 — 프로토 pg-home 6열(파일/클래스/도메인/기능 흐름/요구사항/프로그램) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <StatTile label="파일" value={stats.files} />
          <StatTile label="클래스" value={stats.classes} />
          {domainGraph && <StatTile label="도메인" value={stats.domains} />}
          {domainGraph && <StatTile label="기능 흐름" value={stats.flows} />}
          {rtm && (
            <StatTile
              label="요구사항"
              value={rtm.requirements}
              sub={`추적 기능 ${rtm.functions}`}
            />
          )}
          {programTotal !== null && <StatTile label="프로그램" value={programTotal} sub="본" />}
        </section>

        {/* 여정 진입 카드 — 시안: 아이콘 + 제목 + → / 설명 / 푸터 */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-3.5">
          {domainGraph && (
            <EntryCard
              to="/domains"
              icon={iconDomain}
              title={t.drawer.domain}
              description={`시스템 구성도에서 도메인 ${stats.domains}개·기능 ${stats.flows}개와 타 시스템 연동을 한눈에 봅니다.`}
            >
              <div className="flex flex-wrap gap-1.5">
                {domainChips.slice(0, 5).map((d) => (
                  <span
                    key={d.id}
                    className="text-[12px] px-2.5 py-0.5 rounded-full bg-elevated text-text-secondary"
                  >
                    {d.name}
                  </span>
                ))}
                {domainChips.length > 5 && (
                  <span className="text-[12px] px-2.5 py-0.5 rounded-full bg-elevated text-text-muted">
                    +{domainChips.length - 5}
                  </span>
                )}
              </div>
            </EntryCard>
          )}
          <EntryCard
            to="/domains?tab=structure"
            icon={iconStructure}
            title="코드 구조"
            description="레이어드 아키텍처 그래프. 영향도·위험 오버레이를 지원합니다."
          >
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-text-muted">
              {layerCounts.map((l) => (
                <span key={l.name} className="whitespace-nowrap">
                  {l.name} <b className="text-text-primary font-semibold">{l.count}</b>
                </span>
              ))}
            </div>
          </EntryCard>
          {rtm && (
            <EntryCard
              to="/rtm"
              icon={iconRtm}
              title="요구사항 추적표"
              description="AS-IS 원장과 TO-BE 변경 요청을 행 단위 추정→확정으로 관리합니다."
            >
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-text-muted items-center">
                <span>
                  구현 <b className="text-text-primary font-semibold">{rtm.implemented}</b>
                </span>
                {rtm.changed > 0 && (
                  <span>
                    변경 <b className="text-text-primary font-semibold">{rtm.changed}</b>
                  </span>
                )}
                {rtm.planned > 0 && (
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      color: "var(--color-status-warn)",
                      background: "color-mix(in srgb, var(--color-status-warn) 12%, transparent)",
                    }}
                  >
                    미구현 {rtm.planned}
                  </span>
                )}
              </div>
            </EntryCard>
          )}
        </section>

        {/* 2행 — 프로토 grid3 2단: 이번 주 실적 + 위험 모듈 + 산출물 진행. */}
        {(work || risk || docCounts) && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-3.5">
            {work && (
              <EntryCard
                to="/report"
                icon={iconReport}
                title="이번 주 실적"
                description={`${work.fromIso.slice(5, 10)} ~ ${work.toIso.slice(5, 10)} · git·원장 수집 사실만 집계합니다.`}
              >
                <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-text-muted">
                  <span>
                    커밋 <b className="text-text-primary font-semibold">{work.commits}</b>
                  </span>
                  <span>
                    파일 <b className="text-text-primary font-semibold">{work.files}</b>
                  </span>
                </div>
              </EntryCard>
            )}
            {risk && (
              <EntryCard
                to="/quality"
                icon={iconQuality}
                title="위험 모듈"
                description="복잡도·팬인·변경 빈도 합산 위험 점수 상위 모듈입니다."
              >
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-text-muted items-center">
                  <Badge tone="err">상 {risk.high}</Badge>
                  <Badge tone="warn">중 {risk.mid}</Badge>
                  {risk.topName && (
                    <span>
                      1위 <b className="text-text-primary font-semibold">{risk.topName}</b>
                      {risk.topScore !== null && ` ${risk.topScore.toFixed(2)}`}
                    </span>
                  )}
                </div>
              </EntryCard>
            )}
            {docCounts && (
              <EntryCard
                to="/deliverables"
                icon={iconDocs}
                title="산출물 진행"
                description={`SI 표준 산출물 ${docCounts.total}종의 생성·확정 현황입니다.`}
              >
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-text-muted items-center">
                  <Badge tone="ok">확정 {docCounts.confirmed}</Badge>
                  <Badge tone="info">초안 {docCounts.draft}</Badge>
                  {docCounts.xlsx > 0 && <span>xlsx {docCounts.xlsx}종</span>}
                </div>
              </EntryCard>
            )}
          </section>
        )}

        {/* 하단: 산출물 + 최근 활동 — 시안 2fr/1.2fr */}
        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1.2fr] gap-3.5">
          {docs && docs.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-[10px] px-5 py-4 card-shadow">
              <div className="flex items-center mb-3">
                <h3 className="text-[13px] font-bold text-text-secondary">산출물 문서</h3>
                <Link
                  to="/deliverables"
                  className="ml-auto text-[12px] text-text-muted hover:text-accent transition-colors"
                >
                  전체 →
                </Link>
              </div>
              {docs.slice(0, 5).map((d) => (
                <div
                  key={d.docId}
                  className="flex items-center gap-2.5 py-[9px] border-t border-border-subtle first:border-t-0 text-[13px]"
                >
                  <span className="font-medium truncate">{d.title}</span>
                  {d.methodology && (
                    <span className="text-text-muted shrink-0">· {d.methodology}</span>
                  )}
                  <span
                    className="ml-auto shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={
                      d.confirmed
                        ? {
                            color: "var(--color-status-ok)",
                            background: "color-mix(in srgb, var(--color-status-ok) 12%, transparent)",
                          }
                        : {
                            color: "var(--color-status-info)",
                            background: "color-mix(in srgb, var(--color-status-info) 12%, transparent)",
                          }
                    }
                  >
                    {d.confirmed ? "확정" : "초안"}
                  </span>
                  {d.at && <span className="text-[12px] text-text-muted shrink-0">{d.at.slice(5, 10)}</span>}
                  {d.approver && (
                    <span className="text-[12px] text-text-muted shrink-0">{d.approver}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {feed.length > 0 && (
            <div className="bg-panel border border-border-subtle rounded-[10px] px-5 py-4 card-shadow">
              <h3 className="text-[13px] font-bold text-text-secondary mb-3">최근 활동</h3>
              {feed.map((item, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 py-[9px] border-t border-border-subtle first:border-t-0 text-[13px]"
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full shrink-0 mt-[6px]"
                    style={{ background: item.dot }}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{item.title}</div>
                    <div className="text-[12px] text-text-muted">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** 간단 상대시간 — 실데이터 ISO 기준. */
function fmtWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return iso.slice(0, 10);
}

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-panel border border-border-subtle rounded-[10px] px-4 py-3.5 card-shadow">
      <div className="text-[12px] text-text-muted font-medium mb-1.5">{label}</div>
      <div className="text-[26px] font-semibold leading-none tracking-[-0.5px]">
        {value}
        {sub && <small className="text-[13px] font-medium text-text-muted ml-1.5">{sub}</small>}
      </div>
    </div>
  );
}

function EntryCard({
  to,
  icon,
  title,
  description,
  children,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2.5 bg-panel border border-border-subtle rounded-[10px] p-[18px] card-shadow hover:border-accent/60 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-[18px] h-[18px] shrink-0 text-accent">{icon}</span>
        <h2 className="text-[15px] font-semibold tracking-[-0.2px]">{title}</h2>
        <span className="ml-auto text-[13px] text-text-muted group-hover:text-accent transition-colors">
          →
        </span>
      </div>
      <p className="text-[13px] text-text-muted leading-relaxed">{description}</p>
      {children}
    </Link>
  );
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  className: "w-full h-full",
} as const;

const iconDomain = (
  <svg {...svgProps}>
    <circle cx="7" cy="7" r="3.2" />
    <circle cx="17" cy="7" r="3.2" />
    <circle cx="12" cy="17" r="3.2" />
    <path d="M9 9.5 11 14M15 9.5 13 14" />
  </svg>
);
const iconStructure = (
  <svg {...svgProps}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
    <path d="M6.5 10v2.5h5.5M17.5 10v2.5h-5.5" />
  </svg>
);
const iconRtm = (
  <svg {...svgProps}>
    <path d="M4 5h16M4 12h16M4 19h10" />
    <circle cx="19" cy="19" r="2.4" />
  </svg>
);
const iconDocs = (
  <svg {...svgProps}>
    <path d="M6 2.5h9L20 8v13.5H6zM14.5 3v5.5H20" />
    <path d="M9 13h7M9 17h5" />
  </svg>
);
const iconReport = (
  <svg {...svgProps}>
    <path d="M5 21V10M12 21V4M19 21v-7" />
  </svg>
);
const iconQuality = (
  <svg {...svgProps}>
    <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" />
    <path d="M9 12l2 2 4-4.5" />
  </svg>
);
