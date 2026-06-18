package com.shop.util;

import org.springframework.stereotype.Component;

@Component
public class FormatUtil {
  public String normalize(String value) {
    return value == null ? "" : value.trim();
  }
}
