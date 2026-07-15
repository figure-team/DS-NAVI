import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";

import { useRtm } from "./context";
import DiscardConfirmDialog from "./DiscardConfirmDialog";
import { MD, confChip, useEscClose } from "./shared";
import { AC_KIND, BAD, BORDER, CIRCLED, CONF, CONF_TITLE, FAINT, GOLD, OK, PRIORITY, STEP_DEFS, VERB, WARN, policyDocId, stripFrontmatter } from "./types";
import type { Changeset, IntakeAC, IntakePolicyRef, IntakeRequirement, IntakeScreenRef } from "./types";
import { ModelSelect } from "../ModelSelect";
import EvidenceLink from "../ui/EvidenceLink";

// ── P4: 단계 진행 스테퍼 ──
export function IntakeStepper() {
  const { session, intakeStatus, viewStep, setViewStep, discardSession, closeSession, setView } = useRtm();
  // W4: 폐기 확인 다이얼로그 pending 상태 — 이 컴포넌트는 모듈 레벨(gap4/8 무관, 부모 리렌더에도
  // 타입이 안 바뀜)이라 로컬 useState 로 충분하다.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
            {/* W3: 산출물이 요청 세션 탭 본문으로 옮겨왔으므로 단계 선택은 그 탭으로 데려간다 —
                안 그러면 다른 탭의 상단 스트립에서 단계를 눌러도 보여줄 자리가 없어 죽은 클릭이 된다. */}
            <button type="button" disabled={!clickable} onClick={() => { setViewStep(s.n); setView("session"); }} className="flex items-center gap-1.5 rounded-md transition-colors" title={clickable ? `${s.label} 보기` : undefined}
              style={{ padding: "3px 8px", border: `1px solid ${active ? color : `${color}40`}`, background: active ? `${color}26` : `${color}14`, opacity: clickable || isRunningStep ? 1 : 0.5, cursor: clickable ? "pointer" : "default" }}>
              <span style={{ color, fontSize: 12 }}>{CIRCLED[i]}</span>
              <span style={{ fontSize: 11, color: st === "pending" ? FAINT : "var(--color-text-secondary)" }}>{s.label}</span>
              {st === "confirmed" && <span style={{ color: GOLD, fontSize: 10 }}>✓</span>}
              {isRunningStep && <span className="animate-pulse" style={{ color: WARN, fontSize: 11 }}>…</span>}
            </button>
          </span>
        );
      })}
      {/* W4(C2): 닫기(선택 해제만)와 폐기(영구 tombstone)를 분리한다 — 종전엔 "닫기 ×" 라벨로
          discardSession 을 호출해 문구·동작이 어긋났다(RTM_INTAKE_WORKSPACE_DESIGN.md §4 C2).
          자리 배치: 습관적으로 클릭하는 우측 끝은 안전한 "닫기"가 갖고, 되돌릴 수 없는 "폐기"는
          구분선을 두어 왼쪽으로 떨어뜨린 뒤 확인 다이얼로그로 한 번 더 막는다. */}
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={() => setConfirmDiscard(true)} disabled={running} className="text-text-muted hover:text-status-error disabled:opacity-40" style={{ fontSize: 10.5 }} title="세션 폐기 — 되돌릴 수 없습니다(닫기와 다름)">폐기</button>
        <span style={{ width: 1, height: 11, background: "var(--color-border-subtle)" }} />
        <button type="button" onClick={closeSession} disabled={running} className="text-text-muted hover:text-text-primary disabled:opacity-40" style={{ fontSize: 11 }} title="닫기 — 세션 원장 목록으로 돌아갑니다(세션은 유지됩니다)">닫기 ×</button>
      </span>
      {confirmDiscard && (
        <DiscardConfirmDialog
          request={session.request}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); void discardSession(); }}
        />
      )}
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

