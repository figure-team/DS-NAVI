package com.acme.mcp.cs.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/CsController")
public class CsController {
  @GetMapping public String list() { return "CsController"; }
}
