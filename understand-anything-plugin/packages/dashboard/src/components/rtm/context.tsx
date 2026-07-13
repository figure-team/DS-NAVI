import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  CellKey, Coverage, CustomField, Diagnostic, FnOverride, FunctionRow, ReqOverride,
  Requirement, RtmModel, RtmSession, RtmTab, SessionDoc, Signoff, TestRef, TestResult, TestScenario,
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
  sessionDocs: SessionDoc[];
  stepBusy: boolean;
  viewStep: number | null;
  setViewStep: (v: number | null) => void;
  advance: (toStep: number) => Promise<void>;
  confirmStep: (step: number) => Promise<void>;
  saveDoc: () => Promise<void>;
  discardSession: () => Promise<void>;
  previewName: string | null;
  previewMd: string;
  loadPreview: (name: string) => Promise<void>;
  identified: { requirements?: { id: string; category: string; name: string; priority?: string; derivedFrom?: string | null }[]; questions?: string[]; request?: { id: string; name: string } } | null;
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
