package com.ext;

import lib.x.*;
import lib.y.*;

// Two wildcard imports each providing a "Box" -> simple-name resolution is ambiguous.
public class AmbiguousUser {
  private Box box; // ambiguous: lib.x.Box vs lib.y.Box (multiple candidates).

  public void useAmbiguous() {
    box.open(); // receiver type unresolved (ambiguous simple name).
  }
}
