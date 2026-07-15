import { useSearchParams } from "react-router";

import TrustBadge from "../TrustBadge";
import { useRtm } from "./context";
import { Hl, STICKY_TH, Tile, confChip, rowKeyHandler } from "./shared";
import { BORDER, CONF_TITLE, GOLD, GOLD_DIM, TS_KIND, WARN, pct } from "./types";
import type { TestScenario } from "./types";
import SearchInput from "../ui/SearchInput";

const TH_STYLE: React.CSSProperties = { ...STICKY_TH, padding: "8px 12px", borderBottom: "1px solid var(--color-border-medium)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap", fontSize: 11.5, fontWeight: 650 };

// ── 뷰③ 시험 시나리오(W5) — 단위테스트 시나리오 초안(결정론 생성) 검토·편집·확정 ──
export default function ScenarioView() {
  const { model, cov, scenarios, scOv, selTs, setSelTs, setTsEditing, setTsSaveError, tsConfirmed, tsConfirmedCount, effCell, effTs } = useRtm();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const tskind = searchParams.get("tskind");
  const tsconf = searchParams.get("tsconf"); // confirmed | draft
  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams((prev) => { if (v) prev.set(k, v); else prev.delete(k); return prev; }, { replace });

  if (!model) return null;
  if (scenarios.length === 0) return <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>테스트 시나리오가 없습니다. <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>understand-rtm</code> 을 재실행하면 기능 행별 정상/예외/경계 초안이 생성됩니다(전부 [추정]).</div>;

  // gap3: 검색(?q=)·구분·확정 상태 필터.
  const ql = q.trim().toLowerCase();
  const match = (s: TestScenario): boolean => {
    if (tskind && s.kind !== tskind) return false;
    if (tsconf === "confirmed" && !tsConfirmed(s)) return false;
    if (tsconf === "draft" && tsConfirmed(s)) return false;
    if (!ql) return true;
    return s.id.toLowerCase().includes(ql) || (["title", "given", "when", "then"] as const).some((k) => effTs(s, k).toLowerCase().includes(ql));
  };
  const filtering = Boolean(ql || tskind || tsconf);
  const visible = scenarios.filter(match);

  const byFn = new Map<string, TestScenario[]>();
  for (const s of visible) { if (!byFn.has(s.fnId)) byFn.set(s.fnId, []); byFn.get(s.fnId)!.push(s); }
  const sc = cov?.scenarios;
  const openTs = (s: TestScenario) => { setSelTs(s.id); setTsEditing(false); setTsSaveError(null); };

  return (
    <>
      <div className="flex gap-2.5" style={{ marginBottom: 16 }}>
        <Tile lbl="시나리오" n={sc?.total ?? scenarios.length} />
        <Tile lbl="확정" n={tsConfirmedCount} d={`/${scenarios.length}`} pct={pct(tsConfirmedCount, scenarios.length)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
        <Tile lbl="정상 / 예외 / 경계" n={`${sc?.byKind.normal ?? 0} / ${sc?.byKind.exception ?? 0} / ${sc?.byKind.boundary ?? 0}`} />
        <Tile lbl="보강 필요" n={scenarios.filter((s) => s.notes.length > 0).length} d=" 건" />
      </div>
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
        <SearchInput
          value={q}
          onChange={(v) => setParam("q", v || null, true)}
          placeholder="제목·Given/When/Then 검색"
          width={220}
        />
        <select value={tskind ?? ""} onChange={(e) => setParam("tskind", e.target.value || null)} className="rounded-lg border border-border-medium bg-panel text-text-secondary" style={{ padding: "6px 10px", fontSize: 12.5 }}>
          <option value="">구분 전체</option>
          {(Object.keys(TS_KIND) as TestScenario["kind"][]).map((k) => <option key={k} value={k}>{TS_KIND[k].label}</option>)}
        </select>
        <select value={tsconf ?? ""} onChange={(e) => setParam("tsconf", e.target.value || null)} className="rounded-lg border border-border-medium bg-panel text-text-secondary" style={{ padding: "6px 10px", fontSize: 12.5 }}>
          <option value="">확정 여부 전체</option>
          <option value="confirmed">확정만</option>
          <option value="draft">추정(초안)만</option>
        </select>
        {filtering && <span className="text-text-muted" style={{ fontSize: 12 }}>{visible.length}/{scenarios.length}건 표시 중</span>}
      </div>
      <div className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 16, maxWidth: 760 }}>
        기능 행의 코드 근거(진입점·데이터·인수조건)에서 <b>결정론 생성한 초안</b>입니다 — 전부 [추정]. 행을 눌러 Given/When/Then 을 검토·편집·확정하세요(확정은 재생성에도 유지). 시험 <b>수행 결과</b>는 요청 기준 탭의 인수조건 시험결과에 기록합니다.
      </div>
      {filtering && visible.length === 0 && <div className="text-text-muted" style={{ fontSize: 13 }}>검색·필터에 맞는 시나리오가 없습니다.</div>}
      {model.functions.map((f) => {
        const list = byFn.get(f.id) ?? [];
        if (list.length === 0) return null;
        const confirmedN = list.filter(tsConfirmed).length;
        return (
          <section key={f.id} style={{ marginBottom: 18 }}>
            <div className="flex items-center gap-3" style={{ padding: "0 4px 9px" }}>
              <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{f.featureId}</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, color: "var(--color-text-primary)" }}>{effCell(f, "name")}</span>
              <span className="text-text-muted" style={{ fontSize: 11 }}>{f.domainName}</span>
              <span className="text-text-muted ml-auto" style={{ fontSize: 11 }}>확정 {confirmedN}/{list.length}</span>
            </div>
            <div style={{ background: "var(--color-panel)", border: BORDER, borderRadius: 10, overflow: "hidden" }}>
              {/* gap5: 세로 스크롤 컨테이너로 만들어 sticky 헤더가 이 컨테이너 top 0 에 붙는다. */}
              <div style={{ overflow: "auto", maxHeight: "70vh" }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, width: "100%", minWidth: 900 }}>
                  <thead><tr>{["ID", "구분", "제목", "Given", "When", "Then", "상태"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}</tr></thead>
                  <tbody>{list.map((s) => (
                    <tr key={s.id} tabIndex={0} onClick={() => openTs(s)} onKeyDown={rowKeyHandler(() => openTs(s))} style={{ cursor: "pointer", background: s.id === selTs ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : undefined, boxShadow: tsConfirmed(s) ? `inset 2px 0 0 ${GOLD}` : undefined }} className="hover:bg-accent/[0.045]">
                      <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-text-muted)", verticalAlign: "top" }}><Hl text={s.id.replace(/^TS-/, "")} q={q} />{s.acId && <div style={{ color: GOLD_DIM, fontSize: 9.5 }}>{s.reqId}·{s.acId}</div>}</td>
                      <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TS_KIND[s.kind].color, background: "color-mix(in srgb,currentColor 13%,transparent)" }}>{TS_KIND[s.kind].label}</span></td>
                      <td style={{ borderBottom: BORDER, padding: "9px 12px", verticalAlign: "top", color: "var(--color-text-primary)", fontSize: 12.5, fontWeight: 500 }}><Hl text={effTs(s, "title")} q={q} />{s.notes.length > 0 && <span title={s.notes.join("\n")} style={{ marginLeft: 5, color: WARN, fontSize: 10 }}>⚠</span>}</td>
                      {(["given", "when", "then"] as const).map((k) => <td key={k} style={{ borderBottom: BORDER, padding: "9px 12px", verticalAlign: "top", color: "var(--color-text-secondary)", fontSize: 12, maxWidth: 240 }}><Hl text={effTs(s, k)} q={q} /></td>)}
                      <td style={{ borderBottom: BORDER, padding: "9px 12px", whiteSpace: "nowrap", verticalAlign: "top" }}>{tsConfirmed(s) ? <TrustBadge confirmedBy={scOv[s.id]?.approver ?? "확정"} /> : confChip("추정", WARN, CONF_TITLE.INFERRED)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
