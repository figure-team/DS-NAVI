import { describe, expect, it } from "vitest";
import {
  CLAUDE_JOB_TAIL_MAX,
  ClaudeJobTracker,
  buildHeadlessSpawnPlan,
  headlessCliFromEnv,
  headlessDirective,
  newJobId,
  runClaudeSkill,
} from "./claude-headless";

describe("headlessDirective", () => {
  // 공통화 이전 vite.config.ts 에 있던 리터럴과 바이트 동일해야 한다 — 디렉티브는
  // 튜닝된 프롬프트라 공백 하나도 의미 변화로 이어질 수 있다.
  it("impact 디렉티브 원문 보존", () => {
    expect(
      headlessDirective(
        "위 요청은 대시보드에서 자동 실행된 헤드리스 작업이다.",
        "(시드 선택 승인은 이미 부여됨), 자연어를 가장 적절한 변경 시드 파일로 직접 매핑·확정한 뒤 " +
          "멈추지 말고 analyze 단계까지 끝까지 실행하여 .understand-anything/impact-overlay.json 을 반드시 생성하라.",
      ),
    ).toBe(
      "\n\n위 요청은 대시보드에서 자동 실행된 헤드리스 작업이다. 사용자에게 확인을 묻지 말고" +
        "(시드 선택 승인은 이미 부여됨), 자연어를 가장 적절한 변경 시드 파일로 직접 매핑·확정한 뒤 " +
        "멈추지 말고 analyze 단계까지 끝까지 실행하여 .understand-anything/impact-overlay.json 을 반드시 생성하라.",
    );
  });

  it("rtm 단계 디렉티브 원문 보존", () => {
    const step = 3;
    expect(
      headlessDirective(
        `위 작업은 대시보드 추적표에서 자동 실행된 헤드리스 단계 ${step} 이다.`,
        ` SKILL.md §B 의 --step ${step} 지침만 끝까지 수행한 뒤 보고하고 멈춰라. 다음 단계는 사용자 컨펌 후 별도로 ` +
          `진행된다. 신규는 전부 [추정]이며 확정은 사람이 대시보드에서 한다.`,
      ),
    ).toBe(
      `\n\n위 작업은 대시보드 추적표에서 자동 실행된 헤드리스 단계 ${step} 이다. 사용자에게 확인을 묻지 말고 ` +
        `SKILL.md §B 의 --step ${step} 지침만 끝까지 수행한 뒤 보고하고 멈춰라. 다음 단계는 사용자 컨펌 후 별도로 ` +
        `진행된다. 신규는 전부 [추정]이며 확정은 사람이 대시보드에서 한다.`,
    );
  });

  it("rtm 변경관리 디렉티브 원문 보존", () => {
    const targetReq = "REQ-007";
    expect(
      headlessDirective(
        `위 작업은 대시보드 추적표에서 자동 실행된 변경관리(철회)다. 대상 요청은 ${targetReq} 이다.`,
        ` SKILL.md §C 절차를 끝까지 수행한 뒤 ` +
          `보고하고 멈춰라. **삭제 금지·이력 보존**(상태를 폐기로만), CR 문서(과업내용변경요청서·변경영향분석서)를 ` +
          `생성하고 추적표를 재생성한다. 확정·후속조치 수행은 사람이 한다.`,
      ),
    ).toBe(
      `\n\n위 작업은 대시보드 추적표에서 자동 실행된 변경관리(철회)다. ` +
        `대상 요청은 ${targetReq} 이다. 사용자에게 확인을 묻지 말고 SKILL.md §C 절차를 끝까지 수행한 뒤 ` +
        `보고하고 멈춰라. **삭제 금지·이력 보존**(상태를 폐기로만), CR 문서(과업내용변경요청서·변경영향분석서)를 ` +
        `생성하고 추적표를 재생성한다. 확정·후속조치 수행은 사람이 한다.`,
    );
  });
});

