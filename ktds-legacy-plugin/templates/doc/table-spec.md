---
docId: si-테이블정의서
title: SI 테이블정의서
methodology: si-standard
---

<!--
  SI 테이블정의서 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/table-spec.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 테이블 목록 {#table-list}

table/schema 노드 1개 = 테이블 섹션 1개(헤딩 `{테이블명} 테이블`). 행 신뢰도는 노드 근거
보유 여부로 결정. 컬럼/타입/PK/FK/NULL 은 JPA @Table/@Column·MyBatis Mapper XML SQL
슬라이스(P6 enrichment) 전까지 [추정](미상, 합성 금지). 설명=노드 summary.

| 컬럼 | 타입 | PK | FK | NULL | 설명 |
