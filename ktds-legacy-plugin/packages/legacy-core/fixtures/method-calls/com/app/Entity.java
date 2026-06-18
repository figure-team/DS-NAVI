package com.app;

public class Entity {
  public String name() {
    return "n";
  }

  public Entity self() {
    return this;
  }

  public Repo repo() {
    return new Repo();
  }

  public void touch() {
  }
}
