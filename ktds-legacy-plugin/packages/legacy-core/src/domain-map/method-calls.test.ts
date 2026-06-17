import { expect, test, describe } from "vitest";
import { scanJavaFile, type JavaFileFacts } from "./java-facts.js";
import { buildClassIndex } from "./edges.js";
import { buildMethodCallGraph, type ResolvedCall } from "./method-calls.js";

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
