---
docId: 06_program-list
title: 프로그램 목록
methodology: as-built
status: DRAFT
sourceCommit: a73a85b4dc02c36b56a65d9a79f6cd45b350a700
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
| PG-001 | src/main/java/org/mybatis/jpetstore/domain/Account.java | Account | unknown | 수정 화면에서 입력한 값을 담아 서비스와 매퍼로 전달되는 계정 자료다. 이름과 성은 수정 업무에서 필수 입력으로 검증된다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:27` |
| PG-002 | src/main/java/org/mybatis/jpetstore/domain/Cart.java | Cart | unknown | 새 항목이면 수량 0으로 만들어 맵과 목록에 등록한 뒤 수량을 1 증가시키고, 이미 있는 항목이면 수량만 증가시킨다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:32` |
| PG-003 | src/main/java/org/mybatis/jpetstore/domain/CartItem.java | CartItem | unknown | 담기 시 상품·수량·재고 보유 여부가 설정되며, 설정될 때마다 합계 금액이 재계산된다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:27` |
| PG-004 | src/main/java/org/mybatis/jpetstore/domain/Item.java | Item | unknown | 카탈로그에서 조회한 상품 항목으로, 항목 식별자와 판매가를 장바구니 항목에 제공한다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:26` |
| PG-005 | src/main/java/org/mybatis/jpetstore/domain/Order.java | Order | unknown | 저장 대상이 되는 주문 데이터로, 채번된 주문번호와 주문품목 목록을 보유한다. | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:30` |
| PG-006 | src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java | AccountMapper | dao | 계정 수정 흐름에서 인적사항·개인화 설정·비밀번호 갱신 세 가지 영속 작업을 제공한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:25` |
| PG-007 | src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java | CategoryMapper | dao | 카테고리 ID로 CATEGORY 테이블에서 카테고리 한 건을 조회하며, 전체 카테고리 목록 조회도 제공한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java:27` |
| PG-008 | src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java | ItemMapper | dao | 상품 항목과 재고 수량을 데이터베이스에서 읽어 오는 마이바티스 매퍼 인터페이스다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java:28` |
| PG-009 | src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java | LineItemMapper | dao | 주문에 속한 주문품목을 한 건씩 저장하는 영속 인터페이스다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java:27` |
| PG-010 | src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java | OrderMapper | dao | 주문자 아이디로 주문 목록을 조회하는 영속 인터페이스다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java:27` |
| PG-011 | src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java | ProductMapper | dao | 계정 수정 후 이용자의 선호 분류에 해당하는 상품 목록을 조회한다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java:27` |
| PG-012 | src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java | SequenceMapper | dao | 채번 정보를 조회하고 다음 번호로 갱신하는 영속 인터페이스다. | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java:25` |
| PG-013 | src/main/java/org/mybatis/jpetstore/service/AccountService.java | AccountService | service | 계정 수정 업무를 하나의 트랜잭션으로 조율한다. 인적사항과 개인화 설정을 갱신하고, 비밀번호는 입력됐을 때만 바꾼다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/AccountService.java:30` |
| PG-014 | src/main/java/org/mybatis/jpetstore/service/CatalogService.java | CatalogService | service | 계정 수정 후 선호 분류 상품 목록을 조회해 돌려준다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:34` |
| PG-015 | src/main/java/org/mybatis/jpetstore/service/OrderService.java | OrderService | service | 주문자 아이디를 받아 해당 사용자의 주문 목록 조회를 주문 매퍼에 위임한다. | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:37` |
| PG-016 | src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java | AccountActionBean |  | 계정 화면에 업무 지정 없이 들어왔을 때 실행되는 기본 처리다. 별도 조회 없이 로그인 입력 화면으로 넘긴다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| PG-017 | src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java | CartActionBean |  | 요청받은 항목 식별자를 검증한 뒤, 이미 담긴 항목이면 수량을 1 증가시키고 새 항목이면 실시간 재고 보유 여부와 항목 정보를 조회해 장바구니에 추가한 다음 장바구니 화면으로 보낸다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| PG-018 | src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java | CatalogActionBean |  | 카탈로그의 기본 진입 처리기로, 별도 조회 없이 메인 화면으로 이동시킨다. 파라미터로 처리기가 지정되지 않은 요청이 이 기본 처리기로 들어온다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| PG-019 | src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java | OrderActionBean |  | 세션의 로그인 계정에서 주문자 아이디를 얻어 해당 사용자의 주문 목록을 조회하고 주문 목록 화면으로 전달한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
