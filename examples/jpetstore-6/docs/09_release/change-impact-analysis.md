---
docId: 09_change-impact
title: 변경 영향도 분석
methodology: as-built
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 0.18867924528301888
---

# 변경 영향도 분석

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 변경 대상 (시드)

이 문서는 **읽기전용 분석 산출물**입니다 — 검토·승인 상태기계(DRAFT→APPROVED) 밖이며 `[생성]` 예측은 net-new 라 CONFIRMED 를 받지 못합니다(선례 앵커만 실존 근거).

<!-- claims:FENCE:OPEN -->
- [확정] 변경 시드: src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java (origin: path). 근거: `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java`
- [확정] 변경 시드: src/main/java/org/mybatis/jpetstore/service/AccountService.java (origin: path). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java`
- [확정] 변경 시드: src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java (origin: path). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`
- [확정] 변경 시드: src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml (origin: path). 근거: `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml`
- [확정] 변경 시드: src/main/webapp/WEB-INF/web.xml (origin: path). 근거: `src/main/webapp/WEB-INF/web.xml`
<!-- claims:FENCE:CLOSE -->

## 영향 규모 집계 (공수 산정 입력)

도달 폐포의 **파일 수 기준 규모 신호**다 — 공수 그 자체가 아니라 산정 입력. 상류=영향받는 호출자, 하류=의존 협력자(시드 제외). 도메인 귀속=슬라이스 ownership.

**도메인별**

| 구분 | 상류 | 하류 | 계 |
| --- | ---: | ---: | ---: |
| (공용) | 0 | 8 | 8 |
| (미분류) | 2 | 0 | 2 |
| account | 0 | 1 | 1 |
| **계** | 2 | 9 | 11 |

**언어별**

| 구분 | 상류 | 하류 | 계 |
| --- | ---: | ---: | ---: |
| java | 2 | 6 | 8 |
| xml | 0 | 3 | 3 |
| **계** | 2 | 9 | 11 |

_(항목 없음)_

## API · 진입점 영향

<!-- claims:FENCE:OPEN -->
- [확정(AI)] 진입점 영향: route:ANY *.action, handler net.sourceforge.stripes.controller.DispatcherServlet (검출 both). 근거: `src/main/webapp/WEB-INF/web.xml:60`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action, handler AccountActionBean#signonForm (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?editAccount, handler AccountActionBean#editAccount (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?editAccountForm, handler AccountActionBean#editAccountForm (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?newAccount, handler AccountActionBean#newAccount (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?newAccountForm, handler AccountActionBean#newAccountForm (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?signoff, handler AccountActionBean#signoff (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184`
- [확정(AI)] 진입점 영향: route:ANY /actions/Account.action?signon, handler AccountActionBean#signon (검출 both). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159`
<!-- claims:FENCE:CLOSE -->

## 업무 흐름 · 도메인 영향

