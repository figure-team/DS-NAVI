---
docId: policy-domain-order
title: 주문 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: af7b83995e3bca72a2f211c9cb23ce8780baff5d
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
| 목적 | 《서비스 전략과 연결된 목적 기술》 | [추정] |  |
| 적용 범위 | LineItem, Order, Sequence, LineItemMapper, OrderMapper, SequenceMapper, OrderService | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java`, `src/main/java/org/mybatis/jpetstore/domain/Order.java`, `src/main/java/org/mybatis/jpetstore/domain/Sequence.java`, `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java`, `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 《 》 | sequence == null | throw new RuntimeException( "Error: A null sequence was returned from the database (could not get next " + name + " sequence)."); | 1 | getNextId() · if | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:123` |
| PL-002 | 《 》 | accountBean == null \|\| !accountBean.isAuthenticated() | setMessage("You must sign on before attempting to check out. Please sign on and try checking out again."); return new ForwardResolution(Acc… | 2 | newOrderForm() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125` |
| PL-003 | 《 》 | cartBean != null | order.initOrder(accountBean.getAccount(), cartBean.getCart()); return new ForwardResolution(NEW_ORDER); | 3 | newOrderForm() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:128` |
| PL-004 | 《 》 | shippingAddressRequired | shippingAddressRequired = false; return new ForwardResolution(SHIPPING); | 4 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:145` |
| PL-005 | 《 》 | !isConfirmed() | return new ForwardResolution(CONFIRM_ORDER); | 5 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:148` |
| PL-006 | 《 》 | getOrder() != null | orderService.insertOrder(order); CartActionBean cartBean = (CartActionBean) session.getAttribute("/actions/Cart.action"); cartBean.clear();… | 6 | newOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:150` |
| PL-007 | 《 》 | accountBean.getAccount().getUsername().equals(order.getUsername()) | return new ForwardResolution(VIEW_ORDER); | 7 | viewOrder() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:178` |

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 《 》 | 《 》 | 《 》 | [추정] |  |

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
| TC-01 | 《 》 | 《 》 | PL-001 | [추정] |  |
| TC-02 | 《 》 | 《 》 | PL-002 | [추정] |  |
| TC-03 | 《 》 | 《 》 | PL-003 | [추정] |  |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 상태값 코드 그룹/enum 미정의(분기 조건의 상태값) | 미정 | 《 》 | [추정] |  |
| 2 | 《 》 | 《 》 | 《 》 | [추정] |  |

<!-- policy-fill:start -->
## 규범 진술 (LLM 보강)

> 위 앵커 표는 결정론 근거([확정]). 아래는 각 대상의 규범 진술 보강 — [확정] 인용은 기계 검증기가 실파일과 대조한다(불일치 시 인용 제거·[추정] 강등).

| 대상 | 규범 진술 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| sequence == null | 주문 채번 시 데이터베이스에서 조회한 채번 정보가 존재하지 않으면 다음 순번을 발급하지 않고 오류로 처리하여 중단한다. 채번 대상이 확인되지 않은 상태로는 주문 식별번호를 부여할 수 없다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:123` |
| accountBean == null \|\| !accountBean.isAuthenticated() | 주문서 작성은 로그인한 회원만 진행할 수 있다. 계정 정보가 없거나 인증되지 않은 상태에서는 결제(체크아웃)를 시작할 수 없으며, 로그인 후 다시 시도하도록 안내한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:125` |
| cartBean != null | 장바구니가 존재하는 경우에 한하여 해당 회원 계정과 장바구니 내용으로 주문을 초기화하고 신규 주문 작성 화면으로 진행한다. 장바구니가 없으면 주문을 생성할 수 없다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:128` |
| shippingAddressRequired | 배송지 별도 입력이 필요한 주문은 주문 확정 전에 배송지 입력 단계를 반드시 거친다. 배송지 입력이 요구된 경우 해당 요구 상태를 해제한 뒤 배송지 입력 화면으로 이동한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:145` |
| !isConfirmed() | 주문은 고객의 최종 확인 절차를 거치지 않으면 확정 처리하지 않는다. 확인이 완료되지 않은 주문은 주문 확인 화면으로 이동하여 고객의 확정을 받는다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:148` |
| getOrder() != null | 배송지 입력과 최종 확인을 모두 마치고 주문 정보가 유효하게 존재하는 경우에만 주문을 등록(저장)하고 장바구니를 비운 뒤 주문 완료로 처리한다. 주문 정보가 없으면 등록하지 않고 오류로 안내한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:150` |
| accountBean.getAccount().getUsername().equals(order.getUsername()) | 주문 조회는 본인 주문에 한하여 허용한다. 조회를 요청한 계정의 사용자와 주문에 기록된 사용자가 일치하는 경우에만 주문 상세를 열람할 수 있으며, 일치하지 않으면 열람을 차단하고 본인 주문만 조회 가능함을 안내한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:178` |
<!-- policy-fill:end -->
