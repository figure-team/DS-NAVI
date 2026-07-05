package demo;

import org.quartz.JobExecutionContext;
import org.springframework.scheduling.quartz.QuartzJobBean;

// 명명 관례(*Job)로도 걸리지만, 구조 신호(QuartzJobBean/org.quartz)가 1급으로 우선한다.
// 어떤 XML/어노테이션에도 배선되지 않음 → 의심신호로 표면화되어야 한다.
public class UnwiredQuartzJob extends QuartzJobBean {
  protected void executeInternal(JobExecutionContext context) {}
}
