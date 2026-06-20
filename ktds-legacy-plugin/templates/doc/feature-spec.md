---
docId: si-기능명세서
title: SI 기능명세서
methodology: si-standard
---

<!--
  SI 기능명세서 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/feature-spec.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 기능 목록 {#feature-list}

도메인 노드 1개 = 표 1행. 설명=도메인 summary, 진입점=domainMeta.entryPoint,
업무규칙=domainMeta.businessRules(없으면 [추정]). 관련 API/테이블은 그래프에 도메인↔라우트/
테이블 연결정보가 없으면 [추정](합성 금지, grounding 보존). 기능ID=FN-001.. (도메인 순서).

| 기능ID | 기능명 | 설명 | 진입점 | 관련 API | 관련 테이블 | 업무규칙 |
