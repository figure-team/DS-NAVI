package com.acme.mcp.appform.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/AppformAdminController")
public class AppformAdminController {
  @GetMapping public String list() { return "AppformAdminController"; }
}
