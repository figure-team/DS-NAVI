package com.acme.mcp.board.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/CoBoardController")
public class CoBoardController {
  @GetMapping public String list() { return "CoBoardController"; }
}
