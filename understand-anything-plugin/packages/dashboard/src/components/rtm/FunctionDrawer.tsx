import TrustBadge from "../TrustBadge";
import { useRtm } from "./context";
import { EvidenceLink, Pill, confChip, useEscClose } from "./shared";
import { AC_KIND, BORDER, CONF, CONF_TITLE, COLS, FAINT, GOLD, GOLD_DIM, NFR, STATE_COLOR, STATE_LABEL, VERB, WARN, verbOf } from "./types";
import type { CellKey } from "./types";

// ── 기능 드로어 ──
export default function FunctionDrawer() {
  const {
    selectedFn, canWrite, fnOv, editing, setEditing, saving, saveError, draft, setDraft,
    beginEdit, onConfirm, effCell, effCustom, isConfirmed, isEdited, effFields,
    scenarios, tsConfirmed, reqById, setView, setSelFn, setSelTs, setExpandedReqs,
  } = useRtm();
  // Esc — 편집 중이면 편집만 취소, 아니면 드로어 닫기(gap9).
  useEscClose(() => { if (editing) setEditing(false); else setSelFn(null); });
  const f = selectedFn!;
  return (
    <div role="dialog" aria-modal="true" aria-label={`기능 상세 — ${effCell(f, "name")}`} className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "48vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
      <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
        <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{f.featureId}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "var(--color-text-primary)" }}>{effCell(f, "name")}</span>
        {isConfirmed(f) ? <TrustBadge confirmedBy={fnOv[f.id].approver} /> : <Pill label={STATE_LABEL[f.state]} color={STATE_COLOR[f.state]} />}
        <span className="ml-auto flex items-center gap-2">
          {saveError && <span style={{ fontSize: 11, color: WARN }}>저장 실패: {saveError}</span>}
          {!canWrite ? <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span> : editing ? (
            <><button type="button" onClick={() => setEditing(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 13px", fontSize: 12 }}>취소</button>
              <button type="button" onClick={() => void onConfirm(true)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>{saving ? "저장 중…" : "저장 + 확정"}</button></>
          ) : (
            <>{!isConfirmed(f) && <button type="button" onClick={() => void onConfirm(false)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>✓ 확정</button>}
              <button type="button" onClick={beginEdit} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 13px", fontSize: 12 }}>편집</button></>
          )}
          <button type="button" onClick={() => { setSelFn(null); setEditing(false); }} aria-label="닫기" className="text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
        <div style={{ padding: "18px 24px", borderRight: BORDER }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>
            {([{ key: "name" as const, label: "기능명" }, ...COLS] as Array<{ key: CellKey | "name"; label: string }>).map(({ key, label }) => {
              const cell = key === "name" ? null : f[key];
              return <tr key={key}><td style={{ padding: "9px 12px 9px 0", color: "var(--color-text-muted)", whiteSpace: "nowrap", verticalAlign: "top", width: 88, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</td>
                <td style={{ padding: "9px 0", verticalAlign: "top" }}>
                  {editing ? <input value={draft[key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="w-full bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} /> : (
                    <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{effCell(f, key).length > 0 ? effCell(f, key) : <span style={{ color: FAINT }}>—</span>}{cell && confChip(isEdited(f, key) ? "확정" : CONF[cell.confidence].label, isEdited(f, key) ? GOLD : CONF[cell.confidence].color, isEdited(f, key) ? undefined : CONF_TITLE[cell.confidence])}</span>
                  )}
                  {/* gap2: 근거는 평문 대신 클릭 → 코드 뷰어(file:line). */}
                  {!editing && cell && cell.evidence.length > 0 && <div className="flex flex-wrap items-center" style={{ gap: 4, marginTop: 3 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT }}>근거:</span>{cell.evidence.map((e, i) => <EvidenceLink key={i} e={e} />)}</div>}
                </td></tr>;
            })}
            {/* R7: 사용자 정의 필드 값 — 편집·확정 경로는 기존 셀과 동일(custom:* 키). */}
            {effFields.map((cf) => (
              <tr key={cf.id}><td style={{ padding: "9px 12px 9px 0", color: NFR, whiteSpace: "nowrap", verticalAlign: "top", width: 88, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{cf.label}</td>
                <td style={{ padding: "9px 0", verticalAlign: "top" }}>
                  {editing ? <input value={draft[cf.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [cf.id]: e.target.value }))} className="w-full bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} />
                    : <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{effCustom(f, cf.id) || <span style={{ color: FAINT }}>—</span>}</span>}
                </td></tr>
            ))}
          </tbody></table>
          {/* W5: 이 기능의 시험 시나리오 요약 — 시험 시나리오 탭으로 연결. */}
          {scenarios.some((s) => s.fnId === f.id) && (
            <button type="button" onClick={() => { setView("scenario"); setSelFn(null); setSelTs(null); }} className="flex items-center gap-2 rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors" style={{ marginTop: 12, padding: "6px 12px", fontSize: 11.5 }}>
              🧪 시험 시나리오 {scenarios.filter((s) => s.fnId === f.id).length}건
              <span className="text-text-muted">(확정 {scenarios.filter((s) => s.fnId === f.id && tsConfirmed(s)).length})</span>
              <span className="text-text-muted">— 시험 시나리오 탭에서 검토 ›</span>
            </button>
          )}
        </div>
        <div style={{ padding: "18px 24px", overflow: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: GOLD_DIM, marginBottom: 12 }}>📋 업무 규칙 — 이 기능이 충족할 조건</div>
          {f.rules.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5, marginBottom: 16 }}>관련 업무규칙 없음.</div> : f.rules.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5" style={{ padding: "7px 0", borderBottom: BORDER }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: GOLD_DIM, whiteSpace: "nowrap" }}>{r.reqId}·{r.acId}</span>
              <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}><span style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", padding: "1px 6px", borderRadius: 5, color: AC_KIND[r.kind].color, background: "color-mix(in srgb,currentColor 14%,transparent)", marginRight: 6 }}>{AC_KIND[r.kind].label}</span>{r.text}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: GOLD_DIM, margin: "18px 0 10px" }}>📜 요청별 이력</div>
          {f.requirementHistory.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>관련 요구사항 없음 (AS-IS).</div> : [...f.requirementHistory].reverse().map((reqId, i) => {
            const r = reqById(reqId); if (!r) return null; const v = verbOf(r, f.id); const head = i === 0;
            return <button key={reqId} type="button" onClick={() => { setView("requirement"); setSelFn(null); setExpandedReqs((p) => new Set(p).add(reqId)); }} className="flex items-center gap-2 w-full text-left rounded-md hover:bg-elevated/50" style={{ padding: "5px 6px" }}>
              <span style={{ color: head ? GOLD : "var(--color-text-muted)", fontSize: 11 }}>{head ? "●" : "│"}</span>
              <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{r.id}</span>
              {v && <span style={{ color: VERB[v].color, fontSize: 11 }}>{VERB[v].sym} {VERB[v].label}</span>}
              <span className="text-text-secondary" style={{ fontSize: 12 }}>{r.text}</span>
              <span className="ml-auto text-text-muted" style={{ fontSize: 10.5 }}>{r.status !== "ACTIVE" ? "폐기" : head ? "현행" : ""}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
  );
}
