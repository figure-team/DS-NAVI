# 언어 커버리지 매트릭스 (W9)

> **생성물 — 손편집 금지.** 단일 소스는 `legacy-core/src/coverage-report/matrix.ts` 이며,
> 이 문서는 `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write` 로 재생성한다.
> drift(선언≠문서)는 CI(coverage-matrix.test.ts)와 검증 스크립트가 잡는다.

## degrade 정의

- ● full — 그 언어의 일반 코드에서 동작(남는 한계는 비고에 명기)
- ◐ partial — 특정 관용구/프레임워크/파일 관례만(범위를 비고에 명기)
- — none — 산출물에 절대 나타나지 않아야 함(두 타깃 실측 검증 대상). 표에 없는 언어의 기본값

미지원 표면화: 문서/자산/순수 설정(denylist)을 제외한 **모든** 소스 언어가 계상 대상이다 —
미지 확장자(asp·vb·jcl·rpg 등 미등재 레거시 포함)일수록 표면화된다. 어떤 기능도 덮지 않는
언어(best=none)는 coverage.json `langSupport.unsupportedFiles` 로 "미지원 N건 [미확인]",
좁은 관용구만 스캔되는 언어(best=partial)는 `partialFiles` 로 "부분 지원 N건" 이 계상되고
스캔 출력·커버리지 리포트에 노출된다. 구조분석(routes·edges·complexity) 요약은 행별
`core` tier — 예: sql 은 db-schema 로 덮여 미지원은 아니지만 core=none.
알려진 한계: 확장자 없는 파일(lang=other, LICENSE/Makefile 등)은 소스/비소스 혼재로 계상하지 않는다.

## 기능 × 언어

| 기능 | bat | cmd | gradle | java | javascript | jsp | kts | properties | sh | sql | tsx | typescript | xml | yaml |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 진입점(라우트) | — | — | — | ● | ◐ | ◐ | — | — | — | — | ◐ | ◐ | ◐ | — |
| 배치 진입점 | ◐ | ◐ | — | ● | — | — | — | — | ◐ | — | — | — | ◐ | — |
| 구조 의존(엣지) | — | — | — | ● | — | — | — | — | — | — | — | — | ◐ | — |
| 메서드 호출 그래프 | — | — | — | ● | — | — | — | — | — | — | — | — | — | — |
| 대외 인터페이스 | — | — | — | ● | — | — | — | — | — | ◐ | — | — | ◐ | — |
| JPA/Spring Data | — | — | — | ● | — | — | — | — | — | — | — | — | — | — |
| DB 스키마 | — | — | ◐ | — | — | — | ◐ | ◐ | — | ● | — | — | ◐ | ◐ |
| 복잡도(위험 리포트) | — | — | — | ● | — | — | — | — | — | — | — | — | — | — |

## 비고(범위·한계 근거)

### 진입점(라우트) (`routes`)

- java: ● full — Spring(@RequestMapping 계열·composed·상수 해석)·Stripes
- javascript: ◐ partial — Next.js 파일 라우팅(app/pages)
- jsp: ◐ partial — 페이지 파일 = 진입점(URL 관례)
- tsx: ◐ partial — Next.js 파일 라우팅(app/pages)
- typescript: ◐ partial — Next.js 파일 라우팅(app/pages)
- xml: ◐ partial — web.xml 서블릿 매핑만

### 배치 진입점 (`batch`)

- bat: ◐ partial — java 실행 라인 탐지
- cmd: ◐ partial — java 실행 라인 탐지
- java: ● full — @Scheduled·main()·Quartz Java API·Executor·Timer
- sh: ◐ partial — java 실행 라인 탐지
- xml: ◐ partial — Quartz CronTrigger·task:scheduled·spring-batch 잡
- (예외) crontab 은 확장자 무관 경로 관례(crontab*/cron.d/)로 탐지 — 언어 행 없음

### 구조 의존(엣지) (`edges`)

- java: ● full — import·injection·field-type·ctor-param·extends/implements·impl
- xml: ◐ partial — *Mapper.xml namespace ↔ 매퍼 인터페이스(MyBatis)

### 메서드 호출 그래프 (`method-calls`)

- java: ● full — 8-receiver 해소(field/param/local/self/super/static/return-type/external)

### 대외 인터페이스 (`interfaces`)

- java: ● full — 클라이언트 카탈로그(HTTP/WS/MQ/파일/소켓/메일)+config seam
- sql: ◐ partial — db-link 신호만
- xml: ◐ partial — db-link 신호만
- (예외) properties 는 ${…} endpoint 플레이스홀더 해석의 입력 보조일 뿐 항목을 생산하지 않음(산출 기준 none)

### JPA/Spring Data (`jpa`)

- java: ● full — @Entity 계열·JpaRepository·파생쿼리·@Query(3-Tier 신뢰)

### DB 스키마 (`db-schema`)

- gradle: ◐ partial — liveDbSignals — *.gradle 드라이버 의존성
- kts: ◐ partial — liveDbSignals — *.gradle.kts 드라이버 의존성
- properties: ◐ partial — liveDbSignals — 설정 jdbc URL
- sql: ● full — CREATE TABLE DDL·COMMENT·dataload INSERT(tables)
- xml: ◐ partial — liveDbSignals — pom.xml 드라이버 의존성·설정 jdbc URL
- yaml: ◐ partial — liveDbSignals — 설정 jdbc URL(application.yml 등)

### 복잡도(위험 리포트) (`complexity`)

- java: ● full — AST 결정 포인트 근사(McCabe) — 비 java 는 미측정 null + [미확인] 노트
