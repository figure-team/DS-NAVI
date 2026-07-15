---
docId: si-테이블정의서
title: SI 테이블정의서
methodology: si-standard
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 1
---

# SI 테이블정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## ACCOUNT 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| userid | varchar(80) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:37` |
| email | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:38` |
| firstname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:39` |
| lastname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:40` |
| status | varchar(2) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:41` |
| addr1 | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:42` |
| addr2 | varchar(40) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:43` |
| city | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:44` |
| state | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:45` |
| zip | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:46` |
| country | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:47` |
| phone | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:48` |

## BANNERDATA 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| favcategory | varchar(80) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:62` |
| bannername | varchar(255) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:63` |

## CATEGORY 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| catid | varchar(10) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:114` |
| name | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:115` |
| descn | varchar(255) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:116` |

## INVENTORY 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| itemid | varchar(10) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:155` |
| qty | int |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:156` |

## ITEM 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| itemid | varchar(10) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:134` |
| productid | varchar(10) |  | → PRODUCT(productid) | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:135` |
| listprice | decimal(10,2) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:136` |
| unitcost | decimal(10,2) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:137` |
| supplier | int |  | → SUPPLIER(suppid) | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:138` |
| status | varchar(2) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:139` |
| attr1 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:140` |
| attr2 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:141` |
| attr3 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:142` |
| attr4 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:143` |
| attr5 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:144` |

## LINEITEM 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| orderid | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:105` |
| linenum | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:106` |
| itemid | varchar(10) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:107` |
| quantity | int |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:108` |
| unitprice | decimal(10,2) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:109` |

## ORDERS 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| orderid | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:68` |
| userid | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:69` |
| orderdate | date |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:70` |
| shipaddr1 | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:71` |
| shipaddr2 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:72` |
| shipcity | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:73` |
| shipstate | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:74` |
| shipzip | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:75` |
| shipcountry | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:76` |
| billaddr1 | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:77` |
| billaddr2 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:78` |
| billcity | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:79` |
| billstate | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:80` |
| billzip | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:81` |
| billcountry | varchar(20) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:82` |
| courier | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:83` |
| totalprice | decimal(10,2) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:84` |
| billtofirstname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:85` |
| billtolastname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:86` |
| shiptofirstname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:87` |
| shiptolastname | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:88` |
| creditcard | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:89` |
| exprdate | varchar(7) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:90` |
| cardtype | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:91` |
| locale | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:92` |

## ORDERSTATUS 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| orderid | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:97` |
| linenum | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:98` |
| timestamp | date |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:99` |
| status | varchar(2) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:100` |

## PRODUCT 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| productid | varchar(10) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:121` |
| category | varchar(10) |  | → CATEGORY(catid) | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:122` |
| name | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:123` |
| descn | varchar(255) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:124` |

## PROFILE 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| userid | varchar(80) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:53` |
| langpref | varchar(80) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:54` |
| favcategory | varchar(30) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:55` |
| mylistopt | int |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:56` |
| banneropt | int |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:57` |

## SEQUENCE 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| name | varchar(30) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:162` |
| nextid | int |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:163` |

## SIGNON 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| username | varchar(25) | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:31` |
| password | varchar(25) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:32` |

## SUPPLIER 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| suppid | int | PK |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:18` |
| name | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:19` |
| status | varchar(2) |  |  | NOT NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:20` |
| addr1 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:21` |
| addr2 | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:22` |
| city | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:23` |
| state | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:24` |
| zip | varchar(5) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:25` |
| phone | varchar(80) |  |  | NULL |  | [확정] | `src/main/resources/database/jpetstore-hsqldb-data.sql:26` |
