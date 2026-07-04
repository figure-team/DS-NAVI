# W2 설계 — 배치/스케줄 잡 인벤토리 + 도달성 배선

> 로드맵: `SI_EXPANSION_ROADMAP.md` P2 · 브랜치 `feat/si-expansion`
> 전제 조사(2026-07-04): 배치 추출은 **이미 부분 존재** — `domain-map/routes/batch.ts`가
> @Scheduled/main(Java) + Quartz CronTriggerFactoryBean/task:scheduled(XML)을 routes.json
> `batchEntries`로 추출하고, slices 도달성이 batchEntries.filePath 를 루트로 쓴다(slices.ts:48).
> **그러나 XML 엔트리의 filePath 는 XML 파일이라 엣지가 없어, 실제 잡 클래스(jobDetail ref 빈)는
> 여전히 미도달(unreached)로 분류된다** — 이것이 "배치=데드코드 오판"의 실체.
> as-built `08_batch-list` 문서는 블루프린트 골든 등가 영역이므로 무수정.
> eGov cop·jpetstore 실측 배치 신호 0건 — 양성 커버리지는 픽스처가 담당(W1 동일).

## 1. 목표

1. **핸들러 해석(핵심)**: XML 배치 엔트리의 빈 ref → 클래스 FQN → 프로젝트 파일로 결정론
   해석해 `handlerFile` 을 채우고, 도달성 루트로 주입 — 잡 구현 클래스의 데드코드 오판 제거.
2. **신호 확장**: Spring Batch XML(전자정부 배치 표준)·Quartz Java API·프로그램적 스케줄러
   (ScheduledExecutorService/Timer)·shell(java 실행)·crontab 을 추가 탐지.
3. **배치 인벤토리 산출물**: `.spec/map/batch-jobs.json` — 내용 파생 안정 id(W1 교훈),
   도달 범위 요약, 미해석 [미확인] 표면화, 의심신호(잡처럼 보이는데 트리거 없는 클래스).
4. **SI 배치정의서**: si-standard 4번째 문서 `si-배치정의서`(batch-spec.md 템플릿).

## 2. 신호 카탈로그

