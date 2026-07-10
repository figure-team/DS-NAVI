---
docId: policy-domain-account
title: 계정/회원 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0.4090909090909091
---

# 계정/회원 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 계정/회원 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | src/main/java/org/mybatis/jpetstore/domain/Account.java, src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java, src/main/java/org/mybatis/jpetstore/service/AccountService.java | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java`, `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java`, `src/main/java/org/mybatis/jpetstore/service/AccountService.java` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | [추정] 계정/회원 도메인은 회원가입(newAccount)·정보수정(editAccount)·로그인(signon) 기능으로 사용자를 식별·인증하고, 인증 여부(isAuthenticated)를 주문 등 다른 업무 도메인의 접근 제어 게이트로 제공하며, 선호 카테고리(favouriteCategoryId) 기반 상품 추천 등 개인화 쇼핑 경험을 지원하는 것을 목적으로 한다 | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106-121,137-142,159-177,195-197`, `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125` |
| 적용 범위 | Account, AccountMapper, AccountService | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java`, `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java`, `src/main/java/org/mybatis/jpetstore/service/AccountService.java` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| Account | [추정] 회원의 기본 프로필 정보(이메일·성명·배송주소·전화번호 등)와 로그인/개인화 정보를 하나로 묶은 도메인 객체. DB상 ACCOUNT/SIGNON/PROFILE/BANNERDATA 테이블을 조인해 구성됨 | 클래스명이자 조회 시 조인 뷰 개념 | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:27`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:26-50` |
| SIGNON | [추정] 로그인 자격증명(username/password)만 저장하는 테이블. username이 기본키(PK)로 유일성이 보장됨 | 인증 전용 테이블, ACCOUNT와 1:1(USERID=USERNAME) | [확정] | `src/main/resources/database/jpetstore-hsqldb-schema.sql:30-34` |
| PROFILE | [추정] 회원의 개인화 설정(언어 선호, 관심 카테고리, 메일링 수신 여부, 배너 표시 여부)을 저장하는 테이블 | ACCOUNT와 1:1, USERID로 연결 | [확정] | `src/main/resources/database/jpetstore-hsqldb-schema.sql:52-59` |
| 인증 상태 (authenticated) | [추정] AccountActionBean 세션 빈에 저장되는 boolean 플래그로 로그인 성공 여부를 나타냄. `isAuthenticated()`는 이 플래그, account가 null이 아님, account.username이 null이 아님을 모두 만족해야 true | signon() 성공 시 true로 설정, clear() 호출(로그아웃/로그인 실패) 시 false로 재설정 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:61,171,195-197,202-206` |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| CATEGORY | FISH | Fish | Fish | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:185` |
| CATEGORY | DOGS | Dogs | Dogs | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:186` |
| CATEGORY | REPTILES | Reptiles | Reptiles | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:187` |
| CATEGORY | CATS | Cats | Cats | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:188` |
| CATEGORY | BIRDS | Birds | Birds | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:189` |
| AUTH_STATE | true | 인증됨 | authenticated 플래그가 true이고 account != null이며 account.getUsername() != null인 경우 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:195-197` |
| AUTH_STATE | false | 미인증 | 위 세 조건 중 하나라도 거짓인 경우(초기값 포함, clear() 호출 후에도 해당) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:195-197,202-206` |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 자격증명 불일치 로그인 차단 | account == null | String value = "Invalid username or password. Signon failed."; setMessage(value); clear(); return new ForwardResolution(SIGNON); | 1 | signon() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:163` |

**충돌 처리 규칙**: [확정] `signon()`의 분기는 `if (account == null) { ... } else { ... }` 형태의 배타적(exclusive) if/else 구조이므로(`AccountActionBean.java:163-176`), 두 분기가 동시에 적용되는 경우는 없다 — 매 호출마다 정확히 하나의 분기만 실행된다. 현재 이 도메인에 정의된 정책은 PL-001(로그인 실패 처리)이 유일한 의사결정 지점이며, else 분기(로그인 성공 처리: 세션 등록·리다이렉트)는 아직 별도 정책으로 명세되지 않았다 — [확인 필요]. 향후 정책이 추가되어 동일 조건에 복수 정책이 매칭될 경우, §4 상단 안내문에 따라 우선순위 숫자가 낮은 정책을 먼저 적용한다.

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | signon 이벤트 요청 시 username 또는 password가 비어있음(null/공백) | Stripes `@Validate(required = true, on = {"signon", ...})` 애노테이션에 의해 `signon()` 핸들러 진입 전 요청 검증 단계에서 걸러짐 — PL-001(account == null 분기)에 도달하기 전에 프레젠테이션 계층에서 차단 | Stripes 검증 프레임워크 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:76-77,85-86` |
| 2 | 존재하지 않는 username 또는 password 불일치로 조회 결과가 없음 | `getAccountByUsernameAndPassword`가 매칭 행을 찾지 못해 account가 null이 되며, 아이디 미존재와 비밀번호 오류를 구분하지 않고 동일한 오류 메시지로 처리(PL-001 적용) | AccountActionBean.signon() | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:52-77`, `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:161,163-167` |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] signon(): IF account == null → String value = "Invalid username or password. Signon failed."; setMessage(value); clear(); return new ForwardResolution(SIGNON);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:163`
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | 존재하지 않는 username 또는 잘못된 password로 signon 요청(`getAccount(username, password)` 조회 결과 없음, 즉 account == null) | message에 "Invalid username or password.  Signon failed." 설정, account/myList/authenticated 초기화(`clear()`), SignonForm.jsp로 forward(재표시) | PL-001 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159-167,202-206` |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 비밀번호 정책(길이 제한 외 복잡도 규칙, 해시화 여부)이 코드에 명문화되어 있지 않음 — SIGNON.PASSWORD는 varchar(25) 평문 컬럼이며 SQL에서 `SIGNON.PASSWORD = #{param2}`로 평문 비교됨. 해시/솔트 처리 로직은 발견되지 않음 | 미검토 | 《 》 | [확인 필요] | `src/main/resources/database/jpetstore-hsqldb-schema.sql:30-34`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:52-77,122-130` |
| 2 | ACCOUNT.STATUS 코드값 체계(허용값 목록)가 코드/스키마에 정의되어 있지 않음 — 스키마상 nullable varchar(2)이고 Account.status는 저장/조회만 될 뿐, 코드 전체에서 특정 값을 설정하는 지점이나 값에 따라 분기하는 로직이 없으며 회원가입/수정 화면(JSP)에도 노출되지 않음 | 미검토 | 《 》 | [확인 필요] | `src/main/resources/database/jpetstore-hsqldb-schema.sql:36-50`, `src/main/java/org/mybatis/jpetstore/domain/Account.java:92-98`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:32,58,84,97` |
