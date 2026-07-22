---
runId: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
service: jpetstore-order
createdAt: 2026-07-25T14:20:00+09:00
confidence: medium
baselineCommit: fa8982d327ea2f93d694c4d7d44deb0fe9c5d1dd
---

# 코드 RCA 리포트 — order

## 근본 원인

주문 확정 시 재고 차감과 주문 삽입이 한 트랜잭션이 아니라, 예외 발생 시 재고만 차감되고 주문이 유실될 수 있다.
위치: src/main/java/org/mybatis/jpetstore/service/OrderService.java:60

## 수정 제안

OrderService.java:60 의 두 연산을 단일 트랜잭션 경계로 묶는다.
