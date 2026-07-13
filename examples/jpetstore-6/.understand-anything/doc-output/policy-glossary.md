---
docId: policy-glossary
title: 용어/도메인 사전
methodology: policy
status: DRAFT
sourceCommit: ffe1992c2966d46fd3991f875f42bd0d4237e88f
evidenceRate: 0
---

# 용어/도메인 사전

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 용어 정의

DB 테이블·컬럼 주석(COMMENT)과 Java enum 에서 추출한 용어. 의미 설명은 주석을 그대로
싣고, 주석이 없으면 [추정](P3 LLM 보강 대상). 출처 열로 근거 종류를 구분한다.

| 용어 | 정의/주석 | 출처 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| SUPPLIER | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` |
| SIGNON | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` |
| ACCOUNT | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` |
| PROFILE | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` |
| BANNERDATA | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` |
| ORDERS | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ORDERSTATUS | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` |
| LINEITEM | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` |
| CATEGORY | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` |
| PRODUCT | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` |
| ITEM | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` |
| INVENTORY | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` |
| SEQUENCE | (주석 없음) | DB 테이블 | [추정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` |

<!-- policy-fill:start -->
## 규범 진술 (LLM 보강)

> 위 앵커 표는 결정론 근거([확정]). 아래는 각 대상의 규범 진술 보강 — [확정] 인용은 기계 검증기가 실파일과 대조한다(불일치 시 인용 제거·[추정] 강등).

| 대상 | 규범 진술 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| SUPPLIER | 공급업체는 고유한 공급업체 번호로 식별하며, 상태 코드(2자리)는 반드시 보유해야 한다. 상호명과 주소·연락처 정보는 선택 입력이고 우편번호는 5자리까지만 허용한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` · `src/main/resources/database/jpetstore-hsqldb-data.sql:20` |
| SIGNON | 로그인 계정은 사용자 아이디(최대 25자)로 유일하게 식별하며, 아이디와 비밀번호(최대 25자)는 모두 필수이다. 비밀번호는 평문 형태로 보관된다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` · `src/main/resources/database/jpetstore-hsqldb-data.sql:32` |
| ACCOUNT | 회원 계정은 사용자 아이디로 유일하게 식별하며, 이메일·성명·기본주소·도시·주/도·우편번호·국가·전화번호는 필수 입력이다. 상세주소(2번째 줄)와 상태 코드는 선택 입력이며 우편번호는 최대 20자, 국가는 최대 20자로 제한한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` · `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| PROFILE | 회원 프로필은 사용자 아이디별로 하나만 존재하며 언어 선호는 필수 항목이다. 선호 카테고리, 마이리스트 표시 여부, 배너 표시 여부는 선택 항목으로 회원의 개인화 설정을 담는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` · `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| BANNERDATA | 배너 데이터는 선호 카테고리별로 하나의 배너만 매핑되며, 카테고리 값이 곧 식별 키가 된다. 배너 이름(표시 내용)은 선택 입력이다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` · `src/main/resources/database/jpetstore-hsqldb-data.sql:62` |
| ORDERS | 주문은 주문번호로 유일하게 식별하며 주문자, 주문일자, 배송지 주소 일체, 청구지 주소 일체, 배송업체, 총액, 청구/배송 수령인 성명, 신용카드 번호, 유효기간(7자), 카드 종류, 지역 설정이 모두 필수이다. 배송지·청구지의 상세주소(2번째 줄)만 선택 입력이고 총액은 소수 둘째 자리까지의 금액으로 관리한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ORDERSTATUS | 주문 상태는 주문번호와 라인번호의 조합 단위로 기록하며, 기록 시점(일자)과 상태 코드(2자리)는 필수이다. 동일 주문의 라인별로 상태 이력이 분리 관리된다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` · `src/main/resources/database/jpetstore-hsqldb-data.sql:100` |
| LINEITEM | 주문 상세(라인아이템)는 주문번호와 라인번호 조합으로 식별하며, 상품 아이템 번호·수량·단가는 모두 필수이다. 단가는 주문 시점 가격을 소수 둘째 자리까지 보존한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` · `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |
| CATEGORY | 상품 카테고리는 카테고리 코드(최대 10자)로 유일하게 식별하며, 표시 이름과 설명은 선택 입력이다. 상품 분류 체계의 최상위 단위이다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` · `src/main/resources/database/jpetstore-hsqldb-data.sql:114` |
| PRODUCT | 상품은 상품 코드(최대 10자)로 유일하게 식별하며 반드시 실재하는 카테고리에 소속되어야 한다(존재하지 않는 카테고리 지정 불가). 상품명과 설명은 선택 입력이며 카테고리·상품명으로 조회가 잦아 색인이 마련되어 있다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` · `src/main/resources/database/jpetstore-hsqldb-data.sql:126` |
| ITEM | 판매 아이템은 아이템 코드(최대 10자)로 유일하게 식별하며 반드시 실재하는 상품에 소속되어야 하고, 공급업체를 지정할 경우 실재하는 공급업체여야 한다. 정가와 원가는 소수 둘째 자리까지의 금액으로 관리하고, 상태 코드(2자리)와 최대 5개의 속성 값은 선택 입력이다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` · `src/main/resources/database/jpetstore-hsqldb-data.sql:146` |
| INVENTORY | 재고는 판매 아이템별로 하나의 수량 값으로만 관리하며(아이템당 단일 재고 행), 수량은 필수 항목이다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` · `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |
| SEQUENCE | 일련번호 채번은 채번 대상 이름(최대 30자)별로 다음 발급 번호를 하나씩 보관하는 방식으로 관리하며, 이름과 다음 번호는 모두 필수이다. 주문번호 등 신규 번호 발급의 단일 원천으로 사용된다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` · `src/main/resources/database/jpetstore-hsqldb-data.sql:163` |
<!-- policy-fill:end -->
