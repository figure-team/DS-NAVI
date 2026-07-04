---
docId: si-프로그램목록
title: SI 프로그램목록
methodology: si-standard
status: DRAFT
sourceCommit: null
evidenceRate: 0.990909090909091
---

# SI 프로그램목록

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 프로그램 목록

program-inventory.json(W3 결정론 스캔) 1건 = 표 1행 — 소스 프로그램(java·kotlin·jsp·SQL매퍼) 전수.
프로그램명(파일)·유형·계층·LOC 는 코드 근거 → [확정].
**업무명은 정적 분석이 알 수 없어 [미확인]** — 감리 제출 전에 사람이 채웁니다.
소속도메인은 도메인 후보 분석(candidates)의 결정론 조인 — 도달성 신호는 그대로,
디렉토리/접두어 폴백·모호는 [추정] 표기(도메인 확정은 사람 몫).
유형: 화면(라우트/JSP) · API · 배치(W2 연동) · 서비스/DAO/DB(계층 신호) · SQL매퍼 ·
공통/기타(**계층 신호 없음 — 도메인 모델·유틸 포함, 미분류라는 뜻이 아님**).
설정 XML·기타 언어 파일은 프로그램에서 제외되며 제외 수는 program-inventory.json
stats.excluded 에 기록됩니다(전수 오독 방지). PGM_ID 는 내용 파생 안정 id.

