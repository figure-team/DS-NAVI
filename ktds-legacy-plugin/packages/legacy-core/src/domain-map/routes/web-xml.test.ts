import { describe, expect, test } from "vitest";
import { extractWebXmlRoutes, preprocessXml, lineAt } from "./web-xml.js";

// ── preprocessXml ─────────────────────────────────────────────────────────────

describe("preprocessXml", () => {
  test("주석 블랭킹: 개행 보존, 내용 공백화", () => {
    const input = `line1\n<!-- comment\nspanning -->\nline4`;
    const out = preprocessXml(input);
    expect(out).toContain("line1");
    expect(out).toContain("line4");
    expect(out).not.toContain("comment");
    // 개행 수 보존
    expect(out.split("\n").length).toBe(input.split("\n").length);
  });

  test("CDATA 마커 제거, 내부 내용 유지", () => {
    const input = `<value><![CDATA[/api/users]]></value>`;
    const out = preprocessXml(input);
    expect(out).toContain("/api/users");
    expect(out).not.toContain("CDATA");
  });

  test("주석 안 url-pattern은 매칭 안 됨", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>myServlet</servlet-name>
    <servlet-class>com.example.MyServlet</servlet-class>
  </servlet>
  <!-- <servlet-mapping>
    <servlet-name>myServlet</servlet-name>
    <url-pattern>/commented-out</url-pattern>
  </servlet-mapping> -->
  <servlet-mapping>
    <servlet-name>myServlet</servlet-name>
    <url-pattern>/active</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("WEB-INF/web.xml", xml);
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/active");
    expect(paths).not.toContain("/commented-out");
  });
});

// ── lineAt ────────────────────────────────────────────────────────────────────

describe("lineAt", () => {
  test("오프셋 0 → 1번 라인", () => {
    expect(lineAt("abc", 0)).toBe(1);
  });

  test("첫 번째 줄 끝 다음 → 2번 라인", () => {
    const content = "first\nsecond";
    expect(lineAt(content, 6)).toBe(2);
  });

  test("여러 개행", () => {
    const content = "a\nb\nc\nd";
    expect(lineAt(content, content.indexOf("d"))).toBe(4);
  });
});

// ── extractWebXmlRoutes ───────────────────────────────────────────────────────

const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<web-app>
  <servlet>
    <servlet-name>accountServlet</servlet-name>
    <servlet-class>com.example.AccountServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>accountServlet</servlet-name>
    <url-pattern>/account/*</url-pattern>
  </servlet-mapping>
</web-app>`;

describe("extractWebXmlRoutes — 기본", () => {
  test("단일 서블릿 매핑 파싱", () => {
    const routes = extractWebXmlRoutes("src/main/webapp/WEB-INF/web.xml", MINIMAL_XML);
    expect(routes).toHaveLength(1);
    const r = routes[0];
    expect(r.method).toBe("ANY");
    expect(r.path).toBe("/account/*");
    expect(r.rawPath).toBe("/account/*");
    expect(r.kind).toBe("servlet");
    expect(r.framework).toBe("webxml");
    expect(r.handler).toBe("com.example.AccountServlet");
    expect(r.notes).toEqual([]);
    expect(r.filePath).toBe("src/main/webapp/WEB-INF/web.xml");
    expect(r.line).toBeGreaterThan(0);
  });

  test("여러 url-pattern — 각각 별도 route", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>front</servlet-name>
    <servlet-class>com.example.FrontServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>front</servlet-name>
    <url-pattern>/api/v1/*</url-pattern>
    <url-pattern>/api/v2/*</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/api/v1/*");
    expect(paths).toContain("/api/v2/*");
  });

  test("*.do 확장 매핑 — 정규화 없이 그대로", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>action</servlet-name>
    <servlet-class>com.example.ActionServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>action</servlet-name>
    <url-pattern>*.do</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("*.do");
    expect(routes[0].rawPath).toBe("*.do");
  });

  test("DispatcherServlet → dispatcher 노트", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>dispatcher</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>dispatcher</servlet-name>
    <url-pattern>/</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes).toHaveLength(1);
    expect(routes[0].notes).toContain("dispatcher");
  });

  test("ActionServlet → dispatcher 노트", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>action</servlet-name>
    <servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>action</servlet-name>
    <url-pattern>*.action</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes[0].notes).toContain("dispatcher");
  });

  test("미등록 서블릿 → handler=null + unresolved-servlet 노트", () => {
    const xml = `
<web-app>
  <servlet-mapping>
    <servlet-name>ghost</servlet-name>
    <url-pattern>/ghost</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBeNull();
    expect(routes[0].notes).toContain("unresolved-servlet");
  });

  test("jsp-file 서블릿 → handler에 jsp-file 경로", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>jspSrv</servlet-name>
    <jsp-file>/WEB-INF/views/home.jsp</jsp-file>
  </servlet>
  <servlet-mapping>
    <servlet-name>jspSrv</servlet-name>
    <url-pattern>/home</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes[0].handler).toBe("/WEB-INF/views/home.jsp");
  });

  test("빈 url-pattern 건너뜀", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>s</servlet-name>
    <servlet-class>com.example.S</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>s</servlet-name>
    <url-pattern></url-pattern>
    <url-pattern>/real</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    const paths = routes.map((r) => r.path);
    expect(paths).not.toContain("");
    expect(paths).toContain("/real");
  });

  test("servlet-mapping id 속성 있어도 파싱됨", () => {
    const xml = `
<web-app>
  <servlet>
    <servlet-name>s</servlet-name>
    <servlet-class>com.example.S</servlet-class>
  </servlet>
  <servlet-mapping id="sm1">
    <servlet-name>s</servlet-name>
    <url-pattern>/with-id</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/with-id");
  });

  test("서블릿 없을 때 빈 배열", () => {
    const routes = extractWebXmlRoutes("web.xml", "<web-app></web-app>");
    expect(routes).toEqual([]);
  });

  test("line 번호가 url-pattern 선언 라인", () => {
    const xml = `<web-app>
  <servlet>
    <servlet-name>s</servlet-name>
    <servlet-class>com.example.S</servlet-class>
  </servlet>
  <servlet-mapping>
    <servlet-name>s</servlet-name>
    <url-pattern>/line-check</url-pattern>
  </servlet-mapping>
</web-app>`;
    const routes = extractWebXmlRoutes("web.xml", xml);
    const lines = xml.split("\n");
    expect(lines[routes[0].line - 1]).toContain("/line-check");
  });
});
