package demo.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import demo.service.OrderService;

@RestController
public class OrderController {
  private final OrderService orderService;

  public OrderController(OrderService orderService) {
    this.orderService = orderService;
  }

  @GetMapping("/api/orders")
  public String list() {
    return orderService.list();
  }

  @PostMapping("/api/orders")
  public String create(String body) {
    return orderService.create(body);
  }
}
