---
docId: policy-data
title: 데이터 정책
methodology: policy
status: DRAFT
sourceCommit: ffe1992c2966d46fd3991f875f42bd0d4237e88f
evidenceRate: 1
---

# 데이터 정책

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 데이터 제약

DDL(CREATE TABLE)에서 추출한 제약 — NOT NULL/기본키/유니크/외래키/CHECK. 모두 file:line
근거를 갖는 [확정]. 보존기간 등 DDL 밖 정책은 [추정](P3 LLM 보강 대상).

| 대상 | 제약 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| SUPPLIER | 기본키(PK) | PRIMARY KEY (suppid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` |
| SUPPLIER.suppid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:18` |
| SUPPLIER.status | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:20` |
| SIGNON | 기본키(PK) | PRIMARY KEY (username) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` |
| SIGNON.username | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:31` |
| SIGNON.password | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:32` |
| ACCOUNT | 기본키(PK) | PRIMARY KEY (userid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` |
| ACCOUNT.userid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:37` |
| ACCOUNT.email | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| ACCOUNT.firstname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:39` |
| ACCOUNT.lastname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:40` |
| ACCOUNT.addr1 | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:42` |
| ACCOUNT.city | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:44` |
| ACCOUNT.state | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:45` |
| ACCOUNT.zip | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:46` |
| ACCOUNT.country | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:47` |
| ACCOUNT.phone | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:48` |
| PROFILE | 기본키(PK) | PRIMARY KEY (userid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` |
| PROFILE.userid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:53` |
| PROFILE.langpref | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| BANNERDATA | 기본키(PK) | PRIMARY KEY (favcategory) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` |
| BANNERDATA.favcategory | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:62` |
| ORDERS | 기본키(PK) | PRIMARY KEY (orderid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ORDERS.orderid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:68` |
| ORDERS.userid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:69` |
| ORDERS.orderdate | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:70` |
| ORDERS.shipaddr1 | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:71` |
| ORDERS.shipcity | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:73` |
| ORDERS.shipstate | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:74` |
| ORDERS.shipzip | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:75` |
| ORDERS.shipcountry | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:76` |
| ORDERS.billaddr1 | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:77` |
| ORDERS.billcity | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:79` |
| ORDERS.billstate | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:80` |
| ORDERS.billzip | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:81` |
| ORDERS.billcountry | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:82` |
| ORDERS.courier | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:83` |
| ORDERS.totalprice | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:84` |
| ORDERS.billtofirstname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:85` |
| ORDERS.billtolastname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:86` |
| ORDERS.shiptofirstname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:87` |
| ORDERS.shiptolastname | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:88` |
| ORDERS.creditcard | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:89` |
| ORDERS.exprdate | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:90` |
| ORDERS.cardtype | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:91` |
| ORDERS.locale | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:92` |
| ORDERSTATUS | 기본키(PK) | PRIMARY KEY (orderid, linenum) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` |
| ORDERSTATUS.orderid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:97` |
| ORDERSTATUS.linenum | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:98` |
| ORDERSTATUS.timestamp | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:99` |
| ORDERSTATUS.status | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:100` |
| LINEITEM | 기본키(PK) | PRIMARY KEY (orderid, linenum) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` |
| LINEITEM.orderid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:105` |
| LINEITEM.linenum | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:106` |
| LINEITEM.itemid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:107` |
| LINEITEM.quantity | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:108` |
| LINEITEM.unitprice | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |
| CATEGORY | 기본키(PK) | PRIMARY KEY (catid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` |
| CATEGORY.catid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:114` |
| PRODUCT | 기본키(PK) | PRIMARY KEY (productid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` |
| PRODUCT.productid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:121` |
| PRODUCT.category | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:122` |
| PRODUCT(category) | 외래키(FK) | FK → CATEGORY(catid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:126` |
| ITEM | 기본키(PK) | PRIMARY KEY (itemid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` |
| ITEM.itemid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:134` |
| ITEM.productid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:135` |
| ITEM(productid) | 외래키(FK) | FK → PRODUCT(productid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:146` |
| ITEM(supplier) | 외래키(FK) | FK → SUPPLIER(suppid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:148` |
| INVENTORY | 기본키(PK) | PRIMARY KEY (itemid) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` |
| INVENTORY.itemid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:155` |
| INVENTORY.qty | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |
| SEQUENCE | 기본키(PK) | PRIMARY KEY (name) | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` |
| SEQUENCE.name | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:162` |
| SEQUENCE.nextid | NOT NULL | NOT NULL | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:163` |

<!-- policy-fill:start -->
## 규범 진술 (LLM 보강)

> 위 앵커 표는 결정론 근거([확정]). 아래는 각 대상의 규범 진술 보강 — [확정] 인용은 기계 검증기가 실파일과 대조한다(불일치 시 인용 제거·[추정] 강등).

| 대상 | 규범 진술 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| SUPPLIER | 공급사 정보는 공급사 번호로 유일하게 식별되며, 동일한 공급사 번호의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` |
| SUPPLIER.suppid | 공급사 등록 시 공급사 번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:18` |
| SUPPLIER.status | 공급사 등록 시 공급사 상태는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:20` |
| SIGNON | 로그인 계정 정보는 사용자명로 유일하게 식별되며, 동일한 사용자명의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` |
| SIGNON.username | 로그인 계정 등록 시 로그인 사용자명는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:31` |
| SIGNON.password | 로그인 계정 등록 시 로그인 비밀번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:32` |
| ACCOUNT | 회원 계정 정보는 사용자 ID로 유일하게 식별되며, 동일한 사용자 ID의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` |
| ACCOUNT.userid | 회원 계정 등록 시 회원 ID는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:37` |
| ACCOUNT.email | 회원 계정 등록 시 이메일는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| ACCOUNT.firstname | 회원 계정 등록 시 이름는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:39` |
| ACCOUNT.lastname | 회원 계정 등록 시 성는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:40` |
| ACCOUNT.addr1 | 회원 계정 등록 시 기본 주소는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:42` |
| ACCOUNT.city | 회원 계정 등록 시 도시는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:44` |
| ACCOUNT.state | 회원 계정 등록 시 주(state)는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:45` |
| ACCOUNT.zip | 회원 계정 등록 시 우편번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:46` |
| ACCOUNT.country | 회원 계정 등록 시 국가는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:47` |
| ACCOUNT.phone | 회원 계정 등록 시 전화번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:48` |
| PROFILE | 회원 프로필 정보는 사용자 ID로 유일하게 식별되며, 동일한 사용자 ID의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` |
| PROFILE.userid | 회원 프로필 등록 시 회원 ID는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:53` |
| PROFILE.langpref | 회원 프로필 등록 시 언어 선호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| BANNERDATA | 배너 정보는 선호 카테고리로 유일하게 식별되며, 동일한 선호 카테고리의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` |
| BANNERDATA.favcategory | 배너 등록 시 선호 카테고리는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:62` |
| ORDERS | 주문 정보는 주문 번호로 유일하게 식별되며, 동일한 주문 번호의 중복 등록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ORDERS.orderid | 주문 등록 시 주문 번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:68` |
| ORDERS.userid | 주문 등록 시 주문자 회원 ID는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:69` |
| ORDERS.orderdate | 주문 등록 시 주문 일자는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:70` |
| ORDERS.shipaddr1 | 주문 등록 시 배송 기본 주소는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:71` |
| ORDERS.shipcity | 주문 등록 시 배송 도시는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:73` |
| ORDERS.shipstate | 주문 등록 시 배송 주(state)는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:74` |
| ORDERS.shipzip | 주문 등록 시 배송 우편번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:75` |
| ORDERS.shipcountry | 주문 등록 시 배송 국가는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:76` |
| ORDERS.billaddr1 | 주문 등록 시 청구 기본 주소는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:77` |
| ORDERS.billcity | 주문 등록 시 청구 도시는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:79` |
| ORDERS.billstate | 주문 등록 시 청구 주(state)는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:80` |
| ORDERS.billzip | 주문 등록 시 청구 우편번호는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:81` |
| ORDERS.billcountry | 주문 등록 시 청구 국가는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:82` |
| ORDERS.courier | 주문 등록 시 배송업체는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:83` |
| ORDERS.totalprice | 주문 등록 시 주문 총액는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:84` |
| ORDERS.billtofirstname | 주문 등록 시 청구인 이름는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:85` |
| ORDERS.billtolastname | 주문 등록 시 청구인 성는 반드시 입력되어야 하며, 값이 비어 있는 상태로는 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:86` |
| ORDERS.shiptofirstname | 주문 등록 시 배송 수령인의 이름은 반드시 입력되어야 하며, 수령인 이름 없이 주문을 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:87` |
| ORDERS.shiptolastname | 주문 등록 시 배송 수령인의 성은 반드시 입력되어야 하며, 수령인 성 없이 주문을 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:88` |
| ORDERS.creditcard | 주문에는 결제에 사용할 신용카드 번호가 반드시 기재되어야 하며, 카드 번호 없이 주문을 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:89` |
| ORDERS.exprdate | 주문에는 결제 카드의 유효기간이 반드시 기재되어야 하며, 유효기간은 최대 7자리 형식으로 관리된다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:90` |
| ORDERS.cardtype | 주문에는 결제 카드의 종류(카드사 구분)가 반드시 기재되어야 하며, 카드 종류 없이 주문을 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:91` |
| ORDERS.locale | 주문에는 주문 당시 사용자의 언어·지역 설정이 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:92` |
| ORDERSTATUS | 주문 상태 이력은 주문 번호와 라인 번호의 조합으로 유일하게 식별되며, 동일 주문의 동일 라인에 중복 상태 행을 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` |
| ORDERSTATUS.orderid | 주문 상태 이력은 반드시 어느 주문에 속하는지(주문 번호)를 지정해야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:97` |
| ORDERSTATUS.linenum | 주문 상태 이력은 반드시 라인 번호를 지정해야 하며, 라인 번호 없는 상태 기록은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:98` |
| ORDERSTATUS.timestamp | 주문 상태 이력에는 상태가 기록된 일자가 반드시 남아야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:99` |
| ORDERSTATUS.status | 주문 상태 이력에는 상태 코드(최대 2자리)가 반드시 기재되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:100` |
| LINEITEM | 주문 상품 명세(라인아이템)는 주문 번호와 라인 번호의 조합으로 유일하게 식별되며, 한 주문 안에서 라인 번호는 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` |
| LINEITEM.orderid | 주문 상품 명세는 반드시 소속 주문 번호를 가져야 하며, 주문 없이 존재할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:105` |
| LINEITEM.linenum | 주문 상품 명세는 반드시 라인 번호를 가져야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:106` |
| LINEITEM.itemid | 주문 상품 명세에는 어떤 상품 품목을 주문했는지(품목 식별자)가 반드시 기재되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:107` |
| LINEITEM.quantity | 주문 상품 명세에는 주문 수량이 반드시 기재되어야 하며, 수량 없는 주문 라인은 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:108` |
| LINEITEM.unitprice | 주문 상품 명세에는 주문 시점의 단가(소수 2자리, 총 10자리)가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |
| CATEGORY | 상품 카테고리는 카테고리 식별자로 유일하게 식별되며, 동일 식별자의 카테고리를 중복 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` |
| CATEGORY.catid | 상품 카테고리에는 최대 10자리의 카테고리 식별자가 반드시 부여되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:114` |
| PRODUCT | 상품은 상품 식별자로 유일하게 식별되며, 동일 식별자의 상품을 중복 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` |
| PRODUCT.productid | 상품에는 최대 10자리의 상품 식별자가 반드시 부여되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:121` |
| PRODUCT.category | 모든 상품은 반드시 소속 카테고리를 지정해야 하며, 카테고리 없는 상품은 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:122` |
| PRODUCT(category) | 상품이 지정하는 카테고리는 반드시 카테고리 목록에 실제로 등록된 카테고리여야 하며, 존재하지 않는 카테고리를 참조할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:126` |
| ITEM | 판매 품목은 품목 식별자로 유일하게 식별되며, 동일 식별자의 품목을 중복 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` |
| ITEM.itemid | 판매 품목에는 최대 10자리의 품목 식별자가 반드시 부여되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:134` |
| ITEM.productid | 모든 판매 품목은 반드시 소속 상품을 지정해야 하며, 상품 없는 품목은 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:135` |
| ITEM(productid) | 판매 품목이 지정하는 상품은 반드시 상품 목록에 실제로 등록된 상품이어야 하며, 존재하지 않는 상품을 참조할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:146` |
| ITEM(supplier) | 판매 품목에 공급업체를 지정하는 경우 반드시 공급업체 목록에 실제로 등록된 업체여야 하며, 존재하지 않는 공급업체를 참조할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:148` |
| INVENTORY | 재고는 품목 식별자로 유일하게 식별되며, 하나의 품목에 대해 재고 행은 하나만 존재한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` |
| INVENTORY.itemid | 재고 기록에는 대상 품목 식별자가 반드시 기재되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:155` |
| INVENTORY.qty | 재고 기록에는 보유 수량이 반드시 기재되어야 하며, 수량이 비어 있는 재고는 허용되지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |
| SEQUENCE | 채번 테이블은 채번 대상 이름으로 유일하게 식별되며, 동일 이름의 채번 항목을 중복 등록할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` |
| SEQUENCE.name | 채번 항목에는 최대 30자리의 채번 대상 이름이 반드시 기재되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:162` |
| SEQUENCE.nextid | 채번 항목에는 다음에 발급할 번호가 반드시 유지되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:163` |
<!-- policy-fill:end -->