describe("headlessCliFromEnv", () => {
  it("UA_HEADLESS_CLI=opencode 만 opencode — 그 외(미설정·오타)는 claude", () => {
    expect(headlessCliFromEnv({})).toBe("claude");
    expect(headlessCliFromEnv({ UA_HEADLESS_CLI: "opencode" })).toBe("opencode");
    expect(headlessCliFromEnv({ UA_HEADLESS_CLI: "OpenCode" })).toBe("claude");
  });
});

describe("buildHeadlessSpawnPlan", () => {
  const PROMPT = "/understand-rtm --intake --session ab12 --step 1\n\n디렉티브";

  it("claude: 기존 args 와 바이트 동일(additive 보장) — 전 조합", () => {
    expect(buildHeadlessSpawnPlan({ cli: "claude", prompt: "P" })).toEqual({
      bin: "claude",
      args: ["-p", "P", "--permission-mode", "bypassPermissions"],
      notes: [],
    });
    expect(
      buildHeadlessSpawnPlan({ cli: "claude", prompt: "P", model: "sonnet", resume: "U1", sessionId: "U2" }).args,
    ).toEqual(["-p", "P", "--permission-mode", "bypassPermissions", "--model", "sonnet", "--resume", "U1"]);
    expect(buildHeadlessSpawnPlan({ cli: "claude", prompt: "P", sessionId: "U2" }).args).toEqual([
      "-p", "P", "--permission-mode", "bypassPermissions", "--session-id", "U2",
    ]);
  });

  it("opencode: /커맨드 분리 + --dangerously-skip-permissions + `--` 뒤 message(인자가 - 로 시작해도 안전)", () => {
    const plan = buildHeadlessSpawnPlan({ cli: "opencode", prompt: PROMPT, env: {} });
    expect(plan.bin).toBe("opencode");
    expect(plan.args).toEqual([
      "run", "--command", "understand-rtm", "--dangerously-skip-permissions",
      "--", "--intake --session ab12 --step 1\n\n디렉티브",
    ]);
    expect(plan.notes).toEqual([]);
  });

  it("opencode: 인자 없는 커맨드는 `--` 를 붙이지 않는다", () => {
    expect(buildHeadlessSpawnPlan({ cli: "opencode", prompt: "/understand-dashboard", env: {} }).args).toEqual([
      "run", "--command", "understand-dashboard", "--dangerously-skip-permissions",
    ]);
  });

  it("opencode: 모델 티어는 UA_OPENCODE_MODEL_<TIER> 매핑 — 미설정이면 플래그 생략 + note", () => {
    const mapped = buildHeadlessSpawnPlan({
      cli: "opencode", prompt: PROMPT, model: "sonnet",
      env: { UA_OPENCODE_MODEL_SONNET: "anthropic/claude-sonnet-4-5" },
    });
    expect(mapped.args).toContain("anthropic/claude-sonnet-4-5");
    expect(mapped.notes).toEqual([]);

    const unmapped = buildHeadlessSpawnPlan({ cli: "opencode", prompt: PROMPT, model: "opus", env: {} });
    expect(unmapped.args.join(" ")).not.toContain("--model");
    expect(unmapped.notes.join(" ")).toContain("UA_OPENCODE_MODEL_OPUS");
  });

  it("opencode: resume/sessionId 는 생략하고 note 만 남긴다(1차 방식 — 개정 디렉티브가 자기완결·§4.3)", () => {
    const plan = buildHeadlessSpawnPlan({ cli: "opencode", prompt: PROMPT, resume: "U1", sessionId: "U2", env: {} });
    const flat = plan.args.slice(0, 4).join(" "); // `--` 뒤 message 제외한 실제 플래그 영역
    expect(flat).not.toContain("U1");
    expect(flat).not.toContain("U2");
    expect(plan.notes.join(" ")).toContain("대화 연속성");
  });

  it("opencode: 슬래시 커맨드가 아니면 프롬프트 전체를 message 로 + note", () => {
    const plan = buildHeadlessSpawnPlan({ cli: "opencode", prompt: "그냥 텍스트", env: {} });
    expect(plan.args).toEqual(["run", "--dangerously-skip-permissions", "--", "그냥 텍스트"]);
    expect(plan.notes.length).toBe(1);
  });
});