| trigger | 소스 | 탐지 | 기존/신규 |
|---|---|---|---|
| `scheduled` | Java | `@Scheduled(cron/fixedRate/fixedDelay)` | 기존 유지 |
| `main` | Java | `public static void main` | 기존 유지 |
| `quartz` | XML | `CronTriggerFactoryBean`(jobDetail ref + cronExpression) | 기존 + **핸들러 해석 신규** |
| `task-xml` | XML | `<task:scheduled ref method cron>` | 기존 + **핸들러 해석 신규** |
| `spring-batch` | XML | spring-batch 네임스페이스 `<job id>` / `<batch:job>`, step tasklet `ref`/`class` | 신규 |
| `quartz-java` | Java | `newJob(X.class)`(JobBuilder), `cronSchedule("...")` 리터럴 | 신규 |
| `executor` | Java | `ScheduledExecutorService` 바인딩 수신자의 `schedule/scheduleAtFixedRate/scheduleWithFixedDelay`, `TaskScheduler.schedule` | 신규 |
| `timer` | Java | `Timer` 바인딩 수신자의 `schedule/scheduleAtFixedRate` | 신규 |
| `shell` | sh/bat/cmd | `java -jar <x.jar>` / `java -cp … <MainClass>` 라인 | 신규 |
| `crontab` | crontab*/cron.d/* | cron 5필드 라인 → schedule + command | 신규 |

Java 신규 탐지는 W1 java-scan 관례 재사용: 단일 파일 선언 바인딩(동명 이타입 모호 시 포기),
리터럴/같은 파일 상수 해석, 이스케이프 전체 복원.

## 3. 핸들러 해석 (스프링 빈 인덱스)

1. **빈 인덱스**: 전 XML census 파일에서 `<bean id|name class>` 수집 → `id → {class, file, line}`
   (중복 id 는 첫 출현 승리, relPath 정렬 순회 — 결정론).
2. **quartz**: jobDetail ref → 빈:
   - `MethodInvokingJobDetailFactoryBean` → `targetObject`(ref) 빈의 class + `targetMethod`
   - `JobDetailFactoryBean`/`JobDetailBean` → `jobClass` property 의 FQN
3. **task-xml**: ref 빈 id → class (+method 는 handler 표기에 유지).
4. **spring-batch**: tasklet `ref` 빈 → class, 또는 tasklet/chunk 의 reader/processor/writer ref
   중 첫 번째(대표) — 전부 notes 에 기록.
5. **FQN → 파일**: `com.foo.Bar` → census java 파일 중 `**/com/foo/Bar.java` 접미 일치.
   실패 시 단순명 `Bar.java` 유일 일치. 다중/0건 → `handlerFile: null`(미확인, 침묵 누락 금지).

`BatchEntry` 에 optional `handlerFile: string | null` 추가(additive — routes.json 하위호환).
`slices.ts` addEntry 에 `handlerFile` 도 루트로 등록(핵심 한 줄).

## 4. 산출물 — `.spec/map/batch-jobs.json`

```jsonc
{
  "schemaVersion": 1,
  "gitCommit": "<sha>",
  "jobs": [
    {
      "id": "BAT-<sha256 8hex>",        // 내용 파생(trigger|handler|schedule|file) — 재스캔 안정
      "name": "OrderSyncJob#execute",    // handler 기반 표기(사람 확정 전 초안)
      "trigger": "quartz",
      "schedule": "cron=0 0 4 * * ?",
      "handler": "orderSyncJob#execute",
      "handlerFile": "src/main/java/com/foo/OrderSyncJob.java", // 미해석 시 null
      "unresolvedHandler": false,
      "evidence": { "file": "src/main/resources/context-batch.xml", "line": 12 },
      "reachableFiles": 7                // handlerFile(없으면 filePath)에서 엣지 BFS 도달 수
    }
  ],
  "stats": { "total": 3, "byTrigger": [...], "unresolvedHandlers": 1 },
  "suspectSignals": {                    // *Job/*Batch/*Tasklet 명명인데 어떤 엔트리에도 안 물린 파일
    "count": 1,
    "samples": [{ "file": "src/main/java/com/foo/LegacyJob.java", "kind": "job-named-class" }]
  }
}
```

정렬: (trigger, handler, evidence.file, line). 0건도 기록. coverage 에 batch 지표 통합
(total/byTrigger/unresolvedHandlers/suspectSignals) + 미해석>0 경고.

## 5. SI 배치정의서 — `si-배치정의서` (신규 4번째)

- 템플릿 `templates/doc/batch-spec.md`, 섹션 키 `batch-list-si`.
- 열: `BAT_ID | 배치명 | 트리거 | 스케줄 | 핸들러 | 도달범위(파일) | 해석`
  — 배치명 = handler 초안 `[추정]`, 해석 = 핸들러 파일 해석 여부(해석됨/[미확인])
  (W1 교훈: '확정' 어휘 금지, 감리 오독 방지).
- 행 근거 = evidence file:line (CONFIRMED). methodology.test si 문서 수 3→4 갱신.

## 6. 검증

- **픽스처** `fixtures/batch-scan/`: quartz-xml(MethodInvoking+JobDetailFactory 해석),
  spring-batch-xml, programmatic(quartz-java/executor/timer), shell-cron, negative.
- **도달성 회귀(핵심)**: quartz-xml 픽스처에서 buildSlices ownership — 잡 클래스 파일이
  `unreached` 가 **아님**을 assert(현재는 unreached — 수정 전 red 확인).
- 기존 batch 픽스처/골든(routes-frameworks 등) 무회귀.
- jpetstore/eGov cop 실측 0건 음성 + byte-diff=0.
- 적대적 리뷰 2종(비평+코드) 후 반영.

## 7. 단계

| 단계 | 내용 |
|---|---|
| P2-a | 빈 인덱스 + 핸들러 해석 + slices 배선 + 도달성 회귀 테스트 |
| P2-b | 신규 신호 6종(spring-batch/quartz-java/executor/timer/shell/crontab) |
| P2-c | batch-jobs.json + coverage 통합 + si-배치정의서 |
| P2-d | 실측 + 적대적 리뷰 + 반영 |

## 8. 진행 현황

| 단계 | 상태 | 커밋 |
|---|---|---|
| 설계 | ✅ | |
| P2-a | ⬜ | |
| P2-b | ⬜ | |
| P2-c | ⬜ | |
| P2-d | ⬜ | |
