import { useState } from "react";
import { useSearchParams } from "react-router";

import TrustBadge from "../TrustBadge";
import { useRtm } from "./context";
import { EvidencePopover, Hl, Pill, STICKY_TH, Tile, confChip, rowKeyHandler } from "./shared";
import type { EvPopoverState } from "./shared";
import { BAD, BORDER, CONF, CONF_TITLE, COLS, FAINT, GOLD, GOLD_DIM, NFR, OK, STATE_COLOR, STATE_LABEL, pct } from "./types";
import type { CellKey, Confidence, FunctionRow } from "./types";

const TH_STYLE: React.CSSProperties = { ...STICKY_TH, padding: "8px 12px", borderBottom: "1px solid var(--color-border-medium)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 650 };

// 추적 셀 (그리드) — 근거는 title 툴팁 대신 popover 버튼 → 코드 뷰어(gap2).
function TraceTd({ f, c, q, onEvidence }: { f: FunctionRow; c: { key: CellKey; label: string }; q: string; onEvidence: (key: string, ev: FunctionRow[CellKey]["evidence"], anchor: HTMLElement) => void }) {
  const { effCell, isEdited } = useRtm();
  const cell = f[c.key]; const edited = isEdited(f, c.key);
  const v = effCell(f, c.key); const proposed = v.startsWith("(제안)") || (f.origin === "TO_BE" && v.length > 0);
  const chip = edited ? { label: "확정", color: GOLD } : CONF[cell.confidence];
  return (
    <td style={{ borderBottom: BORDER, padding: "11px 12px", verticalAlign: "top" }}>
      <span style={{ fontSize: 12.5, color: proposed ? "var(--color-text-muted)" : "var(--color-text-secondary)", fontStyle: proposed ? "italic" : "normal" }}>{v.length > 0 ? <Hl text={v} q={q} /> : <span style={{ color: FAINT }}>—</span>}</span>
      {confChip(chip.label, chip.color, edited ? undefined : CONF_TITLE[cell.confidence])}
      {cell.evidence.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEvidence(`${f.id}:${c.key}`, cell.evidence, e.currentTarget); }}
          title="근거(file:line) 목록 — 클릭해 코드 뷰어로 확인"
          className="cursor-pointer bg-transparent border-0 text-text-muted hover:text-accent"
          style={{ display: "block", font: "inherit", fontFamily: "var(--font-mono)", fontSize: 10, padding: 0, marginTop: 3 }}
        >근거 {cell.evidence.length}건 ▾</button>
      )}
    </td>
  );
}

/** R7 ＋필드 — window.prompt 대신 인라인 입력 popover(gap9). */
function AddFieldButton() {
  const { addField } = useRtm();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const submit = () => {
    const v = label.trim();
    if (!v) return;
    addField(v);
    setLabel(""); setOpen(false);
  };
  return (
    <span style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" title="사용자 정의 필드 추가(전 기능 공통 열, R7)" onClick={() => setOpen((v) => !v)} className="text-text-muted hover:text-accent" style={{ marginLeft: 7, fontSize: 10.5, border: BORDER, borderRadius: 4, background: "none", cursor: "pointer", padding: "1px 6px" }}>＋필드</button>
      {open && (
        <span className="rounded-lg border border-border-medium bg-panel card-shadow" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 5, padding: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
            placeholder="필드 이름(예: 담당자)"
            className="rounded-md bg-elevated border border-border-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            style={{ fontSize: 12, padding: "4px 8px", width: 150, fontWeight: 400 }}
          />
          <button type="button" onClick={submit} disabled={!label.trim()} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-40" style={{ fontSize: 11, padding: "4px 9px", background: "none", cursor: "pointer" }}>추가</button>
        </span>
      )}
    </span>
  );
}