// ── P9: ① 식별의 근거 6축 표시 (RTM_IMPACT_GATE_DESIGN.md §9 P9) ─────────────
/**
 * 축 한 줄. `state` 가 세 갈래인 것이 이 컴포넌트의 존재 이유다(설계 §4.1 "없음 vs 못 봄"):
 *  - `filled`  — 근거를 그린다.
 *  - `none`    — **찾았는데 없다**. `evidence: []`(명시적 빈 배열)만 이 상태가 될 수 있다.
 *  - `omitted` — **못 봤다**. 축이 통째로 비었거나(화면·정책 축은 생산자 default 가 `[]` 라
 *                부재와 구별할 수 없다) 인용을 기록하지 않던 시대의 산출(`evidence: undefined`).
 *
 * 둘을 "근거 없음" 한 문구로 뭉치면 축소 모드(§10-1: "없으면 생략하되 그 사실을 명시")에서
 * **생략된 축이 '근거가 없는 축'으로 위장**한다 — 정확히 §4.1 이 경고한 오독이다.
 */
function Axis({ label, state, children }: { label: string; state: "filled" | "none" | "omitted"; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline" style={{ gap: 6, padding: "1px 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, flex: "none" }}>{label}</span>
      {state === "filled" ? children
        : state === "none"
          ? <span title="이 축을 봤으나 근거가 없습니다 — '생략됨'(못 봄)과 다릅니다." style={{ fontSize: 10.5, color: WARN }}>근거 없음</span>
          : <span title="이 축은 이 산출에 기록되지 않았습니다 — 근거가 없다는 뜻이 아닙니다(축소 모드: 있으면 포함·없으면 생략)." style={{ fontSize: 10.5, color: FAINT }}>생략됨</span>}
    </div>
  );
}

/** 화면 축 → 화면설계서 딥링크(`/screens?screen=`, ScreenSpecView.tsx:304 의 URL 계약). */
function ScreenRef({ r }: { r: IntakeScreenRef }) {
  // annotationNo 는 딥링크가 못 받는다(ScreenSpecView 는 ?screen= 만 읽는다) — 표기만 한다.
  const shown = r.screenId.replace(/^screen:/, "");
  return (
    <Link to={`/screens?screen=${encodeURIComponent(r.screenId)}`} title={r.note ? `${r.screenId} — ${r.note}` : r.screenId}
      className="hover:underline" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-status-info)", textDecoration: "none" }}>
      {shown}{r.annotationNo != null && ` #${r.annotationNo}`}
    </Link>
  );
}

/** 정책 축 → 정책서 본문(`/deliverables/:docId` — `policyDocId` 주석에 링크 근거). */
function PolicyRef({ r }: { r: IntakePolicyRef }) {
  // section·ruleId 는 문서 뷰어에 앵커가 없어 딥링크가 못 받는다 — 표기만 한다.
  const suffix = [r.section ? `§${r.section}` : "", r.ruleId ?? ""].filter(Boolean).join(" ");
  return (
    <Link to={`/deliverables/${encodeURIComponent(policyDocId(r.doc))}`} title={r.note ? `${r.doc} — ${r.note}` : r.doc}
      className="hover:underline" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-status-info)", textDecoration: "none" }}>
      {policyDocId(r.doc)}{suffix && ` ${suffix}`}
    </Link>
  );
}

const REF_ROW = "flex flex-wrap items-baseline";
const REF_GAP: CSSProperties = { gap: 6, minWidth: 0 };

