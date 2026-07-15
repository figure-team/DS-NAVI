import TrustBadge from "../TrustBadge";
import EvidenceLink from "../ui/EvidenceLink";
import { useRtm } from "./context";
import { Pill, useEscClose } from "./shared";
import { FAINT, GOLD_DIM, TS_KIND, WARN } from "./types";

// ── 시나리오 드로어 — G/W/T 검토·편집·확정(기능 드로어와 동형) ──
export default function ScenarioDrawer() {
  const {
    selectedTs, canWrite, scOv, tsEditing, setTsEditing, tsSaving, tsSaveError, setTsSaveError,
    tsDraft, setTsDraft, confirmScenario, tsConfirmed, effTs, effCell, fnById, openFunction, setSelTs,
  } = useRtm();
  // Esc — 편집 중이면 편집만 취소, 아니면 드로어 닫기(gap9).
  useEscClose(() => { if (tsEditing) setTsEditing(false); else setSelTs(null); });
  const s = selectedTs!;
  const fn = fnById(s.fnId);
  const confirmed = tsConfirmed(s);
  return (
    <div role="dialog" aria-modal="true" aria-label={`시나리오 상세 — ${effTs(s, "title")}`} className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "44vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
      <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
        <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{s.id}</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TS_KIND[s.kind].color, background: "color-mix(in srgb,currentColor 13%,transparent)" }}>{TS_KIND[s.kind].label}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: "var(--color-text-primary)" }}>{effTs(s, "title")}</span>
        {confirmed ? <TrustBadge confirmedBy={scOv[s.id]?.approver ?? "확정"} /> : <Pill label="초안 [추정]" color={WARN} />}
        <span className="ml-auto flex items-center gap-2">
          {tsSaveError && <span style={{ fontSize: 11, color: WARN }}>저장 실패: {tsSaveError}</span>}
          {!canWrite ? <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span> : tsEditing ? (
            <><button type="button" onClick={() => setTsEditing(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 13px", fontSize: 12 }}>취소</button>
              <button type="button" onClick={() => void confirmScenario(true)} disabled={tsSaving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>{tsSaving ? "저장 중…" : "저장 + 확정"}</button></>
          ) : (
            <>{!confirmed && <button type="button" onClick={() => void confirmScenario(false)} disabled={tsSaving} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>✓ 확정</button>}
              <button type="button" onClick={() => { setTsDraft({ title: effTs(s, "title"), given: effTs(s, "given"), when: effTs(s, "when"), then: effTs(s, "then") }); setTsEditing(true); setTsSaveError(null); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 13px", fontSize: 12 }}>편집</button></>
          )}
          <button type="button" onClick={() => { setSelTs(null); setTsEditing(false); }} aria-label="닫기" className="text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
        </span>
      </div>
      <div style={{ padding: "16px 24px" }}>
        <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 12 }}>
          대상 기능: <button type="button" onClick={() => openFunction(s.fnId)} className="text-text-secondary hover:text-accent" style={{ fontSize: 11.5 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 4 }}>{fn?.featureId}</span>{fn ? effCell(fn, "name") : s.fnId}</button>
          {s.reqId && <span style={{ marginLeft: 10 }}>연관: <span style={{ fontFamily: "var(--font-mono)", color: GOLD_DIM }}>{s.reqId}{s.acId ? ` · ${s.acId}` : ""}</span></span>}
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>
          {(["title", "given", "when", "then"] as const).map((key) => (
            <tr key={key}><td style={{ padding: "8px 12px 8px 0", color: "var(--color-text-muted)", whiteSpace: "nowrap", verticalAlign: "top", width: 70, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>{key === "title" ? "제목" : key}</td>
              <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                {tsEditing ? <textarea value={tsDraft[key] ?? ""} onChange={(e) => setTsDraft((d) => ({ ...d, [key]: e.target.value }))} rows={key === "title" ? 1 : 2} className="w-full resize-y bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "5px 9px" }} />
                  : <span className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{effTs(s, key)}</span>}
              </td></tr>
          ))}
        </tbody></table>
        {/* gap2: 근거는 평문 대신 클릭 → 코드 뷰어(file:line). */}
        {s.evidence.length > 0 && <div className="flex flex-wrap items-center" style={{ gap: 4, marginTop: 8 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT }}>근거:</span>{s.evidence.map((e, i) => <EvidenceLink key={i} file={e.file} line={e.line ?? 1} stopPropagation />)}</div>}
        {s.notes.length > 0 && <div style={{ marginTop: 8 }}>{s.notes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: WARN }}>⚠ {n}</div>)}</div>}
      </div>
    </div>
  );
}
