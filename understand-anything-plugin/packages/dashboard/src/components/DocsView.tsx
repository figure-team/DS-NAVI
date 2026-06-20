import { useCallback, useEffect, useState } from "react";

import { useDashboardStore } from "../store";
import TrustBadge from "./TrustBadge";

/**
 * 산출물 문서 뷰(D3) — 생성된 SI 문서(.md)를 목록·조회·편집·확정한다.
 * node-detail 편집/확정(P3)과 동형: 편집·저장=즉시 **확정(approver)**, 생성물 불변(오버레이 별도).
 * 표 중심 문서라 본문은 원본 마크다운을 monospace 로 노출(원본 .md 가 곧 산출물). 편집은 textarea.
 *
 * 데이터: dev 서버 GET /doc-list.json · GET /doc-content.json?docId= · POST /doc(토큰 게이트).
 * 읽기전용(데모, accessToken 없음)일 때는 편집 버튼을 숨기고 안내한다.
 */
interface DocListItem {
  docId: string;
  title: string;
  confirmed: boolean;
  approver: string | null;
  at: string | null;
}

const APPROVER_LS_KEY = "ktds.approver";

export default function DocsView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);

  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [confirmedBy, setConfirmedBy] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tokenQ = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken);

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

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* 좌측 문서 목록 */}
      <aside className="w-[260px] md:w-[300px] shrink-0 h-full flex flex-col border-r border-border-subtle bg-surface/40">
        <div
          className="shrink-0 border-b border-border-subtle uppercase text-text-muted"
          style={{ padding: "16px 16px 14px", fontSize: 11, letterSpacing: "0.1em" }}
        >
          산출물 문서
        </div>
        <div className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
          {listError ? (
            <p className="text-text-muted" style={{ fontSize: 12 }}>{listError}</p>
          ) : docs.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              생성된 문서가 없습니다.<br />
              <code>understand-docs</code> 를 먼저 실행하세요.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {docs.map((d) => {
                const isSel = d.docId === selected;
                return (
                  <button
                    key={d.docId}
                    type="button"
                    onClick={() => setSelected(d.docId)}
                    className="flex flex-col gap-1 text-left rounded-lg border cursor-pointer transition-colors w-full"
                    style={{
                      padding: "9px 11px",
                      background: isSel ? "rgba(212,165,116,0.07)" : "var(--color-elevated)",
                      borderColor: isSel ? "var(--color-accent)" : "var(--color-border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-primary" style={{ fontSize: 12.5, lineHeight: 1.35 }}>
                        {d.title}
                      </span>
                      {d.confirmed && <TrustBadge confirmedBy={d.approver} className="ml-auto" />}
                    </div>
                    <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      {d.docId}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* 우측 문서 본문 */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-root">
        {selectedDoc ? (
          <>
            <div
              className="flex items-center gap-3 shrink-0 bg-panel border-b border-border-subtle"
              style={{ padding: "10px 20px" }}
            >
              <span className="text-text-primary" style={{ fontSize: 14 }}>{selectedDoc.title}</span>
              <TrustBadge confirmedBy={confirmedBy} verdict={null} />
              <span className="ml-auto flex items-center gap-2">
                {saveError && (
                  <span className="text-amber-400" style={{ fontSize: 11 }}>저장 실패: {saveError}</span>
                )}
                {!canWrite ? (
                  <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용(라이브 서버 없음)</span>
                ) : editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-md border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={saving}
                      className="rounded-md border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      {saving ? "저장 중…" : "저장 + 확정"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(content);
                      setEditing(true);
                    }}
                    className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors"
                    style={{ padding: "4px 12px", fontSize: 12 }}
                  >
                    편집
                  </button>
                )}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto" style={{ padding: 20 }}>
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-elevated text-text-primary rounded-lg border border-border-subtle outline-none focus:border-accent transition-colors"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, padding: 14, resize: "none" }}
                />
              ) : (
                <pre
                  className="text-text-secondary"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre", margin: 0 }}
                >
                  {content}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-8 text-center">
            <p className="text-text-muted" style={{ fontSize: 13 }}>좌측에서 문서를 선택하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
