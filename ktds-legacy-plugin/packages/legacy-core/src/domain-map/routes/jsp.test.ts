import { describe, expect, test } from "vitest";
import { extractJspRoute } from "./jsp.js";

describe("extractJspRoute", () => {
  test("src/main/webapp 아래 JSP → web-relative path", () => {
    const result = extractJspRoute("src/main/webapp/views/account/list.jsp");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("/views/account/list.jsp");
    expect(result!.rawPath).toBe("/views/account/list.jsp");
    expect(result!.method).toBe("GET");
    expect(result!.kind).toBe("page");
    expect(result!.framework).toBe("jsp");
    expect(result!.filePath).toBe("src/main/webapp/views/account/list.jsp");
    expect(result!.line).toBe(1);
    expect(result!.handler).toBeNull();
    expect(result!.notes).toEqual([]);
  });

  test("WebContent 루트 — 대체 webapp 마커", () => {
    const result = extractJspRoute("WebContent/pages/home.jsp");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("/pages/home.jsp");
    expect(result!.notes).toEqual([]);
  });

  test("webapp/ 마커", () => {
    const result = extractJspRoute("webapp/jsp/login.jsp");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("/jsp/login.jsp");
  });

  test("web/ 마커", () => {
    const result = extractJspRoute("web/error.jsp");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("/error.jsp");
  });

  test("src/main/webapp 루트 직하 JSP", () => {
    const result = extractJspRoute("src/main/webapp/index.jsp");
    expect(result!.path).toBe("/index.jsp");
  });

  test("중첩 경로에 webapp 마커가 세그먼트 경계에 있을 때", () => {
    const result = extractJspRoute("myapp/src/main/webapp/admin/users.jsp");
    expect(result!.path).toBe("/admin/users.jsp");
  });

  test("WEB-INF 아래 JSP → null (직접 접근 불가)", () => {
    const result = extractJspRoute("src/main/webapp/WEB-INF/views/account.jsp");
    expect(result).toBeNull();
  });

  test("META-INF 아래 JSP → null", () => {
    const result = extractJspRoute("src/main/webapp/META-INF/internal.jsp");
    expect(result).toBeNull();
  });

  test("WEB-INF 대소문자 무시 — web-inf/ 도 차단됨", () => {
    // 정규식은 /^(WEB-INF|META-INF)\//i 이므로 web-inf/ 도 null
    const result = extractJspRoute("src/main/webapp/web-inf/views/foo.jsp");
    expect(result).toBeNull();
  });

  test("인식 가능한 webapp 루트 없는 파일 → no-webapp-root 노트", () => {
    const result = extractJspRoute("src/views/account.jsp");
    expect(result).not.toBeNull();
    expect(result!.notes).toContain("no-webapp-root");
    expect(result!.path).toBe("/src/views/account.jsp");
  });

  test("webapp 부분 문자열이지만 세그먼트 경계 아닌 경우 → no-webapp-root", () => {
    // "mywebapp/" 은 "webapp/" 마커와 일치하지 않아야 한다
    const result = extractJspRoute("mywebapp/pages/list.jsp");
    expect(result!.notes).toContain("no-webapp-root");
  });

  test("경로 정규화: 이중 슬래시 제거", () => {
    // webapp 마커가 세그먼트에 정확히 있는 경우 정규화 확인
    const result = extractJspRoute("src/main/webapp/views//deep.jsp");
    expect(result!.path).toBe("/views/deep.jsp");
  });

  test("프로젝트 루트 직하 webapp 마커", () => {
    const result = extractJspRoute("webapp/index.jsp");
    expect(result!.path).toBe("/index.jsp");
    expect(result!.notes).toEqual([]);
  });
});
