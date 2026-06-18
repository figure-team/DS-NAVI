package com.ext;

// Interface declaring a contract method used to exercise impl/interface walks.
public interface Iface {
  void handle();

  // Overload set on an interface (same name, distinct arities).
  void cfg(String a);

  void cfg(String a, int b);
}
