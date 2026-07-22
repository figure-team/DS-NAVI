import { useState } from "react";

import { useRtm } from "./context";
import DiscardConfirmDialog from "./DiscardConfirmDialog";
import { IntakeStepContent, IntakeStepper } from "./IntakePanel";
import { Spinner } from "./shared";
import {
  CIRCLED, SESSION_STATE, STEP_DEFS, WARN, fmtSessionTime, sessionStateOf,
} from "./types";
import { Badge } from "../proto/Proto";
import NavGroup from "../ui/NavGroup";

/**
 * W2: 요청 세션 탭 — 좌 270px 세션 원장 + 우 선택 세션 콘텐츠.
 * 설계: docs/ktds/RTM_INTAKE_WORKSPACE_DESIGN.md §2.2(레이아웃) · §3(N1,N2) · §4(C1).
 *
 * 레이아웃은 변경·영향(ChangeImpactView:710,776)의 `?run=` 원장과 동형이다 — 좌 = 동종 항목의
 * 원장, 우 = 선택된 1건의 전체(설계 §1.4). 원장이 해소하는 결함은 orphan 세션(§1.1): 미완 세션
 * A 위에 B 를 만들면 종전엔 A 가 디스크에만 남고 UI 에서 사라졌다.
 *
 * W3: 우측 카드가 **스테퍼 + 단계 산출물 전체**를 담는다 — 종전 `IntakeStepPanel`(fixed 52vh 하단
 * 드로어)을 걷어내고 그 내용을 `IntakeStepContent` 로 이식했다(설계 §0 · §5 W3). 산출물이 없거나
 * 실행 중이거나 폐기된 세션은 이식 대상이 아니므로 여기서 문구로 처리한다(종전 드로어의
 * 마운트 게이트 `intakePanelOpen` 과 같은 조건 — 그때도 그 상태에선 드로어가 안 떴다).
 */

const CARD = "rounded-[10px] border border-border-subtle bg-panel card-shadow";

/** 최고 단계 배지 — producedStep(산출물이 존재하는 최고 단계, 0=없음). */
function StepBadge({ n }: { n: number }) {
  const ok = n >= 1 && n <= STEP_DEFS.length;
  const label = ok ? CIRCLED[n - 1] : "–";
  const title = ok ? `${CIRCLED[n - 1]} ${STEP_DEFS[n - 1].label}까지 산출됨` : "아직 산출물 없음";
  return (
    <span
      title={title}
      className="tabular-nums"
      style={{ fontSize: 12, color: n >= 1 ? "var(--color-accent)" : "var(--color-text-muted)" }}
    >
      {label}
    </span>
  );
}

