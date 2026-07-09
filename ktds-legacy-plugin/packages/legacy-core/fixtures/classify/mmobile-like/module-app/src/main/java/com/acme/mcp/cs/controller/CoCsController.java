package com.acme.mcp.cs.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/CoCsController")
public class CoCsController {
  @GetMapping public String list() { return "CoCsController"; }
}
