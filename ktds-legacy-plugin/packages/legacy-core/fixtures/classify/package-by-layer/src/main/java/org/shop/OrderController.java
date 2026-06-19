package org.shop;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/Order")
public class OrderController {
  @GetMapping public String list() { return "Order"; }
}