| PGM_ID | 프로그램명 | 업무명 | 소속도메인 | 유형 | 계층 | LOC | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PGM-COM-68a9e48b | Account | [미확인] | account | 공통/기타 | unknown | 196 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:1` |
| PGM-COM-51c62df1 | Cart | [미확인] | cart | 공통/기타 | unknown | 125 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:1` |
| PGM-COM-9f4f6427 | CartItem | [미확인] | 공용(cart+order) | 공통/기타 | unknown | 76 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:1` |
| PGM-COM-3eec28c3 | Category | [미확인] | 공용(account+cart+catalog) | 공통/기타 | unknown | 62 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Category.java:1` |
| PGM-COM-6474e19b | Item | [미확인] | 공용(account+cart+catalog+order) | 공통/기타 | unknown | 145 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:1` |
| PGM-COM-b6277a61 | LineItem | [미확인] | order | 공통/기타 | unknown | 118 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:1` |
| PGM-COM-b9d226d6 | Order | [미확인] | order | 공통/기타 | unknown | 335 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:1` |
| PGM-COM-f9a3f312 | Product | [미확인] | 공용(account+cart+catalog+order) | 공통/기타 | unknown | 71 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Product.java:1` |
| PGM-COM-b64dbe20 | Sequence | [미확인] | order | 공통/기타 | unknown | 56 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Sequence.java:1` |
| PGM-COM-3bcd71ec | AbstractActionBean | [미확인] | 공용(account+cart+catalog+order) | 공통/기타 | api | 51 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AbstractActionBean.java:1` |
| PGM-DAO-51f037a7 | AccountMapper | [미확인] | account | DAO | dao | 43 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:1` |
| PGM-DAO-66ca821f | CategoryMapper | [미확인] | 공용(account+cart+catalog) | DAO | dao | 33 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/CategoryMapper.java:1` |
| PGM-DAO-867b6414 | ItemMapper | [미확인] | 공용(account+cart+catalog+order) | DAO | dao | 38 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java:1` |
| PGM-DAO-74737d93 | LineItemMapper | [미확인] | order | DAO | dao | 33 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/LineItemMapper.java:1` |
| PGM-DAO-f30e87dd | OrderMapper | [미확인] | order | DAO | dao | 37 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/OrderMapper.java:1` |
| PGM-DAO-dc8fe9e3 | ProductMapper | [미확인] | 공용(account+cart+catalog) | DAO | dao | 35 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ProductMapper.java:1` |
| PGM-DAO-6d2e4325 | SequenceMapper | [미확인] | order | DAO | dao | 30 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/SequenceMapper.java:1` |
| PGM-MAP-19fe2f40 | AccountMapper | [미확인] | account | SQL매퍼 | db | 132 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:1` |
| PGM-MAP-13169477 | CategoryMapper | [미확인] | 공용(account+cart+catalog) | SQL매퍼 | db | 43 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml:1` |
| PGM-MAP-81a3e7d5 | ItemMapper | [미확인] | 공용(account+cart+catalog+order) | SQL매퍼 | db | 82 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:1` |
| PGM-MAP-26ddb969 | LineItemMapper | [미확인] | order | SQL매퍼 | db | 42 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:1` |
| PGM-MAP-d1be15e8 | OrderMapper | [미확인] | order | SQL매퍼 | db | 109 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:1` |
| PGM-MAP-0666fa83 | ProductMapper | [미확인] | 공용(account+cart+catalog) | SQL매퍼 | db | 56 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:1` |
| PGM-MAP-5194eead | SequenceMapper | [미확인] | order | SQL매퍼 | db | 38 | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:1` |
| PGM-MAP-b9fcb7db | index | [미확인] | [미확인] | SQL매퍼 | unknown | 448 | [확정] | `src/site/es/xdoc/index.xml:1` |
| PGM-MAP-522f2153 | index | [미확인] | [미확인] | SQL매퍼 | unknown | 406 | [확정] | `src/site/ja/xdoc/index.xml:1` |
| PGM-MAP-04dfefa3 | index | [미확인] | [미확인] | SQL매퍼 | unknown | 408 | [확정] | `src/site/ko/xdoc/index.xml:1` |
| PGM-MAP-40db7297 | index | [미확인] | [미확인] | SQL매퍼 | unknown | 448 | [확정] | `src/site/xdoc/index.xml:1` |
| PGM-SCR-03dd742b | AccountActionBean | [미확인] | account | 화면 | api | 208 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:1` |
| PGM-SCR-6c5edc23 | CartActionBean | [미확인] | cart | 화면 | api | 150 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:1` |
| PGM-SCR-1de6f314 | CatalogActionBean | [미확인] | catalog | 화면 | api | 219 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:1` |
| PGM-SCR-fc9c602d | OrderActionBean | [미확인] | order | 화면 | api | 197 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:1` |
| PGM-SCR-3b60f781 | EditAccountForm | [미확인] | web-inf [추정] | 화면 | unknown | 48 | [확정] | `src/main/webapp/WEB-INF/jsp/account/EditAccountForm.jsp:1` |
| PGM-SCR-17377901 | IncludeAccountFields | [미확인] | web-inf [추정] | 화면 | unknown | 87 | [확정] | `src/main/webapp/WEB-INF/jsp/account/IncludeAccountFields.jsp:1` |
| PGM-SCR-4e391b64 | NewAccountForm | [미확인] | web-inf [추정] | 화면 | unknown | 47 | [확정] | `src/main/webapp/WEB-INF/jsp/account/NewAccountForm.jsp:1` |
| PGM-SCR-42f29104 | SignonForm | [미확인] | web-inf [추정] | 화면 | unknown | 34 | [확정] | `src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp:1` |
| PGM-SCR-3c93f7f6 | Cart | [미확인] | web-inf [추정] | 화면 | unknown | 105 | [확정] | `src/main/webapp/WEB-INF/jsp/cart/Cart.jsp:1` |
| PGM-SCR-54cf59fc | Checkout | [미확인] | web-inf [추정] | 화면 | unknown | 76 | [확정] | `src/main/webapp/WEB-INF/jsp/cart/Checkout.jsp:1` |
| PGM-SCR-f9a81dbb | IncludeMyList | [미확인] | web-inf [추정] | 화면 | unknown | 32 | [확정] | `src/main/webapp/WEB-INF/jsp/cart/IncludeMyList.jsp:1` |
| PGM-SCR-a2276880 | Category | [미확인] | web-inf [추정] | 화면 | unknown | 50 | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Category.jsp:1` |
| PGM-SCR-340aa6e6 | Item | [미확인] | web-inf [추정] | 화면 | unknown | 72 | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Item.jsp:1` |
| PGM-SCR-b1ada8ee | Main | [미확인] | web-inf [추정] | 화면 | unknown | 92 | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Main.jsp:1` |
| PGM-SCR-807f6244 | Product | [미확인] | web-inf [추정] | 화면 | unknown | 77 | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Product.jsp:1` |
| PGM-SCR-2fc8e576 | SearchProducts | [미확인] | web-inf [추정] | 화면 | unknown | 62 | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/SearchProducts.jsp:1` |
| PGM-SCR-9d95f4c3 | Error | [미확인] | web-inf [추정] | 화면 | unknown | 22 | [확정] | `src/main/webapp/WEB-INF/jsp/common/Error.jsp:1` |
| PGM-SCR-699ba88b | IncludeBottom | [미확인] | web-inf [추정] | 화면 | unknown | 36 | [확정] | `src/main/webapp/WEB-INF/jsp/common/IncludeBottom.jsp:1` |
| PGM-SCR-9a011004 | IncludeTop | [미확인] | web-inf [추정] | 화면 | unknown | 131 | [확정] | `src/main/webapp/WEB-INF/jsp/common/IncludeTop.jsp:1` |
| PGM-SCR-ed0c6c14 | ConfirmOrder | [미확인] | web-inf [추정] | 화면 | unknown | 122 | [확정] | `src/main/webapp/WEB-INF/jsp/order/ConfirmOrder.jsp:1` |
| PGM-SCR-d0ad3de3 | ListOrders | [미확인] | web-inf [추정] | 화면 | unknown | 47 | [확정] | `src/main/webapp/WEB-INF/jsp/order/ListOrders.jsp:1` |
| PGM-SCR-26b9e12b | NewOrderForm | [미확인] | web-inf [추정] | 화면 | unknown | 91 | [확정] | `src/main/webapp/WEB-INF/jsp/order/NewOrderForm.jsp:1` |
| PGM-SCR-e3e1963d | ShippingForm | [미확인] | web-inf [추정] | 화면 | unknown | 68 | [확정] | `src/main/webapp/WEB-INF/jsp/order/ShippingForm.jsp:1` |
| PGM-SCR-dbbf9812 | ViewOrder | [미확인] | web-inf [추정] | 화면 | unknown | 173 | [확정] | `src/main/webapp/WEB-INF/jsp/order/ViewOrder.jsp:1` |
| PGM-SCR-f1c1b2e3 | web | [미확인] | web-inf | 화면 | api | 64 | [확정] | `src/main/webapp/WEB-INF/web.xml:1` |
| PGM-SVC-5f5bf3cb | AccountService | [미확인] | account | 서비스 | service | 75 | [확정] | `src/main/java/org/mybatis/jpetstore/service/AccountService.java:1` |
| PGM-SVC-2d117c4e | CatalogService | [미확인] | 공용(account+cart+catalog) | 서비스 | service | 90 | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:1` |
| PGM-SVC-d564b236 | OrderService | [미확인] | order | 서비스 | service | 132 | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:1` |
| PGM-TST-cbd3b9bd | ScreenTransitionIT | [미확인] | [미확인] | 테스트 | unknown | 444 | [확정] | `src/test/java/org/mybatis/jpetstore/ScreenTransitionIT.java:1` |
| PGM-TST-a07ed547 | CartTest | [미확인] | cart [추정] | 테스트 | unknown | 187 | [확정] | `src/test/java/org/mybatis/jpetstore/domain/CartTest.java:1` |
| PGM-TST-43e068a3 | OrderTest | [미확인] | order [추정] | 테스트 | unknown | 87 | [확정] | `src/test/java/org/mybatis/jpetstore/domain/OrderTest.java:1` |
| PGM-TST-51d18a8f | AccountMapperTest | [미확인] | account [추정] | 테스트 | unknown | 248 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java:1` |
| PGM-TST-51e4435e | CategoryMapperTest | [미확인] | [미확인] | 테스트 | unknown | 86 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/CategoryMapperTest.java:1` |
| PGM-TST-b62ae196 | ItemMapperTest | [미확인] | [미확인] | 테스트 | unknown | 145 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java:1` |
| PGM-TST-e6e6d949 | LineItemMapperTest | [미확인] | [미확인] | 테스트 | unknown | 90 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/LineItemMapperTest.java:1` |
| PGM-TST-08126415 | MapperTestContext | [미확인] | [미확인] | 테스트 | unknown | 59 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/MapperTestContext.java:1` |
| PGM-TST-35bb0746 | OrderMapperTest | [미확인] | order [추정] | 테스트 | unknown | 247 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java:1` |
| PGM-TST-4bc9630d | ProductMapperTest | [미확인] | [미확인] | 테스트 | unknown | 113 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java:1` |
| PGM-TST-2b457cae | SequenceMapperTest | [미확인] | [미확인] | 테스트 | unknown | 65 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/SequenceMapperTest.java:1` |
| PGM-TST-ee985e74 | AccountServiceTest | [미확인] | account [추정] | 테스트 | unknown | 101 | [확정] | `src/test/java/org/mybatis/jpetstore/service/AccountServiceTest.java:1` |
| PGM-TST-9b9b47d6 | CatalogServiceTest | [미확인] | catalog [추정] | 테스트 | unknown | 193 | [확정] | `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java:1` |
| PGM-TST-f771cf2d | OrderServiceTest | [미확인] | order [추정] | 테스트 | unknown | 181 | [확정] | `src/test/java/org/mybatis/jpetstore/service/OrderServiceTest.java:1` |
| PGM-TST-8d655dc7 | AccountActionBeanTest | [미확인] | account [추정] | 테스트 | unknown | 116 | [확정] | `src/test/java/org/mybatis/jpetstore/web/actions/AccountActionBeanTest.java:1` |
| PGM-TST-8016b806 | CartActionBeanTest | [미확인] | cart [추정] | 테스트 | unknown | 143 | [확정] | `src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java:1` |
| PGM-TST-bd08f434 | CatalogActionBeanTest | [미확인] | catalog [추정] | 테스트 | unknown | 155 | [확정] | `src/test/java/org/mybatis/jpetstore/web/actions/CatalogActionBeanTest.java:1` |
| PGM-TST-39fc6042 | OrderActionBeanTest | [미확인] | order [추정] | 테스트 | unknown | 72 | [확정] | `src/test/java/org/mybatis/jpetstore/web/actions/OrderActionBeanTest.java:1` |

## 규모산정(FP) 기초

**전 행 [추정] — 견적 초안용 잠정치이며 FP 전문가의 재분류·보정 전 값입니다.**
트랜잭션 후보: 라우트 1건 = 1후보(FP 의 기본 프로세스와 1:1 이 아닐 수 있음 — 뷰+제출
분리, 다기능 ActionBean 등은 사람이 통합/분리).
GET/HEAD → EQ · POST/PUT/DELETE/PATCH → EI, **method 미상(ANY 등)은 '미분류'로 두고
합산하지 않습니다**(레거시 프레임워크는 라우트 대부분이 ANY — EI 로 뭉개면 체계적 왜곡).
**EO(파생 출력)는 정적 판별 불가** — 리포트성 화면은 사람이 EO 로 재분류하세요.
데이터 후보: 자체 테이블(DDL) → ILF, DB링크 참조(W1) → EIF.
집계의 잠정 FP 는 간이법 평균복잡도 **미조정 하한**(미분류·EO 미반영 — 재분류 시 상향)
(가중치: ILF 7.5 · EIF 5.4 · EI 4.0 · EO 5.2 · EQ 3.9).

| 구분 | 대상 | 상세 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 미분류(method 미상) [추정] | route:ANY *.action | ANY *.action | [확정] | `src/main/webapp/WEB-INF/web.xml:60` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action | ANY /actions/Account.action | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?editAccount | ANY /actions/Account.action?editAccount | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?editAccountForm | ANY /actions/Account.action?editAccountForm | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?newAccount | ANY /actions/Account.action?newAccount | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?newAccountForm | ANY /actions/Account.action?newAccountForm | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?signoff | ANY /actions/Account.action?signoff | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184` |
| 미분류(method 미상) [추정] | route:ANY /actions/Account.action?signon | ANY /actions/Account.action?signon | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159` |
| 미분류(method 미상) [추정] | route:ANY /actions/Cart.action?addItemToCart | ANY /actions/Cart.action?addItemToCart | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| 미분류(method 미상) [추정] | route:ANY /actions/Cart.action?checkOut | ANY /actions/Cart.action?checkOut | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |
| 미분류(method 미상) [추정] | route:ANY /actions/Cart.action?removeItemFromCart | ANY /actions/Cart.action?removeItemFromCart | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| 미분류(method 미상) [추정] | route:ANY /actions/Cart.action?updateCartQuantities | ANY /actions/Cart.action?updateCartQuantities | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| 미분류(method 미상) [추정] | route:ANY /actions/Cart.action?viewCart | ANY /actions/Cart.action?viewCart | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| 미분류(method 미상) [추정] | route:ANY /actions/Catalog.action | ANY /actions/Catalog.action | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| 미분류(method 미상) [추정] | route:ANY /actions/Catalog.action?searchProducts | ANY /actions/Catalog.action?searchProducts | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190` |
| 미분류(method 미상) [추정] | route:ANY /actions/Catalog.action?viewCategory | ANY /actions/Catalog.action?viewCategory | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153` |
| 미분류(method 미상) [추정] | route:ANY /actions/Catalog.action?viewItem | ANY /actions/Catalog.action?viewItem | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:179` |
| 미분류(method 미상) [추정] | route:ANY /actions/Catalog.action?viewProduct | ANY /actions/Catalog.action?viewProduct | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166` |
| 미분류(method 미상) [추정] | route:ANY /actions/Order.action?listOrders | ANY /actions/Order.action?listOrders | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| 미분류(method 미상) [추정] | route:ANY /actions/Order.action?newOrder | ANY /actions/Order.action?newOrder | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142` |
| 미분류(method 미상) [추정] | route:ANY /actions/Order.action?newOrderForm | ANY /actions/Order.action?newOrderForm | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119` |
| 미분류(method 미상) [추정] | route:ANY /actions/Order.action?viewOrder | ANY /actions/Order.action?viewOrder | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:171` |
| ILF [추정] | ACCOUNT | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` |
| ILF [추정] | BANNERDATA | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` |
| ILF [추정] | CATEGORY | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` |
| ILF [추정] | INVENTORY | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` |
| ILF [추정] | ITEM | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` |
| ILF [추정] | LINEITEM | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` |
| ILF [추정] | ORDERS | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ILF [추정] | ORDERSTATUS | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` |
| ILF [추정] | PRODUCT | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` |
| ILF [추정] | PROFILE | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` |
| ILF [추정] | SEQUENCE | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` |
| ILF [추정] | SIGNON | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` |
| ILF [추정] | SUPPLIER | 자체 테이블 | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` |
| 집계 [추정] | EI 0 · EQ 0 · 미분류 22 · EO 미산출 · ILF 13 · EIF 0 | 잠정 FP ≥ 97.5 (미조정 하한 — 미분류 22건·EO 재분류 시 상향) | [추정] |  |
