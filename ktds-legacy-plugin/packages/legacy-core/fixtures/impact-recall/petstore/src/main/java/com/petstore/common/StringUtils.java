package com.petstore.common;

import org.springframework.stereotype.Component;

@Component
public class StringUtils {
  public String normalize(String value) {
    return value == null ? "" : value.trim();
  }
}
