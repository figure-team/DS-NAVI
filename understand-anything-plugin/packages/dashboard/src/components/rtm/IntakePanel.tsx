import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useRtm } from "./context";
import { MD, useEscClose } from "./shared";
import { BAD, BORDER, CIRCLED, FAINT, GOLD, OK, PRIORITY, STEP_DEFS, WARN, stripFrontmatter } from "./types";
import { ModelSelect } from "../ModelSelect";

// ── P4: 단계 진행 스테퍼 ──
export function IntakeStepper() {
  const { session, intakeStatus, viewStep, setViewStep, discardSession } = useRtm();
  if (!session || session.discarded) return null;
  const running = intakeStatus === "running";
  return (
    <div className="flex items-center gap-1 shrink-0 bg-panel/60 border-b border-border-subtle" style={{ padding: "8px 24px" }}>
      <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginRight: 6 }}>요청 분해</span>
      {STEP_DEFS.map((s, i) => {
        const st = session.steps[String(s.n)]?.status ?? "pending";
        const isRunningStep = running && s.n === session.producedStep + 1;
        const color = st === "confirmed" ? GOLD : st === "produced" ? OK : st === "failed" ? BAD : isRunningStep ? WARN : FAINT;
        const clickable = st !== "pending";
        const active = (viewStep ?? session.producedStep) === s.n;
        return (
          <span key={s.n} className="flex items-center">
            {i > 0 && <span style={{ width: 14, height: 1, background: "var(--color-border-subtle)", margin: "0 2px" }} />}
            <button type="button" disabled={!clickable} onClick={() => setViewStep(s.n)} className="flex items-center gap-1.5 rounded-md transition-colors" title={clickable ? `${s.label} 보기` : undefined}
              style={{ padding: "3px 8px", border: `1px solid ${active ? color : `${color}40`}`, background: active ? `${color}26` : `${color}14`, opacity: clickable || isRunningStep ? 1 : 0.5, cursor: clickable ? "pointer" : "default" }}>
              <span style={{ color, fontSize: 12 }}>{CIRCLED[i]}</span>
              <span style={{ fontSize: 11, color: st === "pending" ? FAINT : "var(--color-text-secondary)" }}>{s.label}</span>
              {st === "confirmed" && <span style={{ color: GOLD, fontSize: 10 }}>✓</span>}
              {isRunningStep && <span className="animate-pulse" style={{ color: WARN, fontSize: 11 }}>…</span>}
            </button>
          </span>
        );
      })}
      <button type="button" onClick={() => void discardSession()} disabled={running} className="ml-auto text-text-muted hover:text-text-primary disabled:opacity-40" style={{ fontSize: 11 }} title="이 세션 닫기">닫기 ×</button>
    </div>
  );
}

function SpecTabs() {
  const { sessionDocs, previewName, previewMd, loadPreview } = useRtm();
  const specs = sessionDocs.filter((d) => d.kind === "spec");
  if (specs.length === 0) return <div className="text-text-muted" style={{ fontSize: 12 }}>명세서를 불러오는 중…</div>;
  return (
    <>
      <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 12 }}>
        {specs.map((d) => (
          <button key={d.name} type="button" onClick={() => void loadPreview(d.name)} className="rounded-md transition-colors" style={{ padding: "3px 10px", fontSize: 11, fontFamily: "var(--font-mono)", border: previewName === d.name ? `1px solid ${GOLD}` : BORDER, color: previewName === d.name ? GOLD : "var(--color-text-secondary)", background: previewName === d.name ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent" }}>
            {d.name.replace(/^요구사항명세서_/, "").replace(/\.md$/, "")}
          </button>
        ))}
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{stripFrontmatter(previewMd)}</ReactMarkdown>
    </>
  );
}

