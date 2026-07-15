import { useSearchParams } from "react-router";

import { useRtm } from "./context";
import { ModelSelect } from "../ModelSelect";
import { Hl, Pill, rowKeyHandler } from "./shared";
import { AC_KIND, BAD, BORDER, FAINT, GOLD, GOLD_DIM, LIFECYCLE_LABEL, NFR, NFR_CAT, PRIORITY, STATE_LABEL, TEST_RES, UNGROUPED, VERB, requestIdOf, verbOf } from "./types";
import type { Changeset, Requirement, TestResult } from "./types";
import SearchInput from "../ui/SearchInput";

function AcMatrix({ r, targets }: { r: Requirement; targets: string[] }) {
  const { fnById, effTest } = useRtm();
  const cols = [...new Set(targets)];
  return (
    <div style={{ marginTop: 10, border: BORDER, borderRadius: 11, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `2.6fr .8fr ${cols.map(() => "1fr").join(" ")} .9fr`, background: "var(--color-elevated)", padding: "9px 14px", alignItems: "center" }}>
        {["인수조건 (AC)", "유형", ...cols.map((id) => fnById(id)?.name ?? id), "시험"].map((h, i) => <span key={i} className="text-text-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600, textAlign: i === 0 ? "left" : "center" }}>{h}</span>)}
      </div>
      {r.acceptanceCriteria.map((ac) => {
        const t0 = ac.tests[0]; const res: TestResult = t0 ? effTest(r, ac.id, t0) : "UNTESTED";
        return (
          <div key={ac.id} style={{ display: "grid", gridTemplateColumns: `2.6fr .8fr ${cols.map(() => "1fr").join(" ")} .9fr`, padding: "10px 14px", borderTop: BORDER, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{ac.id}</span>{ac.text}</span>
            <span style={{ justifySelf: "center", fontSize: 9.5, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: AC_KIND[ac.kind].color, background: "color-mix(in srgb,currentColor 14%,transparent)" }}>{AC_KIND[ac.kind].label}</span>
            {cols.map((id) => <span key={id} style={{ justifySelf: "center", color: ac.fnIds.includes(id) ? GOLD : FAINT, fontSize: ac.fnIds.includes(id) ? 13 : 11 }}>{ac.fnIds.includes(id) ? "●" : "·"}</span>)}
            <span style={{ justifySelf: "center", fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", borderRadius: 5, color: TEST_RES[res].color, background: res === "PASS" ? "rgba(127,174,138,.14)" : "var(--color-elevated)" }}>{TEST_RES[res].label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReqCard({ r, dead, nested, q }: { r: Requirement; dead?: boolean; nested?: boolean; q: string }) {
  const { model, expandedReqs, setExpandedReqs, effSignoff, effLifecycle, effCell, fnById, openFunction, setSelFn, setSelReq } = useRtm();
  if (!model) return null;
  const open = expandedReqs.has(r.id);
  const counts = (["removed", "modified", "added", "revived"] as Array<keyof Changeset>).filter((k) => r.changeset[k].length > 0);
  const targets = [...new Set([...r.changeset.added, ...r.changeset.modified, ...r.changeset.revived, ...r.changeset.removed])];
  const so = effSignoff(r);
  const toggle = () => setExpandedReqs((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
  return (
    <section style={{ background: nested ? "var(--color-surface)" : "linear-gradient(180deg,var(--color-panel),var(--color-surface))", border: BORDER, borderRadius: nested ? 9 : 10, marginTop: nested ? 10 : 0, marginBottom: nested ? 0 : 14, overflow: "hidden", opacity: dead ? 0.68 : 1 }}>
      <div className="flex items-center gap-3" role="button" tabIndex={0} onKeyDown={rowKeyHandler(toggle)} style={{ padding: "14px 20px", cursor: "pointer" }} onClick={toggle}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: dead ? "none" : r.type === "nonfunctional" ? NFR : GOLD, border: dead ? `1.5px solid ${FAINT}` : "none", boxShadow: dead ? "none" : `0 0 0 4px ${r.type === "nonfunctional" ? "color-mix(in srgb, var(--color-status-info) 14%, transparent)" : "color-mix(in srgb, var(--color-accent) 14%, transparent)"}` }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)", textDecoration: dead ? "line-through" : "none" }}><Hl text={r.id} q={q} /></span>
        <span style={{ fontSize: 15, color: dead ? "var(--color-text-secondary)" : "var(--color-text-primary)", fontWeight: 500 }}><Hl text={r.text} q={q} /></span>
        {dead ? <Pill label={r.status === "WITHDRAWN" ? (r.changeReq?.crNo ? `폐기 ${r.changeReq.crNo}` : "폐기(철회)") : "폐기"} color="var(--color-text-muted)" bg="rgba(255,255,255,.04)" />
          : r.type === "nonfunctional" ? <Pill label={`⚡ 비기능 · ${NFR_CAT[r.nfrCategory ?? "other"] ?? "기타"}`} color={NFR} bg="rgba(120,160,190,.12)" />
            : <><Pill label="● 현행" color={GOLD} bg="color-mix(in srgb, var(--color-accent) 12%, transparent)" />{r.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color: PRIORITY[r.priority].color, background: PRIORITY[r.priority].bg }}>{PRIORITY[r.priority].label}</span>}</>}
        {r.supersedes && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: GOLD_DIM }}>⟵ {r.supersedes} 대체</span>}
        {dead && r.supersededBy && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: GOLD_DIM }}>⟶ {r.supersededBy} 이 대체</span>}
        <span className="ml-auto flex items-center gap-2">
          {!dead && r.type === "functional" && <span className="flex gap-2 text-text-muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>
            {r.source?.requester && <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>👤 {r.source.requester}</span>}
            {r.changeReq?.crNo && <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>{r.changeReq.crNo}{r.changeReq.effort ? ` · ${r.changeReq.effort}` : ""}</span>}
            <span style={{ background: "var(--color-elevated)", border: BORDER, borderRadius: 5, padding: "2px 7px" }}>{LIFECYCLE_LABEL[effLifecycle(r)] ?? effLifecycle(r)}</span>
            {so?.approved && <span style={{ color: GOLD }}>✓검수</span>}
          </span>}
          {r.type === "nonfunctional" && r.nfrScope.length > 0 && <span className="text-text-muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>횡단: {r.nfrScope.map((id) => fnById(id)?.name ?? id).join(" · ")}</span>}
          <span className="flex gap-2" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{counts.map((k) => <span key={k} style={{ color: VERB[k].color }}>{VERB[k].sym}{r.changeset[k].length}</span>)}</span>
          {!dead && <button type="button" onClick={(e) => { e.stopPropagation(); setSelFn(null); setSelReq(r.id); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors" style={{ padding: "3px 10px", fontSize: 11 }}>검증</button>}
        </span>
      </div>
      {open && (
        <div style={{ padding: "4px 20px 16px", borderTop: BORDER }}>
          {r.source?.raw && <div className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: "8px 0 6px" }}>본문: <Hl text={r.source.raw} q={q} /></div>}
          {r.acceptanceCriteria.length > 0 && <AcMatrix r={r} targets={r.changeset.added.concat(r.changeset.modified, r.changeset.revived)} />}
          {/* AC 유무와 무관하게 영향 기능을 항상 클릭 목록으로(정방향 연결 가시화). */}
          <div style={{ marginTop: r.acceptanceCriteria.length > 0 ? 12 : 6 }}>
            <div className="text-text-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px 2px" }}>영향 기능{targets.length > 0 ? ` (${targets.length})` : ""}</div>
            {targets.length === 0 ? <div className="text-text-muted" style={{ fontSize: 11.5 }}>연결된 기능 없음.</div> : targets.map((id) => {
              const v = verbOf(r, id); const f = fnById(id);
              return <button key={id} type="button" onClick={() => openFunction(id)} className="flex items-center gap-2.5 w-full text-left rounded-md hover:bg-elevated/50 transition-colors" style={{ padding: "6px 8px" }}>
                {v && <><span style={{ color: VERB[v].color, fontFamily: "var(--font-mono)", fontSize: 13, width: 15, textAlign: "center", fontWeight: 600 }}>{VERB[v].sym}</span><span className="text-text-muted" style={{ fontSize: 11, width: 34 }}>{VERB[v].label}</span></>}
                <span className="text-text-secondary" style={{ fontSize: 12.5 }}>{f ? <><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, marginRight: 6 }}>{f.featureId}</span>{effCell(f, "name")}</> : id}</span>
                {f && <span className="ml-auto text-text-muted" style={{ fontSize: 10.5 }}>{STATE_LABEL[f.state]}</span>}
              </button>;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function RequestCard({ reqId, members, q, stateFilter }: { reqId: string; members: Requirement[]; q: string; stateFilter: "" | "active" | "dead" }) {
  const { expandedRequests, setExpandedRequests, changeRunning, changeReqId, startChange, changeModel, setChangeModel } = useRtm();
  const open = expandedRequests.has(reqId);
  const ungrouped = reqId === UNGROUPED;
  const selfReq = members.find((m) => m.id === reqId); // 요청-레벨 단일 요구사항(레거시 REQ-001 류)
  const title = ungrouped ? "분류되지 않은 요구사항" : selfReq ? selfReq.text : members.find((m) => m.source?.raw)?.source?.raw ?? "";
  const live = members.filter((m) => m.status === "ACTIVE");
  const deadN = members.length - live.length;
  const allDead = live.length === 0;
  const ordered = [...live, ...members.filter((m) => m.status !== "ACTIVE")];
  // 상태 필터는 표시만 거른다 — 카운트·철회 가능 여부는 전체 members 기준(계약 불변).
  const displayed = stateFilter === "active" ? ordered.filter((m) => m.status === "ACTIVE") : stateFilter === "dead" ? ordered.filter((m) => m.status !== "ACTIVE") : ordered;
  const running = changeRunning && changeReqId === reqId;
  const canWithdraw = !ungrouped && live.length > 0; // 유효 요구가 남은 정식 요청만 철회 가능
  const catCount = live.reduce((acc, r) => { const c = r.id.match(/^[A-Z]+/)?.[0] ?? "?"; acc[c] = (acc[c] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const toggle = () => setExpandedRequests((p) => { const n = new Set(p); if (n.has(reqId)) n.delete(reqId); else n.add(reqId); return n; });
  return (
    <section style={{ background: "var(--color-panel)", border: BORDER, borderRadius: 10, marginBottom: 14, overflow: "hidden", opacity: allDead ? 0.7 : 1 }}>
      <div className="flex items-center gap-3" role="button" tabIndex={0} onKeyDown={rowKeyHandler(toggle)} style={{ padding: "15px 20px", cursor: "pointer" }} onClick={toggle}>
        <span style={{ color: "var(--color-text-muted)", fontSize: 10, width: 11, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
        {ungrouped ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: FAINT }}>{UNGROUPED}</span>
          : <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: allDead ? FAINT : GOLD, border: `1px solid ${allDead ? FAINT : GOLD}55`, borderRadius: 5, padding: "2px 8px", textDecoration: allDead ? "line-through" : "none" }}><Hl text={reqId} q={q} /></span>}
        <span style={{ fontSize: 14.5, color: allDead ? "var(--color-text-secondary)" : "var(--color-text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 600 }}><Hl text={title} q={q} /></span>
        <span className="ml-auto flex items-center gap-3 text-text-muted" style={{ fontSize: 11.5 }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{Object.entries(catCount).map(([c, n]) => `${c} ${n}`).join(" · ") || "—"}</span>
          <span>요구사항 {members.length}{deadN ? ` · 폐기 ${deadN}` : ""}</span>
          {canWithdraw && <span onClick={(e) => e.stopPropagation()}><ModelSelect value={changeModel} onChange={setChangeModel} disabled={changeRunning}
            sessionDefaultLabel="세션 모델(기본)" ariaLabel="변경관리 실행 모델 선택"
            className="rounded-md bg-elevated border border-border-medium text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50"
            style={{ padding: "2px 5px", fontSize: 10.5 }} /></span>}
          {canWithdraw && <button type="button" onClick={(e) => { e.stopPropagation(); void startChange(reqId); }} disabled={running}
            className="rounded-md border transition-colors disabled:opacity-60"
            style={{ padding: "3px 10px", fontSize: 11, borderColor: running ? FAINT : `${BAD}66`, color: running ? "var(--color-text-muted)" : BAD }}
            title="이 요청을 철회 — 하위 요구사항 동반 폐기 + 변경관리 문서(CR) 생성(삭제 아님, 이력 보존)">
            {running ? "철회 중…" : "변경요청"}</button>}
        </span>
      </div>
      {open && <div style={{ padding: "2px 14px 12px", borderTop: BORDER }}>
        {displayed.map((m) => <ReqCard key={m.id} r={m} dead={m.status !== "ACTIVE"} nested q={q} />)}
        {displayed.length === 0 && <div className="text-text-muted" style={{ fontSize: 11.5, padding: "10px 6px" }}>상태 필터에 맞는 요구사항이 없습니다.</div>}
      </div>}
    </section>
  );
}

// ── 뷰② 요청 기준 (요청 REQ → 요구사항 SFR… → AC) ──
export default function RequirementView() {
  const { model } = useRtm();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const rstateRaw = searchParams.get("rstate");
  const stateFilter: "" | "active" | "dead" = rstateRaw === "active" || rstateRaw === "dead" ? rstateRaw : "";
  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams((prev) => { if (v) prev.set(k, v); else prev.delete(k); return prev; }, { replace });

  if (!model) return null;
  if (model.requirements.length === 0) return <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 560 }}>등록된 요청이 없습니다. <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>＋ 새 요청</code> 으로 자연어 요청을 분해·문서화하거나 rtm-requirements.json 으로 작성합니다.</div>;

  // 요청(REQ)별 그룹핑 — 한 요청이 여러 요구사항으로 분해된다.
  const groups = new Map<string, Requirement[]>();
  for (const r of model.requirements) {
    const rid = requestIdOf(r);
    if (!groups.has(rid)) groups.set(rid, []);
    groups.get(rid)!.push(r);
  }
  const reqIds = [...groups.keys()].sort((a, b) =>
    a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, undefined, { numeric: true }),
  );

  // gap3: 검색은 그룹 단위 표시 필터 — 요청ID/제목/하위 요구 id·text·본문 중 하나라도 매치.
  const ql = q.trim().toLowerCase();
  const memberMatch = (m: Requirement) => m.id.toLowerCase().includes(ql) || m.text.toLowerCase().includes(ql) || (m.source?.raw ?? "").toLowerCase().includes(ql);
  const groupMatch = (rid: string) => {
    if (!ql) return true;
    if (rid.toLowerCase().includes(ql)) return true;
    return groups.get(rid)!.some(memberMatch);
  };
  const stateMatch = (rid: string) => {
    if (!stateFilter) return true;
    const members = groups.get(rid)!;
    return stateFilter === "active" ? members.some((m) => m.status === "ACTIVE") : members.some((m) => m.status !== "ACTIVE");
  };
  const visible = reqIds.filter((rid) => groupMatch(rid) && stateMatch(rid));

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 16 }}>
        <SearchInput
          value={q}
          onChange={(v) => setParam("q", v || null, true)}
          placeholder="요청·요구사항 검색"
          width={200}
        />
        <select value={stateFilter} onChange={(e) => setParam("rstate", e.target.value || null)} className="rounded-lg border border-border-medium bg-panel text-text-secondary" style={{ padding: "6px 10px", fontSize: 12.5 }}>
          <option value="">상태 전체</option>
          <option value="active">현행만</option>
          <option value="dead">폐기 포함만</option>
        </select>
        {(ql || stateFilter) && <span className="text-text-muted" style={{ fontSize: 12 }}>{visible.length}/{reqIds.length}요청 표시 중</span>}
      </div>
      {visible.length === 0 ? <div className="text-text-muted" style={{ fontSize: 13 }}>검색·필터에 맞는 요청이 없습니다.</div>
        : visible.map((rid) => <RequestCard key={rid} reqId={rid} members={groups.get(rid)!} q={q} stateFilter={stateFilter} />)}
    </>
  );
}
