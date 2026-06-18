package com.shop.service.impl;

import com.shop.service.OrderService;
import com.shop.mapper.OrderMapper;
import com.shop.domain.Order;
import com.shop.util.FormatUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class OrderServiceImpl implements OrderService {

  @Autowired
  private OrderMapper orderMapper;

  private FormatUtil formatUtil;

  public Order place(Order order) {
    order.setRef(formatUtil.normalize(order.getRef()));
    orderMapper.insert(order);
    return order;
  }
}
