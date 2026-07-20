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

// ── 헤드리스 CLI 어댑터(opencode 포팅) ──────────────────────────────────────
// 스폰 플래그 조립을 순수 함수로 분리한다 — claude 경로는 기존과 **바이트 동일**해야 하고
// (아래 테스트가 단언), opencode 경로는 설치본 1.17.11 실측 규약을 따른다:
//   - 커맨드 실행: `opencode run --command <name> -- "<args>"` — 슬래시 문법 불가(#5073),
//     인자가 `-` 로 시작하므로 `--` 구분자가 **필수**(없으면 yargs 가 usage 만 찍고 요청 미도달, 실측).
//   - 권한 우회: `--dangerously-skip-permissions`(문서의 --auto 는 이 버전에 없음, --help 실측).
//     ★ 별도로 스폰 대상 프로젝트 opencode.json 에 `permission.question:"deny"` 를 깔아야
//     헤드리스 question-툴 무한 행(upstream #11899)을 막는다 — 여기서는 강제할 수 없다.
//   - 대화 연속성: `--session-id` 등가물 없음 → resume/sessionId 는 **생략**한다. 인테이크 개정
//     디렉티브가 자기완결형(§4.3 — 답·산출·번들을 디스크에서 재독)이라 결과가 같다(토큰만 더 씀).
//   - 모델: `-m provider/model` 형식이라 claude 티어명(opus/sonnet/haiku)을 그대로 못 쓴다 —
//     `UA_OPENCODE_MODEL_<TIER>` env 로 매핑하고, 미설정이면 플래그 생략(=opencode 기본 모델).

export type HeadlessCli = "claude" | "opencode";

/** 헤드리스 스폰 CLI 선택 — 대시보드 dev 서버 기동 시 `UA_HEADLESS_CLI=opencode` 로 전환. */
export function headlessCliFromEnv(env: NodeJS.ProcessEnv = process.env): HeadlessCli {
  return env.UA_HEADLESS_CLI === "opencode" ? "opencode" : "claude";
}

export interface HeadlessSpawnPlan {
  bin: string;
  args: string[];
  /** 요청과 다르게 조립된 지점의 관측 기록 — 호출측이 tail 에 남긴다(디버깅용). */
  notes: string[];
}

export function buildHeadlessSpawnPlan(opts: {
  cli: HeadlessCli;
  prompt: string;
  model?: string;
  resume?: string;
  sessionId?: string;
  env?: NodeJS.ProcessEnv;
}): HeadlessSpawnPlan {
  if (opts.cli !== "opencode") {
    const args = ["-p", opts.prompt, "--permission-mode", "bypassPermissions"];
    if (opts.model) args.push("--model", opts.model);
    if (opts.resume) args.push("--resume", opts.resume);
    else if (opts.sessionId) args.push("--session-id", opts.sessionId);
    return { bin: "claude", args, notes: [] };
  }

  const env = opts.env ?? process.env;
  const notes: string[] = [];
  const args = ["run"];
  // 프롬프트는 전 호출부가 `/understand-* <인자·디렉티브>` 꼴 — 커맨드명과 나머지를 분리한다.
  const m = opts.prompt.match(/^\/([A-Za-z0-9][\w-]*)[ \t]*([\s\S]*)$/);
  const message = m ? m[2] : opts.prompt;
  if (m) args.push("--command", m[1]);
  else notes.push(`슬래시 커맨드 아님 — 프롬프트 전체를 message 로 전달`);
  args.push("--dangerously-skip-permissions");
  if (opts.model) {
    const mapped = env[`UA_OPENCODE_MODEL_${opts.model.toUpperCase()}`];
    if (mapped) args.push("--model", mapped);
    else
      notes.push(
        `모델 '${opts.model}' 매핑 없음(UA_OPENCODE_MODEL_${opts.model.toUpperCase()} 미설정) — opencode 기본 모델 사용`,
      );
  }
  if (opts.resume || opts.sessionId)
    notes.push(`대화 연속성(resume/session-id) 미지원 — 생략(개정 디렉티브가 디스크 재독으로 자기완결)`);
  if (message) args.push("--", message);
  return { bin: "opencode", args, notes };
}

