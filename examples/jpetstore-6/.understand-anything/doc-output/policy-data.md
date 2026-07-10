---
docId: policy-data
title: 데이터 정책
methodology: policy
status: DRAFT
sourceCommit: d51826fcf3b5618e4a5fc6f5fa1657de3c390ad6
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
