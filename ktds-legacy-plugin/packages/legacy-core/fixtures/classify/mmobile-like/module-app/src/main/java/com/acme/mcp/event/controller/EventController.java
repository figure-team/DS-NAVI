package com.acme.mcp.event.controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/EventController")
public class EventController {
  @GetMapping public String list() { return "EventController"; }
}
