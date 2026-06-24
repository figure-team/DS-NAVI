---
docId: si-테이블정의서
title: SI 테이블정의서
methodology: si-standard
status: DRAFT
sourceCommit: null
evidenceRate: 1
---

# SI 테이블정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## ACCOUNT 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADDR1 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| ADDR2 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| CITY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| COUNTRY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| EMAIL | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| FIRSTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| LASTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| PHONE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| STATE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| STATUS | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| USERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |
| ZIP | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95` |

## BANNERDATA 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## CATEGORY 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## INVENTORY 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QTY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:76` |

## ITEM 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## LINEITEM 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ITEMID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37` |
| LINENUM | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37` |
| ORDERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37` |
| QUANTITY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37` |
| UNITPRICE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37` |

## ORDERS 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BILLADDR1 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLADDR2 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLCITY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLCOUNTRY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLSTATE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLTOFIRSTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLTOLASTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| BILLZIP | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| CARDTYPE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| COURIER | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| CREDITCARD | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| EXPRDATE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| LOCALE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| ORDERDATE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| ORDERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPADDR1 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPADDR2 | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPCITY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPCOUNTRY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPSTATE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPTOFIRSTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPTOLASTNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| SHIPZIP | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| TOTALPRICE | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |
| USERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93` |

## ORDERSTATUS 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LINENUM | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104` |
| ORDERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104` |
| STATUS | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104` |
| TIMESTAMP | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104` |

## PRODUCT 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## PROFILE 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BANNEROPT | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114` |
| FAVCATEGORY | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114` |
| LANGPREF | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114` |
| MYLISTOPT | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114` |
| USERID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114` |

## SEQUENCE 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NEXTID | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:32` |

## SIGNON 테이블

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PASSWORD | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:127` |
| USERNAME | [추정] | [추정] | [추정] | [추정] |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:127` |
