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

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계 | ✅ | 08ab1b7 | |
| P2-a | ✅ | (본 커밋) | 빈 인덱스+핸들러 해석 3방식+slices 배선, 도달성 회귀 테스트 green |
| P2-b | ✅ | (본 커밋) | spring-batch/quartz-java/executor/timer/shell/crontab, 픽스처 4종 |
| P2-c | ✅ | (본 커밋) | batch-jobs.json(안정 id·도달범위·의심신호)+coverage+si-배치정의서 |
| P2-d | ✅ | (본 커밋) | 실측 §9, 적대적 리뷰는 별도 진행 |

## 10. 적대적 리뷰 반영 (2026-07-04)

### 설계 비평(critic) 처리

**반박(사실 검증으로 기각)** — "DI 주입 절단으로 잡의 하위 협력자가 여전히 unreached"(축2 핵심):
엣지 추출은 `injection`(@Autowired·@Resource·@Inject)·`field-type`·`impl`(인터페이스→구현)
엣지를 이미 산출한다(domain-map/types.ts EdgeKind). `@Autowired private SettleDao` 프로브로
injection 엣지 생성을 실증했고, quartz-xml 픽스처의 OrderSyncJob→OrderDao 를 @Autowired 로
바꿔 **DI 경유 도달성 회귀 테스트로 고정**. 실제 잔여 한계는 `Class.forName` 리플렉션 잡
(§한계에 명시)뿐.

**반영**
1. *운영 정의서 컬럼 부재(치명)* → 데이터대상·선행/후행·수행서버·재기동/실패처리 4열을
   **[미확인] 사람-채움 열**로 추가(생략 대신 표면화 — W1 철학 정합). 템플릿에 "정적
   인벤토리 기반 초안, 제출 전 사람 확정 필수" 명시.
2. *도달범위 숫자 오독* → 미해석 행은 [미확인](루트=XML 카운트 1 오독 방지), BFS 를 slices
   와 동일 depthCap 으로 정합, 템플릿에 의미(정적 근사) 명시.
3. *id 체계 W1 불일치* → `BAT-<트리거태그>-<hash8>`(BAT-QUARTZ-…, BAT-CRON-…).
   시드 중복(동일 정의 2행)은 dup 연번으로 유일성 보장(선수정 8d91936).
4. *의심신호 늑대소년* → ①구조 신호 1급 추가(org.quartz/QuartzJobBean/JobExecutionContext/
   springframework.batch 사용인데 미배선 — 명명 관례 없는 배치의 위음성 방지),
   ②`batchScan.ignoreSuspects` config 로 확인된 위양성(DeptJob) 영구 억제.
5. *P3 입력 부족* → `sliceRoot`(slices.json slice.root 조인 키) 필드 추가 — 배치 경계
   멤버 파일 목록은 slices 에서 조인(중복 저장 없이).
6. *배치명 초안 품질* → crontab/shell 은 명령 전문 대신 실행체 basename.

**백로그(범위 외 결정)**
- main() 트리거의 FP 구분(@SpringBootApplication/CLI 제외) — 기존 골든 등가 영역이라 신중 접근.
- as-built/API 순번 id(API-001) 재스캔 불안정 — W1/W2 교훈의 소급 적용, 별도 과제.
- 별도 repo 배치 스크립트(운영 형상) 인입 경로, 배치 체인(선행관계) 자동 추론, Class.forName.
- "핸들러 해소로 un-orphan 된 잡 클래스 수" 델타 지표.

### 적대적 코드 리뷰 처리 (인라인 수행 — 세션 한도로 외부 리뷰어 중단, 동일 체크리스트로
### 본 세션이 프로브 공격 실행)

**발견·수정 3건(전부 프로브 실증 후 수정, 회귀 프로브 3건으로 고정)**
1. [HIGH] `<batch:job-repository>`/`<job-repository>` 가 spring-batch 잡으로 오탐 —
   `\b` 가 `-` 앞에서 매칭. → 태그명 정확 일치 lookahead(`(?=[\s>/])`)로 수정.
2. [HIGH] 중첩 빈 property 오귀속 — 빈 본문을 "첫 `</bean>`"으로 근사해 ①중첩 빈의
   jobClass 가 외부 빈에 귀속(**틀린 handlerFile**), ②외부 자신의 후속 property 유실.
   → 깊이 추적 본문(beanBodyRange) + 중첩 빈 블랭킹(blankNestedBeans)으로 수정.
3. [MED] 인라인 jobDetail 관용구(`<property name="jobDetail"><bean class="…MethodInvoking…">`)
   에서 cronExpression 유실 + 핸들러 미해석 — batch.ts 도 동일 첫-`</bean>` 근사였음.
   → 깊이 추적 본문 적용 + 중첩 MethodInvoking 의 `targetObject#targetMethod` 해석
   (해석 체인: `syncJob#run` → 빈 class → 파일). 스프링+Quartz 고전 관용구 recall 확보.

**이상 없음 확인**: 기존 라우트/배치 골든 등가 무회귀(805 green), shell `\bjava\b`(javadoc
비매칭)·crontab 파일 선별·트리거 enum 하위호환(신규 필드는 optional, 구 파일 파싱 무해),
jpetstore 전 파이프라인 byte-diff=0.

**백로그(코드 리뷰 계열)**: SimpleTriggerFactoryBean, 중첩 JobDetailFactoryBean(jobClass)
인라인 관용구, spring-batch flow/split 스텝, 구조 의심신호의 주석 내 org.quartz 위양성.

## 9. P2-d 실측 결과 (2026-07-04)

- **jpetstore-6**: 배치 0건, 의심신호 0 — 음성 케이스. 전체 파이프라인 2회 실행
  batch-jobs/routes/slices/coverage sha256 동일(byte-diff=0).
- **eGov cop**: 배치 0건, 의심신호 1건 = `DeptJob.java` — 직무(부서업무) 의미의 Job 명명.
  **명명 휴리스틱의 알려진 위양성 패턴**이며, samples 로 사람이 수 초 내 기각 가능(설계 의도).
- 양성 커버리지: 픽스처 4종 13잡(quartz-xml 4·spring-batch 2·programmatic 3·shell-cron 4).
- 기존 803종 테스트 무회귀(798 green 시점 기준) — @Scheduled/quartz/task-xml 골든 등가 유지,
  BatchEntry.handlerFile 은 optional 추가라 구 routes.json 하위호환.
