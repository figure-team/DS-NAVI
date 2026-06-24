---
docId: 07_crud-matrix
title: CRUD 매트릭스
methodology: as-built
status: DRAFT
sourceCommit: null
evidenceRate: 0.45454545454545453
---

# CRUD 매트릭스

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## CRUD 매트릭스

CRUD 는 기능 핸들러가 실제 호출하는 매퍼 메서드의 SQL 문 종류(select=R/insert=C/update=U/delete=D)에서 판정한다(메서드 호출그래프 정밀 귀속). 근거=Mapper XML file:line.

| 기능 | ACCOUNT | BANNERDATA | CATEGORY | INVENTORY | ITEM | LINEITEM | ORDERS | ORDERSTATUS | PRODUCT | PROFILE | SEQUENCE | SIGNON | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| *.action 요청 라우팅 흐름 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 계정 기본 진입(로그인 폼) |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 계정 수정 처리 | RU | R |  |  |  |  |  |  | R | RU |  | RU | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:52`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:79`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:102`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:122`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:36` |
| 계정 수정 폼 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 신규 계정 등록 처리 | CR | R |  |  |  |  |  |  | R | CR |  | CR | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:52`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:95`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:114`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:127`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:36` |
| 신규 계정 등록 폼 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 로그아웃 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 로그인 처리 | R | R |  |  |  |  |  |  | R | R |  | R | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:52`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:36` |
| 장바구니에 품목 담기 |  |  |  | R | R |  |  |  |  |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:70`, `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:47` |
| 체크아웃 진입 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 장바구니에서 품목 제거 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 장바구니 수량 갱신 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 장바구니 조회 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 카탈로그 메인 화면 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 상품 검색 |  |  |  |  |  |  |  |  | R |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:46` |
| 카테고리 조회 |  |  | R |  |  |  |  |  | R |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/CategoryMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:36` |
| 품목 상세 조회 |  |  |  |  | R |  |  |  |  |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:47` |
| 상품 상세 조회 |  |  |  |  | R |  |  |  | R |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml:26` |
| 주문 목록 조회 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 주문 생성 |  |  |  | U |  | C |  |  |  |  | RU |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:76`, `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37`, `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:32` |
| 주문 폼 표시 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 주문 상세 조회 |  |  |  | R | R | R | R | R |  |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:70`, `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:47`, `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:26`, `src/site/xdoc/index.xml:381` |
