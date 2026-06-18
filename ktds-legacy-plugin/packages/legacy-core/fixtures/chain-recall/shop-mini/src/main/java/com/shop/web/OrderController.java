package com.shop.web;

import com.shop.service.OrderService;
import com.shop.domain.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

  @Autowired
  private OrderService orderService;

  @PostMapping
  public Order create(Order order) {
    return orderService.place(order);
  }
}
