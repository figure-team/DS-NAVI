import { expect, test, describe } from "vitest";
import { scanJavaFile, type JavaFileFacts } from "./java-facts.js";
import { buildClassIndex } from "./edges.js";
import {
  buildMethodCallGraph,
  traceFlowMethodCalls,
  reachableFlowFiles,
  type ResolvedCall,
} from "./method-calls.js";

// Method-level call graph unit tests. No disk fixtures — inline sources parsed
// through the real tree-sitter path, then resolved. The headline case mirrors
// jpetstore's AccountActionBean.editAccount: the call order updateAccount →
// getAccount → getProductListByCategory that the FILE-level graph throws away.

async function graphOf(files: Record<string, string>) {
  const facts = new Map<string, JavaFileFacts>();
  for (const [relPath, source] of Object.entries(files)) {
    facts.set(relPath, await scanJavaFile(source));
  }
  return buildMethodCallGraph(facts, buildClassIndex(facts));
}

const callsIn = (graph: { calls: ResolvedCall[] }, method: string) =>
  graph.calls.filter((c) => c.callerMethod === method);

// ── jpetstore editAccount fixture (faithful to the real shapes) ──────────────
const JPETSTORE = {
  "web/AccountActionBean.java": `package web;
import service.AccountService;
import service.CatalogService;
import domain.Account;
public class AccountActionBean {
  private AccountService accountService;
  private CatalogService catalogService;
  private Account account;
  private Object myList;
  public Resolution editAccount() {
    accountService.updateAccount(account);
    account = accountService.getAccount(account.getUsername());
    myList = catalogService.getProductListByCategory(account.getFavouriteCategoryId());
    return null;
  }
}`,
  "service/AccountService.java": `package service;
public class AccountService {
  public void updateAccount(Object a) {}
  public Object getAccount(String u) { return null; }
}`,
  "service/CatalogService.java": `package service;
public class CatalogService {
  public Object getProductListByCategory(String c) { return null; }
}`,
  "domain/Account.java": `package domain;
public class Account {
  public String getUsername() { return null; }
  public String getFavouriteCategoryId() { return null; }
}`,
};

describe("buildMethodCallGraph — editAccount ordered chain (the headline gap)", () => {
  test("resolves every invocation in source order, with field receivers", async () => {
    const graph = await graphOf(JPETSTORE);
    const seq = callsIn(graph, "editAccount").map(
      (c) => `${c.calleeClass}.${c.calleeMethod}:${c.resolution}`,
    );
    // Source order incl. nested-arg getters, all field-resolved.
    expect(seq).toEqual([
      "AccountService.updateAccount:field",
      "AccountService.getAccount:field",
      "Account.getUsername:field",
      "CatalogService.getProductListByCategory:field",
      "Account.getFavouriteCategoryId:field",
    ]);
  });

  test("the cross-service chain == the real call order (file graph loses this)", async () => {
    const graph = await graphOf(JPETSTORE);
    const services = new Set(["AccountService", "CatalogService"]);
    const chain = callsIn(graph, "editAccount")
      .filter((c) => c.calleeClass && services.has(c.calleeClass))
      .map((c) => `${c.calleeClass}.${c.calleeMethod}`);
    expect(chain).toEqual([
      "AccountService.updateAccount",
      "AccountService.getAccount",
      "CatalogService.getProductListByCategory",
    ]);
  });

  test("two calls to the same collaborator are TWO edges (not collapsed)", async () => {
    const graph = await graphOf(JPETSTORE);
    const toAccountService = callsIn(graph, "editAccount").filter(
      (c) => c.calleeClass === "AccountService",
    );
    expect(toAccountService.map((c) => c.calleeMethod)).toEqual([
      "updateAccount",
      "getAccount",
    ]);
  });

  test("nested-argument getter resolves to its field's type (Account)", async () => {
    const graph = await graphOf(JPETSTORE);
    const getUsername = callsIn(graph, "editAccount").find((c) => c.calleeMethod === "getUsername");
    expect(getUsername).toMatchObject({
      calleeClass: "Account",
      calleeRelPath: "domain/Account.java",
      resolution: "field",
      receiverText: "account",
    });
  });
});

