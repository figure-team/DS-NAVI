package demo.batch;

public class OrderSyncJob {
  private final OrderDao orderDao = new OrderDao();

  public void execute() {
    orderDao.syncAll();
  }

  public void cleanup() {
    orderDao.purgeOld();
  }
}