/** 인수 기준 1건 — 신뢰도 배지 + 근거·화면·정책 3축. */
function AcRow({ ac }: { ac: IntakeAC }) {
  const conf = ac.confidence ? CONF[ac.confidence] : null;
  const kind = ac.kind ? AC_KIND[ac.kind] : null;
  const ev = ac.evidence;
  const screens = ac.screenRefs ?? [];
  const policies = ac.policyRefs ?? [];
  return (
    <div style={{ borderTop: BORDER, padding: "6px 0 5px" }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: 5 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-text-muted)", flex: "none" }}>{ac.id}</span>
        {kind && <span style={{ fontSize: 9, color: kind.color, border: BORDER, borderRadius: 4, padding: "1px 4px", flex: "none" }}>{kind.label}</span>}
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, flex: "1 1 240px", minWidth: 0 }}>{ac.text}</span>
        {conf && ac.confidence && confChip(conf.label, conf.color, CONF_TITLE[ac.confidence], { marginLeft: 0, flex: "none" })}
      </div>
      <div style={{ marginTop: 3, paddingLeft: 2 }}>
        {/* 근거(코드) — undefined/[]/[…] 3상태를 그대로 옮긴다(Axis 주석 참조). */}
        <Axis label="근거" state={ev === undefined ? "omitted" : ev.length === 0 ? "none" : "filled"}>
          <div className="flex flex-col" style={{ gap: 2, minWidth: 0, flex: "1 1 auto" }}>
            {(ev ?? []).map((e, i) => (
              <div key={i} className="flex items-baseline" style={{ gap: 6, minWidth: 0 }}>
                {/* line=null 은 "이 파일 근처"까지만 아는 정상 근거(intake-types.ts) — 라인을 지어내지 않는다. */}
                <EvidenceLink file={e.file} line={e.line ?? 1} showLine={e.line !== null} basename />
                {e.snippet && <code className="truncate" title={e.snippet} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-muted)", background: "var(--color-panel)", borderRadius: 3, padding: "0 4px", minWidth: 0 }}>{e.snippet}</code>}
              </div>
            ))}
          </div>
        </Axis>
        <Axis label="화면" state={screens.length > 0 ? "filled" : "omitted"}>
          <div className={REF_ROW} style={REF_GAP}>{screens.map((s, i) => <ScreenRef key={i} r={s} />)}</div>
        </Axis>
        <Axis label="정책" state={policies.length > 0 ? "filled" : "omitted"}>
          <div className={REF_ROW} style={REF_GAP}>{policies.map((p, i) => <PolicyRef key={i} r={p} />)}</div>
        </Axis>
      </div>
    </div>
  );
}

const CS_KEYS = Object.keys(VERB) as (keyof Changeset)[];

/** 요구사항 1건 — 머리줄(기존) + 요구사항 레벨 축 + AC 별 근거. */
function ReqCard({ r }: { r: IntakeRequirement }) {
  const acs = r.acceptanceCriteria ?? [];
  // 요구사항 레벨 화면·정책 축은 "AC 하나로 좁혀지지 않는 영향" 전용이라(intake-types.ts) 비어 있는
  // 게 정상이다 — 여기서 "생략됨"을 띄우면 AC 축의 같은 문구와 뜻이 갈린다. 있을 때만 그린다.
  const screens = r.screenRefs ?? [];
  const policies = r.policyRefs ?? [];
  const cs = CS_KEYS.flatMap((k) => (r.changeset?.[k] ?? []).map((v) => [k, v] as const));
  return (
    <div className="rounded-md" style={{ padding: "8px 11px", background: "var(--color-elevated)" }}>
      <div className="flex items-center gap-2.5">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: GOLD }}>{r.id}</span>
        <span style={{ fontSize: 9, color: "var(--color-text-muted)", border: BORDER, borderRadius: 4, padding: "1px 5px" }}>{r.category}</span>
        <span style={{ fontSize: 12.5, color: "var(--color-text-primary)" }}>{r.name}</span>
        {r.derivedFrom && <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>←{r.derivedFrom}</span>}
        {r.priority && <span className="ml-auto" style={{ fontSize: 10, color: PRIORITY[r.priority]?.color ?? WARN }}>{PRIORITY[r.priority]?.label ?? r.priority}</span>}
      </div>
      <div style={{ marginTop: 5, paddingLeft: 2 }}>
        {cs.length > 0 && (
          <Axis label="변경" state="filled">
            <div className={REF_ROW} style={REF_GAP}>
              {cs.map(([k, v], i) => (
                <span key={i} title={`${VERB[k].label} ${v}`} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: VERB[k].color }}>{VERB[k].sym}{v}</span>
              ))}
            </div>
          </Axis>
        )}
        {screens.length > 0 && <Axis label="화면" state="filled"><div className={REF_ROW} style={REF_GAP}>{screens.map((s, i) => <ScreenRef key={i} r={s} />)}</div></Axis>}
        {policies.length > 0 && <Axis label="정책" state="filled"><div className={REF_ROW} style={REF_GAP}>{policies.map((p, i) => <PolicyRef key={i} r={p} />)}</div></Axis>}
      </div>
      {acs.length > 0
        ? <div style={{ marginTop: 4 }}>{acs.map((ac) => <AcRow key={ac.id} ac={ac} />)}</div>
        : <div style={{ marginTop: 5, fontSize: 10.5, color: FAINT }}>인수 기준 없음 — 근거를 붙일 자리가 아직 없습니다.</div>}
    </div>
  );
}