// ── Receiver-resolution branches ─────────────────────────────────────────────
describe("buildMethodCallGraph — receiver resolution kinds", () => {
  const FILES = {
    "a/Sandbox.java": `package a;
import a.Dep;
import a.Ids;
import java.util.List;
public class Sandbox extends Base {
  private Dep dep;
  private List<String> items;
  public void viaField() { dep.run(); }
  public void viaThisField() { this.dep.run(); }
  public void viaParam(Dep d) { d.run(); }
  public void viaSelf() { helper(); }
  public void viaThisSelf() { this.helper(); }
  public void viaSuper() { super.init(); }
  public void viaStatic() { Ids.next(); }
  public void viaExternalField() { items.size(); }
  public void viaLocal() { Dep local = null; local.run(); }
  public void viaLoop(Dep[] arr) { for (Dep d : arr) { d.run(); } }
  public void viaVar() { var x = getDep(); x.run(); }
  public void viaShadow() { Dep dep = null; dep.run(); this.dep.run(); }
  public void viaChain() { getDep().run(); }
  public void viaDeepChain() { getDep().self().run(); }
  public void viaJdkChain() { label().trim(); }
  public Dep getDep() { return dep; }
  public String label() { return null; }
  public void helper() {}
}`,
    "a/Base.java": `package a;
public class Base { public void init() {} }`,
    "a/Dep.java": `package a;
public class Dep { public void run() {} public Dep self() { return this; } }`,
    "a/Ids.java": `package a;
public class Ids { public static int next() { return 0; } }`,
  };

  const kindOf = async (method: string) => {
    const graph = await graphOf(FILES);
    // The first invocation in each test method is the one under test.
    return callsIn(graph, method)[0];
  };

  test("instance field receiver → field", async () => {
    expect(await kindOf("viaField")).toMatchObject({ resolution: "field", calleeClass: "Dep" });
  });
  test("this.field receiver → field", async () => {
    expect(await kindOf("viaThisField")).toMatchObject({ resolution: "field", calleeClass: "Dep" });
  });
  test("method parameter receiver → param", async () => {
    expect(await kindOf("viaParam")).toMatchObject({ resolution: "param", calleeClass: "Dep" });
  });
  test("unqualified call → self", async () => {
    expect(await kindOf("viaSelf")).toMatchObject({ resolution: "self", calleeClass: "Sandbox" });
  });
  test("this.m() → self", async () => {
    expect(await kindOf("viaThisSelf")).toMatchObject({ resolution: "self", calleeClass: "Sandbox" });
  });
  test("super.m() → super (resolves to superclass file)", async () => {
    expect(await kindOf("viaSuper")).toMatchObject({
      resolution: "super",
      calleeClass: "Base",
      calleeRelPath: "a/Base.java",
    });
  });
  test("Type.staticMethod() on a project type → static", async () => {
    expect(await kindOf("viaStatic")).toMatchObject({ resolution: "static", calleeClass: "Ids" });
  });
  test("field of a JDK type → external (out of scope, not invented)", async () => {
    expect(await kindOf("viaExternalField")).toMatchObject({
      resolution: "external",
      calleeRelPath: null,
    });
  });
  test("local variable receiver → local (resolved via its declared type)", async () => {
    expect(await kindOf("viaLocal")).toMatchObject({
      resolution: "local",
      calleeClass: "Dep",
      calleeRelPath: "a/Dep.java",
    });
  });
  test("enhanced-for loop variable → local", async () => {
    expect(await kindOf("viaLoop")).toMatchObject({ resolution: "local", calleeClass: "Dep" });
  });
  test("var (inferred) local → unresolved (not guessed)", async () => {
    const graph = await graphOf(FILES);
    const run = callsIn(graph, "viaVar").find((c) => c.calleeMethod === "run");
    expect(run).toMatchObject({ resolution: "unresolved", calleeRelPath: null });
  });
  test("local shadows field for bare use, but this.field stays field", async () => {
    const graph = await graphOf(FILES);
    const shadow = callsIn(graph, "viaShadow").filter((c) => c.calleeMethod === "run");
    // `dep.run()` binds to the local; `this.dep.run()` to the instance field.
    expect(shadow.map((c) => c.resolution)).toEqual(["local", "field"]);
  });
  // Chains share a startIndex between inner/outer calls, so target by callee name.
  const callTo = async (method: string, callee: string) => {
    const graph = await graphOf(FILES);
    return callsIn(graph, method).find((c) => c.calleeMethod === callee);
  };

  test("chained receiver getX().y() → chain (resolved via return type)", async () => {
    expect(await callTo("viaChain", "run")).toMatchObject({
      resolution: "chain",
      calleeClass: "Dep",
      calleeRelPath: "a/Dep.java",
    });
  });
  test("deep chain getX().self().y() → chain (recursive return-type inference)", async () => {
    expect(await callTo("viaDeepChain", "run")).toMatchObject({ resolution: "chain", calleeClass: "Dep" });
  });
  test("chain whose return type is JDK (String) → external, not invented", async () => {
    expect(await callTo("viaJdkChain", "trim")).toMatchObject({
      resolution: "external",
      calleeRelPath: null,
    });
  });
});