// ── 뷰① 기능 기준 ──
export default function FunctionView() {
  const { model, cov, canWrite, effFields, effCell, effCustom, fnOv, isConfirmed, openFunction, postField, selFn } = useRtm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [evOpen, setEvOpen] = useState<EvPopoverState | null>(null);
  const q = searchParams.get("q") ?? "";
  const fstate = searchParams.get("fstate");
  const fconf = searchParams.get("fconf");
  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams((prev) => { if (v) prev.set(k, v); else prev.delete(k); return prev; }, { replace });

  if (!model) return null;

  const ql = q.trim().toLowerCase();
  const rowMatch = (f: FunctionRow): boolean => {
    if (fstate && f.state !== fstate) return false;
    if (fconf && !COLS.some((c) => f[c.key].confidence === (fconf as Confidence))) return false;
    if (!ql) return true;
    return effCell(f, "name").toLowerCase().includes(ql) || f.featureId.toLowerCase().includes(ql) || COLS.some((c) => effCell(f, c.key).toLowerCase().includes(ql));
  };
  const filtering = Boolean(ql || fstate || fconf);
  const visible = model.functions.filter(rowMatch);

  const onEvidence = (key: string, evidence: FunctionRow[CellKey]["evidence"], anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setEvOpen(evOpen?.key === key ? null : { key, evidence, right: Math.max(12, window.innerWidth - rect.right), top: rect.bottom + 4 });
  };

  return (
    <>
      {cov && (
        <div className="flex gap-2.5" style={{ marginBottom: 16 }}>
          <Tile lbl="요구사항 구현" n={cov.requirements.implemented} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.implemented, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
          <Tile lbl="요구사항 검증" n={cov.requirements.verified} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.verified, cov.requirements.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
          <Tile lbl="고객 검수" n={cov.requirements.signedOff} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.signedOff, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
          <Tile lbl="검증 공백" n={cov.gaps.unverified.length} d=" 기능" pct={cov.functions.total ? pct(cov.gaps.unverified.length, cov.functions.total) : 0} bar={`linear-gradient(90deg,#9c6360,${BAD})`} />
        </div>
      )}

      {/* gap3: 검색(?q=) · 상태·신뢰도 필터 */}
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 16 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setParam("q", e.target.value || null, true)}
          placeholder="기능·셀 내용 검색"
          className="rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
          style={{ padding: "6px 12px", fontSize: 12.5, width: 200 }}
        />
        <select value={fstate ?? ""} onChange={(e) => setParam("fstate", e.target.value || null)} className="rounded-lg border border-border-medium bg-panel text-text-secondary" style={{ padding: "6px 10px", fontSize: 12.5 }}>
          <option value="">상태 전체</option>
          {(Object.keys(STATE_LABEL) as FunctionRow["state"][]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select>
        <select value={fconf ?? ""} onChange={(e) => setParam("fconf", e.target.value || null)} className="rounded-lg border border-border-medium bg-panel text-text-secondary" style={{ padding: "6px 10px", fontSize: 12.5 }}>
          <option value="">신뢰도 전체</option>
          {(Object.keys(CONF) as Confidence[]).map((c) => <option key={c} value={c}>{CONF[c].label}</option>)}
        </select>
        {filtering && <span className="text-text-muted" style={{ fontSize: 12 }}>{visible.length}/{model.functions.length}건 표시 중</span>}
      </div>

      {model.functions.length === 0 ? <div className="text-text-muted" style={{ fontSize: 13 }}>기능이 없습니다.</div>
        : filtering && visible.length === 0 ? <div className="text-text-muted" style={{ fontSize: 13 }}>검색·필터에 맞는 기능이 없습니다.</div>
        : model.domains.map((domain) => {
        const rows = visible.filter((f) => f.domainId === domain.id);
        if (rows.length === 0) return null;
        const confirmedN = rows.filter(isConfirmed).length;
        const isNew = domain.id.startsWith("to-be:");
        return (
          <section key={domain.id} style={{ marginBottom: 26 }}>
            {/* pmpl-proto .fl-grp — "주문 (8)" 그룹 라벨 */}
            <div className="flex items-center gap-2" style={{ padding: "0 4px 8px" }}>
              <span className="text-text-secondary" style={{ fontSize: 13, fontWeight: 700 }}>{domain.name} ({rows.length})</span>
              {isNew && <span className="inline-flex items-center whitespace-nowrap font-bold" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: OK, background: "color-mix(in srgb, var(--color-status-ok) 12%, transparent)" }}>신규</span>}
              <span className="text-text-muted ml-auto" style={{ fontSize: 11.5 }}>기능 {domain.functionCount} · 확정 {confirmedN}/{rows.length}</span>
            </div>
            <div className="card-shadow" style={{ background: "var(--color-panel)", border: BORDER, borderRadius: 10, overflow: "hidden" }}>
              {/* gap5: 세로 스크롤 컨테이너로 만들어 sticky 헤더가 이 컨테이너 top 0 에 붙는다. */}
              <div style={{ overflow: "auto", maxHeight: "70vh" }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, width: "100%", minWidth: 880 }}>
                  <thead><tr>
                    {["기능", ...COLS.map((c) => c.label)].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                    {/* R7: 사용자 정의 필드 열 — 헤더 × 로 정의 삭제(값 비파괴 보존). */}
                    {effFields.map((cf) => (
                      <th key={cf.id} style={{ ...TH_STYLE, color: NFR }}>
                        {cf.label}
                        {canWrite && <button type="button" title="필드 삭제(값은 보존 — 재등록 시 복원)" onClick={(e) => { e.stopPropagation(); if (window.confirm(`'${cf.label}' 필드를 삭제할까요? (행 값은 보존)`)) void postField("remove", cf.id); }} className="text-text-muted hover:text-status-error" style={{ marginLeft: 5, fontSize: 10, border: "none", background: "none", cursor: "pointer" }}>×</button>}
                      </th>
                    ))}
                    <th style={TH_STYLE}>
                      상태
                      {canWrite && <AddFieldButton />}
                    </th>
                  </tr></thead>
                  <tbody>{rows.map((f) => (
                    <tr key={f.id} tabIndex={0} onClick={() => openFunction(f.id)} onKeyDown={rowKeyHandler(() => openFunction(f.id))} style={{ cursor: "pointer", background: f.id === selFn ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : undefined, boxShadow: isConfirmed(f) ? `inset 2px 0 0 ${GOLD}` : undefined }} className="hover:bg-accent/[0.045]">
                      <td style={{ borderBottom: BORDER, padding: "11px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        <div><span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}><Hl text={f.featureId} q={q} /></span>{f.requirementHistory.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: GOLD_DIM, marginLeft: 6 }}>◷{f.requirementHistory[f.requirementHistory.length - 1]}{f.rules.length > 0 ? ` · 규칙 ${f.rules.length}` : ""}</span>}</div>
                        <div style={{ marginTop: 3 }}><span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}><Hl text={effCell(f, "name")} q={q} /></span>
                          {f.nfrTags.map((t) => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8.5, fontFamily: "var(--font-mono)", color: NFR, background: "rgba(120,160,190,.12)", border: "1px solid rgba(120,160,190,.25)", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>⚡{t}</span>)}</div>
                      </td>
                      {COLS.map((c) => <TraceTd key={c.key} f={f} c={c} q={q} onEvidence={onEvidence} />)}
                      {effFields.map((cf) => {
                        const v = effCustom(f, cf.id);
                        return <td key={cf.id} style={{ borderBottom: BORDER, padding: "11px 12px", verticalAlign: "top" }}><span style={{ fontSize: 12.5, color: v ? "var(--color-text-secondary)" : FAINT }}>{v || "—"}</span></td>;
                      })}
                      <td style={{ borderBottom: BORDER, padding: "11px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>{isConfirmed(f) ? <TrustBadge confirmedBy={fnOv[f.id].approver} /> : <Pill label={STATE_LABEL[f.state]} color={STATE_COLOR[f.state]} />}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}

      {evOpen && <EvidencePopover pop={evOpen} onClose={() => setEvOpen(null)} />}
    </>
  );
}
