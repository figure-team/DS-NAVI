import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useDashboardStore } from "./store";

/**
 * 코드뷰어 두 모드(노드 / 인용 직접 file:line)는 배타적이어야 한다.
 * 인용 칩(근거) 점프가 openCodeViewerAt 으로 임의 파일·라인을 연다.
 */
describe("store — codeViewer 노드/인용-직접 모드", () => {
  beforeEach(() => {
    useDashboardStore.getState().closeCodeViewer();
  });

  it("openCodeViewerAt: 임의 file:line 으로 열고 nodeId 는 비운다", () => {
    useDashboardStore.getState().openCodeViewerAt("src/main/java/Cart.java", 32);
    const s = useDashboardStore.getState();
    expect(s.codeViewerOpen).toBe(true);
    expect(s.codeViewerFilePath).toBe("src/main/java/Cart.java");
    expect(s.codeViewerLine).toBe(32);
    expect(s.codeViewerNodeId).toBeNull();
  });

  it("openCodeViewer: 노드 모드로 열고 직접 file:line 은 비운다(배타)", () => {
    useDashboardStore.getState().openCodeViewerAt("Cart.java", 32);
    useDashboardStore.getState().openCodeViewer("domain:cart");
    const s = useDashboardStore.getState();
    expect(s.codeViewerNodeId).toBe("domain:cart");
    expect(s.codeViewerFilePath).toBeNull();
    expect(s.codeViewerLine).toBeNull();
  });

  it("closeCodeViewer: 모든 코드뷰어 상태를 비운다", () => {
    useDashboardStore.getState().openCodeViewerAt("Cart.java", 32);
    useDashboardStore.getState().closeCodeViewer();
    const s = useDashboardStore.getState();
    expect(s.codeViewerOpen).toBe(false);
    expect(s.codeViewerFilePath).toBeNull();
    expect(s.codeViewerLine).toBeNull();
    expect(s.codeViewerNodeId).toBeNull();
  });
});

/** P3: 노드 오버레이 저장(POST /node-overrides) — 토큰 게이트 + 즉시 확정 반영. */
describe("store — saveNodeOverride", () => {
  beforeEach(() => {
    useDashboardStore.getState().setNodeOverrides({});
    useDashboardStore.getState().setAccessToken(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("토큰 없으면 저장하지 않고 {ok:false} (조용한 실패 금지)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await useDashboardStore
      .getState()
      .saveNodeOverride("step:x", { summary: "edited" }, "alice");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("no-write-server");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("성공 시 응답 레코드를 nodeOverrides 에 반영(즉시 확정)", async () => {
    useDashboardStore.getState().setAccessToken("tok");
    const record = {
      editedClaims: { summary: "edited" },
      approver: "alice",
      at: "2026-06-20T00:00:00.000Z",
      audit: [{ event: "CONFIRMED", by: "alice", at: "2026-06-20T00:00:00.000Z" }],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(record), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const res = await useDashboardStore
      .getState()
      .saveNodeOverride("step:x", { summary: "edited" }, "alice");
    expect(res.ok).toBe(true);
    expect(useDashboardStore.getState().nodeOverrides["step:x"]).toEqual(record);
  });

  it("서버 4xx 는 {ok:false,error} 로 보고하고 store 미변경", async () => {
    useDashboardStore.getState().setAccessToken("tok");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "field not editable" }), { status: 400 }),
    );
    const res = await useDashboardStore
      .getState()
      .saveNodeOverride("step:x", { "filePath": "hack" }, "alice");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("field not editable");
    expect(useDashboardStore.getState().nodeOverrides["step:x"]).toBeUndefined();
  });
});
