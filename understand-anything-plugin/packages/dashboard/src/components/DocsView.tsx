import { Children, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDashboardStore } from "../store";
import { Badge, BtnAccent, BtnOutline } from "./proto/Proto";
import TopBarSlot from "../app/shell/TopBarSlot";
import InfoPopover from "./InfoPopover";

type MdComponents = ComponentProps<typeof ReactMarkdown>["components"];

/** 표시용 frontmatter(--- ... ---) 제거 — 메타는 헤더/배지로 노출, 본문엔 불필요.
 *  claims/wiki-links 펜스 주석도 렌더에서 숨긴다(내용은 유지 — 마커는 기계용). */
function stripFrontmatter(md: string): string {
  return md
    .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/[ \t]*<!--\s*(?:claims:FENCE:(?:OPEN|CLOSE)|wiki-links[^>]*)\s*-->[ \t]*\r?\n?/g, "");
}

/** h2/h3 → 앵커 id. TOC 링크와 헤딩 id 가 같은 함수로 슬러그화되어야 스크롤이 맞는다. */
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** ReactMarkdown 헤딩 children → 순수 텍스트(슬러그 계산용). */
function toText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return toText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

/** 본문 텍스트 토큰화 — file:line(→코드뷰어 칩) · [추정]/[확인필요](→배지)만 요소로 치환. */
const TOKEN_RE = /(\[추정\]|\[확인필요\])|([A-Za-z0-9_./-]+\.[A-Za-z][A-Za-z0-9]{0,4}):(\d+)/g;

function tokenizeText(text: string, openCode: (file: string, line: number) => void): ReactNode {
  TOKEN_RE.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      const estimate = m[1] === "[추정]";
      parts.push(
        <Badge key={k++} tone={estimate ? "warn" : "err"}>
          {estimate ? "추정" : "확인필요"}
        </Badge>,
      );
    } else {
      const file = m[2];
      const line = Number(m[3]);
      parts.push(
        <button
          key={k++}
          type="button"
          onClick={() => openCode(file, line)}
          className="cursor-pointer bg-transparent hover:bg-elevated transition-colors"
          style={{
            font: "inherit",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85em",
            color: "var(--color-status-info)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 4,
            padding: "0 5px",
            margin: "0 1px",
          }}
          title="클릭하면 코드 뷰어에서 해당 위치를 엽니다"
        >
          {file}:{m[3]}
        </button>,
      );
    }
    last = TOKEN_RE.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

/** 블록 요소 children 의 문자열 노드만 토큰화(요소 노드는 그대로 통과). */
function decorate(children: ReactNode, openCode: (file: string, line: number) => void): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? tokenizeText(child, openCode) : child,
  );
}

/** 검색어 하이라이트 — 대소문자 무시로 일치 구간만 mark 표시. */
function Highlight({ text, q }: { text: string; q: string }) {
  const ql = q.trim();
  if (!ql) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = ql.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={k++}
        style={{
          background: "color-mix(in srgb, var(--color-status-info) 24%, transparent)",
          color: "inherit",
          borderRadius: 3,
          padding: "0 1px",
        }}
      >
        {text.slice(idx, idx + ql.length)}
      </mark>,
    );
    i = idx + ql.length;
  }
  return <>{parts}</>;
}

/**
 * 산출물 문서 뷰(D3) — 생성된 SI 문서(.md)를 목록·조회·편집·확정한다.
 * node-detail 편집/확정(P3)과 동형: 편집·저장=즉시 **확정(approver)**, 생성물 불변(오버레이 별도).
 * 레이아웃은 pmpl-proto .docs — 좌 트리 카드(검색·상태필터·fold+상태 배지) + 우 mdoc 카드(.proto-md 렌더). 편집은 textarea.
 *
 * 데이터: dev 서버 GET /doc-list.json · GET /doc-content.json?docId= · POST /doc(토큰 게이트).
 * 읽기전용(데모, accessToken 없음)일 때는 편집 버튼을 숨기고 안내한다.
 */
