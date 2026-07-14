import { describe, expect, it } from "vitest";
import {
  CLAUDE_JOB_TAIL_MAX,
  ClaudeJobTracker,
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
