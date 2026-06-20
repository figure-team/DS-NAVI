---
docId: 07_crud-matrix
title: CRUD 매트릭스
methodology: as-built
---

<!--
  CRUD 매트릭스(기능×테이블) 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/crud-matrix.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## CRUD 매트릭스 {#crud-matrix}

행=기능(flow), 열=테이블(분석 시 자동 생성), 셀=C/R/U/D(해당 없으면 빈칸).
flow→step(dao 계층)→테이블/매퍼 추적으로 접근 테이블을 도출하고, 매퍼 SQL/메서드명에서
C(insert)/R(select)/U(update)/D(delete)를 판정한다(SQL 미해소 시 접근표시 R 또는 [추정]).
고정 열은 '기능'만 — 테이블 열은 데이터로 생성(matrix 섹션, _README 참조).

| 기능 |