function IdentifiedView() {
  const { identified } = useRtm();
  if (!identified) return <div className="text-text-muted" style={{ fontSize: 12 }}>식별 결과를 불러오는 중…</div>;
  const reqs = identified.requirements ?? [];
  const qs = identified.questions ?? [];
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 12 }}>요청 <b style={{ color: GOLD, fontFamily: "var(--font-mono)" }}>{identified.request?.id}</b> {identified.request?.name} → 요구사항 <b style={{ color: "var(--color-text-primary)" }}>{reqs.length}</b>건으로 분해</div>
      <div className="flex flex-col gap-1.5">
        {reqs.map((r) => (
          <div key={r.id} className="flex items-center gap-2.5 rounded-md" style={{ padding: "7px 11px", background: "var(--color-elevated)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: GOLD }}>{r.id}</span>
            <span style={{ fontSize: 9, color: "var(--color-text-muted)", border: BORDER, borderRadius: 4, padding: "1px 5px" }}>{r.category}</span>
            <span style={{ fontSize: 12.5, color: "var(--color-text-primary)" }}>{r.name}</span>
            {r.derivedFrom && <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>←{r.derivedFrom}</span>}
            {r.priority && <span className="ml-auto" style={{ fontSize: 10, color: PRIORITY[r.priority]?.color ?? WARN }}>{PRIORITY[r.priority]?.label ?? r.priority}</span>}
          </div>
        ))}
      </div>
      {qs.length > 0 && (
        <div style={{ marginTop: 16, borderTop: BORDER, paddingTop: 12 }}>
          <div style={{ fontSize: 11.5, color: BAD, marginBottom: 6, fontWeight: 600 }}>[확인필요] — 다음 단계 전에 검토하세요</div>
          {qs.map((q, i) => <div key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "2px 0", lineHeight: 1.5 }}>· {q}</div>)}
        </div>
      )}
    </div>
  );
}

// ── P4: 단계 산출 미리보기/컨펌 패널(하단 드로어) ──
export function IntakeStepPanel() {
  const { session, viewStep, previewName, previewMd, editingDoc, setEditingDoc, draftDoc, setDraftDoc, stepBusy, confirmStep, advance, saveDoc } = useRtm();
  if (!session) return null;
  const frontier = session.producedStep;
  if (frontier < 1) return null;
  const ps = viewStep ?? frontier; // 표시 단계(스테퍼에서 고른 단계)
  const isFrontier = ps === frontier;
  const confirmed = session.confirmedStep >= ps;
  const canAdvance = isFrontier && session.confirmedStep >= frontier && frontier < 5;
  const isDoc = ps >= 2 && ps <= 4;
  return (
    <div className="fixed left-0 right-0 bottom-0 z-[90] bg-panel border-t border-border-medium shadow-2xl" style={{ height: "52vh", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-3 shrink-0 border-b border-border-subtle" style={{ padding: "10px 22px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--color-text-primary)" }}>{CIRCLED[ps - 1]} {STEP_DEFS[ps - 1].label}</span>
        {confirmed ? <span style={{ fontSize: 11, color: GOLD }}>✓ 컨펌됨</span> : <span style={{ fontSize: 11, color: WARN }}>검토 필요</span>}
        {!isFrontier && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>· 이전 단계 보기</span>}
        <span className="ml-auto flex items-center gap-2">
          {isDoc && previewName && !editingDoc && <button type="button" onClick={() => { setDraftDoc(previewMd); setEditingDoc(true); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "5px 12px", fontSize: 12 }}>편집</button>}
          {isDoc && editingDoc && <>
            <button type="button" onClick={() => setEditingDoc(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "5px 12px", fontSize: 12 }}>취소</button>
            <button type="button" onClick={() => void saveDoc()} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 12px", fontSize: 12 }}>{stepBusy ? "저장 중…" : "저장"}</button>
          </>}
          {isFrontier && !confirmed && !editingDoc && <button type="button" onClick={() => void confirmStep(frontier)} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12, fontWeight: 600 }}>✓ 컨펌</button>}
          {canAdvance && <button type="button" onClick={() => void advance(frontier + 1)} disabled={stepBusy} className="rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50" style={{ padding: "5px 13px", fontSize: 12 }}>다음 단계 ▸</button>}
          {canAdvance && frontier < 4 && <button type="button" onClick={() => void advance(5)} disabled={stepBusy} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent disabled:opacity-50" style={{ padding: "5px 11px", fontSize: 12 }}>⑤까지 ▸</button>}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: "14px 22px" }}>
        {ps === 1 ? <IdentifiedView />
          : ps === 5 ? <div className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>⑤ RTM 반영 완료 — <b style={{ color: "var(--color-text-primary)" }}>요청 기준</b> 탭에서 분해된 요청·요구사항과 추적 결과를 확인하세요. <span className="text-text-muted">생성된 문서는 세션 폴더(rtm-intake)에 보존됩니다.</span></div>
          : editingDoc ? <textarea value={draftDoc} onChange={(e) => setDraftDoc(e.target.value)} spellCheck={false} className="w-full h-full resize-none rounded-lg bg-elevated border border-border-medium text-text-primary focus:outline-none focus:border-accent" style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55, padding: "10px 12px" }} />
          : ps === 4 ? <SpecTabs />
          : <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{stripFrontmatter(previewMd)}</ReactMarkdown>}
      </div>
    </div>
  );
}

