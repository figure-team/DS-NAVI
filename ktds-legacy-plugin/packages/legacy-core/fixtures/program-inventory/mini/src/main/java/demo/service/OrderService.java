package demo.service;

import demo.dao.OrderDao;

public class OrderService {
  private final OrderDao orderDao = new OrderDao();

  public String list() {
    return orderDao.selectAll();
  }

  public String create(String body) {
    return orderDao.insert(body);
  }
}
