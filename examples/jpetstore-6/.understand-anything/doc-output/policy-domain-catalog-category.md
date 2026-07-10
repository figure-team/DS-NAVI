---
docId: policy-domain-catalog-category
title: 카탈로그 — CATEGORY 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0.3181818181818182
---

# 카탈로그 — CATEGORY 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 카탈로그 — CATEGORY 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | `CatalogActionBean.java` — 카탈로그 액션 빈(카테고리/상품/아이템 조회 및 검색 이벤트 핸들러) | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:36` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 상품 카테고리(CATEGORY) 단위로 상품 목록을 조회·노출하여, 고객이 대분류(예: FISH/DOGS/REPTILES/CATS/BIRDS)를 통해 카탈로그를 탐색하고 상품 상세 조회·구매 여정으로 이어지도록 하는 카탈로그 탐색 진입점을 제공한다. | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:148-159` |
| 적용 범위 | `CatalogActionBean`의 `viewCategory()` 이벤트 핸들러가 처리하는 categoryId 파라미터 기반 카테고리 조회 및 카테고리별 상품 목록 조회 동작. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:51-52,153-159` |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| Category | 상품(Product)을 그룹화하는 최상위 분류 단위. categoryId(코드) · name(명칭) · description(설명) 3개 속성으로 구성되며, CATEGORY 테이블(CATID/NAME/DESCN)에서 조회된다. | Product는 categoryId로 하나의 Category에 속한다(1:N) | [추정] | `src/main/java/org/mybatis/jpetstore/domain/Category.java:29-31`, `src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml:26-33` |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| CATEGORY | FISH | Fish | Fish | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:185` |
| CATEGORY | DOGS | Dogs | Dogs | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:186` |
| CATEGORY | REPTILES | Reptiles | Reptiles | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:187` |
| CATEGORY | CATS | Cats | Cats | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:188` |
| CATEGORY | BIRDS | Birds | Birds | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:189` |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PL-001 | 카테고리 선택 시 상품 목록 조회 | categoryId != null | productList = catalogService.getProductListByCategory(categoryId); category = catalogService.getCategory(categoryId); | 1 | viewCategory() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:154` |

**충돌 처리 규칙**: 본 의사결정 테이블은 PL-001 단일 조건만 존재한다(`viewCategory()` 내 if 분기 1개). 따라서 정책 간 우선순위 충돌이 발생할 여지가 없다 — 단일 조건, 충돌 없음. [확정] (근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153-159`)

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | categoryId가 null인 경우(요청에 categoryId 파라미터가 전달되지 않음) — `viewCategory()`의 if 블록(154행)이 실행되지 않아 productList/category가 갱신되지 않는다. `CatalogActionBean`은 `@SessionScope`이므로 이전 요청에서 설정된 category/productList 값이 세션에 남아있으면 그 값이 그대로 유지된 채 Category.jsp가 렌더링되고(신규 세션이면 둘 다 null), Category.jsp는 EL(`${actionBean.category.name}`)과 `<c:forEach items="${actionBean.productList}">`로 접근하므로 null이어도 예외 없이 카테고리명 공란·상품 0건의 빈 화면으로 렌더된다. | 별도 방어 로직 없음 — 현재 동작을 그대로 유지(코드 변경 없이 명문화만 수행) | 《 》 | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:35,51-52,154,203-217`, `src/main/webapp/WEB-INF/jsp/catalog/Category.jsp:26,33` |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] viewCategory(): IF categoryId != null → productList = catalogService.getProductListByCategory(categoryId); category = catalogService.getCategory(categoryId);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:154`
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | categoryId != null인 값(예: "FISH")으로 `viewCategory` 이벤트를 호출 | `catalogService.getProductListByCategory(categoryId)`로 조회된 목록이 productList에, `catalogService.getCategory(categoryId)`로 조회된 카테고리 정보가 category에 설정되고 Category.jsp(VIEW_CATEGORY)로 포워딩된다 | PL-001 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153-159` |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | categoryId가 CATEGORY 코드 테이블에 존재하지 않는 값(오탈자·변조 등)으로 전달된 경우, `CategoryMapper.getCategory`는 매칭되는 행이 없으면 null을 반환하고(`WHERE CATID = #{categoryId}`), `ProductMapper.getProductListByCategory`는 빈 목록을 반환한다. 이 경우 Category.jsp는 예외 없이 카테고리명 공란·상품 0건으로 렌더되는데, 이것이 의도된 정상 동작인지 "존재하지 않는 카테고리" 안내가 필요한지 코드상 명시가 없다 — 비즈니스 정책 결정 필요 | 확인 필요 (비즈니스 정책 결정 대기) | 《 》 | [확인 필요] | `src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml:26-33`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:36-44`, `src/main/webapp/WEB-INF/jsp/catalog/Category.jsp:26,33` |
