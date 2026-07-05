package demo.batch;

import org.springframework.scheduling.annotation.Scheduled;

public class NightlyJob {
  @Scheduled(cron = "0 0 3 * * ?")
  public void run() {}
}
