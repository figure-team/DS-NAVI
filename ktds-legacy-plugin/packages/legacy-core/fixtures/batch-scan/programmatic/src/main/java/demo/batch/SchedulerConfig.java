package demo.batch;

import java.util.Timer;
import java.util.concurrent.ScheduledExecutorService;
import org.quartz.JobDetail;

public class SchedulerConfig {
  public void registerQuartz(org.quartz.Scheduler scheduler) throws Exception {
    JobDetail detail =
        org.quartz.JobBuilder.newJob(SettleJob.class).withIdentity("settleJob").build();
    org.quartz.Trigger trigger =
        org.quartz.TriggerBuilder.newTrigger()
            .withSchedule(org.quartz.CronScheduleBuilder.cronSchedule("0 0 2 * * ?"))
            .build();
    scheduler.scheduleJob(detail, trigger);
  }

  public void registerExecutor(ScheduledExecutorService pool) {
    pool.scheduleAtFixedRate(() -> new SettleJob().run(), 0, 60, java.util.concurrent.TimeUnit.SECONDS);
  }

  public void registerTimer() {
    new java.util.Timer();
    Timer timer = new Timer();
    timer.schedule(new java.util.TimerTask() {
      public void run() {}
    }, 1000L);
  }
}
