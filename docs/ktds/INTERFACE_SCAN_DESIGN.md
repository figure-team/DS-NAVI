# W1 설계 — 대외 인터페이스 스캔 + 인터페이스 정의서 확장

> 로드맵: `SI_EXPANSION_ROADMAP.md` P1 · 브랜치 `feat/si-expansion`
> 전제 조사(2026-07-04): `si-인터페이스정의서`(doc-set.ts:36, buildSiInterfaceSpec)는 **수신 라우트 재구성 전용**. outbound(송신/대외 연계) 신호를 잡는 스캐너는 전무 — edges.ts는 프로젝트 내부 파일 의존만 추적. jpetstore-6은 outbound 신호 0건(MyBatis+HSQLDB 로컬 완결)이므로 픽스처 신설 + eGov cop 실측으로 검증한다.

## 1. 목표

대외/대내 연계(송신)를 결정론으로 전수 추출하고, 기존 수신 라우트와 합쳐 **양방향 인터페이스 정의서**를 만든다. 모든 항목 file:line 근거, 미해석은 [미확인]으로 명시(침묵 누락 금지).

## 2. 신호 카탈로그 (Tier)

### T1 — 타입/호출 기반 (결정론, CONFIRMED)
| 프로토콜 | 신호 |
|---|---|
| http | `RestTemplate`, `WebClient`, `FeignClient`/`@FeignClient`, Apache `HttpClient`, `HttpURLConnection`, `OkHttp` |
| ws(SOAP) | JAX-WS `Service`/`@WebServiceClient`, Axis, CXF 클라이언트, `*.wsdl` 존재 |
| mq | `JmsTemplate`, `KafkaTemplate`/`@KafkaListener`(수신도 기록), `RabbitTemplate` |
| file | `JSch`(SFTP), commons-net `FTPClient`, `SmbFile` |
| socket | `java.net.Socket`, `ServerSocket`(수신) |
| mail | `JavaMailSender`, `javax.mail.Transport` |
| db-link | SQL 내 `@dblink` 패턴(mapper XML·DDL), `DATABASE LINK` DDL |

탐지 방식: 기존 스캐너 관례를 따라 tree-sitter Java + 라인 정규식 병용. import 문 + 호출 지점(메서드 인보케이션) 양쪽을 잡되, **호출 지점을 1급 근거**로 기록.

### T2 — 설정/리터럴 해석 (결정론, CONFIRMED/UNRESOLVED)
- endpoint 인자가 문자열 리터럴 → `resolved` 확정.
- `${property.key}` / `@Value` / `Environment.getProperty` → `application*.properties|yml`, spring XML `<property>`를 추적해 해석. 실패 시 `endpoint.raw`만 남기고 `[미확인]`.
- spring XML bean 정의(HttpInvoker, JaxWsPortProxyFactoryBean 등)와 `web.xml`도 스캔 대상.

### T3 — LLM 보강 ([추정], 후순위 P1-c)
- 대상 시스템 명명(엔드포인트 호스트→시스템명), 송수신 데이터 요약. 전부 `[추정]` 마킹, 기존 INFERRED_CELL 관례 재사용.

## 3. 산출물 스키마 — `.spec/map/interfaces.json`

```jsonc
{
  "gitCommit": "<sha>",
  "items": [
    {
      "id": "IF-HTTP-001",              // protocol별 연번 (정렬 후 부여 → 결정론)
      "direction": "outbound",           // outbound | inbound-extra (MQ 리스너 등 라우트 외 수신)
      "protocol": "http",               // http|ws|mq|file|socket|mail|db-link
      "clientType": "RestTemplate",
      "endpoint": { "raw": "${pay.api.url}/v1/approve", "resolved": "https://…", "resolvedFrom": "application.yml:12" },
      "dataHint": "POST JSON",          // 결정론으로 잡히는 범위만
      "callSites": [{ "file": "src/…/PayClient.java", "line": 42, "symbol": "approve" }],
      "unresolved": false
    }
  ],
  "stats": { "total": 12, "unresolvedEndpoints": 3, "byProtocol": { "http": 8 } }
}
```

- 정렬: `(protocol, callSites[0].file, line)` → id 부여. `stableJson`으로 기록. 동일 commit byte-diff=0.
- 신호 0건이어도 파일은 기록(`items: []`) — "스캔했고 없음"과 "안 스캔함"의 구분이 커버리지의 핵심.

## 4. 파이프라인 통합

