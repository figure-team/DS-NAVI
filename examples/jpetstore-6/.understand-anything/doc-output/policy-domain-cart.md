---
docId: policy-domain-cart
title: 장바구니 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: af7b83995e3bca72a2f211c9cb23ce8780baff5d
evidenceRate: 0.48484848484848486
---

# 장바구니 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 장바구니 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | src/main/java/org/mybatis/jpetstore/domain/Cart.java | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 《서비스 전략과 연결된 목적 기술》 | [추정] |  |
| 적용 범위 | Cart | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java` |
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
| PL-001 | 《 》 | cartItem == null | cartItem = new CartItem(); cartItem.setItem(item); cartItem.setQuantity(0); cartItem.setInStock(isInStock); itemMap.put(item.getItemId(), c… | 1 | addItem() · if | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:69` |
| PL-002 | 《 》 | cartItem == null | return null; | 2 | removeItemById() · if | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:90` |
| PL-003 | 《 》 | workingItemId == null \|\| workingItemId.trim().isEmpty() | setMessage("Invalid item ID: cannot add item to cart."); return new ForwardResolution(ERROR); | 3 | addItemToCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:70` |
| PL-004 | 《 》 | cart.containsItemId(workingItemId) | cart.incrementQuantityByItemId(workingItemId); | 4 | addItemToCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:75` |
| PL-005 | 《 》 | workingItemId == null \|\| workingItemId.trim().isEmpty() | setMessage("Invalid item ID: cannot remove item from cart."); return new ForwardResolution(ERROR); | 5 | removeItemFromCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:96` |
| PL-006 | 《 》 | item == null | setMessage("Attempted to remove null CartItem from Cart."); return new ForwardResolution(ERROR); | 6 | removeItemFromCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:103` |
| PL-007 | 《 》 | quantity < 1 | cartItems.remove(); | 7 | updateCartQuantities() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:126` |

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 《 》 | 《 》 | 《 》 | [추정] |  |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] addItem(): IF cartItem == null → cartItem = new CartItem(); cartItem.setItem(item); cartItem.setQuantity(0); cartItem.setInStock(isInStock); itemMap.put(item.getItemId(), c…. 근거: `src/main/java/org/mybatis/jpetstore/domain/Cart.java:69`
- [확정] removeItemById(): IF cartItem == null → return null;. 근거: `src/main/java/org/mybatis/jpetstore/domain/Cart.java:90`
- [확정] addItemToCart(): IF workingItemId == null || workingItemId.trim().isEmpty() → setMessage("Invalid item ID: cannot add item to cart."); return new ForwardResolution(ERROR);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:70`
- [확정] addItemToCart(): IF cart.containsItemId(workingItemId) → cart.incrementQuantityByItemId(workingItemId);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:75`
- [확정] removeItemFromCart(): IF workingItemId == null || workingItemId.trim().isEmpty() → setMessage("Invalid item ID: cannot remove item from cart."); return new ForwardResolution(ERROR);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:96`
- [확정] removeItemFromCart(): IF item == null → setMessage("Attempted to remove null CartItem from Cart."); return new ForwardResolution(ERROR);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:103`
- [확정] updateCartQuantities(): IF quantity < 1 → cartItems.remove();. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:126`
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
| cartItem == null | 장바구니에 담으려는 상품이 아직 장바구니에 없는 경우, 해당 상품에 대한 새 장바구니 항목을 수량 0으로 생성하여 등록하고 재고 여부를 함께 기록한다. 이미 담긴 상품이면 새 항목을 만들지 않고 기존 항목을 사용하며, 어느 경우든 마지막에 수량을 1 증가시킨다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:69` |
| cartItem == null | 장바구니에서 특정 상품을 제거할 때, 해당 상품 항목이 장바구니에 존재하지 않으면 제거 결과로 아무것도 반환하지 않는다. 존재하는 경우에만 항목을 목록에서 제거하고 제거된 상품을 반환한다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:90` |
| workingItemId == null \|\| workingItemId.trim().isEmpty() | 장바구니 담기 요청 시 대상 상품 식별자가 비어 있거나 공백뿐이면 유효하지 않은 것으로 보아 담기를 수행하지 않고 오류 안내와 함께 오류 화면으로 처리한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:70` |
| cart.containsItemId(workingItemId) | 담으려는 상품이 이미 장바구니에 들어 있으면 새로 추가하지 않고 해당 상품의 수량만 1 증가시킨다. 담겨 있지 않은 경우에는 실시간 재고 여부를 조회한 뒤 상품 정보와 함께 새 항목으로 추가한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:75` |
| workingItemId == null \|\| workingItemId.trim().isEmpty() | 장바구니에서 상품을 빼는 요청 시 대상 상품 식별자가 비어 있거나 공백뿐이면 유효하지 않은 것으로 보아 제거를 수행하지 않고 오류 안내와 함께 오류 화면으로 처리한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:96` |
| item == null | 장바구니에서 상품 제거를 시도했으나 실제로 제거된 상품이 없으면 오류 안내와 함께 오류 화면으로 처리하고, 정상적으로 제거된 경우에만 장바구니 화면으로 되돌린다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:103` |
| quantity < 1 | 장바구니 수량을 일괄 갱신할 때 입력된 수량이 1 미만이면 해당 상품 항목을 장바구니에서 제거한다. 숫자가 아닌 잘못된 수량 입력은 의도적으로 무시하고 기존 상태를 유지한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:126` |
<!-- policy-fill:end -->