export default function SessionView() {
  const { sessions, sessionsError, sid, session, openSession, canWrite, openIntake, intakeStatus, jobStep, discardSession, closeSession } = useRtm();
  // W4: 폐기 확인 다이얼로그 pending — 폐기/닫기가 스테퍼에서 카드 헤더 최우측으로 이사하며
  // (2026-07-16) 상태도 함께 왔다. 모듈 레벨 컴포넌트라 로컬 useState 로 충분하다.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(true);
  const running = intakeStatus === "running";

  const ledger = (
    <div className={`${CARD} proto-tree`}>
      <NavGroup label="세션 원장" count={sessions.length} open={ledgerOpen} onToggle={() => setLedgerOpen((v) => !v)}>
      {sessionsError ? (
        <div style={{ fontSize: 12, color: "var(--color-status-error)", padding: "4px 8px", lineHeight: 1.5 }}>
          원장을 불러오지 못했습니다 — <code style={{ fontFamily: "var(--font-mono)" }}>{sessionsError}</code>
        </div>
      ) : !canWrite ? (
        // demo 번들엔 /rtm-intake-sessions 가 없다 — 변경·영향의 historyEnabled 분기와 같은 사정.
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px", lineHeight: 1.5 }}>
          읽기전용 — 세션 원장은 dev 서버에서만 열람됩니다.
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px", lineHeight: 1.5 }}>
          아직 세션 없음 — 위 <b className="text-text-secondary">＋ 새 요청</b>으로 시작하면 여기 쌓입니다.
        </div>
      ) : (
        sessions.map((s) => {
          const st = SESSION_STATE[sessionStateOf(s)];
          return (
            <button
              key={s.sid}
              type="button"
              className={`doc${s.sid === sid ? " on" : ""}`}
              title={`${s.request}\n${fmtSessionTime(s.createdAt)} · ${st.label} — ${st.title}`}
              onClick={() => openSession(s.sid)}
              style={s.discarded ? { opacity: 0.6 } : undefined}
            >
              <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                <span className="truncate" style={{ display: "block" }}>{s.request || "(요청 미상)"}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{fmtSessionTime(s.createdAt)}</span>
              </span>
              <span className="st">
                {/* 실행 중 로딩 — 종전 RTM 헤더 스피너의 이사처 ①(원장 행). 전역 1건이라 최대 1행. */}
                {s.running && <span style={{ color: WARN, marginRight: 5, display: "inline-flex", verticalAlign: "-1px" }}><Spinner size={11} /></span>}
                <StepBadge n={s.producedStep} />
                <Badge tone={st.tone} title={st.title} style={{ marginLeft: 6 }}>{st.label}</Badge>
              </span>
            </button>
          );
        })
      )}
      </NavGroup>
      {/* C1 을 화면에서 못 박는다 — 원장이 목록이라고 큐로 읽히면 안 된다(§4). */}
      <div className="fold">안내</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "6px 8px", lineHeight: 1.5 }}>
        동시 실행은 <b className="text-text-secondary">한 번에 1건</b>입니다 — 나머지 미완 세션은 대기열이
        아니라 멈춰 있는 상태이고, 고르면 그 자리에서 이어서 진행합니다.
      </div>
    </div>
  );

  const selectedRow = sessions.find((s) => s.sid === sid) ?? null;

  return (
    <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
      <div className="flex flex-col" style={{ gap: 10, minWidth: 0 }}>
        {/* 새 요청 — 종전 헤더 우상단에서 이동(2026-07-16): 세션이 쌓이는 원장 바로 위가 액션 자리다. */}
        <button type="button" onClick={openIntake} disabled={intakeStatus === "running"}
          className="rounded-lg border border-accent bg-panel text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 font-semibold cursor-pointer"
          style={{ padding: "8px 14px", fontSize: 13 }}
          title="자연어로 새 요구사항을 요청 → 6단계(식별·영향분석·목록표·정의서·명세서·RTM)로 분해·문서화(전부 [추정])">＋ 새 요청</button>
        {ledger}
      </div>

      <div style={{ minWidth: 0 }}>
        {!session ? (
          <div className={CARD} style={{ padding: 28, textAlign: "center" }}>
            <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {sessions.length > 0
                ? "좌측 원장에서 세션을 선택하면 단계 진행이 여기 표시됩니다"
                : "진행 중인 요청 세션 없음 — 좌측 ＋ 새 요청으로 시작하면 여기 나타납니다"}
            </p>
          </div>
        ) : (
          <div className={CARD} style={{ overflow: "hidden" }}>
            {/* 헤더 — 제목 = 요청문(사람 언어). 변경·영향 헤더 카드가 질의문을 쓰는 것과 같은 축.
                최우측 = 폐기/닫기(2026-07-16 스테퍼에서 이사 — 세션 수명 조작은 제목 줄의 몫). */}
            <div className="flex items-center gap-2.5 flex-wrap border-b border-border-subtle" style={{ padding: "14px 20px" }}>
              <b className="truncate" style={{ fontSize: 15, minWidth: 0, maxWidth: 620 }} title={session.request}>
                {session.request || "(요청 미상)"}
              </b>
              {selectedRow && (
                <Badge tone={SESSION_STATE[sessionStateOf(selectedRow)].tone} title={SESSION_STATE[sessionStateOf(selectedRow)].title}>
                  {SESSION_STATE[sessionStateOf(selectedRow)].label}
                </Badge>
              )}
              {selectedRow && (
                <span className="text-text-muted" style={{ fontSize: 11.5 }}>{fmtSessionTime(selectedRow.createdAt)}</span>
              )}
              {/* 첫 실행 모델 — 진행·개정이 이 값을 이어받는다(session.model). 세션 기본이면 표기 생략. */}
              {session.model && (
                <span className="text-text-muted" title="첫 실행에서 고른 모델 — 다음 단계·답변 개정도 이 모델로 이어갑니다" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{session.model}</span>
              )}
              {/* 실행 중 로딩 — 이사처 ②(본문 헤더). 개정(jobStep≤produced)과 생성은 문구를 가른다. */}
              {running && (
                <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: WARN }}>
                  <Spinner size={13} />
                  {jobStep !== null && jobStep <= session.producedStep
                    ? `${CIRCLED[jobStep - 1]} 재검토 중…`
                    : `${CIRCLED[Math.min(jobStep ?? session.producedStep + 1, 6) - 1]} 단계 생성 중…`}
                </span>
              )}
              {/* W4(C2): 닫기(선택 해제만)와 폐기(영구 tombstone) 분리. 습관적으로 클릭하는 우측
                  끝은 안전한 "닫기"가 갖고, 되돌릴 수 없는 "폐기"는 구분선으로 왼쪽에 떨어뜨린 뒤
                  확인 다이얼로그로 한 번 더 막는다(RTM_INTAKE_WORKSPACE_DESIGN.md §4 C2). */}
              <span className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => setConfirmDiscard(true)} disabled={running} className="text-text-muted hover:text-status-error disabled:opacity-40" style={{ fontSize: 10.5 }} title="세션 폐기 — 되돌릴 수 없습니다(닫기와 다름)">폐기</button>
                <span style={{ width: 1, height: 11, background: "var(--color-border-subtle)" }} />
                <button type="button" onClick={closeSession} disabled={running} className="text-text-muted hover:text-text-primary disabled:opacity-40" style={{ fontSize: 11 }} title="닫기 — 세션 원장 목록으로 돌아갑니다(세션은 유지됩니다)">닫기 ×</button>
              </span>
            </div>

            {/* 스테퍼 — 유일한 렌더 지점. 종전엔 RtmView 가 다른 탭 상단에도 같은 스트립을 걸었으나
                중복이라 걷었다(2026-07-16) — 단계 위치는 이 카드가 단독으로 말한다. */}
            <IntakeStepper />

            <StepArea />
          </div>
        )}
      </div>

      {confirmDiscard && session && (
        <DiscardConfirmDialog
          request={session.request}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); void discardSession(); }}
        />
      )}
    </div>
  );
}

