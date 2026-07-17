---
docId: policy-data
title: 데이터 정책
methodology: policy
status: DRAFT
sourceCommit: af7b83995e3bca72a2f211c9cb23ce8780baff5d
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
| SUPPLIER | SUPPLIER 정보는 suppid 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:17` |
| SUPPLIER.suppid | SUPPLIER.suppid 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:18` |
| SUPPLIER.status | SUPPLIER.status 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:20` |
| SIGNON | SIGNON 정보는 username 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:30` |
| SIGNON.username | SIGNON.username 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:31` |
| SIGNON.password | SIGNON.password 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:32` |
| ACCOUNT | ACCOUNT 정보는 userid 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:36` |
| ACCOUNT.userid | ACCOUNT.userid 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:37` |
| ACCOUNT.email | ACCOUNT.email 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| ACCOUNT.firstname | ACCOUNT.firstname 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:39` |
| ACCOUNT.lastname | ACCOUNT.lastname 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:40` |
| ACCOUNT.addr1 | ACCOUNT.addr1 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:42` |
| ACCOUNT.city | ACCOUNT.city 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:44` |
| ACCOUNT.state | ACCOUNT.state 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:45` |
| ACCOUNT.zip | ACCOUNT.zip 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:46` |
| ACCOUNT.country | ACCOUNT.country 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:47` |
| ACCOUNT.phone | ACCOUNT.phone 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:48` |
| PROFILE | PROFILE 정보는 userid 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:52` |
| PROFILE.userid | PROFILE.userid 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:53` |
| PROFILE.langpref | PROFILE.langpref 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| BANNERDATA | BANNERDATA 정보는 favcategory 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:61` |
| BANNERDATA.favcategory | BANNERDATA.favcategory 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:62` |
| ORDERS | ORDERS 정보는 orderid 값으로 유일하게 식별하며, 동일 식별자를 가진 중복 레코드는 허용하지 않는다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:67` |
| ORDERS.orderid | ORDERS.orderid 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:68` |
| ORDERS.userid | ORDERS.userid 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:69` |
| ORDERS.orderdate | ORDERS.orderdate 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:70` |
| ORDERS.shipaddr1 | ORDERS.shipaddr1 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:71` |
| ORDERS.shipcity | ORDERS.shipcity 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:73` |
| ORDERS.shipstate | ORDERS.shipstate 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:74` |
| ORDERS.shipzip | ORDERS.shipzip 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:75` |
| ORDERS.shipcountry | ORDERS.shipcountry 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:76` |
| ORDERS.billaddr1 | ORDERS.billaddr1 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:77` |
| ORDERS.billcity | ORDERS.billcity 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:79` |
| ORDERS.billstate | ORDERS.billstate 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:80` |
| ORDERS.billzip | ORDERS.billzip 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:81` |
| ORDERS.billcountry | ORDERS.billcountry 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:82` |
| ORDERS.courier | ORDERS.courier 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:83` |
| ORDERS.totalprice | ORDERS.totalprice 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:84` |
| ORDERS.billtofirstname | ORDERS.billtofirstname 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:85` |
| ORDERS.billtolastname | ORDERS.billtolastname 항목은 필수 입력 대상으로, 값이 비어 있는 상태로는 레코드를 저장할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:86` |
| ORDERS.shiptofirstname | 주문에는 배송받는 사람의 이름을 반드시 입력해야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:87` |
| ORDERS.shiptolastname | 주문에는 배송받는 사람의 성을 반드시 입력해야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:88` |
| ORDERS.creditcard | 주문 결제에는 신용카드 번호가 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:89` |
| ORDERS.exprdate | 주문 결제에는 신용카드 유효기간이 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:90` |
| ORDERS.cardtype | 주문 결제에는 카드 종류가 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:91` |
| ORDERS.locale | 주문에는 처리 기준이 되는 지역(로케일) 정보가 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:92` |
| ORDERSTATUS | 주문 상태 이력은 주문번호와 행번호의 조합으로 유일하게 식별되며, 같은 주문의 동일 행에 대해 상태 이력이 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:96` |
| ORDERSTATUS.orderid | 주문 상태 이력에는 어느 주문에 속하는지 나타내는 주문번호가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:97` |
| ORDERSTATUS.linenum | 주문 상태 이력에는 어느 주문 항목에 대한 것인지 나타내는 행번호가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:98` |
| ORDERSTATUS.timestamp | 주문 상태 이력에는 상태가 기록된 일자가 반드시 남아야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:99` |
| ORDERSTATUS.status | 주문 상태 이력에는 상태 코드가 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:100` |
| LINEITEM | 주문 항목은 주문번호와 행번호의 조합으로 유일하게 식별되며, 같은 주문 안에서 행번호는 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:104` |
| LINEITEM.orderid | 주문 항목에는 소속 주문번호가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:105` |
| LINEITEM.linenum | 주문 항목에는 주문 내 순번을 나타내는 행번호가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:106` |
| LINEITEM.itemid | 주문 항목에는 주문한 품목의 식별자가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:107` |
| LINEITEM.quantity | 주문 항목에는 주문 수량이 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:108` |
| LINEITEM.unitprice | 주문 항목에는 단가가 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |
| CATEGORY | 상품 분류는 분류 코드로 유일하게 식별되며, 동일한 분류 코드가 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:113` |
| CATEGORY.catid | 상품 분류에는 분류 코드가 반드시 부여되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:114` |
| PRODUCT | 상품은 상품 식별자로 유일하게 식별되며, 동일한 상품 식별자가 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:120` |
| PRODUCT.productid | 상품에는 상품 식별자가 반드시 부여되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:121` |
| PRODUCT.category | 상품은 반드시 하나의 상품 분류에 소속되어야 하며, 분류 값을 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:122` |
| PRODUCT(category) | 상품에 지정된 분류는 반드시 실재하는 상품 분류여야 하며, 등록되지 않은 분류에는 상품을 소속시킬 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:126` |
| ITEM | 품목은 품목 식별자로 유일하게 식별되며, 동일한 품목 식별자가 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:133` |
| ITEM.itemid | 품목에는 품목 식별자가 반드시 부여되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:134` |
| ITEM.productid | 품목은 반드시 하나의 상품에 소속되어야 하며, 상품 식별자를 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:135` |
| ITEM(productid) | 품목에 지정된 상품은 반드시 실재하는 상품이어야 하며, 등록되지 않은 상품에는 품목을 소속시킬 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:146` |
| ITEM(supplier) | 품목에 지정된 공급처는 반드시 실재하는 공급처여야 하며, 등록되지 않은 공급처를 품목에 연결할 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:148` |
| INVENTORY | 재고는 품목 식별자로 유일하게 식별되며, 한 품목에 대한 재고 기록은 하나만 존재한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:154` |
| INVENTORY.itemid | 재고 기록에는 대상 품목의 식별자가 반드시 기록되어야 한다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:155` |
| INVENTORY.qty | 재고 기록에는 보유 수량이 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |
| SEQUENCE | 채번(일련번호 발급) 정보는 채번 이름으로 유일하게 식별되며, 동일한 이름의 채번 항목이 중복될 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:160` |
| SEQUENCE.name | 채번 항목에는 채번 이름이 반드시 부여되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:162` |
| SEQUENCE.nextid | 채번 항목에는 다음에 발급할 번호 값이 반드시 기록되어야 하며, 비워 둘 수 없다. | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:163` |
<!-- policy-fill:end -->