<!-- claims:FENCE:OPEN -->
- [추정] 흐름 영향: flow:ANY *.action → 도메인 web-inf (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?editAccount → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?editAccountForm → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?newAccount → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?newAccountForm → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?signoff → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Account.action?signon → 도메인 account (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Order.action?listOrders → 도메인 order (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Order.action?newOrderForm → 도메인 order (검출 step).
- [추정] 흐름 영향: flow:ANY /actions/Order.action?viewOrder → 도메인 order (검출 step).
- [추정] 도메인 영향: account.
- [추정] 도메인 영향: order.
- [추정] 도메인 영향: web-inf.
<!-- claims:FENCE:CLOSE -->

## DB · 영속성 영향

SQL 파일은 콜체인 간선에 등장하지 않아 도달성 밖입니다(census 인벤토리로만 후보화). 매퍼 XML이 건드리는 테이블/컬럼은 tableCandidateSlots의 SQL 슬라이스에서 인용 의무로 추출하세요.

host 인용 추출 대상 매퍼 슬라이스 4개 · KG 테이블 카탈로그 29개.

<!-- claims:FENCE:OPEN -->
- [확인 필요] 영속성 영향(매퍼): src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml [namespace org.mybatis.jpetstore.mapper.AccountMapper] · 진입점 1개.
- [확인 필요] 영속성 영향(매퍼): src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml [namespace org.mybatis.jpetstore.mapper.CategoryMapper] · 진입점 3개.
- [확인 필요] 영속성 영향(매퍼): src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml [namespace org.mybatis.jpetstore.mapper.ItemMapper] · 진입점 4개.
- [확인 필요] 영속성 영향(매퍼): src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml [namespace org.mybatis.jpetstore.mapper.ProductMapper] · 진입점 3개.
<!-- claims:FENCE:CLOSE -->

## 연관 모듈 (상류 영향)

<!-- claims:FENCE:OPEN -->
- [확정(AI)] 연관 모듈(상류): src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java (via injection, 깊이 1). 근거: `src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java:36`
- [확인 필요] 연관 모듈(상류): src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java (via field-type, 깊이 1). 근거: `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java:37`
<!-- claims:FENCE:CLOSE -->

## 연관 협력 (하류 의존 · 보조)

<!-- claims:FENCE:OPEN -->
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/domain/Account.java (via field-type, 깊이 1). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:59`
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java (via ctor-param,field-type, 깊이 2). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java (via ctor-param,field-type, 깊이 2). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java (via ctor-param,field-type, 깊이 2). 근거: `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34`
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/service/CatalogService.java (via field-type, 깊이 1). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:56`
- [확정(AI)] 연관 협력(하류): src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java (via extends, 깊이 1). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:42`
- [추정] 연관 협력(하류): src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml (via mapper-xml, 깊이 3).
- [추정] 연관 협력(하류): src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml (via mapper-xml, 깊이 3).
- [추정] 연관 협력(하류): src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml (via mapper-xml, 깊이 3).
<!-- claims:FENCE:CLOSE -->

## 신규 생성 권장 — 변경 ([변경])

생성예측 강도: **strong** · 선례 흐름 `flow:ANY /actions/Account.action?signon`. 이 문서는 **읽기전용 분석 산출물**입니다 — 검토·승인 상태기계(DRAFT→APPROVED) 밖이며 `[생성]` 예측은 net-new 라 CONFIRMED 를 받지 못합니다(선례 앵커만 실존 근거).

<!-- claims:FENCE:OPEN -->
- [확정] [변경] src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java. 근거: `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:1`
- [확정] [변경] src/main/java/org/mybatis/jpetstore/service/AccountService.java. 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java:43`
- [확정] [변경] src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159`
- [확정] [변경] src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml. 근거: `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:1`
- [확정] [변경] src/main/webapp/WEB-INF/web.xml. 근거: `src/main/webapp/WEB-INF/web.xml:37`
<!-- claims:FENCE:CLOSE -->

## 신규 생성 권장 — 생성 ([생성])

<!-- claims:FENCE:OPEN -->
- [추정] [생성] src/main/java/org/mybatis/jpetstore/web/actions/KakaoLoginController.java — KakaoLoginController (선례 앵커). 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159`
- [추정] [생성] src/main/java/org/mybatis/jpetstore/service/KakaoLoginService.java — KakaoLoginService (선례 앵커). 근거: `src/main/java/org/mybatis/jpetstore/service/AccountService.java:1`
- [추정] [생성] src/main/java/org/mybatis/jpetstore/mapper/KakaoLoginMapper.java — KakaoLoginMapper (선례 앵커). 근거: `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:1`
- [추정] [생성] src/main/java/org/mybatis/jpetstore/domain/KakaoLogin.java — KakaoLogin (선례 앵커). 근거: `src/main/java/org/mybatis/jpetstore/domain/Account.java:1`
<!-- claims:FENCE:CLOSE -->

## 검토 필요

<!-- claims:FENCE:OPEN -->
- [확인 필요] src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml: 비-Java 시드(xml) — edges가 java 기반이라 역방향 영향 빈약, host 보강 권장.
- [확인 필요] src/main/webapp/WEB-INF/web.xml: 비-Java 시드(xml) — edges가 java 기반이라 역방향 영향 빈약, host 보강 권장.
<!-- claims:FENCE:CLOSE -->
