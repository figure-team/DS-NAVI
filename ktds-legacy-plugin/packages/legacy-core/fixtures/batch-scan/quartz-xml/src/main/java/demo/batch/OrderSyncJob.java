package demo.batch;

import org.springframework.beans.factory.annotation.Autowired;

public class OrderSyncJob {
  // 스프링 DI 주입 — injection 엣지로 도달성이 하위 DAO 까지 전파되는지의 회귀 고정
  // (비평 축2 "DI 절단" 주장 반박 근거).
  @Autowired
  private OrderDao orderDao;

  public void execute() {
    orderDao.syncAll();
  }

  public void cleanup() {
    orderDao.purgeOld();
  }
}
