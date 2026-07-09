package com.acme.mcp.board.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/BoardController")
public class BoardController {
  @GetMapping public String list() { return "BoardController"; }
}
