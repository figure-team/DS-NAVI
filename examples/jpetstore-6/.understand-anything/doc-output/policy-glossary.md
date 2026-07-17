---
docId: policy-glossary
title: 용어/도메인 사전
methodology: policy
status: DRAFT
sourceCommit: af7b83995e3bca72a2f211c9cb23ce8780baff5d
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
| SUPPLIER | 공급업체(SUPPLIER)는 상품을 납품하는 거래처를 관리하는 기준정보로, 공급업체 번호를 유일 식별자로 부여하고 상태 값은 반드시 지정하도록 규정한다. 상호·주소·연락처는 선택 항목으로 두어 최소 식별 정보만으로도 등록을 허용한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` · `src/main/resources/database/jpetstore-hsqldb-data.sql:27` |
| SIGNON | 로그인 자격(SIGNON)은 사용자 인증에 사용하는 아이디와 비밀번호를 보관하며, 아이디를 유일 식별자로 하여 한 아이디에 하나의 비밀번호만 유지하도록 규정한다. 두 항목 모두 필수로 지정해 자격 없는 계정 접근을 차단한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` · `src/main/resources/database/jpetstore-hsqldb-data.sql:33` |
| ACCOUNT | 회원 계정(ACCOUNT)은 고객의 신원과 연락 정보를 관리하는 기준정보로, 사용자 아이디를 유일 식별자로 부여한다. 이메일·성명·주소·국가·전화번호를 필수로 요구하여 주문·배송에 필요한 최소 개인정보를 반드시 확보하도록 규정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` · `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| PROFILE | 고객 프로파일(PROFILE)은 회원별 개인화 설정을 관리하며, 사용자 아이디를 유일 식별자로 하여 계정과 일대일로 대응한다. 언어 선호는 필수로 지정하고, 선호 카테고리·마이리스트·배너 표시 여부 등 개인화 옵션을 보관하도록 규정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` · `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| BANNERDATA | 배너 데이터(BANNERDATA)는 선호 카테고리별로 노출할 배너 정보를 관리하며, 선호 카테고리를 유일 식별자로 하여 카테고리마다 하나의 배너를 대응시키도록 규정한다. 고객의 선호 카테고리에 맞춘 화면 배너 표출의 기준정보 역할을 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` · `src/main/resources/database/jpetstore-hsqldb-data.sql:64` |
| ORDERS | 주문(ORDERS)은 고객 한 건의 구매 거래를 관리하는 핵심 원장으로, 주문번호를 유일 식별자로 부여하고 주문자·주문일자·총금액을 필수로 요구한다. 배송지·청구지 주소와 결제(신용카드·유효기간·카드종류) 및 배송 정보를 필수 항목으로 규정하여 주문 성립에 필요한 정보를 빠짐없이 확보한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` · `src/main/resources/database/jpetstore-hsqldb-data.sql:84` |
| ORDERSTATUS | 주문 상태(ORDERSTATUS)는 주문의 처리 상태 이력을 관리하며, 주문번호와 라인번호의 조합을 유일 식별자로 하여 주문 항목 단위로 상태와 상태 변경 시점을 기록하도록 규정한다. 상태 값은 반드시 지정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` · `src/main/resources/database/jpetstore-hsqldb-data.sql:101` |
| LINEITEM | 주문 상세(LINEITEM)는 한 주문에 포함된 개별 구매 품목을 관리하며, 주문번호와 라인번호의 조합을 유일 식별자로 한다. 품목·수량·단가를 필수로 요구하여 주문 내 각 품목의 구매 내역과 금액 산정 근거를 확정하도록 규정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` · `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |
| CATEGORY | 카테고리(CATEGORY)는 상품을 분류하는 최상위 기준정보로, 카테고리 코드를 유일 식별자로 부여한다. 명칭과 설명은 선택 항목으로 두어 코드만으로도 분류 체계를 구성할 수 있도록 규정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` · `src/main/resources/database/jpetstore-hsqldb-data.sql:117` |
| PRODUCT | 상품(PRODUCT)은 카테고리 하위의 판매 상품을 관리하는 기준정보로, 상품 코드를 유일 식별자로 부여한다. 상품은 반드시 하나의 유효한 카테고리에 소속되도록 규정하여, 존재하지 않는 분류에 상품이 등록되는 것을 차단한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` · `src/main/resources/database/jpetstore-hsqldb-data.sql:126` |
| ITEM | 품목(ITEM)은 상품의 구체적 판매 단위(재고 단위)를 관리하며, 품목 코드를 유일 식별자로 한다. 품목은 반드시 하나의 유효한 상품에 소속되고 공급업체와 연결되도록 규정하여, 판매가·원가·공급처 및 속성별 판매 단위를 상품·공급업체와 정합성 있게 관리한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` · `src/main/resources/database/jpetstore-hsqldb-data.sql:146` |
| INVENTORY | 재고(INVENTORY)는 품목별 보유 수량을 관리하며, 품목 코드를 유일 식별자로 하여 품목마다 하나의 재고 수량을 유지하도록 규정한다. 수량은 반드시 지정하여 재고 없는 품목이 수량 미기재로 남는 것을 방지한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` · `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |
| SEQUENCE | 채번(SEQUENCE)은 주문번호 등 업무 키의 다음 발번 값을 관리하는 기준정보로, 채번 명칭을 유일 식별자로 하여 명칭별로 다음 발급 번호를 보관한다. 명칭과 다음 번호를 필수로 지정하여 신규 번호 채번의 유일성과 연속성을 보장하도록 규정한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` · `src/main/resources/database/jpetstore-hsqldb-data.sql:164` |
<!-- policy-fill:end -->
