import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { useDashboardStore } from "../../store";
import { dataUrl } from "../../shared/api/client";
import { useI18n } from "../../contexts/I18nContext";
import type { ShellContext } from "../Root";

interface RtmSummary {
  functions: number;
  requirements: number;
}

interface DocEntry {
  docId: string;
  title: string;
  methodology: string | null;
  confirmed: boolean;
  approver: string | null;
  at: string | null;
}

/**
 * 홈 (FRONT_REDESIGN §5.1, P3 신설) — 프로젝트 개요 랜딩.
 * 스탯 타일 + 여정 진입 카드 + 산출물 요약. P0 승인 시안(mockup-shell-home.html)의
 * 구조를 현행 다크 토큰으로 구현 — 라이트 전환은 P4.
 */
export default function HomePage() {
  const { accessToken } = useOutletContext<ShellContext>();
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const wikiGraph = useDashboardStore((s) => s.wikiGraph);
  const { t } = useI18n();
  const [rtm, setRtm] = useState<RtmSummary | null>(null);
  const [docs, setDocs] = useState<DocEntry[] | null>(null);

  // 홈 전용 요약 데이터 — 없으면(404) 해당 카드/타일만 숨긴다.
  useEffect(() => {
    fetch(dataUrl("rtm.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.functions)) {
          setRtm({
            functions: data.functions.length,
            requirements: Array.isArray(data.requirements) ? data.requirements.length : 0,
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
  }, [accessToken]);

  const stats = useMemo(() => {
    const count = (type: string, g = graph) =>
      g ? g.nodes.filter((n) => n.type === type).length : 0;
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

  if (!graph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        {t.common.appName}
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-root text-text-primary">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-7 pb-16">
        {/* 페이지 헤더 */}
        <div className="flex items-end gap-4 mb-2">
          <h1 className="font-heading text-2xl text-text-primary tracking-wide">
            {graph.project.name}
          </h1>
          {graph.project.languages.length > 0 && (
            <span className="text-xs text-text-muted pb-1">
              {graph.project.languages.join(" / ")}
            </span>
          )}
        </div>
        {graph.project.description && (
          <p className="text-sm text-text-muted mb-6 max-w-[720px] leading-relaxed">
            {graph.project.description}
          </p>
        )}

        {/* 스탯 타일 */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatTile label="파일" value={stats.files} />
          <StatTile label="클래스" value={stats.classes} />
          {domainGraph && <StatTile label="도메인" value={stats.domains} />}
          {domainGraph && <StatTile label="기능 흐름" value={stats.flows} />}
          {rtm && (
            <StatTile
              label="추적 기능"
              value={rtm.functions}
              sub={rtm.requirements > 0 ? `요구 ${rtm.requirements}` : undefined}
            />
          )}
        </section>

        {/* 여정 진입 카드 */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
          {domainGraph && (
            <EntryCard
              to="/domains"
              title="도메인 지도"
              description={`업무 도메인 ${stats.domains}개와 기능 흐름 ${stats.flows}개로 시스템을 업무 관점에서 탐색합니다.`}
            >
              <div className="flex flex-wrap gap-1.5">
                {domainChips.slice(0, 5).map((d) => (
                  <span
                    key={d.id}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-elevated text-text-secondary"
                  >
                    {d.name}
                  </span>
                ))}
                {domainChips.length > 5 && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-elevated text-text-muted">
                    +{domainChips.length - 5}
                  </span>
                )}
              </div>
            </EntryCard>
          )}
          <EntryCard
            to="/structure"
            title="코드 구조"
            description="레이어드 아키텍처 그래프. 파일·클래스 상세도와 영향도 오버레이를 지원합니다."
          >
            <div className="flex gap-4 text-[12px] text-text-muted">
              <span>
                노드 <b className="text-text-primary font-semibold">{graph.nodes.length}</b>
              </span>
              <span>
                레이어{" "}
                <b className="text-text-primary font-semibold">{graph.layers.length}</b>
              </span>
            </div>
          </EntryCard>
          {rtm && (
            <EntryCard
              to="/rtm"
              title="요구사항 추적표"
              description="AS-IS 원장과 TO-BE 변경 요청을 행 단위 추정→확정으로 관리합니다."
            >
              <div className="flex gap-4 text-[12px] text-text-muted">
                <span>
                  기능 <b className="text-text-primary font-semibold">{rtm.functions}</b>
                </span>
                <span>
                  요구 <b className="text-text-primary font-semibold">{rtm.requirements}</b>
                </span>
              </div>
            </EntryCard>
          )}
        </section>

        {/* 산출물 + 위키 */}
        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1.1fr] gap-3.5">
          {docs && docs.length > 0 && (
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <div className="flex items-center mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  산출물 문서
                </h3>
                <Link
                  to="/deliverables"
                  className="ml-auto text-xs text-text-muted hover:text-accent transition-colors"
                >
                  전체 →
                </Link>
              </div>
              {docs.slice(0, 5).map((d) => (
                <div
                  key={d.docId}
                  className="flex items-center gap-2.5 py-2 border-t border-border-subtle first:border-t-0 text-[13px]"
                >
                  <span className="font-medium truncate">{d.title}</span>
                  {d.methodology && (
                    <span className="text-text-muted shrink-0">· {d.methodology}</span>
                  )}
                  <span
                    className={`ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      d.confirmed
                        ? "text-emerald-400 bg-emerald-400/10"
                        : "text-sky-400 bg-sky-400/10"
                    }`}
                  >
                    {d.confirmed ? "확정" : "초안"}
                  </span>
                  {d.approver && (
                    <span className="text-[11px] text-text-muted shrink-0">{d.approver}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {wikiGraph && (
            <EntryCard
              to="/wiki"
              title="위키 문서"
              description="세분화 위키 — 도메인·개념 단위 문서를 폴더 트리로 탐색합니다."
            >
              <div className="text-[12px] text-text-muted">
                문서{" "}
                <b className="text-text-primary font-semibold">
                  {wikiGraph.nodes.filter((n) => n.type === "article").length}
                </b>
              </div>
            </EntryCard>
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3.5">
      <div className="text-[11px] text-text-muted font-medium mb-1">{label}</div>
      <div className="text-[26px] font-semibold leading-none tracking-tight">
        {value}
        {sub && <small className="text-[12px] font-medium text-text-muted ml-1.5">{sub}</small>}
      </div>
    </div>
  );
}

function EntryCard({
  to,
  title,
  description,
  children,
}: {
  to: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2.5 bg-surface border border-border-subtle rounded-xl p-5 hover:border-accent/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="ml-auto text-text-muted group-hover:text-accent transition-colors">→</span>
      </div>
      <p className="text-[13px] text-text-muted leading-relaxed">{description}</p>
      {children}
    </Link>
  );
}
