package com.ex.use;

import com.ex.Repo;

public class Consumer {
  private Dup dup;

  private Repo repo;

  public Object get() {
    return repo.load();
  }
}