1. 신규 모듈 `legacy-core/src/interface-scan/`(scan.ts, resolve.ts, types.ts).
2. `scanDomainMap`(domain-map/extract.ts:169)의 stage 시퀀스에 `extractInterfaces` 추가(라우트 추출 뒤).
3. `persist.ts`에 `interfaces.json` 상수 + writer 추가(`writeMapArtifact` 재사용).
4. `src/index.ts` 재수출, `understand-map.mjs` `runScan` 리포트에 "인터페이스 N건(미해석 M)" 한 줄 추가. 독립 서브커맨드는 두지 않음(스캔 일부).
5. `coverage-report`: `CoverageInputs`에 interfaces 추가 — 총계·프로토콜별·미해석 수 노출.

## 5. 문서 통합 — 기존 `si-인터페이스정의서` 확장

- 별도 문서를 만들지 않고 기존 문서를 **§1 수신(API) / §2 송신(대외 연계)** 2섹션으로 확장.
- `buildSiInterfaceSpec`(methodology/si-standard.ts:138)에 `interfaces.json` 입력 추가.
- §2 컬럼: `IF_ID | 프로토콜 | 방향 | 대상시스템[추정] | 엔드포인트 | 데이터 | 호출 위치(file:line) | 상태(확정/미확인)`.
- `templates/doc/interface-spec.md`에 §2 섹션 추가(사용자 커스텀 관례 유지 — 프로젝트 오버라이드 우선 로드는 기존 그대로).
- 대시보드: doc-output 경로로 산출물 탭에 자동 노출(추가 작업 없음).

## 6. 검증 전략

- **픽스처 신설** `legacy-core/fixtures/interface-scan/`: RestTemplate 리터럴/프로퍼티 참조, WebClient, @FeignClient, HttpURLConnection, JmsTemplate, KafkaTemplate, JSch, mapper XML 내 dblink, 미해석 케이스(동적 조립 URL). 각각 기대 JSON 스냅샷.
- **jpetstore 실측**: 0건 + coverage에 "인터페이스 0건" 명시 — 음성(negative) 케이스로 고정.
- **eGov cop 실측**(/home/jk/projects/ktds/apm-project/egov-cop): outbound 신호 존재 여부 확인, 있으면 수동 대조.
- 결정론: 동일 commit 2회 실행 byte-diff=0 테스트.

## 7. 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| P1-a | 스키마+T1 스캐너+픽스처+파이프라인 통합 | 픽스처 스냅샷 green, jpetstore 0건 |
| P1-b | T2 endpoint 해석(properties/yml/XML)+dblink | 참조 해석 픽스처 green, 미해석 [미확인] 처리 |
| P1-c | 문서 빌더 §2 확장+템플릿+coverage 통합 (+T3 [추정] 보강 훅) | 인터페이스 정의서 양방향 렌더, doc-set 테스트 green |
| P1-d | eGov cop 실측+결정론 검증+사용자 컨펌 | 실측 리포트, byte-diff=0 |

## 8. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계 | ✅ | 1c0a3f6 | |
| P1-a | ✅ | 410f9c7 | 스캐너+픽스처 4종(18항목) 골든 등가 8테스트 |
| P1-b | ✅ | 410f9c7 | `${key}`/`${key:default}` properties+yml 해석, P1-a 와 동시 구현 |
| P1-c | ✅ | 207fbeb | §2 outbound-list, 방법론 테스트 2건, 스냅샷 검수 갱신 |
| P1-d | ✅ | (본 커밋) | 실측 결과 아래 §9 |

## 9. P1-d 실측 결과 (2026-07-04)

- **jpetstore-6** (148파일): 인터페이스 **0건** — 설계 예상대로 음성 케이스. 로컬 HSQLDB 완결형.
- **eGov cop** (587파일): 인터페이스 **0건**. 스캐너 누락이 아님을 raw grep 교차 검증
  (RestTemplate/HttpClient/Feign/JMS/Kafka/Socket/FTP/JSch/DATABASE LINK — 전 패턴 0히트).
  UI 컴포넌트 모듈 특성상 타당. **양성 커버리지는 픽스처 4종 18항목이 담당.**
- **결정론**: jpetstore 사본에서 `scanDomainMap` 2회 실행 —
  interfaces.json/coverage.json/census.json sha256 동일(byte-diff=0).
- coverage.json 에 `interfaces: {total:0, unresolvedEndpoints:0, byProtocol:[]}` 정상 기록
  ("스캔했고 없음"의 증거).

## 10. 적대적 리뷰 반영 (2026-07-04, 010d0d3)

비평 지적 8건 중 5건 즉시 반영, 3건 후속 백로그로 결정.

