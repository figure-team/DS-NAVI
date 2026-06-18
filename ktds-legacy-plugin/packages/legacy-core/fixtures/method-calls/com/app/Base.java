package com.app;

public class Base {
  protected Repo baseRepo;

  public void init() {
  }

  public Entity provide() {
    return new Entity();
  }
}
