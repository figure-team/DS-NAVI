package com.acme.mcp.common.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/FCommonController")
public class FCommonController {
  @GetMapping public String list() { return "FCommonController"; }
}
