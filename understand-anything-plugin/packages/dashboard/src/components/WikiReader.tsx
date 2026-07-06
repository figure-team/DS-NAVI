// ktds-fork (ADR-004): "문서"(wiki) 모드 전용 리더 — pmpl-proto .docs 레이아웃.
// 좌측 트리 카드(카테고리/계층 fold + 문서 행) + 우측 mdoc 카드(제목 + dmeta + TOC + 본문 +
// 연결/백링크 칩). 본문 링크는 비활성(이동은 연결/백링크 칩으로) — 임의 외부 URL 클릭 차단.
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import type { GraphNode } from "@understand-anything/core/types";
import ClaimsContent from "./ClaimsContent";
import { PageHead } from "./proto/Proto";

const MD_COMPONENTS = {
  // 본문 링크는 비활성(이동은 연결/백링크로)
  a: ({ children }: { children?: ReactNode }) => <span className="text-accent">{children}</span>,
};

function LinkChips({ title, nodes, onClick }: { title: string; nodes: GraphNode[]; onClick: (id: string) => void }) {
  if (nodes.length === 0) return null;
  return (
    <div className="flex items-start gap-2.5" style={{ marginTop: 8 }}>
      <span className="text-text-muted shrink-0 font-bold" style={{ fontSize: 11, paddingTop: 4 }}>{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onClick(n.id)}
            className="rounded-full bg-elevated text-text-secondary hover:text-accent transition-colors cursor-pointer"
            style={{ padding: "3px 9px", fontSize: 12, fontWeight: 500 }}
          >
            {n.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WikiReader() {
  const wikiGraph = useDashboardStore((s) => s.wikiGraph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const navigateToNode = useDashboardStore((s) => s.navigateToNode);

  const graph = wikiGraph;
  const node = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // 트리 그룹 — 카테고리(categorized_under)가 있으면 카테고리, 없으면 계층(layers) 기준.
  const groups = useMemo(() => {
    if (!graph) return [];
    const articles = graph.nodes.filter((n) => n.type === "article");
    const catOf = new Map<string, string>();
    for (const e of graph.edges) {
      if (e.type !== "categorized_under") continue;
      const cat = graph.nodes.find((n) => n.id === e.target);
      if (cat) catOf.set(e.source, cat.name);
    }
    if (catOf.size > 0) {
      const byCat = new Map<string, GraphNode[]>();
      for (const a of articles) {
        const key = catOf.get(a.id) ?? "기타";
        byCat.set(key, [...(byCat.get(key) ?? []), a]);
      }
      return [...byCat.entries()].map(([label, items]) => ({ label, items }));
    }
    return graph.layers
      .map((layer) => ({
        label: layer.name,
        items: layer.nodeIds
          .map((id) => graph.nodes.find((n) => n.id === id))
          .filter((n): n is GraphNode => !!n && n.type === "article"),
      }))
      .filter((g) => g.items.length > 0);
  }, [graph]);

  const articleCount = useMemo(
    () => (graph ? graph.nodes.filter((n) => n.type === "article").length : 0),
    [graph],
  );

  // 목차(TOC) — 본문 마크다운 h2/h3 헤딩에서 추출(프로토 .toc).
  const content = node?.knowledgeMeta?.content ?? "";
  const toc = useMemo(
    () =>
      content
        .split("\n")
        .filter((l) => /^#{2,3}\s/.test(l))
        .map((l) => ({
          depth: (l.match(/^#+/) as RegExpMatchArray)[0].length,
          text: l.replace(/^#+\s*/, "").trim(),
        }))
        .slice(0, 12),
    [content],
  );

  if (!graph) return null;

  // 연결(나가는 위키링크) / 백링크(들어오는) / 카테고리(categorized_under)
  const connections = node
    ? graph.edges
        .filter((e) => e.type === "related" && e.source === node.id)
        .map((e) => graph.nodes.find((n) => n.id === e.target))
        .filter((n): n is GraphNode => n !== undefined)
    : [];
  const backlinks = node
    ? graph.edges
        .filter((e) => e.type === "related" && e.target === node.id)
        .map((e) => graph.nodes.find((n) => n.id === e.source))
        .filter((n): n is GraphNode => n !== undefined)
    : [];
  const categoryEdge = node ? graph.edges.find((e) => e.type === "categorized_under" && e.source === node.id) : null;
  const categoryNode = categoryEdge ? graph.nodes.find((n) => n.id === categoryEdge.target) ?? null : null;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="문서"
        meta={
          <>
            프로젝트 위키 · <b className="text-text-primary tabular-nums">{articleCount}</b>편
          </>
        }
      />

      {/* 프로토 .docs — 좌 270px 트리 카드 + 우 mdoc 카드 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="fold">{g.label}</div>
              {g.items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigateToNode(a.id)}
                  className={`doc ${a.id === selectedNodeId ? "on" : ""}`}
                  title={a.name}
                >
                  <span className="truncate" style={{ minWidth: 0 }}>{a.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* .mdoc — 문서 본문 카드 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "20px 24px" }}>
          {node ? (
            <>
              <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
                <h2 className="text-text-primary" style={{ fontSize: 17, fontWeight: 700 }}>{node.name}</h2>
              </div>
              {/* .dmeta — 카테고리 · 연결/백링크 수 · 태그 */}
              <div className="text-text-muted flex items-center gap-1.5 flex-wrap" style={{ fontSize: 12, marginBottom: 14 }}>
                {categoryNode && (
                  <button
                    type="button"
                    onClick={() => navigateToNode(categoryNode.id)}
                    className="text-text-secondary hover:text-accent transition-colors cursor-pointer"
                  >
                    {categoryNode.name}
                  </button>
                )}
                {categoryNode && <span>·</span>}
                <span>연결 {connections.length}</span>
                <span>·</span>
                <span>백링크 {backlinks.length}</span>
                {node.tags.length > 0 && (
                  <>
                    <span>·</span>
                    {node.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </>
                )}
              </div>

              {/* .toc — 본문 헤딩 목차 */}
              {toc.length > 1 && (
                <div
                  className="text-text-muted"
                  style={{
                    fontSize: 12.5,
                    borderLeft: "2px solid var(--color-border-subtle)",
                    paddingLeft: 12,
                    margin: "12px 0",
                  }}
                >
                  {toc.map((h, i) => (
                    <div key={i} style={{ padding: "2px 0", paddingLeft: h.depth === 3 ? 12 : 0 }}>
                      {h.text}
                    </div>
                  ))}
                </div>
              )}

              {/* 본문 — proto-md + claims 카드 렌더 */}
              {content ? (
                <div className="proto-md">
                  <ClaimsContent content={content} mdComponents={MD_COMPONENTS} />
                </div>
              ) : (
                <p className="text-text-muted" style={{ fontSize: 13 }}>(본문 없음)</p>
              )}

              {/* 프로토 "연결" 섹션 — 하단 칩 */}
              {(connections.length > 0 || backlinks.length > 0) && (
                <div style={{ marginTop: 18, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
                  <LinkChips title="연결" nodes={connections} onClick={navigateToNode} />
                  <LinkChips title="백링크" nodes={backlinks} onClick={navigateToNode} />
                </div>
              )}
            </>
          ) : (
            <p className="text-text-muted" style={{ fontSize: 13, padding: 20, textAlign: "center" }}>
              좌측에서 문서를 선택하세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
