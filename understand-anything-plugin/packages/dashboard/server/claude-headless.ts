// ── 대시보드 dev server 공통: claude 헤드리스 잡 실행기 ─────────────────────────
// impact-analyze / rtm-intake / rtm-change 세 경로가 공유하는 규약을 한 곳에 모은다:
//   - spawn("claude", ["-p", prompt, "--permission-mode", "bypassPermissions"])
//     args 배열 전달(셸 미경유)로 인젝션 차단, 헤드리스 자율 실행.
//   - 모듈 스코프 단일 job 추적(서버 수명 동안), 동시 실행은 호출측이 409로 차단.
//   - jobId = randomBytes(8).hex(16자 소문자) — 경로 조작 차단을 겸한다(스냅샷 디렉터리명 등).
//   - stdout/stderr tail 16KB 보관(디버깅용), close/error 핸들러는 jobId 교체 시 무시.
import { spawn } from "child_process";
import crypto from "crypto";

/** stdout/stderr tail 보관 상한(디버깅용). */
export const CLAUDE_JOB_TAIL_MAX = 16 * 1024;

export type ClaudeJobStatus = "idle" | "running" | "done" | "failed";

export interface ClaudeJobBase {
  status: ClaudeJobStatus;
  jobId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  tail: string;
}

export function newJobId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function idleBase(): ClaudeJobBase {
  return {
    status: "idle",
    jobId: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    tail: "",
  };
}

/**
 * 헤드리스 자율 실행 디렉티브 조립 — 각 SKILL.md 는 사람 확인 게이트를 요구하므로,
 * 대시보드 자동 실행 경로에서만 이 디렉티브로 승인을 사전 부여로 간주시킨다.
 * (사용자가 직접 스킬을 실행하는 경로에는 절대 붙이지 않는다.)
 * 결과: "\n\n<context> 사용자에게 확인을 묻지 말고<rest>" — rest 의 선행 공백/괄호까지
 * 호출측이 제어해 기존 프롬프트와 바이트 동일하게 유지한다.
 */
export function headlessDirective(context: string, rest: string): string {
  return `\n\n${context} 사용자에게 확인을 묻지 말고${rest}`;
}

/**
 * 모듈 스코프 단일 job 추적기. `job` 은 의도적으로 가변 공개(진행 step 갱신 등),
 * 상태 전이는 begin/fail/finish 로만 — fail/finish 는 jobId 가 현재일 때만 적용된다.
 */
export class ClaudeJobTracker<Extra extends Record<string, unknown>> {
  job: ClaudeJobBase & Extra;
  private readonly idleExtra: Extra;

  constructor(idleExtra: Extra) {
    this.idleExtra = idleExtra;
    this.job = { ...idleBase(), ...idleExtra };
  }

  get running(): boolean {
    return this.job.status === "running";
  }

  snapshot(): ClaudeJobBase & Extra {
    return { ...this.job };
  }

  isCurrent(jobId: string): boolean {
    return this.job.jobId === jobId;
  }

  /** 새 job 시작 — 이전 job 필드를 idle 값으로 리셋한 뒤 extra 를 덮어쓴다. */
  begin(extra: Partial<Extra>): string {
    const jobId = newJobId();
    this.job = {
      ...idleBase(),
      ...this.idleExtra,
      ...extra,
      status: "running",
      jobId,
      startedAt: new Date().toISOString(),
    };
    return jobId;
  }

  appendTail(chunk: string): void {
    this.job.tail = (this.job.tail + chunk).slice(-CLAUDE_JOB_TAIL_MAX);
  }

  /** 실패 전이(현재 job 일 때만). message 는 "[spawn error]" 꼬리표로 tail 에 남긴다. */
  fail(jobId: string, message?: string): boolean {
    if (!this.isCurrent(jobId)) return false;
    this.job.status = "failed";
    this.job.finishedAt = new Date().toISOString();
    if (message) this.appendTail(`\n[spawn error] ${message}\n`);
    return true;
  }

  /** 종료 전이(현재 job 일 때만) — exit code 0 이면 done, 아니면 failed. */
  finish(jobId: string, code: number | null): boolean {
    if (!this.isCurrent(jobId)) return false;
    this.job.status = code === 0 ? "done" : "failed";
    this.job.exitCode = code;
    this.job.finishedAt = new Date().toISOString();
    return true;
  }
}

export interface RunClaudeSkillOptions<Extra extends Record<string, unknown>> {
  prompt: string;
  cwd: string;
  /** begin() 이 발급한 jobId — 모든 핸들러가 이 값으로 현재성(現在性)을 판정한다. */
  jobId: string;
  tracker: ClaudeJobTracker<Extra>;
  /** 테스트/포팅용 CLI 이름 오버라이드(기본 "claude"). */
  command?: string;
  /**
   * 세션 기본 대신 사용할 모델(whitelist: opus/sonnet/haiku). 값이 있으면 spawn args 에
   * `--model <model>` 을 덧붙이고, 없으면(기본) 플래그를 생략해 세션 모델을 그대로 쓴다.
   */
  model?: string;
  /** spawn 동기 실패로 failed 처리된 직후(현재 job 일 때만) 추가 후처리 — 예: 500 응답. */
  onSpawnError?: () => void;
  /** child 'error' 이벤트로 failed 처리된 직후 추가 후처리 — 예: 이력 기록. */
  onErrorSettled?: () => void;
  /** 종료 시 기본 finish(done/failed) 를 통째로 대체하는 커스텀 처리(단계 체인 등). */
  onClose?: (code: number | null) => void;
  /** 기본 finish 적용 직후 추가 후처리(onClose 미지정 시에만) — 예: 이력 기록. */
  onCloseSettled?: () => void;
}

/**
 * claude 를 헤드리스로 1회 spawn 하고 tracker 에 수명주기를 기록한다.
 * spawn 자체가 동기 실패하면 false (호출측은 응답만 처리하면 된다).
 * tail 은 현재 job 에 기록된다 — jobId 가 교체된 뒤 도착한 출력도 새 job 의 tail 에
 * 섞이는 기존 규약을 유지한다(상태 전이만 jobId 로 가드).
 */
export function runClaudeSkill<Extra extends Record<string, unknown>>(
  opts: RunClaudeSkillOptions<Extra>,
): boolean {
  const { prompt, cwd, jobId, tracker } = opts;
  let child: ReturnType<typeof spawn>;
  const args = ["-p", prompt, "--permission-mode", "bypassPermissions"];
  // 모델 미전달(기본) 이면 플래그 없이 세션 모델을 쓴다 — 프로젝트 공통 규약.
  if (opts.model) args.push("--model", opts.model);
  try {
    child = spawn(opts.command ?? "claude", args, { cwd, env: process.env });
  } catch (err) {
    if (tracker.fail(jobId, err instanceof Error ? err.message : String(err))) {
      opts.onSpawnError?.();
    }
    return false;
  }
  child.stdout?.on("data", (c: Buffer) => tracker.appendTail(c.toString("utf8")));
  child.stderr?.on("data", (c: Buffer) => tracker.appendTail(c.toString("utf8")));
  child.on("error", (err) => {
    if (tracker.fail(jobId, err.message)) opts.onErrorSettled?.();
  });
  child.on("close", (code) => {
    if (!tracker.isCurrent(jobId)) return;
    if (opts.onClose) {
      opts.onClose(code);
      return;
    }
    if (tracker.finish(jobId, code)) opts.onCloseSettled?.();
  });
  return true;
}
