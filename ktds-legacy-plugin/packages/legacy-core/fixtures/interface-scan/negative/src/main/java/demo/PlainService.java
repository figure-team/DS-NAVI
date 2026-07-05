package demo;

import java.util.List;

public class PlainService {
  private final OrderRepository repository = new OrderRepository();

  public List<String> findOrders(String userId) {
    // 이메일 리터럴/애노테이션이 오탐되지 않아야 한다: admin@example.com
    return repository.findByUser(userId);
  }

  public static void main(String[] args) {
    new PlainService().findOrders("u1");
  }
}
