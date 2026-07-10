---
docId: policy-domain-cart
title: 장바구니 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
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
| 목적 | 고객이 상품을 결제(체크아웃) 확정 전에 임시로 담아두고 수량을 조정할 수 있게 하여, 카탈로그 탐색과 주문 확정 사이의 중간 저장 공간을 제공한다. 여러 상품을 한 번에 담고 조정한 뒤 구매를 결정하게 함으로써 주문 완결(전환)을 지원하는 역할로 판단된다. | [추정] |  |
| 적용 범위 | Cart | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| Cart | 장바구니 도메인 객체. 상품ID→CartItem 매핑(itemMap)과 순서 보존 목록(itemList)을 함께 들고 있으며, 항목 추가/제거/수량 변경 및 소계(subTotal) 계산 메서드를 제공한다. 세션 범위(CartActionBean이 `@SessionScope`)에서 사용자별 장바구니 상태를 보관하는 역할로 판단된다. | 클래스 존재는 [확정], 역할 서술은 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:32` |
| CartItem | 장바구니에 담긴 개별 상품 항목. Item(상품), quantity(수량), inStock(재고 여부), total(항목별 합계 금액)을 필드로 가진다. | 클래스 존재·필드는 [확정] | [추정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:27` |
| workingItemId | 담기/삭제 요청 시 대상 상품을 식별하기 위해 CartActionBean이 보관하는 상품 ID 문자열 필드. | 필드 존재는 [확정], 용도 서술은 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:49` |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 재고 여부 (inStock) | true | 재고 있음 | CartItem이 담긴 시점의 실시간 재고 여부. `catalogService.isItemInStock(workingItemId)` 조회 결과를 담기 시점에 CartItem에 저장한다(다른 상품 상세 정보는 캐시되더라도 이 값만은 담을 때마다 갱신). [추정] 별도 코드 테이블/enum은 없고 boolean 필드다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:36`; `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:81` |
| 재고 여부 (inStock) | false | 재고 없음 | 위와 동일한 근거. isInStock 조회 결과가 false인 경우. [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:36`; `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:81` |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 신규 장바구니 항목 생성 | cartItem == null | cartItem = new CartItem(); cartItem.setItem(item); cartItem.setQuantity(0); cartItem.setInStock(isInStock); itemMap.put(item.getItemId(), c… | 1 | addItem() · if | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:69` |
| PL-002 | 미존재 항목 삭제 요청 무시 | cartItem == null | return null; | 2 | removeItemById() · if | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:90` |
| PL-003 | 담기 요청 상품ID 필수값 검증 | workingItemId == null \|\| workingItemId.trim().isEmpty() | setMessage("Invalid item ID: cannot add item to cart."); return new ForwardResolution(ERROR); | 3 | addItemToCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:70` |
| PL-004 | 기존 담긴 상품 수량 증가(중복 방지) | cart.containsItemId(workingItemId) | cart.incrementQuantityByItemId(workingItemId); | 4 | addItemToCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:75` |
| PL-005 | 삭제 요청 상품ID 필수값 검증 | workingItemId == null \|\| workingItemId.trim().isEmpty() | setMessage("Invalid item ID: cannot remove item from cart."); return new ForwardResolution(ERROR); | 5 | removeItemFromCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:96` |
| PL-006 | 장바구니 미존재 상품 삭제 오류 처리 | item == null | setMessage("Attempted to remove null CartItem from Cart."); return new ForwardResolution(ERROR); | 6 | removeItemFromCart() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:103` |
| PL-007 | 수량 1 미만 항목 자동 삭제 | quantity < 1 | cartItems.remove(); | 7 | updateCartQuantities() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:126` |

### 충돌 처리 규칙

- PL-001·PL-002는 `Cart` 도메인 객체 내부 메서드(`addItem`, `removeItemById`)의 분기이고, PL-003~PL-006은 `CartActionBean`의 `addItemToCart()`/`removeItemFromCart()` 메서드, PL-007은 `updateCartQuantities()` 메서드에 속한 분기다. 이들은 서로 다른 사용자 액션(담기/삭제/수량변경)에 대응하는 별도 메서드이며 호출 시점 자체가 다르므로, 동일 요청 안에서 동시에 평가되지 않고 각자 독립적으로 적용된다. [추정]
- 같은 메서드 안에서는 코드의 if 순서를 그대로 따르는 가드절/배타적 분기 구조다. `addItemToCart()`에서 PL-003(상품ID 공백 검증)이 참이면 즉시 `ERROR`로 반환되어 이후 PL-004는 평가되지 않는다(가드절). PL-003이 거짓일 때만 PL-004의 if/else(`containsItemId` 참/거짓)가 배타적으로 하나만 실행된다. `removeItemFromCart()`의 PL-005·PL-006도 동일하게 순차 가드절 관계다. [확정] 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68-87`, `:94-109`
- 표의 "우선순위" 열은 문서 내 정책 나열 순서이며, 실제 실행 순서는 각 메서드 내 if/else 코드 순서를 따른다. [추정]

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | (PL-001) 이미 담긴 상품을 다시 `addItem()`으로 담는 경우 | if(cartItem == null) 분기를 타지 않아 새 CartItem을 만들지 않고, 조건문 밖의 `cartItem.incrementQuantity()`만 실행되어 기존 항목 수량만 증가한다 | Cart | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:69,77` |
| 2 | (PL-002) 장바구니에 없는 itemId로 `removeItemById()` 호출 | `itemMap.remove(itemId)`가 null을 반환하고 itemList 제거 없이 그대로 null을 반환한다(예외 발생 없음) | Cart | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:88-91` |
| 3 | (PL-003/PL-005) workingItemId가 공백 문자열(" ")인 경우 | null이 아니어도 `trim().isEmpty()`가 true이므로 담기/삭제 모두 동일하게 오류 메시지 후 ERROR로 포워드된다 | CartActionBean | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:70,96` |
| 4 | (PL-007) 수량 입력값이 숫자로 파싱되지 않는 경우 | `Integer.parseInt(request.getParameter(itemId))`가 `NumberFormatException`을 던지면 catch 블록에서 그대로 무시되어 `setQuantityByItemId`도, PL-007의 삭제 분기도 실행되지 않고 기존 수량이 유지된다 | CartActionBean | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:124,129-131` |

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
| TC-04 | 이미 장바구니에 담긴 상품ID로 `addItemToCart()` 호출(`cart.containsItemId(workingItemId) == true`) | 새 CartItem을 생성하지 않고 `cart.incrementQuantityByItemId(workingItemId)`만 호출되어 기존 항목의 수량이 1 증가한다 | PL-004 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:75-76` |
| TC-05 | `removeItemFromCart()` 호출 시 workingItemId가 null이거나 공백 문자열 | "Invalid item ID: cannot remove item from cart." 메시지가 설정되고 `ForwardResolution(ERROR)`가 반환된다 | PL-005 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:96-98` |
| TC-06 | `removeItemFromCart()`에서 `cart.removeItemById(workingItemId)`가 null을 반환(장바구니에 해당 상품 없음) | "Attempted to remove null CartItem from Cart." 메시지가 설정되고 `ForwardResolution(ERROR)`가 반환된다 | PL-006 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:103-105` |
| TC-07 | `updateCartQuantities()`에서 특정 항목의 요청 수량 파싱 결과가 1 미만(0 또는 음수) | 해당 CartItem이 `cartItems.remove()`로 이터레이터에서 제거되어 장바구니에서 삭제된다 | PL-007 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:124-128` |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 상태값 코드 그룹/enum 미정의(분기 조건의 상태값) | 미정 | 《 》 | [추정] |  |
| 2 | `Cart.itemMap`은 `Collections.synchronizedMap`으로 감싸져 있으나 `Cart.itemList`(ArrayList)는 동기화되어 있지 않다. `addItem()`/`removeItemById()`가 두 컬렉션을 함께 갱신하는데, 세션 단일 스레드 가정이 실제로 보장되는지(동시 요청 시 데이터 정합성 문제 가능성) 코드만으로는 확인되지 않는다 | 미정 | 《 》 | [확인 필요] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:36-37,67-96` |
