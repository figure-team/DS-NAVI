---
docId: policy-domain-catalog
title: 카탈로그 처리 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0.18181818181818182
---

# 카탈로그 처리 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 카탈로그 처리 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | CatalogActionBean.java(컨트롤러, viewMain/viewCategory/viewProduct/viewItem/searchProducts) · CatalogService.java(서비스) · JSP 뷰 5종(Main/Category/Product/Item/SearchProducts.jsp) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:40-47` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 고객이 카테고리별 상품 탐색과 키워드 검색을 통해 원하는 상품·품목 정보를 빠르게 찾을 수 있도록 지원하는 조회 전용(read-only) 도메인으로 판단됨 — viewMain/viewCategory/viewProduct/viewItem/searchProducts 5개 핸들러가 모두 조회 후 JSP로 forward만 수행하고 생성/수정/삭제 로직은 없음 | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143-198` |
| 적용 범위 | CatalogActionBean의 5개 핸들러: viewMain(메인 진입), viewCategory(카테고리별 상품 목록), viewProduct(상품 상세·품목 목록), viewItem(품목 상세), searchProducts(키워드 검색) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:144-198` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| Product(상품) | 카테고리에 속하는 판매 단위 상품을 나타내는 도메인 객체 | 필드: productId, categoryId, name, description | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Product.java:29-32` |
| Item(품목) | 하나의 Product에 속하는 실제 판매 가능한 개별 SKU(품목) — 가격·원가·공급자·재고수량 등 판매 실행 정보를 가짐 | 필드: itemId, productId, listPrice, unitCost, supplierId, status, attribute1~5, quantity, product | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:30-42` |
| Category(카테고리) | Product를 그룹으로 분류하는 상위 카테고리 개념 | 필드: categoryId, name, description | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Category.java:29-31` |
| keyword(검색어) | searchProducts() 호출 시 사용자가 입력하는 검색어 문자열. Product.name 컬럼에 대한 대소문자 무시 부분일치(LIKE '%keyword%') 검색에 사용됨 | 공백으로 분리해 키워드별로 개별 검색 후 결과를 합산(OR, 중복 제거 없음) | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:71-77`; `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:46-54` |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 상품 ID 지정 시 품목 목록·상세정보 조회 | productId != null | itemList = catalogService.getItemListByProduct(productId); product = catalogService.getProduct(productId); | 1 | viewProduct() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:167` |
| PL-002 | 검색어 미입력 시 에러 안내 | keyword == null \|\| keyword.length() < 1 | setMessage("Please enter a keyword to search for, then press the search button."); return new ForwardResolution(ERROR); | 2 | searchProducts() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:191` |

**충돌 처리 규칙**: PL-001과 PL-002는 각각 `viewProduct()`(`CatalogActionBean.java:166`)와 `searchProducts()`(`CatalogActionBean.java:190`)라는 서로 다른 공개 핸들러 메서드에 속하며, 한 요청에서 동시에 실행되지 않는다. 두 정책은 상태(필드)를 공유하지 않고 각자의 메서드 스코프 안에서 독립적으로 평가·적용되므로, §4 표의 "우선순위" 열은 동일 메서드 내 분기 순서가 아니라 문서 열거 순서이며 두 정책 간 실질적 충돌은 발생하지 않는다. [확정] 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166-198`

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | viewProduct() 호출 시 productId가 null인 경우(else 분기 없음) | if 블록을 건너뛰고 itemList/product 조회 없이 그대로 VIEW_PRODUCT(Product.jsp)로 forward — 에러 메시지 없음 | CatalogActionBean.viewProduct() | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166-171` |
| 2 | searchProducts() 호출 시 keyword가 공백 문자만으로 구성된 경우(예: " ", length=1) | keyword.length() < 1 조건을 통과하지 못해 에러로 처리되지 않고 그대로 catalogService.searchProductList(keyword.toLowerCase())가 호출됨(공백을 포함한 LIKE 검색 수행) | CatalogActionBean.searchProducts() | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:191,195` |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] viewProduct(): IF productId != null → itemList = catalogService.getItemListByProduct(productId); product = catalogService.getProduct(productId);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:167`
- [확정] searchProducts(): IF keyword == null || keyword.length() < 1 → setMessage("Please enter a keyword to search for, then press the search button."); return new ForwardResolution(ERROR);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:191`
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | productId 파라미터가 null이 아닌 값으로 전달됨(예: productId=EST-1) | catalogService.getItemListByProduct(productId)로 품목 목록을, catalogService.getProduct(productId)로 상품 상세를 조회한 뒤 Product.jsp(VIEW_PRODUCT)로 forward | PL-001 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166-172` |
| TC-02 | keyword 파라미터가 null이거나 길이가 0인 문자열로 전달됨(검색어 미입력) | "Please enter a keyword to search for, then press the search button." 메시지를 설정하고 ERROR 페이지로 forward | PL-002 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190-194` |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 상태값 코드 그룹/enum 미정의(분기 조건의 상태값) | 미정 | 《 》 | [추정] |  |
| 2 | 카탈로그 조회/검색(viewProduct, searchProducts, viewCategory)에서 재고 상태(품절 여부) 필터링·표시 정책이 정의되어 있지 않음 — isItemInStock()은 CartActionBean(장바구니 담기 시점)에서만 호출되고 CatalogActionBean에서는 호출되지 않음 | 미정 | 《 》 | [확인 필요] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:87-89`; `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:81` |
