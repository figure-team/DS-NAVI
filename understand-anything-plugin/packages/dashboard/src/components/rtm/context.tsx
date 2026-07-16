import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  CellKey, Coverage, CustomField, Diagnostic, FnOverride, FunctionRow, Identified, ImpactRun,
  ImpactSnapshot, QaHistory, ReqOverride, Requirement, RtmModel, RtmSession, RtmTab, SessionDoc,
  SessionRow, Signoff, TestRef, TestResult, TestScenario,
} from "./types";
import type { ModelChoice } from "../ModelSelect";

/**
 * RTM 화면 공유 컨텍스트 — 상태·콜백·병합 helper 전부 RtmView(셸)가 소유하고,
 * 뷰/드로어/인테이크는 모듈 레벨 컴포넌트로 이 컨텍스트만 소비한다.
 * (본문 내부 함수 정의였을 때 부모 리렌더마다 컴포넌트 타입이 바뀌어 unmount/remount →
 * 편집 input 포커스 유실 — 감사 gap4/8 해소의 핵심.)
 */
export interface RtmCtx {
  // 데이터·모드
  model: RtmModel | null;
  cov: Coverage | undefined;
  diags: Diagnostic[];
  errCount: number;
  canWrite: boolean;
  fnOv: Record<string, FnOverride>;
  reqOv: Record<string, ReqOverride>;
  scOv: Record<string, FnOverride>;

  // 선택·탭 상태(URL 미러는 셸이 관리)
  view: RtmTab;
  setView: (v: RtmTab) => void;
  selFn: string | null;
  setSelFn: (v: string | null) => void;
  selReq: string | null;
  setSelReq: (v: string | null) => void;
  selTs: string | null;
  setSelTs: (v: string | null) => void;
  selectedFn: FunctionRow | null;
  selectedReq: Requirement | null;
  selectedTs: TestScenario | null;
  expandedReqs: Set<string>;
  setExpandedReqs: Dispatch<SetStateAction<Set<string>>>;
  expandedRequests: Set<string>;
  setExpandedRequests: Dispatch<SetStateAction<Set<string>>>;
  openFunction: (id: string) => void;

  // 기능 편집·확정
  editing: boolean;
  setEditing: (v: boolean) => void;
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  saveError: string | null;
  beginEdit: () => void;
  onConfirm: (fromEdit: boolean) => Promise<void>;

  // 시나리오 편집·확정
  tsEditing: boolean;
  setTsEditing: (v: boolean) => void;
  tsDraft: Record<string, string>;
  setTsDraft: Dispatch<SetStateAction<Record<string, string>>>;
  tsSaving: boolean;
  tsSaveError: string | null;
  setTsSaveError: (v: string | null) => void;
  confirmScenario: (fromEdit: boolean) => Promise<void>;

  // 요구 검증 입력·필드 정의·확정자
  postReq: (reqId: string, payload: { lifecycle?: string; signoff?: Signoff | null; tests?: Record<string, { result: TestResult; defectId: string | null }> }) => Promise<void>;
  postField: (op: "add" | "remove", id: string, label?: string) => Promise<void>;
  addField: (label: string) => void;
  resolveApprover: () => Promise<string | null>;

  // 병합 helpers
  effCell: (f: FunctionRow, key: CellKey | "name") => string;
  isEdited: (f: FunctionRow, key: string) => boolean;
  isConfirmed: (f: FunctionRow) => boolean;
  effLifecycle: (r: Requirement) => string;
  effSignoff: (r: Requirement) => Signoff | null;
  effTest: (r: Requirement, acId: string, t: TestRef) => TestResult;
  fnById: (id: string) => FunctionRow | undefined;
  reqById: (id: string) => Requirement | undefined;
  scenarios: TestScenario[];
  effTs: (s: TestScenario, key: "title" | "given" | "when" | "then") => string;
  tsConfirmed: (s: TestScenario) => boolean;
  tsConfirmedCount: number;
  effFields: CustomField[];
  effCustom: (f: FunctionRow, fieldId: string) => string;

  // 변경관리(P6)
  changeReqId: string | null;
  changeRunning: boolean;
  startChange: (reqId: string) => Promise<void>;
  changeModel: ModelChoice;
  setChangeModel: (v: ModelChoice) => void;

