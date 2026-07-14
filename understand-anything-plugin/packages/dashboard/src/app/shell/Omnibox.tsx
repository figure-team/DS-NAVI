import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { dataUrl } from "../../shared/api/client";

interface OmniResult {
  key: string;
  group: string;
  label: string;
  sub?: string;
  badge?: string;
  go: () => void;
}

interface DocEntry {
  docId: string;
  title: string;
  methodology: string | null;
}

interface RtmFn {
  id: string;
  name: string;
  domainId: string | null;
  domainName: string | null;
}

interface RtmReq {
  id: string;
  text: string | null;
  type: string | null;
}

/**
 * 옴니박스 (FRONT_REDESIGN §4, 시안 mockup-shell-home) — ⌘K 전역 검색.
 * 소스: 코드(SearchEngine, filePath 있는 노드만 — 코드뷰어 직접 오픈) · 도메인/흐름
 * (domain-graph) · 산출물(doc-list) · 추적표(rtm 기능/요구). 결과 선택 시에만 이동
 * (자동 라우팅 금지 — structure-scale 원칙). "코드" 그룹은 이동이 아니라 코드뷰어
 * 오버레이를 여는 예외(STRUCTURE_FROM_MAP_DESIGN v2 이후 구조 메뉴가 노드를 렌더하지
 * 않으므로 옛 `/structure?node=` 딥링크는 더 이상 유효한 목적지가 아니다).
 */
