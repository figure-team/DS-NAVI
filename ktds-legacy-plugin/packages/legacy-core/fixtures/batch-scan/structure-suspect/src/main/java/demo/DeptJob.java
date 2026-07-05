package demo;

// 직무(부서업무) 의미의 Job — 배치가 아니다. 명명 신호 위양성의 대표 사례.
// understanding.config.json 의 batchScan.ignoreSuspects 로 억제되어야 한다.
public class DeptJob {
  private String deptId;
  private String jobName;
}
