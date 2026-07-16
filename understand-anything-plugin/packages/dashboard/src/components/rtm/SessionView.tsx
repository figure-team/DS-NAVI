import { useRtm } from "./context";
import { IntakeStepContent, IntakeStepper } from "./IntakePanel";
import {
  CIRCLED, SESSION_STATE, STEP_DEFS, fmtSessionTime, sessionStateOf,
} from "./types";
import { Badge } from "../proto/Proto";

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
  const { sessions, sessionsError, sid, session, openSession, canWrite } = useRtm();

  const ledger = (
    <div className={`${CARD} proto-tree`}>
      <div className="fold">세션 원장 ({sessions.length})</div>
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
          아직 세션 없음 — 우상단 <b className="text-text-secondary">＋ 새 요청</b>으로 시작하면 여기 쌓입니다.
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
                <StepBadge n={s.producedStep} />
                <Badge tone={st.tone} title={st.title} style={{ marginLeft: 6 }}>{st.label}</Badge>
              </span>
            </button>
          );
        })
      )}
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
      {ledger}

      <div style={{ minWidth: 0 }}>
        {!session ? (
          <div className={CARD} style={{ padding: 28, textAlign: "center" }}>
            <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {sessions.length > 0
                ? "좌측 원장에서 세션을 선택하면 단계 진행이 여기 표시됩니다"
                : "진행 중인 요청 세션 없음 — 우상단 ＋ 새 요청으로 시작하면 여기 나타납니다"}
            </p>
          </div>
        ) : (
          <div className={CARD} style={{ overflow: "hidden" }}>
            {/* 헤더 — 제목 = 요청문(사람 언어). 변경·영향 헤더 카드가 질의문을 쓰는 것과 같은 축. */}
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
            </div>

            {/* 스테퍼 — 페이지 상단 스트립과 같은 컴포넌트다(RtmView 가 이 탭에선 상단 렌더를 건다). */}
            <IntakeStepper />

            <StepArea />
          </div>
        )}
      </div>
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
  // 실행 중엔 산출물을 걸지 않는다 — 폴링이 producedStep 을 올리는 순간 최전선으로 바뀐다.
  // 인덱스는 "다음 단계"(frontier+1 의 0-based = frontier)이고 마지막 단계에서 넘치지 않게 자른다.
  if (intakeStatus === "running") return msg(`${CIRCLED[Math.min(frontier, STEP_DEFS.length - 1)]} 다음 단계 생성 중… — 완료되면 산출물이 여기 표시됩니다.`);
  return <IntakeStepContent />;
}
