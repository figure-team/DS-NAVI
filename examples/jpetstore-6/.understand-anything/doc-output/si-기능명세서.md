---
docId: si-기능명세서
title: SI 기능명세서
methodology: si-standard
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 1
---

# SI 기능명세서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 기능 목록

도메인 노드 1개 = 표 1행. 설명=도메인 summary, 진입점=domainMeta.entryPoint,
업무규칙=domainMeta.businessRules(없으면 [추정]). 관련 API/테이블은 그래프에 도메인↔라우트/
테이블 연결정보가 없으면 [추정](합성 금지, grounding 보존). 기능ID=FN-001.. (도메인 순서).

| 기능ID | 기능명 | 설명 | 진입점 | 관련 API | 관련 테이블 | 업무규칙 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FN-001 | 계정/회원 | 계정 도메인은 회원 로그인(signon)·로그아웃(signoff)·신규 등록(newAccount)·프로필 수정(editAccount)을 처리하고, 로그인 시 즐겨찾기 카테고리(favouriteCategoryId)의 상품을 MyList로 로딩하는 Stripes ActionBean 흐름을 담당한다. | [추정] | [추정] | [추정] | 계정 수정 시 account·profile은 항상 갱신하되, signon(비밀번호)은 비밀번호가 비어있지 않은 경우에만 updateSignon으로 갱신한다., 로그아웃은 세션을 무효화(invalidate)하고 빈 상태로 clear한다., 로그인 성공 시 password를 null로 비우고 favouriteCategoryId 기준 상품 목록을 MyList로 로딩한 뒤, 인증 플래그를 켜고 accountBean을 세션에 저장한다., 로그인은 AccountService.getAccount(username, password)로 자격증명을 검증하며, 결과가 null이면 인증 실패 메시지를 세팅하고 로그인 폼으로 되돌린다., 신규 계정 생성은 AccountService.insertAccount가 account·profile·signon 세 테이블 행을 트랜잭션으로 함께 기록한다., 인증 상태는 authenticated 플래그와 account 및 username의 존재를 모두 만족해야 true로 판단한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:43`, `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:170` |
| FN-002 | 장바구니 | 장바구니(cart) 도메인은 사용자가 품목을 담고(addItemToCart), 제거하고(removeItemFromCart), 수량을 갱신하고(updateCartQuantities), 내용을 조회한 뒤(viewCart) 주문으로 넘기는(checkOut) 흐름을 담당한다. 모든 요청은 session scope의 CartActionBean에서 처리된다. | [추정] | [추정] | [추정] | addItemToCart는 이미 담긴 품목이면 수량만 증가시키고, 신규 품목이면 CatalogService.isItemInStock으로 실시간 재고를 조회해 inStock 값과 함께 Cart.addItem으로 추가한다., addItem은 동일 itemId의 CartItem이 없을 때만 신규 CartItem을 생성해 itemMap·itemList에 등록하고, 마지막에 incrementQuantity로 수량을 1 증가시킨다., getSubTotal은 itemList의 각 라인에 대해 listPrice × quantity를 계산해 BigDecimal.ZERO에서 시작해 합산하여 장바구니 소계를 산출한다., updateCartQuantities는 각 품목의 수량을 요청 파라미터로 갱신하되, 수량이 1 미만이면 해당 라인을 장바구니에서 제거한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:38`, `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| FN-003 | 카탈로그 | 카탈로그 도메인은 카테고리 → 상품(product) → 품목(item) 순으로 탐색하고 키워드로 상품을 검색하는 기능을 제공한다. Stripes 액션 빈 CatalogActionBean이 화면 흐름을 처리하고 비즈니스 로직은 CatalogService에 위임한다. | [추정] | [추정] | [추정] | CatalogService는 CategoryMapper, ItemMapper, ProductMapper 세 매퍼를 생성자로 주입받아 카테고리·상품·품목 조회를 각 매퍼에 단순 위임한다., isItemInStock은 itemMapper.getInventoryQuantity(itemId) 결과가 0보다 클 때 재고 있음으로 판정한다., searchProductList는 키워드 문자열을 공백(\s+)으로 분리해 각 토큰을 소문자로 바꾸고 %로 감싸 productMapper.searchProductList를 반복 호출한 뒤 결과를 누적한다., searchProducts 핸들러는 keyword가 null이거나 길이가 1 미만이면 안내 메시지와 함께 ERROR로 포워딩하고, 그렇지 않으면 소문자화한 키워드로 검색 후 SEARCH_PRODUCTS로 포워딩한다., viewItem 핸들러는 getItem으로 품목을 로드한 뒤 item.getProduct()로 연관 상품을 꺼내 화면 모델에 설정한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:36`, `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:35` |
| FN-004 | 주문 | 주문(order) 도메인은 체크아웃 흐름을 담당한다. newOrderForm으로 로그인된 계정과 세션 Cart로부터 주문 폼을 초기화하고(initOrder), newOrder로 장바구니 내용을 실제 주문으로 생성하며(insertOrder), viewOrder/listOrders로 단건 주문과 사용자별 주문 목록을 조회한다. OrderActionBean이 화면 흐름을, OrderService가 트랜잭션 비즈니스 로직을 담당한다. | [추정] | [추정] | [추정] | 본인 주문만 조회: viewOrder는 조회한 주문의 username이 세션 계정 username과 일치할 때만 주문을 보여주고, 불일치하면 주문을 null로 비우고 오류로 처리한다., 주문 ID 채번: orderId는 insertOrder 시작 시 getNextId("ordernum")로 발번되며, getNextId는 SequenceMapper로 현재 시퀀스를 읽고 nextId+1로 갱신한 뒤 기존 값을 반환한다., 주문 삽입 트랜잭션: OrderService.insertOrder는 @Transactional 경계 안에서 주문 ID 채번 후 각 lineItem의 재고를 차감(updateInventoryQuantity)하고, 주문(insertOrder)·주문 상태(insertOrderStatus)·각 라인 항목(insertLineItem)을 순서대로 저장한다., 주문 초기화 규칙: Order.initOrder는 Account의 이름·주소를 배송/청구 정보로 복사하고 Cart.getSubTotal을 totalPrice로 설정한 뒤, Cart의 모든 CartItem을 순회하며 addLineItem으로 라인 항목을 채운다., 체크아웃 전 로그인 필수: newOrderForm은 accountBean이 없거나 인증되지 않은 경우 체크아웃을 막고 로그인 화면(AccountActionBean)으로 보낸다. 인증된 경우에만 Cart로 주문을 초기화한다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119`, `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142`, `src/main/java/org/mybatis/jpetstore/service/OrderService.java:60` |
| FN-005 | 웹 배포 설정 (web.xml) | web.xml은 Stripes 프론트 컨트롤러를 구성한다. StripesFilter와 DispatcherServlet(StripesDispatcher)을 *.action URL 패턴에 매핑하고, Spring의 ContextLoaderListener가 애플리케이션 루트 컨텍스트를 부트스트랩한다. | [추정] | [추정] | [추정] | Spring 루트 컨텍스트는 애플리케이션 기동 시 ContextLoaderListener를 통해 부트스트랩된다., StripesFilter는 REQUEST 디스패처에 대해 StripesDispatcher 서블릿에 매핑되어 액션 요청 전처리를 담당한다., 모든 *.action 요청은 StripesDispatcher 서블릿(DispatcherServlet)으로 라우팅되어 Stripes 프론트 컨트롤러를 거친다. | [확정] | `src/main/webapp/WEB-INF/web.xml:40`, `src/main/webapp/WEB-INF/web.xml:57`, `src/main/webapp/WEB-INF/web.xml:62` |