function IdentifiedView() {
  const { identified } = useRtm();
  if (!identified) return <div className="text-text-muted" style={{ fontSize: 12 }}>식별 결과를 불러오는 중…</div>;
  const reqs = identified.requirements ?? [];
  const qs = identified.questions ?? [];
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 4 }}>요청 <b style={{ color: GOLD, fontFamily: "var(--font-mono)" }}>{identified.request?.id}</b> {identified.request?.name} → 요구사항 <b style={{ color: "var(--color-text-primary)" }}>{reqs.length}</b>건으로 분해</div>
      {/* 축소 모드(§10-1)를 화면에서 읽는 법 — "생략됨"이 "없음"으로 오독되지 않게 미리 못박는다. */}
      <div className="text-text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 12 }}>
        각 인수 기준의 <b className="text-text-secondary">근거·화면·정책</b> 축은 분석 산출물에서 가져온 것입니다.
        <b style={{ color: FAINT }}> 생략됨</b> = 이 산출에 그 축이 기록되지 않음(<b>근거가 없다는 뜻이 아닙니다</b>),
        <b style={{ color: WARN }}> 근거 없음</b> = 찾았으나 없음.
      </div>
      <div className="flex flex-col gap-1.5">
        {reqs.map((r) => <ReqCard key={r.id} r={r} />)}
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

// ── W3: 단계 산출물 본문 — 미리보기 · md 편집 · 컨펌 · 진행 ──
/**
 * 종전 `IntakeStepPanel`(fixed 52vh 하단 드로어)의 내용을 그대로 이식했다. 드로어를 걷어낸 이유는
 * 설계 §0(RTM_INTAKE_WORKSPACE_DESIGN.md): 나머지 드로어 3종(Function/Requirement/Scenario)은 전부
 * "표에서 고른 한 행의 상세"라 `absolute` + 선택 종속인데, 이것만 `fixed` 이면서 선택이 아니라
 * **세션 수명**에 묶여 있었다 — 형태만 드로어이고 성격이 달랐다. 이제 요청 세션 탭 우측 카드
 * (SessionView)의 본문으로 산다.
 *
 * 마운트 게이트(세션 있음 · 미폐기 · 미실행 · producedStep>=1)는 호출부(SessionView)가 진다 —
 * 종전 RtmView 의 `intakePanelOpen` 과 같은 조건이다.
 *
 * 높이를 확정값(52vh flex column)으로 두는 이유: 편집 textarea 가 `h-full` 이라 부모 높이가
 * 확정이어야 한다(auto 면 기본 2행으로 접힌다). 드로어 시절의 내부 비율을 그대로 보존한다.
 */
export function IntakeStepContent() {
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
    <div className="flex flex-col" style={{ height: "52vh" }}>
      <div className="flex items-center gap-3 shrink-0 border-b border-border-subtle" style={{ padding: "10px 20px" }}>
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
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: "14px 20px" }}>
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
          {/* 범위 경계(P9 갱신) — 종전 문구는 "코드 영향 범위는 여기서 분석하지 않습니다" 였으나
              P5 로 ①식별이 분석 산출물 6축을 근거로 읽게 되면서 절반이 낡았다. 그렇다고 impact
              엔진을 부르는 건 아니다(P6 진행 중) — 자연어 입구가 둘인 이상(여기 · 변경·영향의
              "자연어 영향 분석") 무엇을 주고 무엇을 안 주는지 여기서 정확히 갈라야 한다. */}
          <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 10 }}>이미 분석된 산출물(화면·정책·도메인·데이터·추적표)을 근거로 분해합니다. 다만 <b className="text-text-secondary">코드 도달성 분석</b>(바뀐 파일에서 무엇이 연쇄로 영향받는지)은 아직 별도입니다 — <b className="text-text-secondary">변경·영향</b> 메뉴에서 실행하세요.</p>
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
