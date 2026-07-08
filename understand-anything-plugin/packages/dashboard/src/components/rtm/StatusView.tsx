import { useRtm } from "./context";
import { Tile } from "./shared";
import { BAD, BORDER, FAINT, GOLD, GOLD_DIM, OK, WARN, pct } from "./types";

function Gap({ title, color, ids, render }: { title: string; color: string; ids: string[]; render: (id: string) => React.ReactNode }) {
  return (
    <div style={{ background: "var(--color-panel)", border: BORDER, borderRadius: 10, overflow: "hidden" }}>
      <h3 className="flex items-center gap-2" style={{ fontSize: 12, padding: "12px 16px", borderBottom: BORDER, color }}>{title}<span className="ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{ids.length}</span></h3>
      {ids.length === 0 ? <div className="text-text-muted" style={{ padding: "12px 16px", fontSize: 12 }}>없음 ✓</div> : ids.map((id) => <div key={id} style={{ padding: "9px 16px", borderBottom: BORDER, fontSize: 12.5, color: "var(--color-text-secondary)" }}>{render(id)}</div>)}
    </div>
  );
}

// ── 뷰④ 커버리지 현황 ──
export default function StatusView() {
  const { model, cov, diags, errCount, fnById, reqById } = useRtm();
  if (!model) return null;
  if (!cov) return <div className="text-text-muted" style={{ fontSize: 13 }}>커버리지 데이터가 없습니다(rtm.json v2 재생성 필요).</div>;
  return (
    <>
      <div className="text-accent" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>커버리지</div>
      <div className="flex gap-2.5" style={{ marginBottom: 14 }}>
        <Tile lbl="요구사항" n={cov.requirements.total} />
        <Tile lbl="구현" n={cov.requirements.implemented} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.implemented, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
        <Tile lbl="검증" n={cov.requirements.verified} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.verified, cov.requirements.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
        <Tile lbl="검수" n={cov.requirements.signedOff} d={`/${cov.requirements.total}`} pct={pct(cov.requirements.signedOff, cov.requirements.total)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
        <Tile lbl="시험 통과" n={cov.tests.pass} d={`/${cov.tests.total}`} pct={pct(cov.tests.pass, cov.tests.total)} bar={`linear-gradient(90deg,#5f8a6c,${OK})`} />
      </div>
      <div style={{ color: BAD, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>갭 리포트 — 빈칸 = 위험</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        <Gap title="🚫 고아 코드" color={BAD} ids={cov.gaps.orphanCode} render={(id) => { const f = fnById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f?.featureId ?? id}</span>{f?.name ?? id} — 현행 요구 없음</>; }} />
        <Gap title="⚠ 미구현 요구" color={WARN} ids={cov.gaps.unimplemented} render={(id) => { const r = reqById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{id}</span>{r?.text ?? id}{r?.type === "nonfunctional" ? "(성능)" : ""}</>; }} />
        <Gap title="◔ 미검증 기능" color="var(--color-text-muted)" ids={cov.gaps.unverified} render={(id) => { const f = fnById(id); return <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f?.featureId ?? id}</span>{f?.name ?? id}</>; }} />
      </div>
      {diags.length > 0 && (
        <>
          <div style={{ color: errCount > 0 ? BAD : WARN, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", margin: "24px 0 12px" }}>무결성 진단</div>
          <div style={{ background: "var(--color-panel)", border: BORDER, borderRadius: 10, overflow: "hidden" }}>
            {diags.map((d, i) => <div key={i} className="flex items-center gap-3" style={{ padding: "9px 16px", borderBottom: i < diags.length - 1 ? BORDER : "none", fontSize: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: d.level === "error" ? BAD : WARN, border: `1px solid ${d.level === "error" ? "rgba(207,138,134,.3)" : "rgba(216,162,94,.3)"}`, borderRadius: 4, padding: "1px 6px" }}>{d.level}</span>
              <span className="text-text-secondary">{d.message}</span>{d.ref && <span className="text-text-muted ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{d.ref}</span>}
            </div>)}
          </div>
        </>
      )}
    </>
  );
}