describe("buildMethodCallGraph — determinism", () => {
  test("identical inputs yield identical call lists", async () => {
    const a = await graphOf(JPETSTORE);
    const b = await graphOf(JPETSTORE);
    expect(a.calls).toEqual(b.calls);
  });
});

describe("traceFlowMethodCalls — per-flow ordered edge labels", () => {
  const STEP_FILES = new Set([
    "web/AccountActionBean.java",
    "service/AccountService.java",
    "service/CatalogService.java",
    "domain/Account.java",
  ]);

  test("editAccount: each file→file pair carries its ordered, deduped methods", async () => {
    const graph = await graphOf(JPETSTORE);
    const trace = traceFlowMethodCalls(graph, "web/AccountActionBean.java", "editAccount", STEP_FILES);
    const from = trace.get("web/AccountActionBean.java")!;
    expect(from.get("service/AccountService.java")).toEqual(["updateAccount", "getAccount"]);
    expect(from.get("service/CatalogService.java")).toEqual(["getProductListByCategory"]);
    expect(from.get("domain/Account.java")).toEqual(["getUsername", "getFavouriteCategoryId"]);
  });

  test("is rooted at the handler — a different handler yields different labels", async () => {
    // newAccount calls insertAccount (not updateAccount); editAccount's labels
    // must not leak into it even though both live in the same file.
    const FILES = {
      ...JPETSTORE,
      "web/AccountActionBean.java": JPETSTORE["web/AccountActionBean.java"].replace(
        "public Resolution editAccount() {",
        `public Resolution newAccount() {
    accountService.insertAccount(account);
    return null;
  }
  public Resolution editAccount() {`,
      ),
    };
    const graph = await graphOf(FILES);
    const edit = traceFlowMethodCalls(graph, "web/AccountActionBean.java", "editAccount", STEP_FILES);
    const neu = traceFlowMethodCalls(graph, "web/AccountActionBean.java", "newAccount", STEP_FILES);
    expect(edit.get("web/AccountActionBean.java")!.get("service/AccountService.java")).toEqual([
      "updateAccount",
      "getAccount",
    ]);
    expect(neu.get("web/AccountActionBean.java")!.get("service/AccountService.java")).toEqual([
      "insertAccount",
    ]);
  });

  test("follows the chain transitively (service → mapper)", async () => {
    const FILES = {
      "web/Bean.java": `package web;
import svc.Svc;
public class Bean {
  private Svc svc;
  public void handle() { svc.doWork(); }
}`,
      "svc/Svc.java": `package svc;
import dao.Mapper;
public class Svc {
  private Mapper mapper;
  public void doWork() { mapper.persist(); }
}`,
      "dao/Mapper.java": `package dao;
public class Mapper { public void persist() {} }`,
    };
    const graph = await graphOf(FILES);
    const steps = new Set(["web/Bean.java", "svc/Svc.java", "dao/Mapper.java"]);
    const trace = traceFlowMethodCalls(graph, "web/Bean.java", "handle", steps);
    expect(trace.get("web/Bean.java")!.get("svc/Svc.java")).toEqual(["doWork"]);
    expect(trace.get("svc/Svc.java")!.get("dao/Mapper.java")).toEqual(["persist"]);
  });

  test("no handler method (batch flow) → empty trace", async () => {
    const graph = await graphOf(JPETSTORE);
    expect(traceFlowMethodCalls(graph, "web/AccountActionBean.java", undefined, STEP_FILES).size).toBe(0);
  });

  test("resolves overloads by arity — a 1-arg call doesn't pull the 2-arg overload's calls", async () => {
    // jpetstore shape: getAccount(u) → byUser, getAccount(u,p) → byUserAndPass.
    // The handler calls getAccount(u) (1 arg), so only byUser must surface.
    const FILES = {
      "web/Bean.java": `package web;
import svc.Svc;
public class Bean {
  private Svc svc;
  public void handle() { svc.getAccount("u"); }
}`,
      "svc/Svc.java": `package svc;
import dao.Mapper;
public class Svc {
  private Mapper mapper;
  public Object getAccount(String u) { return mapper.byUser(u); }
  public Object getAccount(String u, String p) { return mapper.byUserAndPass(u, p); }
}`,
      "dao/Mapper.java": `package dao;
public class Mapper { public Object byUser(String u){return null;} public Object byUserAndPass(String u, String p){return null;} }`,
    };
    const graph = await graphOf(FILES);
    const steps = new Set(["web/Bean.java", "svc/Svc.java", "dao/Mapper.java"]);
    const trace = traceFlowMethodCalls(graph, "web/Bean.java", "handle", steps);
    expect(trace.get("svc/Svc.java")!.get("dao/Mapper.java")).toEqual(["byUser"]);
  });
});

