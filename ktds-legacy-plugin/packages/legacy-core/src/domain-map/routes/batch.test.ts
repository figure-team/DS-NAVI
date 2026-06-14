import { describe, expect, test } from "vitest";
import { extractJavaBatchEntries, extractXmlBatchEntries } from "./batch.js";
import { scanJavaFile } from "../java-facts.js";

// ── extractJavaBatchEntries ───────────────────────────────────────────────────

describe("extractJavaBatchEntries — @Scheduled", () => {
  test("단일 @Scheduled(cron) 메서드", async () => {
    const source = `
package com.example;
import org.springframework.scheduling.annotation.Scheduled;
public class ReportJob {
  @Scheduled(cron = "0 0 * * * ?")
  public void generateReport() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/jobs/ReportJob.java", facts);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.trigger).toBe("scheduled");
    expect(e.schedule).toBe("cron=0 0 * * * ?");
    expect(e.handler).toBe("ReportJob#generateReport");
    expect(e.filePath).toBe("src/jobs/ReportJob.java");
    expect(e.entryId).toBe("batch:src/jobs/ReportJob.java#ReportJob.generateReport");
    expect(e.notes).toEqual([]);
    expect(e.line).toBeGreaterThan(0);
  });

  test("@Scheduled(fixedRate)", async () => {
    const source = `
public class PollJob {
  @Scheduled(fixedRate = 5000)
  public void poll() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/PollJob.java", facts);
    expect(entries).toHaveLength(1);
    expect(entries[0].schedule).toBe("fixedRate=5000");
  });

  test("@Scheduled(fixedDelay)", async () => {
    const source = `
public class CleanupJob {
  @Scheduled(fixedDelay = 10000)
  public void cleanup() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/CleanupJob.java", facts);
    expect(entries[0].schedule).toBe("fixedDelay=10000");
  });

  test("여러 메서드 — 각각 별도 엔트리", async () => {
    const source = `
public class MultiJob {
  @Scheduled(cron = "0 * * * * ?")
  public void jobA() {}
  @Scheduled(cron = "0 30 * * * ?")
  public void jobB() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/MultiJob.java", facts);
    expect(entries).toHaveLength(2);
    const handlers = entries.map((e) => e.handler).sort();
    expect(handlers).toEqual(["MultiJob#jobA", "MultiJob#jobB"]);
  });

  test("@Schedules 컨테이너 — container:@Schedules 노트, schedule=null", async () => {
    const source = `
import org.springframework.scheduling.annotation.Schedules;
import org.springframework.scheduling.annotation.Scheduled;
public class ContainerJob {
  @Schedules({
    @Scheduled(cron = "0 0 1 * * ?"),
    @Scheduled(cron = "0 0 13 * * ?")
  })
  public void twice() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/ContainerJob.java", facts);
    // @Schedules 컨테이너 엔트리 하나
    const containerEntry = entries.find((e) => e.notes.includes("container:@Schedules"));
    expect(containerEntry).toBeDefined();
    expect(containerEntry!.schedule).toBeNull();
    expect(containerEntry!.handler).toBe("ContainerJob#twice");
  });

  test("@Scheduled 없는 클래스 → 빈 배열", async () => {
    const source = `
public class PlainService {
  public void doWork() {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/PlainService.java", facts);
    expect(entries).toHaveLength(0);
  });
});

describe("extractJavaBatchEntries — public static void main", () => {
  test("main 메서드 → main trigger", async () => {
    const source = `
public class BatchLauncher {
  public static void main(String[] args) {
    System.out.println("start");
  }
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/BatchLauncher.java", facts);
    expect(entries).toHaveLength(1);
    expect(entries[0].trigger).toBe("main");
    expect(entries[0].handler).toBe("BatchLauncher#main");
    expect(entries[0].schedule).toBeNull();
    expect(entries[0].entryId).toBe("batch:src/BatchLauncher.java#BatchLauncher.main");
  });

  test("varargs main(String... args) 도 인식", async () => {
    const source = `
public class VarargMain {
  public static void main(String... args) {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/VarargMain.java", facts);
    expect(entries).toHaveLength(1);
    expect(entries[0].trigger).toBe("main");
  });

  test("비-static main → 무시", async () => {
    const source = `
public class NotEntry {
  public void main(String[] args) {}
}`;
    const facts = await scanJavaFile(source);
    const entries = extractJavaBatchEntries("src/NotEntry.java", facts);
    expect(entries).toHaveLength(0);
  });
});

// ── extractXmlBatchEntries ────────────────────────────────────────────────────

describe("extractXmlBatchEntries — Quartz XML", () => {
  test("CronTriggerFactoryBean → quartz trigger", () => {
    const xml = `<?xml version="1.0"?>
<beans>
  <bean id="reportTrigger"
        class="org.springframework.scheduling.quartz.CronTriggerFactoryBean">
    <property name="cronExpression" value="0 0 * * * ?"/>
    <property name="jobDetail" ref="reportJobDetail"/>
  </bean>
</beans>`;
    const entries = extractXmlBatchEntries("src/quartz-jobs.xml", xml);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.trigger).toBe("quartz");
    expect(e.schedule).toBe("cron=0 0 * * * ?");
    expect(e.handler).toBe("reportJobDetail");
    expect(e.entryId).toBe("batch:src/quartz-jobs.xml#reportTrigger");
    expect(e.filePath).toBe("src/quartz-jobs.xml");
    expect(e.line).toBeGreaterThan(0);
  });

  test("CronTriggerBean (org.quartz) → quartz trigger", () => {
    const xml = `<beans>
  <bean id="myTrigger" class="org.quartz.CronTriggerBean">
    <property name="cronExpression" value="0 30 9 * * ?"/>
  </bean>
</beans>`;
    const entries = extractXmlBatchEntries("quartz.xml", xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].trigger).toBe("quartz");
  });

  test("JobDetail bean → quartz 트리거 아님 → 무시", () => {
    const xml = `<beans>
  <bean id="myJob" class="org.springframework.scheduling.quartz.JobDetailFactoryBean">
    <property name="jobClass" value="com.example.MyJob"/>
  </bean>
</beans>`;
    const entries = extractXmlBatchEntries("quartz.xml", xml);
    expect(entries).toHaveLength(0);
  });

  test("cronExpression <value> 자식 태그 형식", () => {
    const xml = `<beans>
  <bean id="cronTrigger" class="org.springframework.scheduling.quartz.CronTriggerFactoryBean">
    <property name="cronExpression">
      <value>0 0 12 * * ?</value>
    </property>
  </bean>
</beans>`;
    const entries = extractXmlBatchEntries("quartz.xml", xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].schedule).toBe("cron=0 0 12 * * ?");
  });
});

describe("extractXmlBatchEntries — <task:scheduled>", () => {
  test("cron 속성", () => {
    const xml = `<beans>
  <task:scheduled ref="myBean" method="runTask" cron="0 0 6 * * ?"/>
</beans>`;
    const entries = extractXmlBatchEntries("tasks.xml", xml);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.trigger).toBe("task-xml");
    expect(e.schedule).toBe("cron=0 0 6 * * ?");
    expect(e.handler).toBe("myBean#runTask");
    expect(e.entryId).toBe("batch:tasks.xml#myBean.runTask");
  });

  test("fixed-rate 속성", () => {
    const xml = `<beans>
  <task:scheduled ref="poller" method="poll" fixed-rate="3000"/>
</beans>`;
    const entries = extractXmlBatchEntries("tasks.xml", xml);
    expect(entries[0].schedule).toBe("fixedRate=3000");
    expect(entries[0].trigger).toBe("task-xml");
  });

  test("fixed-delay 속성", () => {
    const xml = `<beans>
  <task:scheduled ref="checker" method="check" fixed-delay="1000"/>
</beans>`;
    const entries = extractXmlBatchEntries("tasks.xml", xml);
    expect(entries[0].schedule).toBe("fixedDelay=1000");
  });

  test("schedule 없는 task:scheduled → schedule=null", () => {
    const xml = `<beans>
  <task:scheduled ref="svc" method="run"/>
</beans>`;
    const entries = extractXmlBatchEntries("tasks.xml", xml);
    expect(entries[0].schedule).toBeNull();
  });

  test("ref/method 없으면 무시", () => {
    const xml = `<beans>
  <task:scheduled cron="0 * * * * ?"/>
</beans>`;
    const entries = extractXmlBatchEntries("tasks.xml", xml);
    expect(entries).toHaveLength(0);
  });

  test("빈 XML → 빈 배열", () => {
    const entries = extractXmlBatchEntries("empty.xml", "<beans></beans>");
    expect(entries).toHaveLength(0);
  });
});
