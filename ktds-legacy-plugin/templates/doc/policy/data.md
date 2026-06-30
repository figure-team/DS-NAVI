---
docId: policy-data
title: 데이터 정책
methodology: policy
---

<!--
  데이터 정책 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/policy/data.md
  형식·신뢰도 규약: ../_README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 데이터 제약 {#data-constraints}

DDL(CREATE TABLE)에서 추출한 제약 — NOT NULL/기본키/유니크/외래키/CHECK. 모두 file:line
근거를 갖는 [확정]. 보존기간 등 DDL 밖 정책은 [추정](P3 LLM 보강 대상).

| 대상 | 제약 | 내용 |
