import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";

import { useRtm } from "./context";
import ImpactStepView from "./ImpactStepView";
import { Axis, MD, REF_GAP, REF_ROW, confChip, useEscClose } from "./shared";
import { AC_KIND, BAD, BORDER, CIRCLED, CONF, CONF_TITLE, FAINT, GOLD, OK, PRIORITY, QUESTION_AXIS, STEP_DEFS, VERB, WARN, latestAnswers, normalizeQuestions, policyDocId, stripFrontmatter } from "./types";
import type { Changeset, IntakeAC, IntakePolicyRef, IntakeQuestion, IntakeRequirement, IntakeScreenRef } from "./types";
import { ModelSelect } from "../ModelSelect";
import EvidenceLink from "../ui/EvidenceLink";

// ── P4: 단계 진행 스테퍼 ──
/**
 * 우측 액션(편집/컨펌/다음 단계)은 종전 IntakeStepContent 단계 헤더의 것이다 — 그 헤더가 단계
 * 위치·컨펌 상태를 스테퍼와 중복 표기해 제거되면서(2026-07-16) 액션만 여기로 왔다. 폐기/닫기는
 * 세션 카드 헤더(SessionView) 최우측으로 — 세션 수명 조작은 세션 제목 줄의 몫이다.
 */
export function IntakeStepper() {
  const {
    session, intakeStatus, viewStep, setViewStep, setView,
    previewName, previewMd, editingDoc, setEditingDoc, setDraftDoc, stepBusy, confirmStep, advance, saveDoc,
  } = useRtm();
  if (!session || session.discarded) return null;
  const running = intakeStatus === "running";
  const frontier = session.producedStep;
  const ps = viewStep ?? frontier;
  const isDoc = ps >= 3 && ps <= 5; // ③목록표 ④정의서 ⑤명세서 — .md 편집 대상
  // 컨펌·진행은 **세션의 최전선**에 대한 액션이라 보고 있는 단계와 무관하다(2026-07-17 결함 수정:
  // 종전엔 isFrontier 게이트라 이전 단계 칩을 누를 때마다 버튼이 사라졌다 붙었다 해 깜빡임으로
  // 보였다). 라벨에 대상 단계(✓ ② 컨펌)를 박아 무엇을 컨펌하는지 못 박는다.
  const needConfirm = session.confirmedStep < frontier;
  const canAdvance = session.confirmedStep >= frontier && frontier < 6;
  // 낡은 단계(이전 단계 편집 뒤 미재생성) — 가장 앞의 것부터 되감아 다시 만든다.
  const firstStale = STEP_DEFS.map((s) => s.n).find((n) => session.steps[String(n)]?.stale) ?? null;
  return (
    // flex-wrap — 우측 액션이 늘어(컨펌·다음·목표·재생성) 좁은 폭에선 칩 라벨이 세로로 꺾였다.
    // 칩·버튼은 전부 nowrap 으로 형태를 지키고, 넘치면 액션 묶음이 통째로 다음 줄로 내려간다.
    <div className="flex items-center gap-1 shrink-0 bg-panel/60 border-b border-border-subtle flex-wrap" style={{ padding: "8px 24px", rowGap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginRight: 6, whiteSpace: "nowrap" }}>요청 분해</span>
      {STEP_DEFS.map((s, i) => {
        const st = session.steps[String(s.n)]?.status ?? "pending";
        const isRunningStep = running && s.n === session.producedStep + 1;
        const color = st === "confirmed" ? GOLD : st === "produced" ? OK : st === "failed" ? BAD : isRunningStep ? WARN : FAINT;
        // 진행 중 이전 단계는 read-only 로 열람 가능(2026-07-16) — 단 **지금 생성 중인 미산출
        // 단계**(st=running 이고 아직 산출 전)는 보여줄 완성물이 없어 클릭을 막는다. ①개정 중의
        // ①은 산출된 적이 있으므로(producedStep>=1) 열람이 되고, 인터뷰의 "재검토 중"이 그 자리다.
        const clickable = st !== "pending" && !(st === "running" && s.n > session.producedStep);
        const active = (viewStep ?? session.producedStep) === s.n;
        return (
          <span key={s.n} className="flex items-center">
            {i > 0 && <span style={{ width: 14, height: 1, background: "var(--color-border-subtle)", margin: "0 2px" }} />}
            {/* W3: 산출물이 요청 세션 탭 본문으로 옮겨왔으므로 단계 선택은 그 탭으로 데려간다. */}
            <button type="button" disabled={!clickable} onClick={() => { setViewStep(s.n); setView("session"); }} className="flex items-center gap-1.5 rounded-md transition-colors" title={clickable ? `${s.label} 보기` : undefined}
              style={{ padding: "3px 8px", border: `1px solid ${active ? color : `${color}40`}`, background: active ? `${color}26` : `${color}14`, opacity: clickable || isRunningStep ? 1 : 0.5, cursor: clickable ? "pointer" : "default", whiteSpace: "nowrap" }}>
              <span style={{ color, fontSize: 12 }}>{CIRCLED[i]}</span>
              <span style={{ fontSize: 11, color: st === "pending" ? FAINT : "var(--color-text-secondary)" }}>{s.label}</span>
              {st === "confirmed" && <span style={{ color: GOLD, fontSize: 10 }}>✓</span>}
              {session.steps[String(s.n)]?.stale && <span title="낡음 — 이전 단계가 편집된 뒤 재생성되지 않은 산출입니다. '낡은 단계 다시 생성'으로 갱신하세요." style={{ color: WARN, fontSize: 10 }}>⚠</span>}
              {isRunningStep && <span className="animate-pulse" style={{ color: WARN, fontSize: 11 }}>…</span>}
            </button>
          </span>
        );
      })}
      {/* 실행 중엔 액션 전체를 숨긴다 — 진행 중 열람은 read-only 다(편집·컨펌·진행 불가). */}
      {!running && frontier >= 1 && (
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
          {isDoc && previewName && !editingDoc && <button type="button" onClick={() => { setDraftDoc(previewMd); setEditingDoc(true); }} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent" style={{ padding: "4px 11px", fontSize: 11.5 }}>편집</button>}
          {isDoc && editingDoc && <>
            <button type="button" onClick={() => setEditingDoc(false)} className="rounded-md border border-border-subtle text-text-secondary" style={{ padding: "4px 11px", fontSize: 11.5 }}>취소</button>
            <button type="button" onClick={() => void saveDoc()} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "4px 11px", fontSize: 11.5 }}>{stepBusy ? "저장 중…" : "저장"}</button>
          </>}
          {/* 낡은 단계 재생성 — 첫 낡은 단계부터 종전 최전선까지 되감아 다시 만든다(편집 정책:
              낡음 표시 + 선택 재생성, 2026-07-17 사용자 결정). */}
          {firstStale !== null && !editingDoc && (
            <button type="button" onClick={() => void advance(frontier, firstStale)} disabled={stepBusy}
              title={`${CIRCLED[firstStale - 1]}~${CIRCLED[frontier - 1]} 을(를) 편집된 문서 기준으로 다시 생성합니다`}
              className="rounded-md disabled:opacity-50" style={{ padding: "4px 12px", fontSize: 11.5, fontWeight: 600, border: `1px solid ${WARN}`, background: `${WARN}1A`, color: WARN, cursor: "pointer" }}>
              ⚠ 낡은 단계 다시 생성 ▸
            </button>
          )}
          {needConfirm && !editingDoc && <button type="button" onClick={() => void confirmStep(frontier)} disabled={stepBusy} className="rounded-md border border-accent text-accent hover:bg-accent/10 disabled:opacity-50" style={{ padding: "4px 12px", fontSize: 11.5, fontWeight: 600 }} title={`${CIRCLED[frontier - 1]} ${STEP_DEFS[frontier - 1].label} 산출을 컨펌합니다 — 다음 단계 게이트가 열립니다`}>✓ {CIRCLED[frontier - 1]} 컨펌</button>}
          {canAdvance && <button type="button" onClick={() => void advance(frontier + 1)} disabled={stepBusy} className="rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50" style={{ padding: "4px 12px", fontSize: 11.5 }}>다음 단계 ▸</button>}
          {/* 목표 단계 드롭다운(2026-07-17) — 시작 모달의 목표 선택과 대칭. 다음 단계(frontier+1)는
              왼쪽 버튼 몫이라 그 뒤(frontier+2~⑥)만 나열한다. */}
          {canAdvance && frontier + 2 <= 6 && (
            <select value="" onChange={(e) => { const n = Number(e.target.value); if (n) void advance(n); }} disabled={stepBusy}
              className="rounded-md border border-border-subtle bg-panel text-text-secondary disabled:opacity-50" style={{ padding: "4px 6px", fontSize: 11.5, cursor: "pointer" }}
              title="선택한 단계까지 한 번에 생성 후 멈춤(중간 컨펌 없이 자동 진행)">
              <option value="" disabled>…까지 ▸</option>
              {STEP_DEFS.filter((s) => s.n >= frontier + 2).map((s) => (
                <option key={s.n} value={s.n}>{CIRCLED[s.n - 1]} {s.label}까지</option>
              ))}
            </select>
          )}
        </span>
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
// Axis·REF_ROW·REF_GAP 은 shared.tsx 로 이동(2026-07-17) — ② ImpactStepView 와 공유.

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


/**
 * A5/D3: ① `[확인필요]` 인터뷰 블록 — **분해보다 위**에 온다.
 *
 * 순서가 설계다(RTM_INTAKE_ANSWER_DESIGN.md §2.2·§6). 가이드의 ①은 "모호함을 먼저 제거"인데,
 * 분해를 위에 두면 **이미 다 정해진 것처럼 보인다**(사용자 실측 지적). 엔진은 한 패스로 분해+질문을
 * 내지만(날카로운 질문은 코드를 봐야 나오므로), 화면이 순서를 바로잡아 논리적 순서를 지킨다:
 * 분해는 답 전까지 `[추정]` 초안이고, 답하면 굳는다.
 */
function QuestionInterview({ questions, locked }: { questions: IntakeQuestion[]; locked: boolean }) {
  const { qaHistory, answerQuestions, stepBusy, intakeStatus } = useRtm();
  // 입력 중인 답(qid → 텍스트). 제출 전까지 로컬 — 제출하면 서버 원장이 진실원본이 된다.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const running = intakeStatus === "running";
  // 원장에 있으나 identified 에 아직 안 실린 답 = **제출됐지만 개정이 반영 전**. 이 겹침을 봐야
  // 개정 실패·새로고침에도 사용자가 친 답이 사라지지 않는다(§3.2).
  const submitted = latestAnswers(qaHistory);
  // `||` 인 이유: 개정이 `answer: ""` 를 쓸 수 있는데(빈 답), `??` 면 `""` 에서 멈춰 **원장에 답이
  // 있는데도** 미답으로 그린다. 빈 문자열은 답이 아니다 — 서버도 같은 판정으로 빈 답을 버린다.
  const answerOf = (q: IntakeQuestion): string | null =>
    q.answer?.trim() || submitted.get(q.id)?.answer || null;
  const open = questions.filter((q) => !answerOf(q));
  const answered = questions.filter((q) => answerOf(q));
  /** 제출됐지만 개정이 아직 안 실은 답 — 원장에는 있고 산출에는 없다. */
  const isPending = (q: IntakeQuestion): boolean => !q.answer?.trim() && submitted.has(q.id);
  /**
   * ★ 개정이 **답한 질문을 지워버린 경우**(SKILL 의 "answer≠null 은 지우지 마라" 위반)를 잡는다.
   *
   * 산문 지시는 지켜지지 않을 수 있고, 그때 사용자의 답은 원장에만 남아 **화면에서 조용히 사라진다** —
   * 이 저장소가 금지하는 바로 그 손실이다(§C8 "게이트는 코드로"의 짝: 못 지킬 약속은 코드로 잡는다).
   * `qid` 대조 + **답 텍스트 대조**를 함께 쓴다 — 구형 문자열 질문은 id 가 순서로 합성된 값이라
   * 개정이 번호를 다시 매기면 qid 만으로는 오탐한다(그때도 답 자체는 산출에 실려 있으면 정상).
   */
  const answerTexts = new Set(questions.map((q) => q.answer?.trim()).filter(Boolean));
  const orphaned = [...submitted.values()].filter(
    (qa) => !questions.some((q) => q.id === qa.qid) && !answerTexts.has(qa.answer),
  );

  const submit = () => {
    const payload = questions
      .map((q) => ({ qid: q.id, question: q.text, answer: (drafts[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
    if (payload.length === 0) return;
    void answerQuestions(payload);
    setDrafts({});
  };
  const filled = Object.values(drafts).some((v) => v.trim().length > 0);

  return (
    <div style={{ border: `1px solid ${BAD}55`, background: `${BAD}0A`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <div className="flex items-baseline" style={{ gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: BAD }}>먼저 정해 주세요</span>
        <span className="text-text-muted" style={{ fontSize: 10.5 }}>
          [확인필요] {open.length}건{answered.length > 0 && ` · 답함 ${answered.length}건`}
        </span>
        {locked && <span style={{ marginLeft: "auto", fontSize: 10.5, color: GOLD }}>① 컨펌됨 — 답변 잠금</span>}
      </div>
      {/* 미답변이 컨펌을 막지 않는다(D2) — 그 사실을 화면이 먼저 말해야 사용자가 갇히지 않는다. */}
      {!locked && (
        <div className="text-text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 10 }}>
          답하면 그 답을 반영해 <b className="text-text-secondary">①을 다시 분해</b>합니다(답변은 기록이 아니라 재검토입니다).
          <b> 답하지 않아도 컨펌할 수 있습니다</b> — 남은 질문과 그에 의존하는 결론은 <b style={{ color: WARN }}>[추정]</b>으로 남습니다.
        </div>
      )}
      <div className="flex flex-col" style={{ gap: 10 }}>
        {questions.map((q) => {
          const ans = answerOf(q);
          const pending = isPending(q);
          return (
            <div key={q.id} style={{ borderTop: q === questions[0] ? "none" : BORDER, paddingTop: q === questions[0] ? 0 : 8 }}>
              <div className="flex items-baseline" style={{ gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, flex: "none" }}>{q.id}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{q.text}</span>
              </div>
              <div className="flex items-center" style={{ gap: 5, marginTop: 3, marginLeft: 26 }}>
                {q.targetReqId && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: GOLD, border: `1px solid ${GOLD}40`, borderRadius: 3, padding: "0 4px" }}>{q.targetReqId}</span>}
                {q.axis && <span style={{ fontSize: 9.5, color: FAINT, border: BORDER, borderRadius: 3, padding: "0 4px" }}>{QUESTION_AXIS[q.axis] ?? q.axis}</span>}
              </div>
              {ans ? (
                <div style={{ marginLeft: 26, marginTop: 5 }}>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    <b style={{ color: OK }}>답</b> {ans}
                  </div>
                  <div className="text-text-muted" style={{ fontSize: 9.5, marginTop: 2 }}>
                    {pending ? <span style={{ color: WARN }}>제출됨 — 재검토 대기(아직 분해에 반영 전)</span> : q.answeredAt ?? ""}
                  </div>
                </div>
              ) : locked ? null : (
                <textarea
                  value={drafts[q.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  disabled={running || stepBusy}
                  rows={2}
                  placeholder="답을 적으면 이 답을 반영해 ①을 다시 분해합니다"
                  className="w-full rounded-md bg-panel border border-border-subtle focus:outline-none focus:border-status-info"
                  style={{ marginLeft: 26, width: "calc(100% - 26px)", marginTop: 5, padding: "5px 7px", fontSize: 11.5, color: "var(--color-text-primary)", resize: "vertical", fontFamily: "inherit" }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* 개정이 답한 질문을 지웠다 — 답은 원장에 남아 있으니 화면이 그 사실을 말한다(조용한 손실 금지). */}
      {orphaned.length > 0 && (
        <div style={{ marginTop: 10, borderTop: BORDER, paddingTop: 8 }}>
          <div style={{ fontSize: 10.5, color: WARN, fontWeight: 600, marginBottom: 4 }}>
            ⚠ 개정이 이 답을 산출에서 빠뜨렸습니다 — 답변 원장에는 남아 있습니다
          </div>
          {orphaned.map((qa) => (
            <div key={qa.qid} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: FAINT }}>{qa.qid}</span>{" "}
              {qa.question && <span className="text-text-muted">{qa.question} → </span>}
              <b>{qa.answer}</b>
            </div>
          ))}
        </div>
      )}
      {!locked && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
          <button type="button" onClick={submit} disabled={!filled || running || stepBusy}
            className="rounded-md transition-colors"
            title={filled ? "답변을 반영해 ①을 다시 분해합니다" : "답을 하나 이상 입력하세요"}
            style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 600, border: `1px solid ${filled && !running ? BAD : "var(--color-border-subtle)"}`, background: filled && !running ? `${BAD}1F` : "transparent", color: filled && !running ? BAD : FAINT, cursor: filled && !running ? "pointer" : "default" }}>
            {running ? "재검토 중…" : "답변 반영해 ① 재검토"}
          </button>
          <span className="text-text-muted" style={{ fontSize: 10 }}>여러 질문에 답한 뒤 한 번에 반영됩니다.</span>
        </div>
      )}
    </div>
  );
}

function IdentifiedView() {
  const { identified, session } = useRtm();
  if (!identified) return <div className="text-text-muted" style={{ fontSize: 12 }}>식별 결과를 불러오는 중…</div>;
  const reqs = identified.requirements ?? [];
  const qs = normalizeQuestions(identified.questions);
  // 답변은 ① 컨펌 루프 안에서만(D2 · §5) — 서버 게이트와 **같은 판정**이라야 화면이 거짓말을 안 한다.
  const locked = (session?.confirmedStep ?? 0) >= 1;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 10 }}>요청 <b style={{ color: GOLD, fontFamily: "var(--font-mono)" }}>{identified.request?.id}</b> {identified.request?.name} → 요구사항 <b style={{ color: "var(--color-text-primary)" }}>{reqs.length}</b>건으로 분해</div>
      {/* 질문을 **못 읽었다** — "질문 없음"으로 위장하지 않는다(§6 · "없음 vs 못 봄"). */}
      {qs === null && (
        <div style={{ border: `1px solid ${BAD}55`, background: `${BAD}0A`, borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 11.5, color: BAD }}>
          ⚠ `questions` 가 배열이 아닙니다 — 질문을 읽지 못했습니다(<b>모호함이 없다는 뜻이 아닙니다</b>). identified.json 을 확인하세요.
        </div>
      )}
      {/* D3: 질문이 먼저. 0건이면 물을 게 없으니 숨기고 분해를 바로 보여준다(명확한 요청은 루프 없이 통과). */}
      {qs !== null && qs.length > 0 && <QuestionInterview questions={qs} locked={locked} />}
      {/* 분해는 "초안"이다 — 질문이 남아 있는 동안 확정처럼 읽히지 않게 여기서 못박는다(§2.2). */}
      {qs !== null && qs.length > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <b>근거로 본 초안</b> — 위 질문에 답하면 확정됩니다
        </div>
      )}
      {/* 축소 모드(§10-1)를 화면에서 읽는 법 — "생략됨"이 "없음"으로 오독되지 않게 미리 못박는다. */}
      <div className="text-text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 12 }}>
        각 인수 기준의 <b className="text-text-secondary">근거·화면·정책</b> 축은 분석 산출물에서 가져온 것입니다.
        <b style={{ color: FAINT }}> 생략됨</b> = 이 산출에 그 축이 기록되지 않음(<b>근거가 없다는 뜻이 아닙니다</b>),
        <b style={{ color: WARN }}> 근거 없음</b> = 찾았으나 없음.
      </div>
      <div className="flex flex-col gap-1.5">
        {reqs.map((r) => <ReqCard key={r.id} r={r} />)}
      </div>
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
  const { session, viewStep, previewMd, editingDoc, draftDoc, setDraftDoc } = useRtm();
  if (!session) return null;
  const frontier = session.producedStep;
  if (frontier < 1) return null;
  const ps = viewStep ?? frontier; // 표시 단계(스테퍼에서 고른 단계)
  const stale = Boolean(session.steps[String(ps)]?.stale);
  // 단계 헤더(① 라벨 · 컨펌 상태 · 액션 줄)는 제거됐다(2026-07-16) — 단계 위치·컨펌 상태는
  // 스테퍼 칩이 이미 말하고 있었고(중복), 액션은 스테퍼 우측으로 옮겼다(IntakeStepper 주석).
  // 높이 — 드로어 시절 유산(52vh)은 큰 화면에서 카드 아래 빈 공간을 남겼다(사용자 실측,
  // 2026-07-17). 뷰포트를 채우되(카드 위 크롬 ≈ 340px 차감) 작은 창에선 52vh 를 하한으로.
  // 확정값이어야 하는 이유는 그대로다: 편집 textarea 가 h-full 이라 부모가 auto 면 접힌다.
  return (
    <div className="flex flex-col" style={{ height: "max(52vh, calc(100vh - 340px))" }}>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: "14px 20px" }}>
        {/* 낡음 배너 — 이 산출은 이전 단계 편집 **전** 문서를 근거로 생성됐다(조용한 불일치 금지). */}
        {stale && (
          <div style={{ border: `1px solid ${WARN}55`, background: `${WARN}0F`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11.5, color: WARN, lineHeight: 1.5 }}>
            ⚠ 이 산출물은 이전 단계가 편집되기 <b>전에</b> 생성되었습니다 — 편집 내용이 반영되어 있지 않습니다.
            상단 <b>낡은 단계 다시 생성</b>으로 갱신하세요.
          </div>
        )}
        {ps === 1 ? <IdentifiedView />
          : ps === 2 ? <ImpactStepView />
          : ps === 6 ? <div className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.7 }}>⑥ RTM 반영 완료 — <b style={{ color: "var(--color-text-primary)" }}>요청 기준</b> 탭에서 분해된 요청·요구사항과 추적 결과를 확인하세요. <span className="text-text-muted">생성된 문서는 세션 폴더(rtm-intake)에 보존됩니다.</span></div>
          : editingDoc ? <textarea value={draftDoc} onChange={(e) => setDraftDoc(e.target.value)} spellCheck={false} className="w-full h-full resize-none rounded-lg bg-elevated border border-border-medium text-text-primary focus:outline-none focus:border-accent" style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55, padding: "10px 12px" }} />
          : ps === 5 ? <SpecTabs />
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
          <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>고객 요청을 자연어로 입력하세요. 요청(REQ)을 요구사항(SFR/SIR/DAR/SER…)으로 분해해 6단계로 문서화합니다.<span className="text-text-muted"> 결과는 전부 <code style={{ fontFamily: "var(--font-mono)" }}>[추정]</code> — 단계마다 검토·컨펌하세요.</span></p>
          {/* 범위 경계 — 자연어 입구가 둘이므로(여기 · 변경·영향의 "자연어 영향 분석") 무엇을 주고
              무엇을 안 주는지 정확히 갈라야 한다. 종전 문구는 "코드 도달성은 변경·영향에서"였으나
              ②영향분석이 독립 단계가 되며 낡았다 — 이제 여기서도 돌린다. 남은 차이는 **시드 도출**:
              여기는 ①의 changeset 에서 결정론 조인, 변경·영향은 임의 파일집합. */}
          <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 10 }}>이미 분석된 산출물(화면·정책·도메인·데이터·추적표)을 근거로 분해하고, <b className="text-text-secondary">②영향분석</b>에서 코드 도달성(바뀐 기능에서 무엇이 연쇄로 영향받는지)까지 확인합니다. 임의 파일집합으로 영향만 보려면 <b className="text-text-secondary">변경·영향</b> 메뉴를 쓰세요.</p>
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
            <div className="text-text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>{targetStep === 6 ? "⑥ RTM까지 — 추적표에 바로 반영(한 방에 완료)." : `${CIRCLED[targetStep - 1]} ${STEP_DEFS[targetStep - 1].label}까지 생성 후 검토 대기.`}</div>
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
