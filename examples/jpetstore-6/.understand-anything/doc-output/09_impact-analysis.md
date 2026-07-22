---
docId: 09_impact-analysis
title: 영향도 분석서
methodology: as-built
status: DRAFT
sourceCommit: a73a85b4dc02c36b56a65d9a79f6cd45b350a700
evidenceRate: 1
---

# 영향도 분석서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 고영향 컴포넌트

피의존수(fan-in)·전이 영향 파일수 기준 상위 컴포넌트. 변경 시 파급이 큰 핫스팟.
fan-in/fan-out 은 depends_on/imports/calls 엣지 집계 → [확정]. 전이 영향 파일수는 impact
엔진(reach) 결과. 레이어=노드 layer. 컴포넌트=파일 경로(근거 file:line). 피의존수 내림차순.

| 컴포넌트 | 피의존수(fan-in) | 의존수(fan-out) | 전이 영향(파일수) | 레이어 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| src/main/java/org/mybatis/jpetstore/domain/Item.java | 5 | 0 | 0 | unknown | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:26` |
| src/main/java/org/mybatis/jpetstore/domain/Account.java | 3 | 0 | 0 | unknown | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:27` |
| src/main/java/org/mybatis/jpetstore/domain/Order.java | 3 | 0 | 0 | unknown | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:30` |
| src/main/java/org/mybatis/jpetstore/service/CatalogService.java | 3 | 4 | 4 | service | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34` |
| src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java | 2 | 1 | 1 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java:28` |
| src/main/java/org/mybatis/jpetstore/domain/Cart.java | 1 | 0 | 0 | unknown | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:32` |
| src/main/java/org/mybatis/jpetstore/domain/CartItem.java | 1 | 1 | 1 | unknown | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:27` |
| src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java | 1 | 1 | 1 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:25` |
| src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java | 1 | 0 | 0 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java:27` |
| src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java | 1 | 0 | 0 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java:27` |
| src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java | 1 | 1 | 1 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java:27` |
| src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java | 1 | 0 | 0 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java:27` |
| src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java | 1 | 0 | 0 | dao | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java:25` |
| src/main/java/org/mybatis/jpetstore/service/AccountService.java | 1 | 2 | 2 | service | [확정] | `src/main/java/org/mybatis/jpetstore/service/AccountService.java:30` |
| src/main/java/org/mybatis/jpetstore/service/OrderService.java | 1 | 5 | 6 | service | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37` |
| src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java | 0 | 3 | 8 | api | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java | 0 | 4 | 7 | api | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java | 0 | 2 | 5 | api | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java | 0 | 2 | 7 | api | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |

## 도메인 간 의존

도메인 경계를 넘는 의존(결합). skeleton 의 교차 도메인 의존 엣지 → [확정] + 근거 건수.
출발/도착 도메인, 가중치, 근거 건수. 가중치 내림차순.

| 출발 도메인 | 도착 도메인 | 가중치 | 근거 건수 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
