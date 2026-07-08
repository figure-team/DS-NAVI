import { useRtm } from "./context";
import { Pill, useEscClose } from "./shared";
import { BORDER, FAINT, GOLD, LIFECYCLE_LABEL, LIFECYCLE_ORDER, PRIORITY, TEST_RES } from "./types";
import type { TestResult } from "./types";

// ── 요구사항 검증 드로어 ──
export default function RequirementDrawer() {
  const { selectedReq, canWrite, effSignoff, effLifecycle, effTest, postReq, resolveApprover, setSelReq } = useRtm();
  useEscClose(() => setSelReq(null));
  const r = selectedReq!;
  const so = effSignoff(r);
  const lc = effLifecycle(r);
  return (
    <div role="dialog" aria-modal="true" aria-label={`요구사항 검증 — ${r.id}`} className="absolute bottom-0 left-0 right-0 bg-surface border-t z-20 overflow-auto animate-slide-up" style={{ height: "50vh", borderTopColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)" }}>
      <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "12px 24px" }}>
        <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.id}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "var(--color-text-primary)" }}>{r.text}</span>
        <Pill label="● 현행" color={GOLD} bg="color-mix(in srgb, var(--color-accent) 12%, transparent)" />
        {r.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: PRIORITY[r.priority].color, background: PRIORITY[r.priority].bg }}>{PRIORITY[r.priority].label}</span>}
        {!canWrite && <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용</span>}
        <button type="button" onClick={() => setSelReq(null)} aria-label="닫기" className="ml-auto text-text-muted hover:text-text-primary" style={{ fontSize: 16, padding: "0 4px" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
        <div style={{ padding: "18px 24px", borderRight: BORDER }}>
          <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-accent-dim)", marginBottom: 12 }}>🧪 인수조건 시험 결과 — 사람 기록</div>
          {r.acceptanceCriteria.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>인수조건이 없습니다.</div> : r.acceptanceCriteria.map((ac) => {
            const t0 = ac.tests[0];
            const res = t0 ? effTest(r, ac.id, t0) : "UNTESTED";
            return <div key={ac.id} className="flex items-center gap-2.5" style={{ padding: "9px 0", borderBottom: BORDER }}>
              <span className="flex-1 text-text-secondary" style={{ fontSize: 12 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 5 }}>{ac.id}</span>{ac.text}{!t0 && <span className="text-text-muted" style={{ fontSize: 10, marginLeft: 6 }}>(케이스 미정)</span>}</span>
              {t0 && <div className="flex rounded-lg overflow-hidden" style={{ border: BORDER }}>
                {(["PASS", "FAIL", "NA"] as TestResult[]).map((rr) => <button key={rr} type="button" disabled={!canWrite} onClick={() => void postReq(r.id, { tests: { [`${ac.id}::${t0.caseId}`]: { result: rr, defectId: null } } })}
                  style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", padding: "4px 9px", border: "none", borderRight: BORDER, cursor: canWrite ? "pointer" : "default", background: res === rr ? (rr === "PASS" ? "rgba(127,174,138,.16)" : rr === "FAIL" ? "rgba(207,138,134,.16)" : "var(--color-elevated)") : "transparent", color: res === rr ? (rr === "PASS" ? TEST_RES.PASS.color : rr === "FAIL" ? TEST_RES.FAIL.color : "var(--color-text-secondary)") : "var(--color-text-muted)" }}>{rr === "NA" ? "N/A" : rr}</button>)}
              </div>}
            </div>;
          })}
        </div>
        <div style={{ padding: "18px 24px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>진행 상태 (lifecycle)</div>
            <select value={lc} disabled={!canWrite} onChange={(e) => void postReq(r.id, { lifecycle: e.target.value })} className="w-full bg-elevated text-text-primary rounded-lg border border-border-subtle outline-none focus:border-accent" style={{ fontSize: 12.5, padding: "8px 11px" }}>
              {LIFECYCLE_ORDER.map((l) => <option key={l} value={l}>{LIFECYCLE_LABEL[l]}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>고객 검수 (signoff)</div>
            <div className="flex items-center gap-2.5" style={{ background: "color-mix(in srgb, var(--color-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)", borderRadius: 10, padding: "11px 14px" }}>
              <span style={{ color: so?.approved ? GOLD : "var(--color-text-muted)", fontSize: 12 }}>{so?.approved ? `✓ 검수 완료${so.by ? ` (${so.by})` : ""}` : "아직 검수 전"}</span>
              {canWrite && <button type="button" onClick={async () => {
                // 검수 승인엔 확정자 필요(비동기 인라인 입력) — 취소 시 저장하지 않는다.
                if (so?.approved) { void postReq(r.id, { signoff: null }); return; }
                const by = await resolveApprover();
                if (!by) return;
                void postReq(r.id, { signoff: { approved: true, by, at: new Date().toISOString() } });
              }} className="ml-auto rounded-lg" style={{ fontSize: 11.5, fontWeight: 600, color: GOLD, border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", padding: "6px 13px" }}>{so?.approved ? "검수 취소" : "고객 검수 승인"}</button>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 6 }}>메타</div>
            <div className="flex flex-wrap gap-3" style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 8, padding: "9px 12px", fontSize: 12 }}>
              <span className="text-text-muted">우선순위 <b style={{ color: PRIORITY[r.priority]?.color }}>{PRIORITY[r.priority]?.label}</b></span>
              {r.source?.requester && <span className="text-text-muted">요청자 <b className="text-text-secondary">{r.source.requester}</b></span>}
              {r.changeReq?.crNo && <span className="text-text-muted">변경 <b className="text-text-secondary">{r.changeReq.crNo}</b></span>}
              {r.source?.targetRelease && <span className="text-text-muted">릴리스 <b className="text-text-secondary">{r.source.targetRelease}</b></span>}
              {r.dependsOn.length > 0 && <span className="text-text-muted">선행 <b className="text-text-secondary">{r.dependsOn.join(", ")}</b></span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
