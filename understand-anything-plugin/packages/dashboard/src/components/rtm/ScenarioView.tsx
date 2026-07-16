import { useState } from "react";
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
  // 기능 아코디언 — null=기본값(전부 접힘, 2026-07-16). FunctionView 도메인 접기와 동형.
  const [closedOverride, setClosedOverride] = useState<Set<string> | null>(null);
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

  // 기능 접기 — 기본 전부 접힘(2026-07-16): 기능 헤더의 요약(시나리오 수·확정)만 먼저 보인다.
  // 텍스트 검색 중에만 매칭 기능을 강제 펼침(드롭다운 필터는 접기 유지 — FunctionView 와 같은 규약).
  const defaultClosed = () => new Set(model.functions.map((f) => f.id));
  const closed = closedOverride ?? defaultClosed();
  const searching = ql.length > 0;
  const isFnOpen = (id: string) => searching || !closed.has(id);
  const toggleFn = (id: string) => setClosedOverride((prev) => { const next = new Set(prev ?? defaultClosed()); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const anyClosed = model.functions.some((f) => closed.has(f.id));

  return (
    <>
      {/* 카드 — ① 확정 n/전체 ② 미확정 n ③ 정상/예외/경계 ④ 보강 필요 (2026-07-16 재배열:
          종전 ① "시나리오" 총계는 ①의 분모와 중복이라 미확정 카드에 자리를 내줬다). */}
      <div className="flex gap-2.5" style={{ marginBottom: 16 }}>
        <Tile lbl="확정" n={tsConfirmedCount} d={`/${scenarios.length}`} pct={pct(tsConfirmedCount, scenarios.length)} bar={`linear-gradient(90deg,${GOLD_DIM},${GOLD})`} />
        <Tile lbl="미확정" n={scenarios.length - tsConfirmedCount} d=" 건" sub="검토·확정을 기다리는 [추정] 초안" />
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
        {!searching && (
          <button
            type="button"
            onClick={() => setClosedOverride(anyClosed ? new Set() : new Set(model.functions.map((f) => f.id)))}
            className="ml-auto text-text-muted hover:text-accent"
            style={{ fontSize: 11.5, border: BORDER, borderRadius: 6, background: "none", cursor: "pointer", padding: "4px 10px" }}
          >{anyClosed ? "전체 펼치기" : "전체 접기"}</button>
        )}
      </div>
      <div className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 16, maxWidth: 760 }}>
        기능 행의 코드 근거(진입점·데이터·인수조건)에서 <b>결정론 생성한 초안</b>입니다 — 전부 [추정]. 행을 눌러 Given/When/Then 을 검토·편집·확정하세요(확정은 재생성에도 유지). 시험 <b>수행 결과</b>는 요청 기준 탭의 인수조건 시험결과에 기록합니다.
      </div>
      {filtering && visible.length === 0 && <div className="text-text-muted" style={{ fontSize: 13 }}>검색·필터에 맞는 시나리오가 없습니다.</div>}
      {model.functions.map((f) => {
        const list = byFn.get(f.id) ?? [];
        if (list.length === 0) return null;
        const confirmedN = list.filter(tsConfirmed).length;
        const open = isFnOpen(f.id);
        return (
          <section key={f.id} style={{ marginBottom: open ? 18 : 8 }}>
            {/* 기능 헤더 = 접기/펼치기 토글(2026-07-16) — FunctionView 도메인 헤더와 동형. */}
            <button
              type="button"
              onClick={() => toggleFn(f.id)}
              aria-expanded={open}
              className="flex items-center gap-3 w-full text-left cursor-pointer bg-transparent border-0 rounded-[7px] hover:bg-elevated"
              style={{ padding: "4px 4px 9px", fontFamily: "inherit" }}
              title={searching ? "검색 중에는 매칭 기능이 항상 펼쳐집니다" : open ? "클릭 — 기능 접기" : "클릭 — 기능 펼치기"}
            >
              <span className="inline-flex justify-center text-text-muted" style={{ fontSize: 9, width: 10, flex: "none", transition: "transform 0.12s ease", transform: open ? "rotate(90deg)" : "none" }}>▸</span>
              <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{f.featureId}</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, color: "var(--color-text-primary)" }}>{effCell(f, "name")}</span>
              <span className="text-text-muted" style={{ fontSize: 11 }}>{f.domainName}</span>
              <span className="text-text-muted ml-auto" style={{ fontSize: 11 }}>시나리오 {list.length} · 확정 {confirmedN}/{list.length}</span>
            </button>
            {open && (
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
            )}
          </section>
        );
      })}
    </>
  );
}