  // 인테이크(P4)
  intakeOpen: boolean;
  setIntakeOpen: (v: boolean) => void;
  /** 새 요청 모달 열기(에러 리셋 + 목표 ⑥) — 버튼은 요청 세션 탭 좌측 원장 위에 산다(2026-07-16). */
  openIntake: () => void;
  intakeQuery: string;
  setIntakeQuery: (v: string) => void;
  targetStep: number;
  setTargetStep: (v: number) => void;
  intakeModel: ModelChoice;
  setIntakeModel: (v: ModelChoice) => void;
  intakeStatus: "idle" | "running" | "done" | "failed";
  intakeError: string | null;
  startIntake: () => Promise<void>;
  session: RtmSession | null;
  /** 현재 세션의 sid = `?sid=` 라우팅 키(W2/N2). 원장 선택 강조의 기준. */
  sid: string | null;
  /** W2: 세션 원장(GET /rtm-intake-sessions) — createdAt 내림차순, 폐기 포함. */
  sessions: SessionRow[];
  sessionsError: string | null;
  /** 원장에서 세션 열기 — `?sid=` 를 push 해 뒤로가기로 되돌아올 수 있게 한다(N2). */
  openSession: (sid: string) => void;
  /** W4: 닫기 — 선택 해제만(서버 호출 없음). `?sid=` 를 push 로 제거 — openSession 과 대칭. */
  closeSession: () => void;
  sessionDocs: SessionDoc[];
  stepBusy: boolean;
  viewStep: number | null;
  setViewStep: (v: number | null) => void;
  /** 단계 진행. rerunFrom 지정 시 그 단계부터 되감아 재생성(낡은 단계 재생성, 2026-07-17). */
  advance: (toStep: number, rerunFrom?: number) => Promise<void>;
  confirmStep: (step: number) => Promise<void>;
  saveDoc: () => Promise<void>;
  discardSession: () => Promise<void>;
  previewName: string | null;
  previewMd: string;
  loadPreview: (name: string) => Promise<void>;
  identified: Identified | null;
  /**
   * W5: ①의 코드영향 검증(§2.3) — 세션 포인터 + 그 포인터가 가리키는 원장 스냅샷.
   * `impactLoaded` 는 조회 완료 여부다: false 면 화면은 아직 "미실행"을 단언할 수 없다.
   * `impactRun=null && impactLoaded` 일 때만 부재이고, 그 원인은 `impactAbsenceOf` 가 가른다.
   */
  impactRun: ImpactRun | null;
  impactData: ImpactSnapshot | null;
  impactLoaded: boolean;
  /**
   * A5: ① 답변 원장(§3.2) — **제출됐지만 아직 개정에 반영 안 된 답**의 출처.
   * `identified.questions[].answer` 는 개정이 성공해야 채워지므로 둘을 겹쳐 봐야 화면이 정직하다.
   */
  qaHistory: QaHistory | null;
  /**
   * 지금 도는 job 의 단계(서버 `rtmTracker.job.step`). null=실행 중 아님/모름.
   * `jobStep <= producedStep` = **최전선 재실행**(①개정) · `> producedStep` = 다음 단계 생성.
   * 이 구별이 없으면 개정 중에 "② 다음 단계 생성 중"이라 말해 단계 경계를 거짓으로 알린다.
   */
  jobStep: number | null;
  /** A5: ① `[확인필요]` 답변 일괄 제출 → 개정 재실행(§4.2). 성공 시 running 으로 전환된다. */
  answerQuestions: (answers: { qid: string; question: string; answer: string }[]) => Promise<void>;
  editingDoc: boolean;
  setEditingDoc: (v: boolean) => void;
  draftDoc: string;
  setDraftDoc: (v: string) => void;

  setToast: (t: { kind: "done" | "failed"; msg: string } | null) => void;
}

export const RtmContext = createContext<RtmCtx | null>(null);

export function useRtm(): RtmCtx {
  const ctx = useContext(RtmContext);
  if (!ctx) throw new Error("useRtm must be used within RtmContext.Provider");
  return ctx;
}
