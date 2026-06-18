package com.petstore.orphan;

/**
 * 어떤 루트에서도 도달하지 못하는 고아 클래스(unreached 검증용).
 * 아무도 import/주입/상속하지 않는다.
 */
public class Unused {
  private String note;

  public String getNote() {
    return note;
  }
}
