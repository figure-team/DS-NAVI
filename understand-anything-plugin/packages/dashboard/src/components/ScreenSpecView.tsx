import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "../store";
import TrustBadge from "./TrustBadge";
import { Badge, BtnAccent, BtnOutline, ConfBadge, PageHead, type ConfKind } from "./proto/Proto";

/**
 * ktds-fork (S4): 화면설계서 뷰 — SI 화면설계서 슬라이드 재현.
 * 좌: 도메인별 화면 목록 / 우: 캡처 + 번호 배지 오버레이(①②③=입력, ⓐⓑⓒ=이벤트/링크)
 * + 하단 범례 표(항목/이벤트/동작/설명/근거/신뢰도).
 * 데이터: screens.json(생성물, 불변) + screen-overrides.json(사람 편집) 클라이언트 병합.
 * 배지는 PNG 에 굽지 않고 bbox(문서 좌표)를 %로 환산해 오버레이한다.
 */

interface BBox { x: number; y: number; width: number; height: number }
interface Handler {
  target: string | null;
  chain: string[];
  evidence: Array<{ file: string; line: number }>;
  confidence: "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
}
interface Annotation {
  no: number;
  kind: "field" | "action" | "link" | "region";
  selector: string;
  bbox: BBox;
  label: string;
  eventType: string;
  mechanical: { name: string | null; href: string | null; formAction: string | null; required: boolean };
  handler: Handler | null;
  description: string | null;
  note: string | null;
}
interface Screen {
  id: string;
  title: string;
  url: string;
  jspFile: string | null;
  domain: string | null;
  scenario: string | null;
  openedFrom: string | null;
  capture: { path: string; width: number; height: number; capturedAt: string };
  summary: { text: string; confidence: string } | null;
  annotations: Annotation[];
}
interface ScreensFile {
  baseUrl: string;
  screens: Screen[];
  unmatchedJsps: string[];
  fragments: string[];
  missing: Array<{ url: string; reason: string }>;
}
interface AnnOverride { description?: string; label?: string; note?: string; hidden?: boolean }
interface ScreenOverride {
  approver: string;
  at: string;
  titleOverride?: string;
  annotations?: Record<string, AnnOverride>;
  confirmed: boolean;
}

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";
const CIRCLED_LETTERS = "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ";
const CIRCLED_UPPER = "ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ";
function glyphTable(kind: Annotation["kind"]): string {
  return kind === "field" || kind === "region"
    ? CIRCLED_DIGITS
    : kind === "action"
      ? CIRCLED_LETTERS
      : CIRCLED_UPPER;
}
function badgeGlyph(kind: Annotation["kind"], no: number): string {
  return [...glyphTable(kind)][no - 1] ?? `(${no})`;
}
const annKey = (a: Annotation) => `${a.kind}:${a.no}`;

/** 종류별 배지 색상 — 입력=남색 / 버튼·이벤트=금색 / 링크=회색. */
type KindStyle = { bg: string; fg: string; border: string; swatch: string };
const KIND_STYLE: Record<string, KindStyle> = {
  field: { bg: "#2f5d8a", fg: "#ffffff", border: "#2f5d8a", swatch: "#4d82bd" },
  region: { bg: "#2f5d8a", fg: "#ffffff", border: "#2f5d8a", swatch: "#4d82bd" },
  action: { bg: "var(--color-accent)", fg: "#141414", border: "var(--color-accent)", swatch: "var(--color-accent)" },
  link: { bg: "#55585c", fg: "#ececec", border: "#8a8d92", swatch: "#8a8d92" },
};
const kindStyle = (kind: string): KindStyle => KIND_STYLE[kind] ?? KIND_STYLE.link;
/** 범례 섹션 순서 — 입력 → 버튼·이벤트 → 링크. */
const KIND_ORDER: Array<Annotation["kind"]> = ["field", "region", "action", "link"];
const KIND_SECTION: Record<string, string> = {
  field: "입력 항목",
  region: "영역",
  action: "버튼·이벤트",
  link: "링크(이동)",
};

const DOMAIN_LABEL: Record<string, string> = {
  account: "계정(account)",
  cart: "장바구니(cart)",
  catalog: "카탈로그(catalog)",
  order: "주문(order)",
  common: "공통(common)",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  CONFIRMED: "확정",
  CONFIRMED_AI: "확정(AI)",
  INFERRED: "추정",
  UNVERIFIED: "확인 필요",
};
const CONF_KIND: Record<string, ConfKind> = {
  CONFIRMED: "fix",
  CONFIRMED_AI: "ai",
  INFERRED: "est",
  UNVERIFIED: "chk",
};
const KIND_LABEL: Record<string, string> = {
  field: "입력",
  action: "이벤트",
  link: "링크",
  region: "영역",
};
const APPROVER_LS_KEY = "ktds.approver";

