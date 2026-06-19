import { describe, it, expect, beforeEach } from "vitest";
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
