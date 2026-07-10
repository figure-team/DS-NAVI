---
docId: policy-domain-order
title: 주문 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0.48484848484848486
---

# 주문 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 주문 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | src/main/java/org/mybatis/jpetstore/domain/LineItem.java, src/main/java/org/mybatis/jpetstore/domain/Order.java, src/main/java/org/mybatis/jpetstore/domain/Sequence.java, src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java, src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java, src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java, src/main/java/org/mybatis/jpetstore/service/OrderService.java | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java`, `src/main/java/org/mybatis/jpetstore/domain/Order.java`, `src/main/java/org/mybatis/jpetstore/domain/Sequence.java`, `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 인증된 고객이 장바구니(Cart) 내용을 근거로 배송지·청구지·결제수단을 확정해 주문(Order)을 생성하고, 주문 확정 시점에 재고를 차감하며 시퀀스(Sequence) 기반으로 주문번호를 순차 발급함으로써, 이후 고객 본인의 주문 이력 조회·확인을 가능하게 하는 것을 목적으로 한다. | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:286-324`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java:60-77`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java:121-130`, `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:76-80` |
| 적용 범위 | LineItem, Order, Sequence, LineItemMapper, OrderMapper, SequenceMapper, OrderService | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java`, `src/main/java/org/mybatis/jpetstore/domain/Order.java`, `src/main/java/org/mybatis/jpetstore/domain/Sequence.java`, `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| Order | 고객이 장바구니를 근거로 생성하는 주문 1건을 표현하는 도메인 객체. 배송지·청구지·결제수단·상태(status)·라인아이템(LineItem) 목록을 필드로 보유한다. | 주문의 헤더(header) 역할 | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:30-60` |
| LineItem | 주문에 속한 개별 상품 라인 1건(품목ID·수량·단가·합계)을 표현하는 도메인 객체. Order에 1:N으로 포함된다. | 주문의 상세(detail) 역할 | [추정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:27-37` |
| Sequence | 이름(name)별로 다음 발급 번호(nextId)를 관리하는 채번용 도메인 객체. OrderService.getNextId()가 이를 통해 주문번호를 순차 발급한다(예: name="ordernum"). | 채번 대상 이름은 호출부(getNextId 인자)에서 결정 | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Sequence.java:25-38`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java:61,121-129` |
| status (주문 상태) | Order가 보유한 2자리 이내 상태 코드 문자열 필드. 주문 생성(initOrder) 시 "P"로 고정 설정되며, 그 외 상태 전이 로직은 코드에서 확인되지 않는다. | 상세는 §3 참조 | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:59,316` |
| ORDERSTATUS | 주문별 상태 이력을 (orderid, linenum) 단위로 적재하는 테이블. insertOrder() 실행 시 insertOrderStatus()로 최초 상태 1건이 함께 기록된다. | 이력성 테이블(상태 갱신이 아닌 append) | [추정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:72`, `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104-107`, `src/main/resources/database/jpetstore-hsqldb-schema.sql:96-101` |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 주문 상태 (ORDERSTATUS.STATUS) | P | [추정] 신규 접수(Pending) | Order.initOrder() 호출 시 무조건 부여되는 초기 상태값. 코드 전체(적용 범위 파일 기준)에서 "P" 외 다른 상태값으로의 전이 로직·상수는 발견되지 않았다 — 사실상 유일하게 관측된 코드값이다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:316`, `src/main/resources/database/jpetstore-hsqldb-schema.sql:96-101` |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 주문번호 시퀀스 결번 방어(Fail-Fast) | sequence == null | throw new RuntimeException( "Error: A null sequence was returned from the database (could not get next " + name + " sequence)."); | 1 | getNextId() · if | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:123` |
| PL-002 | 미인증 체크아웃 차단 | accountBean == null \|\| !accountBean.isAuthenticated() | setMessage("You must sign on before attempting to check out. Please sign on and try checking out again."); return new ForwardResolution(Acc… | 2 | newOrderForm() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125` |
| PL-003 | 유효 장바구니 보유 시 신규 주문 폼 진입 | cartBean != null | order.initOrder(accountBean.getAccount(), cartBean.getCart()); return new ForwardResolution(NEW_ORDER); | 3 | newOrderForm() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:128` |
| PL-004 | 배송지 입력 단계 진입 | shippingAddressRequired | shippingAddressRequired = false; return new ForwardResolution(SHIPPING); | 4 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:145` |
| PL-005 | 주문 확정 전 확인 단계 강제 | !isConfirmed() | return new ForwardResolution(CONFIRM_ORDER); | 5 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:148` |
| PL-006 | 최종 주문 접수 및 장바구니 초기화 | getOrder() != null | orderService.insertOrder(order); CartActionBean cartBean = (CartActionBean) session.getAttribute("/actions/Cart.action"); cartBean.clear();… | 6 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:150` |
| PL-007 | 본인 주문 조회 제한 | accountBean.getAccount().getUsername().equals(order.getUsername()) | return new ForwardResolution(VIEW_ORDER); | 7 | viewOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:178` |

### 충돌 처리 규칙

[추정] 위 7개 정책은 하나의 결정 테이블처럼 동시에 평가되는 것이 아니라, 서로 다른 4개 메서드(`getNextId()`, `newOrderForm()`, `newOrder()`, `viewOrder()`)의 호출 시점마다 각각 독립적으로 적용된다. 메서드가 호출되지 않으면 그 메서드에 속한 정책도 평가되지 않는다.

- **`newOrderForm()`** (`OrderActionBean.java:119-135`): PL-002 → PL-003이 `if / else if` 체인으로 위에서 아래로 순서대로 평가되며, 먼저 참인 조건 1개만 적용된다. 두 조건이 모두 거짓인 경우(인증은 되어 있으나 `cartBean == null`)는 이 표에 없는 세 번째 `else` 분기로 빠져 "장바구니를 찾을 수 없다" 에러로 처리된다(`OrderActionBean.java:131-134`).
- **`newOrder()`** (`OrderActionBean.java:142-164`): PL-004 → PL-005 → PL-006이 `if / else if / else if` 체인으로 순서대로 평가되며, 먼저 참인 조건 1개만 적용된다(예: `shippingAddressRequired`가 true이면 PL-004만 적용되고 PL-005·PL-006은 그 호출에서 평가되지 않음). 세 조건이 모두 거짓인 경우(즉 `order == null`)는 이 표에 없는 네 번째 `else` 분기로 "주문 처리 오류" 에러가 발생한다(`OrderActionBean.java:160-163`).
- **PL-001과 PL-006의 관계**: PL-001은 독립적으로 호출되는 정책이 아니라, PL-006의 THEN(`orderService.insertOrder(order)`)이 실행되는 도중 `OrderService.insertOrder()` → `getNextId("ordernum")` 경로를 통해 중첩 실행된다(`OrderService.java:60-61`, `:121-126`). 즉 PL-001은 PL-006이 적용된 호출 안에서만, 그리고 그 실행 도중 시퀀스 조회가 일어나는 시점에만 평가된다.
- **`viewOrder()`** (`OrderActionBean.java:171-185`): PL-007은 단독 `if / else` 분기이며, `newOrder()`/`newOrderForm()`과는 별개의 HTTP 액션 호출이므로 다른 정책과 동시에 충돌할 일이 없다.

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | (PL-001) `sequence == null` — 요청한 이름(예: "ordernum")의 SEQUENCE 레코드가 DB에 없음 | `RuntimeException`을 던져 채번·주문 처리를 즉시 중단한다. 별도 catch/복구 로직 없이 상위로 전파됨 | 시스템(자동 예외 발생, 사람 개입 없음) | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:121-126` |
| 2 | (PL-002) 세션에 `AccountActionBean`이 없거나 `isAuthenticated()`가 false인 상태로 `newOrderForm()` 호출 | 주문 폼 대신 로그인 유도 메시지를 설정하고 `AccountActionBean`으로 포워드. `order`는 초기화(`clear()`)만 되고 생성되지 않음 | 시스템(자동 리다이렉트) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:124-127` |
| 3 | PL-002/003의 세 번째 분기 — 인증은 되어 있으나 세션에 `CartActionBean`이 없음(`cartBean == null`) | "장바구니를 찾을 수 없어 주문을 생성할 수 없다" 메시지를 설정하고 에러 화면으로 포워드 | 시스템(자동 에러 처리) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:131-134` |
| 4 | PL-004/005/006의 네 번째 분기 — `shippingAddressRequired == false`, `isConfirmed() == true`인데 `order == null`인 상태로 `newOrder()` 호출 | "주문 처리 중 오류가 발생했다(주문 정보 없음)" 메시지를 설정하고 에러 화면으로 포워드 | 시스템(자동 에러 처리) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:160-163` |
| 5 | PL-007의 else 분기 — 로그인 계정의 username과 조회 대상 `order.getUsername()`이 다름(타인 주문 조회 시도) | `order`를 null로 초기화하고 "본인 주문만 조회할 수 있다" 메시지를 설정, 에러 화면으로 포워드 | 시스템(자동 접근 제어) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:180-183` |
| 6 | PL-007 관련 — `viewOrder()`는 세션 키 `"accountBean"`으로 계정 빈을 조회하는데, 이 키는 `AccountActionBean.signon()` 성공 시에만 명시적으로 설정됨(다른 액션들은 `"/actions/Account.action"` 키를 사용). 해당 키가 세션에 없는 상태로 `viewOrder()`가 호출되면 `accountBean`이 null이 되어 `:178`에서 NPE 위험이 있음 | 코드상 null 체크 없음 — 세션 상태에 의존하는 잠재적 취약 지점으로 남아 있음 | [확인 필요] 담당 조직 미정 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:172-174`, `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:174,178` |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] getNextId(): IF sequence == null → throw new RuntimeException( "Error: A null sequence was returned from the database (could not get next " + name + " sequence).");. 근거: `src/main/java/org/mybatis/jpetstore/service/OrderService.java:123`
- [확정] newOrderForm(): IF accountBean == null || !accountBean.isAuthenticated() → setMessage("You must sign on before attempting to check out. Please sign on and try checking out again."); return new ForwardResolution(Acc…. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125`
- [확정] newOrderForm(): IF cartBean != null → order.initOrder(accountBean.getAccount(), cartBean.getCart()); return new ForwardResolution(NEW_ORDER);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:128`
- [확정] newOrder(): IF shippingAddressRequired → shippingAddressRequired = false; return new ForwardResolution(SHIPPING);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:145`
- [확정] newOrder(): IF !isConfirmed() → return new ForwardResolution(CONFIRM_ORDER);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:148`
- [확정] newOrder(): IF getOrder() != null → orderService.insertOrder(order); CartActionBean cartBean = (CartActionBean) session.getAttribute("/actions/Cart.action"); cartBean.clear();…. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:150`
- [확정] viewOrder(): IF accountBean.getAccount().getUsername().equals(order.getUsername()) → return new ForwardResolution(VIEW_ORDER);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:178`
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | 요청한 시퀀스 이름(예: "ordernum")에 해당하는 SEQUENCE 레코드가 DB에 없는 상태에서 `getNextId(name)` 호출 | `RuntimeException`이 발생하며 채번 처리가 중단된다 | PL-001 | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:121-126` |
| TC-02 | 세션에 `AccountActionBean`이 없거나 `isAuthenticated() == false`인 상태로 `newOrderForm()` 호출 | "You must sign on before attempting to check out. ..." 메시지가 설정되고 `AccountActionBean` 화면으로 포워드된다 | PL-002 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125-127` |
| TC-03 | 인증된 상태(`accountBean != null && isAuthenticated() == true`)이고 세션에 `cartBean`이 존재하는 상태로 `newOrderForm()` 호출 | `order.initOrder(account, cart)`가 실행되어 주문이 초기화되고 신규 주문 폼(`NewOrderForm.jsp`)으로 포워드된다 | PL-003 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:128-130` |
| TC-04 | `shippingAddressRequired == true`인 상태에서 `newOrder()` 호출 | `shippingAddressRequired`가 false로 재설정되고 배송지 입력 화면(`ShippingForm.jsp`)으로 포워드된다 | PL-004 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:145-147` |
| TC-05 | `shippingAddressRequired == false`, `isConfirmed() == false`인 상태에서 `newOrder()` 호출 | 주문 확인 화면(`ConfirmOrder.jsp`)으로 포워드된다 | PL-005 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:148-149` |
| TC-06 | `shippingAddressRequired == false`, `isConfirmed() == true`, `getOrder() != null`인 상태에서 `newOrder()` 호출 | `orderService.insertOrder(order)`가 호출되어 주문이 저장되고, 세션 장바구니가 `clear()`되며, "Thank you, your order has been submitted." 메시지와 함께 주문 상세 화면(`ViewOrder.jsp`)으로 포워드된다 | PL-006 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:150-159` |
| TC-07 | 로그인 계정의 username과 조회 대상 `order.getUsername()`이 동일한 상태로 `viewOrder()` 호출 | 주문 상세 화면(`ViewOrder.jsp`)으로 포워드된다 | PL-007 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:178-179` |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 상태값 코드 그룹/enum 미정의(분기 조건의 상태값) | 미정 | 《 》 | [추정] |  |
| 2 | 주문 취소/환불 처리 로직·정책이 코드 내에서 발견되지 않음(생성된 주문을 취소·환불하는 메서드·상태 전이가 없음) | 확인 필요 | 《 》 | [확인 필요] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java`, `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java` (전체 검토 결과 cancel/refund/취소/환불 관련 코드 없음) |