/**
 * 카드 본문 — 산출물이 렌더 가능한 상태면 IntakeStepContent, 아니면 그 이유를 문구로.
 * 게이트는 종전 RtmView 의 `intakePanelOpen`(세션 있음 · 미폐기 · 미실행 · producedStep>=1)과 동일.
 */
function StepArea() {
  const { session, intakeStatus } = useRtm();
  if (!session) return null;
  const frontier = session.producedStep;
  const msg = (text: string) => (
    <div style={{ padding: "14px 20px" }}>
      <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{text}</p>
    </div>
  );
  if (session.discarded) return msg("폐기된 세션입니다 — 진행할 수 없습니다. 산출물은 세션 폴더(rtm-intake)에 남아 있습니다.");
  if (frontier < 1) return msg(intakeStatus === "running" ? "① 식별 진행 중…" : "아직 산출된 단계가 없습니다.");
  // 실행 중에도 산출물을 그대로 보여준다(2026-07-16: 진행 중 이전 단계 read-only 열람) —
  // 종전엔 다음 단계 생성 중이면 본문을 문구로 갈아치워 산출된 이전 단계를 볼 수 없었다.
  // read-only 는 두 겹으로 보장된다: 액션(편집·컨펌·진행)은 스테퍼가 실행 중 통째로 숨기고,
  // 자동 미리보기 로더는 안정된 단계(지금 도는 jobStep 보다 앞)만 읽는다(useIntake).
  // ①개정 중 ① 열람은 그 자체가 설계다(A5 · RTM_INTAKE_ANSWER_DESIGN.md §6) — 인터뷰의
  // optimistic "재검토 중"(버튼 문구·textarea disable)이 그 자리에 산다.
  return <IntakeStepContent />;
}