export default function Omnibox({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 팔레트 오픈 시 1회 로드 캐시 — 홈/셸 어디서든 같은 세션 데이터.
  const docsRef = useRef<DocEntry[] | null>(null);
  const rtmRef = useRef<{ fns: RtmFn[]; reqs: RtmReq[] } | null>(null);
  const [, setLoadedTick] = useState(0);

  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);

  // ⌘K / Ctrl+K — 전역 오픈.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // 오픈 시: 포커스 + 문서/RTM 소스 1회 로드(없으면 그룹만 비움).
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (docsRef.current === null) {
      fetch(dataUrl("doc-list.json", accessToken))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          docsRef.current = Array.isArray(d?.docs) ? d.docs : [];
          setLoadedTick((n) => n + 1);
        })
        .catch(() => {
          docsRef.current = [];
        });
    }
    if (rtmRef.current === null) {
      fetch(dataUrl("rtm.json", accessToken))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          rtmRef.current = {
            fns: Array.isArray(d?.functions)
              ? d.functions.map((f: Record<string, unknown>) => ({
                  id: String(f.id ?? ""),
                  name: String(f.name ?? f.id ?? ""),
                  domainId: typeof f.domainId === "string" ? f.domainId : null,
                  domainName: typeof f.domainName === "string" ? f.domainName : null,
                }))
              : [],
            reqs: Array.isArray(d?.requirements)
              ? d.requirements.map((r: Record<string, unknown>) => ({
                  id: String(r.id ?? ""),
                  text: typeof r.text === "string" ? r.text : null,
                  type: typeof r.type === "string" ? r.type : null,
                }))
              : [],
          };
          setLoadedTick((n) => n + 1);
        })
        .catch(() => {
          rtmRef.current = { fns: [], reqs: [] };
        });
    }
  }, [open, accessToken]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  // 크로스섹션 점프는 선택을 들고 이동 — 셸의 섹션 전환 정리를 1회 건너뛴다.
  const jump = useCallback(
    (path: string, preserve: boolean) => {
      if (preserve) useDashboardStore.getState().markPreserveTransientOnce();
      navigate(path);
      close();
    },
    [navigate, close],
  );

  const results = useMemo<OmniResult[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const out: OmniResult[] = [];

    // 1) 구조 노드 — 퍼지(SearchEngine). 구조 메뉴가 파일/클래스 KG 뷰를 은퇴한 뒤로는
    // 노드 자체를 렌더하는 화면이 없다 — 선택 시 코드뷰어를 직접 연다(openCodeViewer,
    // 인용 칩·EdgeEvidencePanel 등 다른 진입점과 동일한 경로). filePath 없는 노드
    // (예: table)는 코드뷰어가 보여줄 게 없으므로 결과에서 제외한다.
    const engine = useDashboardStore.getState().searchEngine;
    const nodesById = useDashboardStore.getState().nodesById;
    const openCodeViewer = useDashboardStore.getState().openCodeViewer;
    if (engine && graph) {
      for (const r of engine.search(q, { limit: 6 })) {
        const node = nodesById.get(r.nodeId);
        if (!node || !node.filePath) continue;
        out.push({
          key: `node:${node.id}`,
          group: "코드",
          label: node.name,
          sub: node.filePath,
          badge: node.type,
          go: () => {
            openCodeViewer(node.id);
            close();
          },
        });
      }
    }

    // 2) 도메인/흐름 — 이름 부분일치.
    if (domainGraph) {
      const flowDomain = new Map<string, string>();
      for (const e of domainGraph.edges) {
        if (e.type === "contains_flow") flowDomain.set(e.target, e.source);
      }
      let count = 0;
      for (const n of domainGraph.nodes) {
        if (count >= 4) break;
        if (n.type !== "domain" && n.type !== "flow") continue;
        if (!n.name.toLowerCase().includes(lower)) continue;
        count += 1;
        if (n.type === "domain") {
          out.push({
            key: `domain:${n.id}`,
            group: "도메인·흐름",
            label: n.name,
            badge: "도메인",
            go: () => jump(`/domains/${encodeURIComponent(n.id)}`, false),
          });
        } else {
          const dom = flowDomain.get(n.id);
          out.push({
            key: `flow:${n.id}`,
            group: "도메인·흐름",
            label: n.name,
            sub: dom ? domainGraph.nodes.find((d) => d.id === dom)?.name : undefined,
            badge: "흐름",
            go: () =>
              dom
                ? jump(
                    `/domains/${encodeURIComponent(dom)}?flow=${encodeURIComponent(n.id)}`,
                    true,
                  )
                : jump("/domains", false),
          });
        }
      }
    }

    // 3) 산출물 문서.
    for (const d of (docsRef.current ?? []).filter(
      (d) => d.title.toLowerCase().includes(lower) || d.docId.toLowerCase().includes(lower),
    ).slice(0, 3)) {
      out.push({
        key: `doc:${d.docId}`,
        group: "산출물",
        label: d.title,
        sub: d.methodology ?? undefined,
        badge: "문서",
        go: () => jump("/deliverables", false),
      });
    }

    // 4) 추적표 — 기능·요구.
    const rtm = rtmRef.current;
    if (rtm) {
      for (const f of rtm.fns
        .filter(
          (f) =>
            f.name.toLowerCase().includes(lower) ||
            f.id.toLowerCase().includes(lower) ||
            (f.domainName ?? "").toLowerCase().includes(lower),
        )
        .slice(0, 4)) {
        out.push({
          key: `fn:${f.id}`,
          group: "추적표",
          label: f.name,
          sub: f.domainName ?? undefined,
          badge: "기능",
          go: () => jump("/rtm", false),
        });
      }
      for (const r of rtm.reqs
        .filter(
          (r) => r.id.toLowerCase().includes(lower) || (r.text ?? "").toLowerCase().includes(lower),
        )
        .slice(0, 3)) {
        out.push({
          key: `req:${r.id}`,
          group: "추적표",
          label: r.text ? `${r.id} — ${r.text}` : r.id,
          badge: r.type === "nonfunctional" ? "NFR" : "요구",
          go: () => jump("/rtm", false),
        });
      }
    }

    return out.slice(0, 14);
  }, [query, graph, domainGraph, jump, close]);

  useEffect(() => setCursor(0), [query]);

  // 커서 항목이 리스트 밖이면 스크롤 추적.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      results[cursor].go();
    }
  };

  const isMac =
    typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform ?? "");

  return (
    <>
      {/* 트리거 — 시안: 검색 필드 모양 + ⌘K 힌트 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 w-[340px] px-3 py-[7px] rounded-lg bg-panel border border-border-medium text-[13px] text-text-muted hover:border-accent/50 transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="truncate">노드·흐름·문서·요구사항 검색</span>
        <kbd className="ml-auto shrink-0 text-[11px] px-1.5 py-px rounded border border-border-medium bg-surface text-text-muted">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {/* 모바일 트리거 — 아이콘만 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="검색"
        className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {/* 팔레트 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4"
          onMouseDown={close}
        >
          <div
            className="w-full max-w-[600px] bg-panel border border-border-subtle rounded-xl card-shadow overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 border-b border-border-subtle">
              <svg className="w-4 h-4 shrink-0 text-text-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="노드·흐름·문서·요구사항 검색"
                className="flex-1 py-3.5 bg-transparent text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <kbd className="shrink-0 text-[11px] px-1.5 py-px rounded border border-border-medium bg-surface text-text-muted">
                Esc
              </kbd>
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-auto py-1.5">
              {query.trim() === "" ? (
                <div className="px-4 py-6 text-[13px] text-text-muted text-center">
                  이름·경로·ID로 검색합니다. 결과를 선택하면 해당 화면으로 이동합니다(코드는 코드뷰어가 열립니다).
                </div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-[13px] text-text-muted text-center">
                  “{query}” 검색 결과가 없습니다.
                </div>
              ) : (
                results.map((r, i) => (
                  <div key={r.key}>
                    {(i === 0 || results[i - 1].group !== r.group) && (
                      <div className="px-4 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                        {r.group}
                      </div>
                    )}
                    <button
                      type="button"
                      data-idx={i}
                      onClick={r.go}
                      onMouseEnter={() => setCursor(i)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${
                        i === cursor ? "bg-elevated" : ""
                      }`}
                    >
                      {r.badge && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-elevated text-text-secondary border border-border-subtle">
                          {r.badge}
                        </span>
                      )}
                      <span className="truncate text-text-primary">{r.label}</span>
                      {r.sub && (
                        <span className="ml-auto shrink-0 max-w-[220px] truncate text-[12px] text-text-muted font-mono">
                          {r.sub}
                        </span>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-2 border-t border-border-subtle text-[11px] text-text-muted flex gap-3">
              <span>↑↓ 이동</span>
              <span>Enter 열기</span>
              <span>Esc 닫기</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
