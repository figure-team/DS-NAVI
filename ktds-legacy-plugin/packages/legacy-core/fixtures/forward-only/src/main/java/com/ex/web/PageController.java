package com.ex.web;

import com.ex.service.DataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/pages")
public class PageController {

  @Autowired
  private DataService dataService;

  // Forward-only handler: declared, but makes no resolved project calls.
  @GetMapping("/home")
  public String home() {
    return "home";
  }

  // Genuine handler: calls the service layer (multi-step trace).
  @GetMapping("/data")
  public String data() {
    return dataService.load();
  }
}