export interface RunClaudeSkillOptions<Extra extends Record<string, unknown>> {
  prompt: string;
  cwd: string;
  /** begin() 이 발급한 jobId — 모든 핸들러가 이 값으로 현재성(現在性)을 판정한다. */
  jobId: string;
  tracker: ClaudeJobTracker<Extra>;
  /** 헤드리스 CLI 종류(기본 = UA_HEADLESS_CLI env). 플래그 조립 규약이 통째로 갈린다. */
  cli?: HeadlessCli;
  /** 테스트/포팅용 CLI 실행 파일 오버라이드(기본 = cli 에 따라 "claude"/"opencode"). */
  command?: string;
  /**
   * 세션 기본 대신 사용할 모델(whitelist: opus/sonnet/haiku). 값이 있으면 spawn args 에
   * `--model <model>` 을 덧붙이고, 없으면(기본) 플래그를 생략해 세션 모델을 그대로 쓴다.
   */
  model?: string;
  /**
   * 새 claude 대화를 **이 UUID 로 연다**(`--session-id`). 나중에 `resume` 으로 그 대화를 이어가려면
   * 우리가 id 를 미리 정해야 한다 — 헤드리스 spawn 은 자기가 만든 session id 를 돌려주지 않는다.
   * `resume` 과 배타(둘 다 오면 resume 이 이긴다 — 이어가기가 새로 열기보다 구체적인 의도다).
   * A2/A3 · RTM_INTAKE_ANSWER_DESIGN.md §3.3·§4.2(D1 하이브리드).
   */
  sessionId?: string;
  /**
   * 기존 claude 대화를 **이어간다**(`--resume <uuid>`). 이전 턴의 맥락(예: ①이 근거 번들을 읽은
   * 대화)을 재주입 없이 그대로 쓴다. 대화창을 띄우지 않는다 — 여전히 `-p` 헤드리스 1회 spawn 이다.
   */
  resume?: string;
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
  // 플래그 조립은 순수 함수로 위임 — claude 경로는 기존과 바이트 동일(테스트 단언), opencode 는
  // 실측 규약(--command/--dangerously-skip-permissions/`--` 구분자) 적용. 모델 미전달(기본)이면
  // 플래그 없이 세션(claude)/기본(opencode) 모델을 쓴다 — 프로젝트 공통 규약. 대화 연속성(D1)은
  // claude 만: resume 이 sessionId 를 이긴다("이어라"가 "새로 열어라"보다 구체적 의도 — 둘 다는
  // 호출자 실수인데 그때 새 대화를 열면 이어가려던 맥락이 조용히 사라진다).
  const cli = opts.cli ?? headlessCliFromEnv();
  const plan = buildHeadlessSpawnPlan({
    cli,
    prompt,
    model: opts.model,
    resume: opts.resume,
    sessionId: opts.sessionId,
  });
  for (const note of plan.notes) tracker.appendTail(`[headless-cli] ${note}\n`);
  try {
    // ★ opencode 헤드리스 spawn 함정 2개(둘 다 1.17.11 실측, claude 경로는 기존값 유지):
    //   1) stdin 을 "ignore" 로 닫아야 한다 — non-TTY 의 **열린** stdin 파이프를 주면 EOF 를
    //      기다리며 LLM 스트림 시작 전에 무한 행(`tail -f /dev/null |` 재현, `</dev/null` 정상).
    //   2) env.PWD 를 cwd 로 덮어써야 한다 — spawn 의 cwd 옵션은 PWD env 를 갱신하지 않아
    //      부모(dev 서버, packages/dashboard) 디렉터리가 새어 들어가고, opencode 가 프로젝트
    //      해석에 PWD 를 우선하므로 커맨드 미발견(UnknownError) 이 된다(env PWD=<딴 곳> 재현).
    child = spawn(opts.command ?? plan.bin, plan.args, {
      cwd,
      env: cli === "opencode" ? { ...process.env, PWD: cwd } : process.env,
      stdio: [cli === "opencode" ? "ignore" : "pipe", "pipe", "pipe"],
    });
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
