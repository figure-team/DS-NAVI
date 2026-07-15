---
docId: 06_program-list
title: 프로그램 목록
methodology: as-built
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 1
---

# 프로그램 목록

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 프로그램 목록

소스 파일/클래스 1개 = 표 1행. 파일 경로·클래스는 census/노드 사실 → [확정] + 근거(file:line).
레이어=노드 layer(api/service/dao/db/other), 책임 요약=노드 summary(없으면 빈칸).
프로그램ID=PG-001.. (파일 경로 정렬 순서).

| 프로그램ID | 파일 경로 | 클래스 | 레이어 | 책임 요약 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| PG-001 | src/main/java/org/mybatis/jpetstore/domain/Account.java | Account | unknown | editAccount 흐름에서 갱신되는 데이터 구조인 Account 엔티티다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:27` |
| PG-002 | src/main/java/org/mybatis/jpetstore/domain/Cart.java | Cart | unknown | Cart.addItem이 신규 CartItem을 생성해 itemMap·itemList에 등록하고 incrementQuantity로 수량을 증가시킨다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:32` |
| PG-003 | src/main/java/org/mybatis/jpetstore/domain/CartItem.java | CartItem | unknown | CartItem이 item·quantity를 보관하고 setItem/incrementQuantity 시 calculateTotal로 합계를 재계산한다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:27` |
| PG-004 | src/main/java/org/mybatis/jpetstore/domain/Item.java | Item | unknown | Item이 itemId와 listPrice 등 품목 정보를 제공하여 장바구니 라인의 합계 계산에 사용된다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:26` |
| PG-005 | src/main/java/org/mybatis/jpetstore/domain/Order.java | Order | unknown | Order 객체가 저장 대상 주문 데이터(orderId, lineItems 등)를 보유하며 insertOrder의 입력이 된다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:30` |
| PG-006 | src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java | AccountMapper | dao | editAccount 흐름에서 account·profile·signon 행 갱신을 담당하는 MyBatis 매퍼다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:25` |
| PG-007 | src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java | CategoryMapper | dao | CategoryMapper.getCategory가 categoryId로 단건 카테고리를 조회한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java:27` |
| PG-008 | src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java | ItemMapper | dao | ItemMapper가 getInventoryQuantity와 getItem을 통해 재고 수량과 품목 단건을 영속 계층에서 조회한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java:28` |
| PG-009 | src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java | LineItemMapper | dao | LineItemMapper.insertLineItem이 주문에 속한 개별 라인 항목 레코드를 삽입한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java:27` |
| PG-010 | src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java | OrderMapper | dao | OrderMapper.getOrdersByUsername이 username으로 해당 사용자의 주문 목록을 조회하는 MyBatis 매퍼 메서드를 정의한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java:27` |
| PG-011 | src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java | ProductMapper | dao | editAccount 후 MyList 로딩 시 카테고리별 상품 목록을 조회하는 매퍼다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java:27` |
| PG-012 | src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java | SequenceMapper | dao | SequenceMapper.getSequence/updateSequence가 주문 ID 발번에 쓰이는 시퀀스 값을 조회·갱신한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java:25` |
| PG-013 | src/main/java/org/mybatis/jpetstore/service/AccountService.java | AccountService | service | editAccount 흐름에서 updateAccount 트랜잭션으로 계정·프로필을 갱신하고 조건부로 signon을 갱신한다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/AccountService.java:30` |
| PG-014 | src/main/java/org/mybatis/jpetstore/service/CatalogService.java | CatalogService | service | editAccount 후 favouriteCategoryId 상품 목록을 조회해 MyList를 채우는 카탈로그 서비스다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34` |
| PG-015 | src/main/java/org/mybatis/jpetstore/service/OrderService.java | OrderService | service | OrderService.getOrdersByUsername이 OrderMapper에 위임해 username으로 주문 목록을 반환한다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37` |
| PG-016 | src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java | AccountActionBean |  | 기본 핸들러 signonForm이 로그인 폼(SignonForm.jsp)으로 포워딩하는 진입 흐름이다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| PG-017 | src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java | CartActionBean |  | addItemToCart 핸들러가 workingItemId를 검증한 뒤, 이미 담긴 품목이면 수량을 증가시키고 신규 품목이면 재고 조회 후 Cart.addItem으로 추가한 다음 장바구니 화면으로 포워딩한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| PG-018 | src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java | CatalogActionBean |  | 기본 핸들러 viewMain이 MAIN(Main.jsp)으로 포워딩하여 카탈로그 메인 화면을 표시한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| PG-019 | src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java | OrderActionBean |  | listOrders는 세션 계정의 username으로 OrderService.getOrdersByUsername을 호출해 사용자별 주문 목록을 조회한 뒤 ListOrders 화면으로 포워딩한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| PG-020 | src/main/webapp/WEB-INF/web.xml | web |  | 모든 *.action 요청은 StripesDispatcher(DispatcherServlet)로 디스패치되어 해당 Stripes 액션 빈으로 위임된다. | [확정] | `src/main/webapp/WEB-INF/web.xml:60` |
