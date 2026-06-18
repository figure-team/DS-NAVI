package com.ext;

import java.util.List;
import java.util.Map;
import lib.x.Box;

// Exercises generics field types, arrays, deep chains, explicit import resolution,
// wildcard-free JDK externals, var inference, interface-typed receivers.
public class Consumer {
  private List<Node> nodes;        // generic field -> outer type Node.
  private Node[] arr;              // array field -> element type Node.
  private Map<String, Node> map;   // generic with two args -> outer type Map (external).
  private Box box;                 // resolved via explicit import lib.x.Box.
  private Iface svc;               // interface-typed field.

  // generic field element type drives nothing on its own; but the field itself is List (external).
  public void genericField() {
    nodes.add(new Node()); // List.add -> external (java.util.List).
  }

  // array field receiver: arr is Node[] -> field type Node.
  public void arrayFieldDirect() {
    Node n = arr[0]; // local n typed Node via declaration (not via array access inference).
    n.tick();
  }

  // explicit-import resolution: Box from lib.x (not lib.y).
  public void explicitImport() {
    box.open();
  }

  // interface-typed field receiver resolves to the interface file; method on interface.
  public void interfaceReceiver() {
    svc.handle();
    svc.cfg("a");        // overload arity 1.
    svc.cfg("a", 2);     // overload arity 2.
  }

  // deep chain across self-referential type: head() -> Node, .next() -> Node, .tick().
  public void deepChain() {
    head().next().tick();
  }

  // method-return chain head().tick() (single hop return-type).
  public void singleHopChain() {
    head().tick();
  }

  // var inference is unsupported: declared local typed var cannot drive resolution.
  public void varReceiver() {
    var x = head();
    x.tick(); // unresolved (var).
  }

  // local typed by explicit class drives resolution even when initialized by chain.
  public void typedLocalFromChain() {
    Node y = head().next();
    y.tick();
  }

  // helper returning Node for chains above.
  public Node head() {
    return new Node();
  }
}