/** 인테이크 모달 — 자연어 요청 입력 + 목표 단계 선택. */
export function IntakeModal() {
  const { setIntakeOpen, intakeQuery, setIntakeQuery, targetStep, setTargetStep, intakeModel, setIntakeModel, intakeError, startIntake } = useRtm();
  useEscClose(() => setIntakeOpen(false));
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setIntakeOpen(false); }}>
      <div role="dialog" aria-modal="true" className="glass-heavy rounded-xl shadow-2xl w-full max-w-xl mx-4">
        <div className="flex items-center justify-between border-b border-border-subtle" style={{ padding: "14px 20px" }}>
          <h2 className="text-text-primary" style={{ fontSize: 15, fontWeight: 600 }}>요구사항 요청</h2>
          <button onClick={() => setIntakeOpen(false)} aria-label="닫기" className="text-text-muted hover:text-text-primary" style={{ fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>고객 요청을 자연어로 입력하세요. 요청(REQ)을 요구사항(SFR/SIR/DAR/SER…)으로 분해해 가이드 5단계로 문서화합니다.<span className="text-text-muted"> 결과는 전부 <code style={{ fontFamily: "var(--font-mono)" }}>[추정]</code> — 단계마다 검토·컨펌하세요.</span></p>
          <textarea value={intakeQuery} onChange={(e) => setIntakeQuery(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void startIntake(); }} placeholder="예) 네이버 로그인 추가해주세요." rows={3} autoFocus className="w-full resize-y rounded-lg bg-elevated border border-border-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" style={{ fontSize: 13, padding: "8px 11px" }} />
          <div style={{ marginTop: 14 }}>
            <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 7 }}>어디까지 진행할까요? <span style={{ color: "var(--color-text-secondary)" }}>(선택 단계까지 한 번에 생성 후 멈춤)</span></div>
            <div className="flex items-center gap-1.5">
              {STEP_DEFS.map((s, i) => (
                <button key={s.n} type="button" onClick={() => setTargetStep(s.n)}
                  className="flex-1 rounded-lg transition-colors" style={{ padding: "7px 4px", border: targetStep === s.n ? `1px solid ${GOLD}` : BORDER, background: targetStep === s.n ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent" }}>
                  <div style={{ fontSize: 13, color: targetStep === s.n ? GOLD : "var(--color-text-secondary)" }}>{CIRCLED[i]}</div>
                  <div style={{ fontSize: 10, color: targetStep === s.n ? GOLD : "var(--color-text-muted)", marginTop: 2 }}>{s.label}</div>
                </button>
              ))}
            </div>
            <div className="text-text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>{targetStep === 5 ? "⑤ RTM까지 — 추적표에 바로 반영(한 방에 완료)." : `${CIRCLED[targetStep - 1]} ${STEP_DEFS[targetStep - 1].label}까지 생성 후 검토 대기.`}</div>
          </div>
          {intakeError && <p style={{ fontSize: 11.5, marginTop: 8, color: BAD }}>{intakeError}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle" style={{ padding: "12px 20px" }}>
          <ModelSelect value={intakeModel} onChange={setIntakeModel} sessionDefaultLabel="세션 모델(기본)" ariaLabel="실행 모델 선택"
            className="mr-auto rounded-lg bg-elevated border border-border-medium text-text-secondary focus:outline-none focus:border-accent" style={{ padding: "5px 8px", fontSize: 12 }} />
          <button onClick={() => setIntakeOpen(false)} className="rounded-lg text-text-secondary hover:text-text-primary" style={{ padding: "6px 12px", fontSize: 13 }}>취소</button>
          <button onClick={() => void startIntake()} disabled={!intakeQuery.trim()} className="rounded-lg font-medium bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40" style={{ padding: "6px 16px", fontSize: 13 }}>실행 ▸</button>
        </div>
      </div>
    </div>
  );
}
