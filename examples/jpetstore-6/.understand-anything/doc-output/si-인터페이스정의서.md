---
docId: si-인터페이스정의서
title: SI 인터페이스정의서
methodology: si-standard
status: DRAFT
sourceCommit: null
evidenceRate: 1
---

# SI 인터페이스정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## API 목록

| API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-001 | ANY | *.action | net.sourceforge.stripes.controller.DispatcherServlet | [추정] | [추정] | [추정] | [확정] | `src/main/webapp/WEB-INF/web.xml:60` |
| API-002 | ANY | /actions/Account.action | AccountActionBean#signonForm | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| API-003 | ANY | /actions/Account.action?editAccount | AccountActionBean#editAccount | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137` |
| API-004 | ANY | /actions/Account.action?editAccountForm | AccountActionBean#editAccountForm | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128` |
| API-005 | ANY | /actions/Account.action?newAccount | AccountActionBean#newAccount | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115` |
| API-006 | ANY | /actions/Account.action?newAccountForm | AccountActionBean#newAccountForm | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106` |
| API-007 | ANY | /actions/Account.action?signoff | AccountActionBean#signoff | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184` |
| API-008 | ANY | /actions/Account.action?signon | AccountActionBean#signon | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159` |
| API-009 | ANY | /actions/Cart.action?addItemToCart | CartActionBean#addItemToCart | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| API-010 | ANY | /actions/Cart.action?checkOut | CartActionBean#checkOut | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |
| API-011 | ANY | /actions/Cart.action?removeItemFromCart | CartActionBean#removeItemFromCart | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| API-012 | ANY | /actions/Cart.action?updateCartQuantities | CartActionBean#updateCartQuantities | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| API-013 | ANY | /actions/Cart.action?viewCart | CartActionBean#viewCart | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| API-014 | ANY | /actions/Catalog.action | CatalogActionBean#viewMain | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| API-015 | ANY | /actions/Catalog.action?searchProducts | CatalogActionBean#searchProducts | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190` |
| API-016 | ANY | /actions/Catalog.action?viewCategory | CatalogActionBean#viewCategory | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153` |
| API-017 | ANY | /actions/Catalog.action?viewItem | CatalogActionBean#viewItem | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:179` |
| API-018 | ANY | /actions/Catalog.action?viewProduct | CatalogActionBean#viewProduct | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166` |
| API-019 | ANY | /actions/Order.action?listOrders | OrderActionBean#listOrders | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| API-020 | ANY | /actions/Order.action?newOrder | OrderActionBean#newOrder | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142` |
| API-021 | ANY | /actions/Order.action?newOrderForm | OrderActionBean#newOrderForm | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119` |
| API-022 | ANY | /actions/Order.action?viewOrder | OrderActionBean#viewOrder | [추정] | [추정] | [추정] | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:171` |
