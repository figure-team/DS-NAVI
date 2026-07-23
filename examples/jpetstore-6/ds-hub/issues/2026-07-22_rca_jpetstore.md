---
runId: 3c9a1f0b2d4e5a6b7c8d9e0f1a2b3c4d
service: jpetstore
createdAt: 2026-07-22T09:41:17+09:00
confidence: high
baselineCommit: fa8982d327ea2f93d694c4d7d44deb0fe9c5d1dd
---

# 코드 RCA 리포트 — jpetstore

## 근본 원인

장바구니에 없는 상품 ID 로 수량 변경 요청이 들어오면 널 체크 없이 그대로 사용해 NullPointerException 이 난다.
위치: src/main/java/org/mybatis/jpetstore/domain/Cart.java:110 (setQuantityByItemId), 같은 파일 105 (incrementQuantityByItemId), src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:125 (updateCartQuantities)
- updateCartQuantities 는 폼 파라미터로 넘어온 itemId 를 검증 없이 setQuantityByItemId 에 전달한다.
- setQuantityByItemId 는 itemMap.get(itemId) 결과를 널 체크 없이 setQuantity 를 호출한다 — 세션 만료 후 재제출이나 다른 탭에서 이미 삭제된 상품이면 null 이라 즉시 NPE.
- 결과: 수량 변경 제출이 500 오류로 실패하고, 같은 폼을 재제출하는 한 장바구니 갱신이 계속 막힌다.

## 수정 제안

itemMap 조회 결과에 널 가드를 추가하고, 진입 지점에서 존재 여부를 선검증한다.
1. Cart.java:110 과 :105 — itemMap.get 결과가 null 이면 무시(또는 로그 후 스킵)하도록 가드 추가.
2. CartActionBean.java:125 — 제출된 itemId 를 containsItemId 로 선검증한 뒤에만 수량 변경 호출(도메인과 웹 계층 규칙 일치).
3. (권장) 만료 세션 재제출·타 탭 삭제 케이스의 단위 테스트를 CartTest 에 추가.
※ 본 제안은 참고용이며 자동 적용되지 않음.

## 한계

- 발생 지점은 코드로 확정이나, 운영에서 카트에 없는 itemId 가 제출되는 실제 경로(멀티탭 동시 조작인지 세션 만료 재제출인지)는 로그만으로 특정하지 못함.
- 동일 클래스의 itemMap/itemList 이중 자료구조 동기화 문제는 이번 장애 범위 밖이라 다루지 않음.
