---
docId: 07_crud-matrix
title: CRUD 매트릭스
methodology: as-built
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 0.5
---

# CRUD 매트릭스

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## CRUD 매트릭스

행=기능(flow), 열=테이블(분석 시 자동 생성), 셀=C/R/U/D(해당 없으면 빈칸).
flow→step(dao 계층)→테이블/매퍼 추적으로 접근 테이블을 도출하고, 매퍼 SQL/메서드명에서
C(insert)/R(select)/U(update)/D(delete)를 판정한다(SQL 미해소 시 접근표시 R 또는 [추정]).
고정 열은 '기능'만 — 테이블 열은 데이터로 생성(matrix 섹션, _README 참조).

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
| 주문 목록 조회 |  |  |  |  |  |  | R | R |  |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:59` |
| 주문 생성 |  |  |  | U |  | C | C | C |  |  | RU |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:76`, `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:37`, `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:93`, `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:104`, `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/SequenceMapper.xml:32` |
| 주문 폼 표시 |  |  |  |  |  |  |  |  |  |  |  |  | [추정] |  |
| 주문 상세 조회 |  |  |  | R | R | R | R | R |  |  |  |  | [확정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:70`, `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:47`, `src/main/resources/org/mybatis/jpetstore/mapper/LineItemMapper.xml:26`, `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:26` |
