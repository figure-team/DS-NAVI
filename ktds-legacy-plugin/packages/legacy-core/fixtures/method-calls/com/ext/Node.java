package com.ext;

// Self-referential type to exercise chained return-type hops a.next().next().
public class Node {
  private Node next;

  public Node next() {
    return this.next;
  }

  public void tick() {
  }
}