export default function ScreenSpecView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken) && !DEMO_MODE;

  const [file, setFile] = useState<ScreensFile | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ScreenOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAnn, setDraftAnn] = useState<Record<string, AnnOverride>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`${dataBase}screens.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ScreensFile) => {
        if (Array.isArray(data?.screens)) setFile(data);
        else setError("screens.json 형식 오류");
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
    fetch(`${dataBase}screen-overrides.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setOverrides(data as Record<string, ScreenOverride>);
        }
      })
      .catch(() => {});
  }, [dataBase, tokenQ]);
  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const byDomain = new Map<string, Screen[]>();
    for (const s of file?.screens ?? []) {
      const key = s.domain ?? "기타";
      byDomain.set(key, [...(byDomain.get(key) ?? []), s]);
    }
    return [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [file]);

  const sel = useMemo(
    () => file?.screens.find((s) => s.id === selId) ?? file?.screens[0] ?? null,
    [file, selId],
  );
  const selOv = sel ? overrides[sel.id] : undefined;
  const title = (s: Screen) => overrides[s.id]?.titleOverride ?? s.title;
  const merged = useCallback(
    (a: Annotation): { description: string | null; label: string; note: string | null; hidden: boolean } => {
      const o = selOv?.annotations?.[annKey(a)];
      return {
        description: o?.description ?? a.description,
        label: o?.label ?? a.label,
        note: o?.note ?? a.note,
        hidden: o?.hidden ?? false,
      };
    },
    [selOv],
  );

  const imgSrc = (s: Screen) =>
    DEMO_MODE
      ? `${dataBase}${s.capture.path}`
      : `/screen-asset?path=${encodeURIComponent(s.capture.path)}&token=${encodeURIComponent(accessToken ?? "")}`;

  const startEdit = () => {
    if (!sel) return;
    setDraftTitle(title(sel));
    const d: Record<string, AnnOverride> = {};
    for (const a of sel.annotations) {
      const m = merged(a);
      d[annKey(a)] = {
        description: m.description ?? "",
        note: m.note ?? "",
        hidden: m.hidden,
      };
    }
    setDraftAnn(d);
    setSaveError(null);
    setEditing(true);
  };

  const save = async (confirmOnly: boolean) => {
    if (!sel || !accessToken) return;
    let approver = approverHandle || localStorage.getItem(APPROVER_LS_KEY) || "";
    if (!approver) {
      approver = window.prompt("확정자 핸들(이름/사번)을 입력하세요:")?.trim() ?? "";
      if (!approver) return;
      localStorage.setItem(APPROVER_LS_KEY, approver);
    }
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = { screenId: sel.id, approver };
    if (!confirmOnly) {
      body.titleOverride = draftTitle;
      const ann: Record<string, AnnOverride> = {};
      for (const a of sel.annotations) {
        const d = draftAnn[annKey(a)];
        if (!d) continue;
        const entry: AnnOverride = {};
        if ((d.description ?? "") !== (a.description ?? "")) entry.description = d.description;
        if ((d.note ?? "") !== (a.note ?? "")) entry.note = d.note;
        if (d.hidden) entry.hidden = true;
        if (Object.keys(entry).length > 0) ann[annKey(a)] = entry;
      }
      body.annotations = ann;
    }
    try {
      const res = await fetch(`/screen-override?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      load();
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        화면설계서 데이터를 불러올 수 없습니다: {error} — 먼저 /understand-screens 를 실행하세요.
      </div>
    );
  }
  if (!file || !sel) {
    return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">불러오는 중…</div>;
  }

  const visibleAnns = sel.annotations.filter((a) => !merged(a).hidden);
  const notes = visibleAnns.filter((a) => merged(a).note);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {/* pmpl-proto page-head — 미매핑·도달 실패는 침묵 누락 대신 헤더 메타로 표면화 */}
      <PageHead
        title="화면설계서"
        meta={
          <>
            화면 <b className="text-text-primary tabular-nums">{file.screens.length}</b>
            {" · "}도달 실패 <b className="text-text-primary tabular-nums">{file.missing.length}</b>건
            {" · "}미매핑 <b className="text-text-primary tabular-nums">{file.unmatchedJsps.length}</b>건
          </>
        }
      />

      {/* 프로토 .scr — 좌 260px 트리 카드 + 우 상세 카드 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]" style={{ gap: 14 }}>
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
          {groups.map(([domain, screens]) => (
            <div key={domain}>
              <div className="fold">{DOMAIN_LABEL[domain] ?? domain} ({screens.length})</div>
              {screens.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelId(s.id);
                    setEditing(false);
                    setHoverKey(null);
                  }}
                  className={`doc ${s.id === sel.id ? "on" : ""}`}
                  title={s.scenario ? `시나리오 ${s.scenario} 로 도달` : undefined}
                >
                  <span className="truncate" style={{ minWidth: 0 }}>{title(s)}</span>
                  {overrides[s.id]?.confirmed && (
                    <span className="st"><Badge tone="ok">확정</Badge></span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {(file.missing.length > 0 || file.unmatchedJsps.length > 0) && (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 8 }}>
              {file.unmatchedJsps.length > 0 && (
                <div className="flex items-center gap-2" style={{ padding: "4px 8px", fontSize: 12 }} title={file.unmatchedJsps.join("\n")}>
                  <span className="text-text-muted">미매핑 JSP {file.unmatchedJsps.length}건</span>
                  <span className="ml-auto"><Badge tone="warn">확인</Badge></span>
                </div>
              )}
              {file.missing.length > 0 && (
                <details style={{ padding: "4px 8px", fontSize: 12 }}>
                  <summary className="cursor-pointer text-text-muted">도달 실패 보고 {file.missing.length}건</summary>
                  <ul style={{ marginTop: 4 }} className="space-y-0.5 text-text-muted">
                    {file.missing.map((m) => (
                      <li key={m.url + m.reason} className="break-all" style={{ fontSize: 11 }}>
                        {m.url} — {m.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* 우: 상세 카드 — 제목 + URL + 배지 + 액션 / dmeta / 캡처 + 배지 오버레이 / 범례 표 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
          <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
            {editing ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="bg-elevated border border-border-subtle rounded px-2 py-1 text-text-primary"
                style={{ fontSize: 15, fontWeight: 700, minWidth: 240 }}
              />
            ) : (
              <b className="text-text-primary" style={{ fontSize: 15 }}>{title(sel)}</b>
            )}
            <span className="text-text-muted break-all" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{sel.url}</span>
            {selOv?.confirmed ? <TrustBadge confirmedBy={selOv.approver} /> : <Badge tone="info">초안</Badge>}
            <div className="flex-1" />
            {saveError && <span style={{ fontSize: 11, color: "var(--color-status-warn)" }}>저장 실패: {saveError}</span>}
            {canWrite && (
              editing ? (
                <>
                  <BtnOutline sm onClick={() => setEditing(false)}>취소</BtnOutline>
                  <BtnAccent sm onClick={() => void save(false)} disabled={saving}>{saving ? "저장 중…" : "저장·확정"}</BtnAccent>
                </>
              ) : (
                <>
                  <BtnOutline sm onClick={startEdit}>편집</BtnOutline>
                  {!selOv?.confirmed && (
                    <BtnAccent sm onClick={() => void save(true)} disabled={saving}>확정</BtnAccent>
                  )}
                </>
              )
            )}
          </div>
          {/* .dmeta — 렌더 JSP · 시나리오 */}
          <div className="text-text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {sel.jspFile && <>렌더 JSP: <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{sel.jspFile}</span></>}
            {sel.jspFile && sel.scenario && " · "}
            {sel.scenario && <>시나리오: {sel.scenario}</>}
          </div>
          {sel.summary && (
            <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
              {sel.summary.text}
              <span style={{ marginLeft: 6 }}>
                <ConfBadge kind={CONF_KIND[sel.summary.confidence] ?? "est"} label={CONFIDENCE_LABEL[sel.summary.confidence]} />
              </span>
            </p>
          )}

          {/* 배지 색상 키 */}
          <div className="flex items-center gap-4 text-text-muted" style={{ fontSize: 11, marginBottom: 12 }}>
            {KIND_ORDER.filter((k) => k !== "region").map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-flex items-center justify-center rounded-full font-bold"
                  style={{
                    width: 16,
                    height: 16,
                    fontSize: 10,
                    background: kindStyle(k).bg,
                    color: kindStyle(k).fg,
                    border: `1px solid ${kindStyle(k).border}`,
                  }}
                >
                  {badgeGlyph(k, 1)}
                </span>
                {KIND_SECTION[k] ?? k}
              </span>
            ))}
          </div>

          {/* 캡처 + 배지 오버레이 */}
          <div
            className="relative border border-border-medium rounded-lg overflow-hidden bg-white"
            style={{ maxWidth: sel.capture.width }}
          >
            <img
              src={imgSrc(sel)}
              alt={title(sel)}
              className="block w-full h-auto select-none"
              draggable={false}
            />
            {visibleAnns.map((a) => {
              const key = annKey(a);
              const active = hoverKey === key;
              const st = kindStyle(a.kind);
              return (
                <span
                  key={key}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey(null)}
                  title={`${merged(a).label} — ${merged(a).description ?? ""}`}
                  className="absolute flex items-center justify-center rounded-full font-bold cursor-default transition-transform"
                  style={{
                    left: `${((a.bbox.x + a.bbox.width) / sel.capture.width) * 100}%`,
                    top: `${(a.bbox.y / sel.capture.height) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${active ? 1.4 : 1})`,
                    width: 20,
                    height: 20,
                    fontSize: 13,
                    lineHeight: "20px",
                    background: st.bg,
                    color: st.fg,
                    border: `1.5px solid ${st.border}`,
                    boxShadow: active ? "0 0 0 2px #fff, 0 0 6px rgba(0,0,0,0.5)" : "0 0 2px rgba(0,0,0,0.6)",
                    zIndex: active ? 10 : 1,
                  }}
                >
                  {badgeGlyph(a.kind, a.no)}
                </span>
              );
            })}
          </div>

          {/* 범례 표 — 프로토 .tbl */}
          <div className="overflow-x-auto" style={{ marginTop: 14 }}>
            <table className="proto-tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>번호</th>
                  <th style={{ width: 48 }}>구분</th>
                  <th>항목</th>
                  <th style={{ width: 56 }}>이벤트</th>
                  <th>동작(핸들러)</th>
                  <th>설명</th>
                  <th style={{ width: 72 }}>신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.flatMap((kind) => {
                  const rows = visibleAnns.filter((a) => a.kind === kind);
                  if (rows.length === 0) return [];
                  const st = kindStyle(kind);
                  const header = (
                    <tr key={`sec:${kind}`}>
                      <td colSpan={7} style={{ paddingTop: 12, paddingBottom: 4, borderBottom: "none" }}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-text-secondary" style={{ fontSize: 11 }}>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ background: st.swatch }}
                          />
                          {KIND_SECTION[kind] ?? kind} ({rows.length})
                        </span>
                      </td>
                    </tr>
                  );
                  const items = rows.map((a) => {
                    const key = annKey(a);
                    const m = merged(a);
                    const d = draftAnn[key];
                    return (
                      <tr
                        key={key}
                        onMouseEnter={() => setHoverKey(key)}
                        onMouseLeave={() => setHoverKey(null)}
                        style={hoverKey === key ? { background: "color-mix(in srgb, var(--color-accent) 7%, transparent)" } : undefined}
                      >
                        <td className="font-semibold" style={{ color: kindStyle(a.kind).swatch }}>
                          {badgeGlyph(a.kind, a.no)}
                        </td>
                        <td className="text-text-muted">{KIND_LABEL[a.kind] ?? a.kind}</td>
                        <td className="break-all">
                          {m.label}
                          {a.mechanical.required && <span style={{ color: "var(--color-status-error)", marginLeft: 2 }}>*</span>}
                        </td>
                        <td className="text-text-muted">{a.eventType}</td>
                        <td className="text-text-secondary">
                          {a.handler?.target && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{a.handler.target}</div>}
                          {a.handler && a.handler.chain.length > 0 && (
                            <div className="text-text-muted break-all" style={{ fontSize: 10.5 }}>
                              {a.handler.chain.join(" → ")}
                            </div>
                          )}
                          {a.handler?.evidence.map((ev) => (
                            <code
                              key={`${ev.file}:${ev.line}`}
                              className="inline-block mt-0.5 mr-1 px-1 rounded bg-elevated text-text-muted break-all"
                              style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}
                            >
                              {ev.file}:{ev.line}
                            </code>
                          ))}
                        </td>
                        <td className="text-text-secondary">
                          {editing ? (
                            <div className="space-y-1">
                              <textarea
                                value={d?.description ?? ""}
                                onChange={(e) =>
                                  setDraftAnn((prev) => ({ ...prev, [key]: { ...prev[key], description: e.target.value } }))
                                }
                                rows={2}
                                className="w-full min-w-40 bg-elevated border border-border-subtle rounded px-1.5 py-1 text-text-primary"
                                style={{ fontSize: 12 }}
                              />
                              <label className="flex items-center gap-1 text-text-muted" style={{ fontSize: 10.5 }}>
                                <input
                                  type="checkbox"
                                  checked={d?.hidden ?? false}
                                  onChange={(e) =>
                                    setDraftAnn((prev) => ({ ...prev, [key]: { ...prev[key], hidden: e.target.checked } }))
                                  }
                                />
                                숨김
                              </label>
                            </div>
                          ) : (
                            m.description
                          )}
                        </td>
                        <td>
                          {a.handler && (
                            <ConfBadge
                              kind={CONF_KIND[a.handler.confidence] ?? "est"}
                              label={CONFIDENCE_LABEL[a.handler.confidence]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  });
                  return [header, ...items];
                })}
              </tbody>
            </table>
          </div>

          {/* ※ 비고 */}
          {notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-text-muted" style={{ fontSize: 12 }}>
              {notes.map((a) => (
                <li key={annKey(a)}>
                  <span className="text-accent font-semibold mr-1">{badgeGlyph(a.kind, a.no)}</span>
                  {merged(a).note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
