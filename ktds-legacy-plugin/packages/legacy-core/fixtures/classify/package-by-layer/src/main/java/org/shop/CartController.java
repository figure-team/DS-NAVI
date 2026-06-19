package org.shop;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/Cart")
public class CartController {
  @GetMapping public String list() { return "Cart"; }
}
