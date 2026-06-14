import { describe, expect, test } from "vitest";
import {
  buildActionBeanIndex,
  extractStripesRoutes,
  nameBasedBinding,
} from "./stripes.js";
import { scanJavaFile } from "../java-facts.js";

// ── nameBasedBinding ──────────────────────────────────────────────────────────

describe("nameBasedBinding", () => {
  test("org.mybatis.jpetstore.web.actions.CatalogActionBean → /actions/Catalog.action", () => {
    expect(nameBasedBinding("org.mybatis.jpetstore.web.actions", "CatalogActionBean")).toBe(
      "/actions/Catalog.action",
    );
  });

  test("ActionBean 접미사 제거", () => {
    expect(nameBasedBinding("com.example.action", "AccountActionBean")).toBe(
      "/Account.action",
    );
  });

  test("Action 접미사 제거", () => {
    expect(nameBasedBinding("com.example.web", "LoginAction")).toBe("/Login.action");
  });

  test("Bean 접미사 제거", () => {
    expect(nameBasedBinding("com.example.stripes", "SearchBean")).toBe("/Search.action");
  });

  test("base package 없으면 클래스명만", () => {
    expect(nameBasedBinding("com.example.service", "MyActionBean")).toBe("/My.action");
  });

  test("packageName=null → 클래스명만", () => {
    expect(nameBasedBinding(null, "HomeActionBean")).toBe("/Home.action");
  });

  test("web base package → segments after web", () => {
    expect(nameBasedBinding("com.example.web.admin", "UserActionBean")).toBe(
      "/admin/User.action",
    );
  });

  test("마지막 base package 이후 세그먼트 사용", () => {
    // "com.example.action.sub" → last base = "action" → segments after = ["sub"]
    expect(nameBasedBinding("com.example.action.sub", "OrderActionBean")).toBe(
      "/sub/Order.action",
    );
  });
});

// ── buildActionBeanIndex ──────────────────────────────────────────────────────

describe("buildActionBeanIndex", () => {
  test("ActionBean 접미사 클래스 → index에 포함", async () => {
    const source = `
package com.example;
public class AccountActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Account.java", facts]]));
    expect(idx.has("AccountActionBean")).toBe(true);
  });

  test("ActionBean 인터페이스 구현 → index에 포함", async () => {
    const source = `
package com.example;
public class LoginBean implements ActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Login.java", facts]]));
    expect(idx.has("LoginBean")).toBe(true);
  });

  test("간접 상속 — fixpoint 확장", async () => {
    // Base extends ActionBean-named class; Child extends Base
    const baseSource = `
public class BaseActionBean {}
`;
    const childSource = `
public class CheckoutBean extends BaseActionBean {}
`;
    const baseFacts = await scanJavaFile(baseSource);
    const childFacts = await scanJavaFile(childSource);
    const idx = buildActionBeanIndex(
      new Map([
        ["Base.java", baseFacts],
        ["Checkout.java", childFacts],
      ]),
    );
    expect(idx.has("BaseActionBean")).toBe(true);
    expect(idx.has("CheckoutBean")).toBe(true);
  });

  test("관련 없는 클래스 → index에 없음", async () => {
    const source = `public class PlainService {}`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["S.java", facts]]));
    expect(idx.has("PlainService")).toBe(false);
  });
});

// ── extractStripesRoutes ──────────────────────────────────────────────────────

describe("extractStripesRoutes — @UrlBinding", () => {
  test("@UrlBinding 명시 → 해당 경로 사용", async () => {
    const source = `
package com.example.web;
import net.sourceforge.stripes.action.UrlBinding;
@UrlBinding("/account/manage.action")
public class AccountActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Account.java", facts]]));
    const routes = extractStripesRoutes("src/Account.java", facts, idx);
    expect(routes).toHaveLength(1);
    const r = routes[0];
    expect(r.method).toBe("ANY");
    expect(r.path).toBe("/account/manage.action");
    expect(r.rawPath).toBe("/account/manage.action");
    expect(r.kind).toBe("form");
    expect(r.framework).toBe("stripes");
    expect(r.handler).toBe("AccountActionBean");
    expect(r.notes).toEqual([]);
  });

  test("@UrlBinding 있으면 name-based-convention 노트 없음", async () => {
    const source = `
@UrlBinding("/explicit.action")
public class ExplicitActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["E.java", facts]]));
    const routes = extractStripesRoutes("E.java", facts, idx);
    expect(routes[0].notes).not.toContain("name-based-convention");
  });
});

describe("extractStripesRoutes — name-based convention", () => {
  test("ActionBean 접미사 + index에 있음 → name-based route", async () => {
    const source = `
package com.example.web.actions;
public class CatalogActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Catalog.java", facts]]));
    const routes = extractStripesRoutes("src/Catalog.java", facts, idx);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/actions/Catalog.action");
    expect(routes[0].notes).toContain("name-based-convention");
  });

  test("추상 ActionBean → 라우트 없음", async () => {
    const source = `
public abstract class AbstractActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Abstract.java", facts]]));
    const routes = extractStripesRoutes("Abstract.java", facts, idx);
    expect(routes).toHaveLength(0);
  });

  test("index에 없는 클래스 → 라우트 없음", async () => {
    const source = `
public class PlainService {}
`;
    const facts = await scanJavaFile(source);
    const idx = new Set<string>(); // empty index
    const routes = extractStripesRoutes("PlainService.java", facts, idx);
    expect(routes).toHaveLength(0);
  });

  test("filePath, line, handler 보존", async () => {
    const source = `
package com.example.action;
public class OrderActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Order.java", facts]]));
    const routes = extractStripesRoutes("src/Order.java", facts, idx);
    expect(routes[0].filePath).toBe("src/Order.java");
    expect(routes[0].handler).toBe("OrderActionBean");
    expect(routes[0].line).toBeGreaterThan(0);
  });
});
