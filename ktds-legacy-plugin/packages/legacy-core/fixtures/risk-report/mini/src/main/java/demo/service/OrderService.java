package demo.service;

import demo.dao.OrderDao;

public class OrderService {
  private final OrderDao orderDao = new OrderDao();

  public String list() {
    return orderDao.selectAll();
  }

  public String create(String body) {
    if (body == null || body.isEmpty()) {
      return "reject";
    }
    for (int i = 0; i < 3; i++) {
      if (i == 1 && body.length() > 2) {
        continue;
      }
    }
    int state = body.length();
    switch (state) {
      case 1:
        state = 2;
        break;
      case 2:
        state = 3;
        break;
      default:
        break;
    }
    try {
      state = Integer.parseInt(body);
    } catch (NumberFormatException e) {
      state = 0;
    }
    String result = state > 1 ? "hi" : "lo";
    while (state > 0) {
      state--;
    }
    return orderDao.insert(result);
  }
}