describe("reachableFlowFiles — call-graph step chain", () => {
  test("includes only files actually called (excludes injected-but-uncalled collaborators)", async () => {
    // Bean injects two services but the handler only calls `used`; `unused` and
    // its mapper must NOT appear (the structural-adjacency chain would include them).
    const FILES = {
      "web/Bean.java": `package web;
import svc.Used; import svc.Unused;
public class Bean {
  private Used used;
  private Unused unused;
  public void handle() { used.work(); }
}`,
      "svc/Used.java": `package svc;
import dao.Mapper;
public class Used { private Mapper mapper; public void work() { mapper.run(); } }`,
      "svc/Unused.java": `package svc;
import dao.OtherMapper;
public class Unused { private OtherMapper m; public void idle() { m.run(); } }`,
      "dao/Mapper.java": `package dao;
public class Mapper { public void run() {} }`,
      "dao/OtherMapper.java": `package dao;
public class OtherMapper { public void run() {} }`,
    };
    const graph = await graphOf(FILES);
    const { files } = reachableFlowFiles(graph, "web/Bean.java", "handle", 8);
    expect(files).toEqual(["web/Bean.java", "svc/Used.java", "dao/Mapper.java"]);
    expect(files).not.toContain("svc/Unused.java");
    expect(files).not.toContain("dao/OtherMapper.java");
  });

  test("a forward-only handler (no calls) reaches only the root", async () => {
    const FILES = {
      "web/Bean.java": `package web;
public class Bean { public Object form() { return new Object(); } }`,
    };
    const graph = await graphOf(FILES);
    expect(reachableFlowFiles(graph, "web/Bean.java", "form", 8).files).toEqual(["web/Bean.java"]);
  });

  test("respects stepCap, reporting the overflow as dropped", async () => {
    const FILES = {
      "web/Bean.java": `package web;
import a.A; import a.B; import a.C;
public class Bean { private A a; private B b; private C c;
  public void handle() { a.x(); b.x(); c.x(); } }`,
      "a/A.java": `package a; public class A { public void x() {} }`,
      "a/B.java": `package a; public class B { public void x() {} }`,
      "a/C.java": `package a; public class C { public void x() {} }`,
    };
    const graph = await graphOf(FILES);
    const { files, dropped } = reachableFlowFiles(graph, "web/Bean.java", "handle", 3);
    expect(files).toHaveLength(3);
    expect(files[0]).toBe("web/Bean.java");
    expect(dropped).toHaveLength(1);
  });
});
