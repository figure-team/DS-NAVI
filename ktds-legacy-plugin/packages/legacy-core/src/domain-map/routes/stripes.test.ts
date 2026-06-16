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
  test("@UrlBinding + 이벤트 핸들러 → 핸들러당 1 라우트", async () => {
    const source = `
package com.example.web;
import net.sourceforge.stripes.action.UrlBinding;
import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.HandlesEvent;
import net.sourceforge.stripes.action.Resolution;
@UrlBinding("/account/manage.action")
public class AccountActionBean {
    @DefaultHandler
    public Resolution view() { return null; }
    @HandlesEvent("save")
    public Resolution store() { return null; }
}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Account.java", facts]]));
    const routes = extractStripesRoutes("src/Account.java", facts, idx);
    expect(routes).toHaveLength(2);

    const def = routes.find((r) => r.handler === "AccountActionBean#view")!;
    expect(def.method).toBe("ANY");
    expect(def.path).toBe("/account/manage.action");
    expect(def.rawPath).toBe("/account/manage.action");
    expect(def.kind).toBe("form");
    expect(def.framework).toBe("stripes");
    expect(def.notes).toEqual(["stripes-event"]);

    const evt = routes.find((r) => r.handler === "AccountActionBean#store")!;
    expect(evt.path).toBe("/account/manage.action?save");
    expect(evt.rawPath).toBe("/account/manage.action?save");
    expect(evt.notes).toEqual(["stripes-event"]);
  });

  test("@UrlBinding 핸들러 없음 → bean 단위 폴백 라우트 1개", async () => {
    const source = `
package com.example.web;
import net.sourceforge.stripes.action.UrlBinding;
@UrlBinding("/explicit.action")
public class ExplicitActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["E.java", facts]]));
    const routes = extractStripesRoutes("E.java", facts, idx);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/explicit.action");
    expect(routes[0].handler).toBe("ExplicitActionBean");
    expect(routes[0].notes).toEqual([]);
    expect(routes[0].notes).not.toContain("name-based-convention");
  });
});

describe("extractStripesRoutes — name-based convention", () => {
  test("핸들러 없음 → bean 단위 name-based 폴백 라우트", async () => {
    const source = `
package com.example.web.actions;
public class CatalogActionBean {}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Catalog.java", facts]]));
    const routes = extractStripesRoutes("src/Catalog.java", facts, idx);
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/actions/Catalog.action");
    expect(routes[0].handler).toBe("CatalogActionBean");
    expect(routes[0].notes).toEqual(["name-based-convention"]);
  });

  test("name-based + 이벤트 핸들러 → 핸들러당 1 라우트 (event 분리)", async () => {
    const source = `
package com.example.web.actions;
import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.Resolution;
public class CatalogActionBean {
    @DefaultHandler
    public Resolution list() { return null; }
    public Resolution viewCategory() { return null; }
}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Catalog.java", facts]]));
    const routes = extractStripesRoutes("src/Catalog.java", facts, idx);
    expect(routes).toHaveLength(2);

    const def = routes.find((r) => r.handler === "CatalogActionBean#list")!;
    expect(def.path).toBe("/actions/Catalog.action");
    expect(def.notes).toEqual(["name-based-convention", "stripes-event"]);

    const evt = routes.find(
      (r) => r.handler === "CatalogActionBean#viewCategory",
    )!;
    expect(evt.path).toBe("/actions/Catalog.action?viewCategory");
    expect(evt.notes).toEqual(["name-based-convention", "stripes-event"]);
  });

  test("이벤트 핸들러는 비정적 Resolution 반환 메서드만 — 베이스 getter 제외", async () => {
    const source = `
package com.example.web.actions;
import net.sourceforge.stripes.action.ActionBeanContext;
import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.Resolution;
public class OrderActionBean {
    private ActionBeanContext context;
    public ActionBeanContext getContext() { return context; }
    public void setContext(ActionBeanContext c) { this.context = c; }
    public static Resolution helper() { return null; }
    @DefaultHandler
    public Resolution submit() { return null; }
}
`;
    const facts = await scanJavaFile(source);
    const idx = buildActionBeanIndex(new Map([["Order.java", facts]]));
    const routes = extractStripesRoutes("src/Order.java", facts, idx);
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("OrderActionBean#submit");
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