interface DocListItem {
  docId: string;
  title: string;
  methodology?: string;
  confirmed: boolean;
  approver: string | null;
  at: string | null;
  /** W7: 병기된 xlsx 존재 — 다운로드 버튼 노출 조건. */
  hasXlsx?: boolean;
  /** W7: xlsx 가 스캔 스냅샷보다 낡음(확정 편집 미반영/md 갱신) — 경고 라벨. */
  xlsxStale?: boolean;
}

const APPROVER_LS_KEY = "ktds.approver";

/** 방법론 → 사이드바 폴더 라벨 + 순서. 미분류는 '기타'. */
const FOLDERS: Array<{ key: string; label: string }> = [
  { key: "as-built", label: "현행 분석" },
  { key: "si-standard", label: "SI 표준 산출물" },
  { key: "policy", label: "정책서" },
  { key: "_other", label: "기타" },
];
const folderKeyOf = (m?: string): string =>
  m === "as-built" || m === "si-standard" || m === "policy" ? m : "_other";
const folderLabelOf = (m?: string): string =>
  FOLDERS.find((f) => f.key === folderKeyOf(m))?.label ?? "기타";

type StatusFilter = "all" | "confirmed" | "draft";

export default function DocsView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);

  // P5 잔여 해소: 선택 문서는 URL(:docId)이 진실 — 딥링크·공유 가능. 검색·상태 필터는 searchParams.
  const { docId: routeDocId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const status = ((): StatusFilter => {
    const s = searchParams.get("status");
    return s === "confirmed" || s === "draft" ? s : "all";
  })();

  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(routeDocId ?? null);
  const [content, setContent] = useState<string>("");
  const [confirmedBy, setConfirmedBy] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [approverOpen, setApproverOpen] = useState(false);
  const [approverInput, setApproverInput] = useState("");

  const tokenQ = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken);
  const dirty = editing && draft !== content;

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setSearchParams(
        (prev) => {
          if (value) prev.set(key, value);
          else prev.delete(key);
          return prev;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // URL(:docId) → 선택 동기화(뒤로가기/딥링크).
  useEffect(() => {
    if (routeDocId) setSelected(routeDocId);
  }, [routeDocId]);

  // 문서 목록 로드.
  useEffect(() => {
    let alive = true;
    fetch(`/doc-list.json${tokenQ}`)
      .then((r) => r.json())
      .then((data: { docs?: DocListItem[]; error?: string }) => {
        if (!alive) return;
        if (Array.isArray(data.docs)) {
          setDocs(data.docs);
          setSelected((cur) => cur ?? data.docs![0]?.docId ?? null);
        } else {
          setListError(data.error ?? "문서 목록을 불러오지 못했습니다.");
        }
      })
      .catch((e) => alive && setListError(String(e)));
    return () => {
      alive = false;
    };
  }, [tokenQ]);

  // 선택 문서 내용 로드 — 로딩/에러를 삼키지 않고 노출한다.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setEditing(false);
    setApproverOpen(false);
    setSaveError(null);
    setContentError(null);
    setLoading(true);
    fetch(`/doc-content.json${tokenQ ? tokenQ + "&" : "?"}docId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data: { content?: string; confirmed?: boolean; approver?: string | null; error?: string }) => {
        if (!alive) return;
        if (typeof data.content === "string") {
          setContent(data.content);
          setConfirmedBy(data.confirmed ? data.approver ?? null : null);
        } else {
          setContent("");
          setConfirmedBy(null);
          setContentError(data.error ?? "문서 내용을 불러오지 못했습니다.");
        }
      })
      .catch((e) => {
        if (!alive) return;
        setContent("");
        setContentError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected, tokenQ]);

  // 편집 중 미저장 이탈 가드 — 탭 닫기/새로고침에만 개입(편집 중에만 등록).
  useEffect(() => {
    if (!editing) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (draft === content) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing, draft, content]);

  /** 저장된 확정자(store → localStorage). 없으면 null → 인라인 입력을 띄운다(window.prompt 폐기). */
  const storedApprover = useCallback((): string | null => {
    const fromStore = approverHandle?.trim();
    if (fromStore) return fromStore;
    const fromLs =
      typeof localStorage !== "undefined" ? localStorage.getItem(APPROVER_LS_KEY)?.trim() : undefined;
    if (fromLs) {
      setApproverHandle(fromLs);
      return fromLs;
    }
    return null;
  }, [approverHandle, setApproverHandle]);

  const doSave = useCallback(
    async (approver: string) => {
      if (!selected || !accessToken) return;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/doc?token=${encodeURIComponent(accessToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId: selected, content: draft, approver }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string; approver?: string } | null;
        if (!res.ok || !data) {
          setSaveError(data?.error ?? `HTTP ${res.status}`);
          return;
        }
        // 즉시 확정 반영(낙관적) — 필터/전체 리스트 공용 docs 를 갱신.
        setContent(draft);
        setConfirmedBy(data.approver ?? approver);
        setDocs((prev) =>
          prev.map((d) => (d.docId === selected ? { ...d, confirmed: true, approver: data.approver ?? approver } : d)),
        );
        setEditing(false);
      } catch (e) {
        setSaveError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [selected, accessToken, draft],
  );

  const onSaveClick = useCallback(() => {
    if (!selected || !accessToken) return;
    const approver = storedApprover();
    if (approver) {
      void doSave(approver);
    } else {
      setApproverInput(approverHandle?.trim() ?? "");
      setApproverOpen(true);
    }
  }, [selected, accessToken, storedApprover, doSave, approverHandle]);

  const confirmApprover = useCallback(() => {
    const v = approverInput.trim();
    if (!v) return;
    try {
      localStorage.setItem(APPROVER_LS_KEY, v);
    } catch {
      /* ignore */
    }
    setApproverHandle(v);
    setApproverOpen(false);
    void doSave(v);
  }, [approverInput, setApproverHandle, doSave]);

  /** 미저장 상태에서의 이탈(문서 전환/편집 취소) 확인. */
  const confirmDiscard = useCallback(
    (message: string): boolean => !dirty || window.confirm(message),
    [dirty],
  );

  const selectDoc = useCallback(
    (docId: string) => {
      if (!confirmDiscard("저장하지 않은 변경이 있습니다. 다른 문서로 이동할까요?")) return;
      navigate(`/deliverables/${encodeURIComponent(docId)}`);
    },
    [confirmDiscard, navigate],
  );

  const selectedDoc = docs.find((d) => d.docId === selected) ?? null;
  const confirmedCount = docs.filter((d) => d.confirmed).length;

  // 검색(제목·docId·방법론 폴더) + 상태 칩 필터. 선택은 필터와 독립(딥링크·낙관적 반영 유지).
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (status === "confirmed" && !d.confirmed) return false;
      if (status === "draft" && d.confirmed) return false;
      if (!ql) return true;
      return (
        d.title.toLowerCase().includes(ql) ||
        d.docId.toLowerCase().includes(ql) ||
        folderLabelOf(d.methodology).toLowerCase().includes(ql) ||
        (d.methodology ?? "").toLowerCase().includes(ql)
      );
    });
  }, [docs, q, status]);

  const mdComponents = useMemo<MdComponents>(
    () => ({
      p: ({ children }) => <p>{decorate(children, openCodeViewerAt)}</p>,
      li: ({ children }) => <li>{decorate(children, openCodeViewerAt)}</li>,
      td: ({ children }) => <td>{decorate(children, openCodeViewerAt)}</td>,
      th: ({ children }) => <th>{decorate(children, openCodeViewerAt)}</th>,
      h2: ({ children }) => <h2 id={slugify(toText(children))}>{children}</h2>,
      h3: ({ children }) => <h3 id={slugify(toText(children))}>{children}</h3>,
    }),
    [openCodeViewerAt],
  );

  // 장문 목차 — 코드펜스 밖 h2/h3 추출. 헤딩 id 와 동일 슬러그.
  const toc = useMemo(() => {
    const src = stripFrontmatter(content);
    const out: Array<{ level: number; text: string; id: string }> = [];
    let inFence = false;
    for (const line of src.split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
      if (m) {
        const text = m[2].trim();
        out.push({ level: m[1].length, text, id: slugify(text) });
      }
    }
    return out;
  }, [content]);

  const hasMarkers = /\[추정\]|\[확인필요\]/.test(content);

  const onTocClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const statusChips: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "전체", count: docs.length },
    { key: "confirmed", label: "확정", count: confirmedCount },
    { key: "draft", label: "초안", count: docs.length - confirmedCount },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {/* 메뉴 헤더 제거(2026-07-15) — 산출물 카운트는 TopBar 정보 팝오버(ⓘ)로 이관. */}
      {docs.length > 0 && (
        <TopBarSlot>
          <InfoPopover
            title="산출물 정보"
            rows={[
              { label: "산출물", value: `${docs.length}종` },
              { label: "확정", value: `${confirmedCount}` },
              { label: "초안", value: `${docs.length - confirmedCount}` },
            ]}
          />
        </TopBarSlot>
      )}

      {/* 프로토 .docs — 좌 270px 트리 카드 + 우 mdoc 카드 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
        <div className="min-w-0">
          {/* 검색 + 상태 칩 필터 */}
          <input
            type="search"
            value={q}
            onChange={(e) => setParam("q", e.target.value || null)}
            placeholder="제목·ID·방법론 검색"
            aria-label="산출물 검색"
            className="w-full rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
            style={{ padding: "7px 12px", fontSize: 13, marginBottom: 8 }}
          />
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="상태 필터">
            {statusChips.map((c) => {
              const active = status === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setParam("status", c.key === "all" ? null : c.key)}
                  aria-pressed={active}
                  className={`rounded-md border transition-colors ${
                    active
                      ? "border-accent text-accent"
                      : "border-border-subtle text-text-muted hover:bg-elevated"
                  }`}
                  style={{ padding: "3px 10px", fontSize: 11.5, fontWeight: 600, background: "transparent" }}
                >
                  {c.label}
                  <span className="tabular-nums" style={{ marginLeft: 5, opacity: 0.75 }}>
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
            {listError ? (
              <p className="text-text-muted" style={{ fontSize: 12, padding: "4px 6px" }}>{listError}</p>
            ) : docs.length === 0 ? (
              <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.5, padding: "4px 6px" }}>
                생성된 문서가 없습니다.<br />
                <code>understand-docs</code> 를 먼저 실행하세요.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-text-muted" style={{ fontSize: 12, padding: "10px 8px" }}>검색 결과 없음</p>
            ) : (
              FOLDERS.map((folder) => {
                const items = filtered.filter((d) => folderKeyOf(d.methodology) === folder.key);
                if (items.length === 0) return null;
                const isOpen = !collapsed.has(folder.key);
                return (
                  <div key={folder.key}>
                    {/* .fold — 접기/펼치기 겸용 그룹 라벨 */}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(folder.key)) next.delete(folder.key);
                          else next.add(folder.key);
                          return next;
                        })
                      }
                      className="fold flex items-center gap-1 w-full text-left cursor-pointer bg-transparent border-0"
                      style={{ font: "inherit", fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)" }}
                    >
                      <span style={{ fontSize: 9, width: 10, display: "inline-block" }}>{isOpen ? "▾" : "▸"}</span>
                      {folder.label}
                      <span className="ml-auto tabular-nums" style={{ fontWeight: 500 }}>{items.length}</span>
                    </button>
                    {isOpen &&
                      items.map((d) => {
                        const isSel = d.docId === selected;
                        return (
                          <button
                            key={d.docId}
                            type="button"
                            aria-current={isSel ? "true" : undefined}
                            onClick={() => selectDoc(d.docId)}
                            title={d.docId}
                            className={`doc ${isSel ? "on" : ""}`}
                          >
                            <span className="truncate" style={{ minWidth: 0 }}>
                              <Highlight text={d.title} q={q} />
                            </span>
                            <span className="st">
                              <Badge
                                tone={d.confirmed ? "ok" : "info"}
                                title={d.confirmed && d.approver ? `확정 · ${d.approver}` : undefined}
                              >
                                {d.confirmed ? "확정" : "초안"}
                              </Badge>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* .mdoc — 문서 본문 카드 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "20px 24px" }}>
          {selectedDoc ? (
            <>
              {/* .dh — 제목 + 상태 배지 + 우측 액션 (장문 편집 중에도 저장 버튼 유지: sticky) */}
              <div
                className="flex items-center gap-2.5 flex-wrap"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  background: "var(--color-panel)",
                  paddingTop: 4,
                  paddingBottom: 8,
                  marginBottom: 4,
                }}
              >
                <h2 className="text-text-primary" style={{ fontSize: 17, fontWeight: 700 }}>{selectedDoc.title}</h2>
                <Badge tone={confirmedBy ? "ok" : "info"}>{confirmedBy ? "확정" : "초안"}</Badge>
                {dirty && <Badge tone="warn">미저장</Badge>}
                <div className="flex-1" />
                {saveError && (
                  <span style={{ fontSize: 11, color: "var(--color-status-warn)" }}>저장 실패: {saveError}</span>
                )}
                {selectedDoc.hasXlsx && accessToken && !editing && (
                  <a
                    href={`/doc-xlsx?token=${encodeURIComponent(accessToken)}&docId=${encodeURIComponent(selectedDoc.docId)}`}
                    download={`${selectedDoc.docId}.xlsx`}
                    className="rounded-md border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
                    style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, textDecoration: "none" }}
                    title={
                      selectedDoc.xlsxStale
                        ? "이 xlsx 는 스캔 스냅샷입니다 — 이후의 확정 편집/문서 갱신이 반영되지 않았습니다. 최신화: /understand-docs 재실행."
                        : "정적 스캔 스냅샷(원천 데이터) — 확정 편집은 md 가 진실입니다."
                    }
                  >
                    xlsx
                  </a>
                )}
                {!canWrite ? (
                  <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용(라이브 서버 없음)</span>
                ) : editing ? (
                  <>
                    <BtnOutline
                      sm
                      onClick={() => {
                        if (!confirmDiscard("저장하지 않은 변경이 있습니다. 편집을 취소할까요?")) return;
                        setApproverOpen(false);
                        setEditing(false);
                      }}
                    >
                      취소
                    </BtnOutline>
                    <BtnAccent sm onClick={onSaveClick} disabled={saving}>
                      {saving ? "저장 중…" : "저장 + 확정"}
                    </BtnAccent>
                  </>
                ) : (
                  <BtnOutline
                    sm
                    disabled={loading || Boolean(contentError)}
                    onClick={() => {
                      setDraft(content);
                      setEditing(true);
                    }}
                  >
                    편집
                  </BtnOutline>
                )}
              </div>

              {/* 인라인 확정자 입력 — window.prompt 대체(localStorage 기억 유지) */}
              {approverOpen && (
                <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: 12 }}>
                  <label className="text-text-muted" style={{ fontSize: 12 }} htmlFor="docs-approver">
                    확정자
                  </label>
                  <input
                    id="docs-approver"
                    autoFocus
                    value={approverInput}
                    onChange={(e) => setApproverInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmApprover();
                      else if (e.key === "Escape") setApproverOpen(false);
                    }}
                    placeholder="이름/핸들"
                    aria-label="확정자 이름 또는 핸들"
                    className="rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
                    style={{ padding: "5px 10px", fontSize: 12.5, width: 180 }}
                  />
                  <BtnAccent sm onClick={confirmApprover} disabled={!approverInput.trim() || saving}>
                    확정자 저장 후 저장
                  </BtnAccent>
                  <BtnOutline sm onClick={() => setApproverOpen(false)}>
                    취소
                  </BtnOutline>
                </div>
              )}

              {/* .dmeta — 방법론 · 승인자 · 확정일 */}
              <div className="text-text-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                {folderLabelOf(selectedDoc.methodology)}
                {confirmedBy ? <> · 승인자 {confirmedBy}</> : <> · 승인자 미지정</>}
                {selectedDoc.at ? <> · {selectedDoc.at.slice(0, 10)}</> : null}
              </div>

              {/* xlsx 스냅샷 주의 배너 — 프로토 .banner.info */}
              {selectedDoc.hasXlsx && selectedDoc.xlsxStale && !editing && (
                <div
                  className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-panel"
                  style={{ borderLeft: "3px solid var(--color-status-info)", padding: "10px 14px", fontSize: 13, marginBottom: 14 }}
                >
                  <span style={{ fontWeight: 650 }}>xlsx 스냅샷 주의</span>
                  <span className="text-text-muted">미반영 편집 있음 — 다운로드 전 확정(재생성)을 권장합니다</span>
                </div>
              )}

              {loading ? (
                <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[92, 78, 85, 60, 88, 70].map((w, i) => (
                    <div
                      key={i}
                      className="animate-pulse bg-elevated rounded"
                      style={{ height: 12, width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : contentError ? (
                <div
                  className="rounded-lg border border-border-subtle bg-panel"
                  style={{ borderLeft: "3px solid var(--color-status-warn)", padding: "14px 16px" }}
                >
                  <div className="text-text-primary" style={{ fontWeight: 650, marginBottom: 4, fontSize: 13 }}>
                    문서를 불러오지 못했습니다
                  </div>
                  <div className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{contentError}</div>
                </div>
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full bg-elevated text-text-primary rounded-lg border border-border-subtle outline-none focus:border-accent transition-colors"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, padding: 14, resize: "vertical", minHeight: "60vh" }}
                />
              ) : (
                <>
                  {hasMarkers && (
                    <div
                      className="flex items-center flex-wrap text-text-muted"
                      style={{ gap: 8, fontSize: 11.5, marginBottom: 12 }}
                    >
                      <span>범례:</span>
                      <Badge tone="warn">추정</Badge>
                      <span>자동 추론</span>
                      <Badge tone="err">확인필요</Badge>
                      <span>근거 없음</span>
                      <span>· file:line 클릭 시 코드 뷰어 열림</span>
                    </div>
                  )}
                  {toc.length >= 3 && (
                    <details
                      className="rounded-lg border border-border-subtle"
                      style={{ marginBottom: 14, padding: "8px 12px" }}
                    >
                      <summary
                        className="text-text-secondary cursor-pointer"
                        style={{ fontSize: 12.5, fontWeight: 650 }}
                      >
                        목차 ({toc.length})
                      </summary>
                      <nav style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {toc.map((h, i) => (
                          <a
                            key={i}
                            href={`#${h.id}`}
                            onClick={(e) => onTocClick(e, h.id)}
                            className="truncate"
                            style={{
                              paddingLeft: h.level === 3 ? 14 : 0,
                              fontSize: 12.5,
                              color: "var(--color-status-info)",
                            }}
                          >
                            {h.text}
                          </a>
                        ))}
                      </nav>
                    </details>
                  )}
                  <div className="proto-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {stripFrontmatter(content)}
                    </ReactMarkdown>
                  </div>
                </>
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