describe("newJobId", () => {
  it("16자 소문자 hex — 스냅샷 경로 검증 정규식(/^[0-9a-f]{16}$/)과 호환", () => {
    expect(newJobId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("ClaudeJobTracker", () => {
  it("begin 은 idle 값 리셋 후 running 전이 + extra 반영", () => {
    const t = new ClaudeJobTracker<{ query: string | null }>({ query: null });
    expect(t.job.status).toBe("idle");
    const jobId = t.begin({ query: "로그인 변경" });
    expect(t.job).toMatchObject({ status: "running", jobId, query: "로그인 변경" });
    expect(t.job.startedAt).toBeTruthy();
    expect(t.running).toBe(true);

    // 두 번째 begin 은 이전 job 흔적(tail 등)을 리셋한다.
    t.appendTail("old output");
    const second = t.begin({ query: "다음" });
    expect(second).not.toBe(jobId);
    expect(t.job.tail).toBe("");
    expect(t.isCurrent(jobId)).toBe(false);
  });

  it("finish 는 exit code 0=done, 그 외 failed — 교체된 jobId 는 무시", () => {
    const t = new ClaudeJobTracker<{ query: string | null }>({ query: null });
    const j1 = t.begin({ query: "a" });
    expect(t.finish(j1, 0)).toBe(true);
    expect(t.job).toMatchObject({ status: "done", exitCode: 0 });

    const j2 = t.begin({ query: "b" });
    expect(t.finish(j1, 1)).toBe(false); // 낡은 jobId — 상태 불변
    expect(t.job.status).toBe("running");
    expect(t.finish(j2, 2)).toBe(true);
    expect(t.job).toMatchObject({ status: "failed", exitCode: 2 });
  });

  it("fail 은 [spawn error] 꼬리표를 tail 에 남긴다", () => {
    const t = new ClaudeJobTracker<{ query: string | null }>({ query: null });
    const j = t.begin({ query: "a" });
    expect(t.fail(j, "ENOENT")).toBe(true);
    expect(t.job.status).toBe("failed");
    expect(t.job.tail).toContain("[spawn error] ENOENT");
  });

  it("tail 은 16KB 상한으로 뒤쪽만 보관", () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    t.begin({});
    t.appendTail("x".repeat(CLAUDE_JOB_TAIL_MAX));
    t.appendTail("END");
    expect(t.job.tail.length).toBe(CLAUDE_JOB_TAIL_MAX);
    expect(t.job.tail.endsWith("END")).toBe(true);
  });
});

describe("runClaudeSkill", () => {
  const until = async (cond: () => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!cond()) {
      if (Date.now() > deadline) throw new Error("timeout waiting for job settle");
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it("exit 0 → done + onCloseSettled", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    let settled = false;
    expect(
      runClaudeSkill({
        prompt: "ignored",
        cwd: process.cwd(),
        jobId,
        tracker: t,
        command: "true",
        onCloseSettled: () => {
          settled = true;
        },
      }),
    ).toBe(true);
    await until(() => t.job.status !== "running");
    expect(t.job).toMatchObject({ status: "done", exitCode: 0 });
    expect(settled).toBe(true);
  });

  it("model 지정 시 spawn args 에 --model 을 덧붙인다(echo 셔임 tail 검증)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({
      prompt: "P",
      cwd: process.cwd(),
      jobId,
      tracker: t,
      command: "echo",
      model: "sonnet",
    });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).toContain("--model sonnet");
    expect(t.job.tail).toContain("--permission-mode bypassPermissions");
  });

  it("model 미지정(기본) 이면 --model 을 붙이지 않는다 — 세션 모델 사용", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({ prompt: "P", cwd: process.cwd(), jobId, tracker: t, command: "echo" });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).not.toContain("--model");
  });

  // ── A3: 대화 연속성 args(D1 하이브리드 · RTM_INTAKE_ANSWER_DESIGN.md §4.2·§4.3) ──
  const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

  it("sessionId 지정 시 --session-id 를 덧붙인다(① 첫 spawn — 나중에 resume 하려면 id 를 미리 정해야)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({ prompt: "P", cwd: process.cwd(), jobId, tracker: t, command: "echo", sessionId: UUID });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).toContain(`--session-id ${UUID}`);
    expect(t.job.tail).not.toContain("--resume");
  });

  it("resume 지정 시 --resume 을 덧붙인다(답변 개정 — 대화창 없이 이어간다)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({ prompt: "P", cwd: process.cwd(), jobId, tracker: t, command: "echo", resume: UUID });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).toContain(`--resume ${UUID}`);
    expect(t.job.tail).not.toContain("--session-id");
  });

  it("★ 둘 다 오면 resume 이 이긴다 — 새 대화를 열면 이어가려던 맥락이 조용히 사라진다", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({
      prompt: "P", cwd: process.cwd(), jobId, tracker: t, command: "echo",
      sessionId: "11111111-1111-1111-1111-111111111111", resume: UUID,
    });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).toContain(`--resume ${UUID}`);
    expect(t.job.tail).not.toContain("--session-id");
  });

  it("★ 둘 다 미지정(기본) 이면 args 가 기존과 바이트 동일하다(additive 보장)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({ prompt: "P", cwd: process.cwd(), jobId, tracker: t, command: "echo" });
    await until(() => t.job.status !== "running");
    expect(t.job.tail.trim()).toBe("-p P --permission-mode bypassPermissions");
  });

  it("cli:opencode — run/--command 조립 + resume 생략 note 가 tail 에 남는다(echo 셔임)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({
      prompt: "/understand-rtm --intake --session ab12 --step 1 --revise",
      cwd: process.cwd(),
      jobId,
      tracker: t,
      cli: "opencode",
      command: "echo",
      resume: UUID,
    });
    await until(() => t.job.status !== "running");
    expect(t.job.tail).toContain("[headless-cli] 대화 연속성");
    expect(t.job.tail).toContain("run --command understand-rtm --dangerously-skip-permissions");
    expect(t.job.tail).toContain("-- --intake --session ab12 --step 1 --revise");
    expect(t.job.tail).not.toContain(UUID);
  });

  it("비 0 exit → failed", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    runClaudeSkill({ prompt: "ignored", cwd: process.cwd(), jobId, tracker: t, command: "false" });
    await until(() => t.job.status !== "running");
    expect(t.job).toMatchObject({ status: "failed", exitCode: 1 });
  });

  it("실행 파일 부재('error' 이벤트) → failed + onErrorSettled", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    let settled = false;
    runClaudeSkill({
      prompt: "ignored",
      cwd: process.cwd(),
      jobId,
      tracker: t,
      command: "definitely-not-a-real-command-xyz",
      onErrorSettled: () => {
        settled = true;
      },
    });
    await until(() => t.job.status !== "running");
    expect(t.job.status).toBe("failed");
    expect(t.job.tail).toContain("[spawn error]");
    expect(settled).toBe(true);
  });

  it("onClose 지정 시 기본 finish 를 대체한다(단계 체인용)", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const jobId = t.begin({});
    let closedWith: number | null | undefined;
    runClaudeSkill({
      prompt: "ignored",
      cwd: process.cwd(),
      jobId,
      tracker: t,
      command: "true",
      onClose: (code) => {
        closedWith = code;
      },
    });
    await until(() => closedWith !== undefined);
    expect(closedWith).toBe(0);
    expect(t.job.status).toBe("running"); // 기본 finish 미적용 — 체인이 상태를 소유
  });

  it("jobId 교체 후 도착한 close 는 상태를 건드리지 않는다", async () => {
    const t = new ClaudeJobTracker<Record<string, never>>({});
    const j1 = t.begin({});
    let closed = false;
    runClaudeSkill({
      prompt: "ignored",
      cwd: process.cwd(),
      jobId: j1,
      tracker: t,
      command: "sleep",
      onCloseSettled: () => {
        closed = true;
      },
    });
    const j2 = t.begin({}); // j1 이 끝나기 전 교체
    await new Promise((r) => setTimeout(r, 300));
    expect(closed).toBe(false); // j1 의 close 는 무시됨(onCloseSettled 미호출)
    expect(t.isCurrent(j2)).toBe(true);
    expect(t.job.status).toBe("running");
  });
});
