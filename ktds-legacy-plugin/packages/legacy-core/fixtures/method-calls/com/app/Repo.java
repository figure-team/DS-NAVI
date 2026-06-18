package com.app;

public class Repo {
  public Entity load(int id) {
    return new Entity();
  }

  public void save(Entity e) {
  }

  // Overload set: same name, different arities.
  public void put(String k) {
  }

  public void put(String k, String v) {
  }

  public void put(String k, String v, int ttl) {
  }

  // Ambiguous overload: two methods, same name, SAME arity.
  public void amb(int a) {
  }

  public void amb(String a) {
  }
}
