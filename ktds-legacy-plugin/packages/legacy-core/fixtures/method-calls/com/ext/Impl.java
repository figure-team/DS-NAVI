package com.ext;

// Concrete implementation; declares handle() + inherits the cfg overloads contract.
public class Impl implements Iface {
  public void handle() {
  }

  public void cfg(String a) {
  }

  public void cfg(String a, int b) {
  }

  public Node head() {
    return new Node();
  }
}
