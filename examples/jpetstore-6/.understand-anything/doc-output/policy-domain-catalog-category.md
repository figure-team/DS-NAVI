---
docId: policy-domain-catalog-category
title: 상품카탈로그 — CATEGORY 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: af7b83995e3bca72a2f211c9cb23ce8780baff5d
evidenceRate: 0.3181818181818182
---

# 상품카탈로그 — CATEGORY 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 상품카탈로그 — CATEGORY 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | 《 》 | [추정] |  |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 《서비스 전략과 연결된 목적 기술》 | [추정] |  |
| 적용 범위 | 《 》 | [추정] |  |
| 적용 제외 | 《 》 | [추정] |  |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |

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
| PL-001 | 《 》 | categoryId != null | productList = catalogService.getProductListByCategory(categoryId); category = catalogService.getCategory(categoryId); | 1 | viewCategory() · if | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:154` |

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 《 》 | 《 》 | 《 》 | [추정] |  |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [확정] viewCategory(): IF categoryId != null → productList = catalogService.getProductListByCategory(categoryId); category = catalogService.getCategory(categoryId);. 근거: `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:154`
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | 《 》 | 《 》 | PL-001 | [추정] |  |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 《 》 | 《 》 | 《 》 | [추정] |  |

<!-- policy-fill:start -->
## 규범 진술 (LLM 보강)

> 위 앵커 표는 결정론 근거([확정]). 아래는 각 대상의 규범 진술 보강 — [확정] 인용은 기계 검증기가 실파일과 대조한다(불일치 시 인용 제거·[추정] 강등).

| 대상 | 규범 진술 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| categoryId != null | 카테고리 화면을 조회할 때 카테고리 식별값이 지정된 경우에만 해당 카테고리에 속한 상품 목록과 카테고리 정보를 조회하여 제공한다. 카테고리 식별값이 없으면 상품 목록·카테고리 정보를 조회하지 않는다. | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:154` |
<!-- policy-fill:end -->
