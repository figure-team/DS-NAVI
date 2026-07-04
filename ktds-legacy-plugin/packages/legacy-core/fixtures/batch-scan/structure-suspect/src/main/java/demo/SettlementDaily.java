package demo;

import org.quartz.Job;
import org.quartz.JobExecutionContext;

// 명명 관례가 전혀 없는 배치 클래스 — 구조 신호(org.quartz Job 구현)로만 잡힌다.
public class SettlementDaily implements Job {
  public void execute(JobExecutionContext context) {}
}