**반영됨**
1. *recall 절벽·false 0건* → ①suspectSignals(http 리터럴/jdbc/wsdl, 테스트 경로 제외) +
   0건 시 커버리지·runScan 경고, ②`understanding.config.json interfaceScan.clients` 커스텀
   연계모듈 seam(사내 EAI 래퍼 등록, 플러그인 수정 불요). eGov cop 실측에서 raw jdbc
   DB유틸(SmsBasicDBUtil)을 의심신호로 실검출.
2. *call-site 당 1행 건수 부풀림* → (방향,프로토콜,클라이언트,엔드포인트) 병합 +
   callSites 누적, stats 에 total(연계 건수)/callSiteTotal(호출 지점) 분리.
3. *위치 연번 id 불안정* → 내용 파생 `IF-<PROTO>-<sha256 8hex>`. 미해석 항목만 첫
   callSite 파생(라인 이동 시 변동 — 알려진 한계로 스키마 주석 명시).
4. *'상태=확정' 감리 오독* → '해석' 열(해석됨/[미확인])로 의미 축소, 신뢰도 열과 충돌 제거.
5. *감리 열 부족* → 인터페이스명(첫 호출 심볼 초안 [추정])·연계방식(프로토콜 파생 [추정])
   열 추가. '수신(라우트외)' 은어 제거, 템플릿 범례에 MQ 리스너 내부/대외 판단은 사람 몫 명시.

**적대적 코드리뷰 반영 (8f5ffdb)** — 발견 7건 전건 수정·회귀 고정(프로브 테스트 7건):
- H1 JDK HttpClient 체인 죽은 분기(innermost=identifier/field_access 미대응) → 탐지 복구+픽스처
- M2 이스케이프 리터럴 절단("틀린 확정값") → fragment+escape 전체 복원
- M3 동명 이타입 선언 스코프 충돌 오탐 → 모호 바인딩 포기
- M4 `*Request.Builder` 도메인 빌더 OkHttp 오탐 → 타입 세그먼트 정확 일치
- M5 한정 상수 오해석 → `Class.NAME` 한정 키 조회
- L6 빈 endpoint 확정 표기 → null 정규화(unresolved), L7 콤마 조인 dblink 탐지
- 리뷰어 "이상 없음" 확인: 결정론·크래시 경로·스키마 하위호환·오라클 정직성

**후속 백로그(범위 외 결정)**
- **사람 확정 레인**: §2 행의 인터페이스명/대상시스템/연계방식/주기를 대시보드에서 편집·확정
  (기존 노드상세·RTM 확정 플로우 재사용). → 별도 후속 단계(P6 RTM 계열과 묶어 검토).
- **주기/전문포맷/오류처리/암호화 열**: 정적 분석으로 합성 불가 — 확정 레인과 함께 사람 입력.
- **P11 매칭 키**: endpoint host/path 분해 + 대상시스템 정규 키는 P11 설계 시 schemaVersion 2 로.
- **§1(내부 API)·§2(대외) 문서 분리 여부**: 발주처 양식에 따라 갈림 — 템플릿 오버라이드로
  대응 가능하므로 현행 병합 유지, P4(xlsx) 시 시트 분리로 재검토.

### 구현 범위 주석 (설계 §2 카탈로그 대비)
- 구현됨: RestTemplate·WebClient(create/체인 uri)·FeignClient·Apache HttpClient(HttpGet/Post/Put/Delete/Patch)·
  HttpURLConnection(URL.openConnection)·OkHttp(Request.Builder.url)·JDK HttpClient(HttpRequest…uri)·
  JmsTemplate·KafkaTemplate·RabbitTemplate·@Kafka/Jms/RabbitListener·JSch·FTPClient·SmbFile·
  Socket/ServerSocket·JavaMailSender/Transport.send·JaxWsProxyFactoryBean·@WebServiceClient·
  dblink(FROM/JOIN/INTO/UPDATE `t@link` + CREATE DATABASE LINK)
- 미구현(후속): Axis 클라이언트, spring XML bean(HttpInvoker/JaxWsPortProxyFactoryBean) 정의,
  web.xml 기반 신호, `*.wsdl` 파일 존재 신호, mail endpoint 의 spring.mail.host 프로퍼티 승계
- 한계(정직): 수신자 타입 해석은 **단일 파일 내** 선언만(필드 주입 타입이 다른 파일에 있으면
  누락 가능 — Tier3 후속), 문자열 해석은 리터럴/같은 파일 상수/`+`연결/URI.create 까지
