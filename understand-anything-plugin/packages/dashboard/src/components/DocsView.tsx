import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDashboardStore } from "../store";
import { Badge, BtnAccent, BtnOutline, PageHead } from "./proto/Proto";

/** 표시용 frontmatter(--- ... ---) 제거 — 메타는 헤더/배지로 노출, 본문엔 불필요.
 *  claims/wiki-links 펜스 주석도 렌더에서 숨긴다(내용은 유지 — 마커는 기계용). */
function stripFrontmatter(md: string): string {
  return md
    .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/[ \t]*<!--\s*(?:claims:FENCE:(?:OPEN|CLOSE)|wiki-links[^>]*)\s*-->[ \t]*\r?\n?/g, "");
}


/**
 * 산출물 문서 뷰(D3) — 생성된 SI 문서(.md)를 목록·조회·편집·확정한다.
 * node-detail 편집/확정(P3)과 동형: 편집·저장=즉시 **확정(approver)**, 생성물 불변(오버레이 별도).
 * 레이아웃은 pmpl-proto .docs — 좌 트리 카드(fold+상태 배지) + 우 mdoc 카드(.proto-md 렌더). 편집은 textarea.
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

export default function DocsView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);

  // P5 잔여 해소: 선택 문서는 URL(:docId)이 진실 — 딥링크·공유 가능.
  const { docId: routeDocId } = useParams();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(routeDocId ?? null);
  const [content, setContent] = useState<string>("");
  const [confirmedBy, setConfirmedBy] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tokenQ = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken);

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

  // 선택 문서 내용 로드.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setEditing(false);
    setSaveError(null);
    fetch(`/doc-content.json${tokenQ ? tokenQ + "&" : "?"}docId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data: { content?: string; confirmed?: boolean; approver?: string | null }) => {
        if (!alive) return;
        setContent(data.content ?? "");
        setConfirmedBy(data.confirmed ? data.approver ?? null : null);
      })
      .catch(() => alive && setContent(""));
    return () => {
      alive = false;
    };
  }, [selected, tokenQ]);

  const resolveApprover = useCallback((): string | null => {
    const fromStore = approverHandle?.trim();
    if (fromStore) return fromStore;
    const fromLs =
      typeof localStorage !== "undefined" ? localStorage.getItem(APPROVER_LS_KEY)?.trim() : undefined;
    if (fromLs) {
      setApproverHandle(fromLs);
      return fromLs;
    }
    const entered = typeof window !== "undefined" ? window.prompt("확정자(이름/핸들)를 입력하세요:")?.trim() : "";
    if (entered) {
      try {
        localStorage.setItem(APPROVER_LS_KEY, entered);
      } catch {
        /* ignore */
      }
      setApproverHandle(entered);
      return entered;
    }
    return null;
  }, [approverHandle, setApproverHandle]);

  const onSave = useCallback(async () => {
    if (!selected || !accessToken) return;
    const approver = resolveApprover();
    if (!approver) return; // 사용자가 확정자 입력을 취소.
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
      // 즉시 확정 반영.
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
  }, [selected, accessToken, draft, resolveApprover]);

  const selectedDoc = docs.find((d) => d.docId === selected) ?? null;

  const confirmedCount = docs.filter((d) => d.confirmed).length;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="산출물"
        meta={
          docs.length > 0 ? (
            <>
              산출물 <b className="text-text-primary tabular-nums">{docs.length}</b>종 · 확정{" "}
              <b className="text-text-primary tabular-nums">{confirmedCount}</b> · 초안{" "}
              <b className="text-text-primary tabular-nums">{docs.length - confirmedCount}</b>
            </>
          ) : undefined
        }
      />

      {/* 프로토 .docs — 좌 270px 트리 카드 + 우 mdoc 카드 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
          {listError ? (
            <p className="text-text-muted" style={{ fontSize: 12, padding: "4px 6px" }}>{listError}</p>
          ) : docs.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.5, padding: "4px 6px" }}>
              생성된 문서가 없습니다.<br />
              <code>understand-docs</code> 를 먼저 실행하세요.
            </p>
          ) : (
            FOLDERS.map((folder) => {
              const items = docs.filter((d) => folderKeyOf(d.methodology) === folder.key);
              if (items.length === 0) return null;
              const isOpen = !collapsed.has(folder.key);
              return (
                <div key={folder.key}>
                  {/* .fold — 접기/펼치기 겸용 그룹 라벨 */}
                  <button
                    type="button"
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
                          onClick={() => navigate(`/deliverables/${encodeURIComponent(d.docId)}`)}
                          title={d.docId}
                          className={`doc ${isSel ? "on" : ""}`}
                        >
                          <span className="truncate" style={{ minWidth: 0 }}>{d.title}</span>
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

        {/* .mdoc — 문서 본문 카드 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "20px 24px" }}>
          {selectedDoc ? (
            <>
              {/* .dh — 제목 + 상태 배지 + 우측 액션 */}
              <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
                <h2 className="text-text-primary" style={{ fontSize: 17, fontWeight: 700 }}>{selectedDoc.title}</h2>
                <Badge tone={confirmedBy ? "ok" : "info"}>{confirmedBy ? "확정" : "초안"}</Badge>
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
                    <BtnOutline sm onClick={() => setEditing(false)}>취소</BtnOutline>
                    <BtnAccent sm onClick={() => void onSave()} disabled={saving}>
                      {saving ? "저장 중…" : "저장 + 확정"}
                    </BtnAccent>
                  </>
                ) : (
                  <BtnOutline
                    sm
                    onClick={() => {
                      setDraft(content);
                      setEditing(true);
                    }}
                  >
                    편집
                  </BtnOutline>
                )}
              </div>
              {/* .dmeta — 방법론 · 승인자 · 확정일 */}
              <div className="text-text-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                {FOLDERS.find((f) => f.key === folderKeyOf(selectedDoc.methodology))?.label ?? "기타"}
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
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full bg-elevated text-text-primary rounded-lg border border-border-subtle outline-none focus:border-accent transition-colors"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, padding: 14, resize: "vertical", minHeight: "60vh" }}
                />
              ) : (
                <div className="proto-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
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
