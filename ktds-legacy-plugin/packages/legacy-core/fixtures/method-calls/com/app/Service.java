package com.app;

import java.util.List;
import java.util.ArrayList;

public class Service extends Base {
  private Repo repo;
  private Helper helper;
  private Entity entity;

  // 1) field receiver: this.repo / repo (class field) -> Repo.
  public void byField() {
    this.repo.save(entity);
    repo.load(1);
  }

  // 2) param receiver: p.touch() where p is a parameter -> Entity.
  public void byParam(Entity p, Repo r) {
    p.touch();
    r.save(p);
  }

  // 3) local receiver: declared/new local -> its type.
  public void byLocal() {
    Repo localRepo = new Repo();
    localRepo.load(2);
    Entity e = helper.build();
    e.touch();
  }

  // 4) self receiver: unqualified / this.* -> enclosing class.
  public void bySelf() {
    helperMethod();
    this.helperMethod();
  }

  private void helperMethod() {
  }

  // 5) super receiver: super.* -> superclass Base.
  public void bySuper() {
    super.init();
  }

  // 6) static receiver: Type.m() -> static method on Type.
  public void byStatic() {
    Helper.fmt("x");
    Helper.make();
  }

  // 7) return-type chaining: a.b().c() -> resolve b()'s return type, then c().
  public void byChain() {
    entity.repo().load(3);
    entity.self().name();
    helper.build().touch();
  }

  // 8) external receiver: java.* type -> external.
  public void byExternal() {
    List<String> list = new ArrayList<String>();
    list.add("a");
    String s = "hello";
    s.length();
  }

  // overload arity selection.
  public void byOverload() {
    repo.put("k");
    repo.put("k", "v");
    repo.put("k", "v", 5);
    repo.amb(1);
  }

  // inherited field receiver: baseRepo declared on Base -> Repo (walk super).
  public void byInheritedField() {
    baseRepo.save(entity);
  }

  // inherited method via self: provide() declared on Base, called unqualified.
  public Entity byInheritedSelf() {
    return provide();
  }

  // unresolved: receiver from a cast / var / unknown.
  public void byUnresolved(Object o) {
    o.toString();
    var v = repo.load(9);
    v.touch();
  }
}
