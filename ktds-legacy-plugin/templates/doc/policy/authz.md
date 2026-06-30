---
docId: policy-authz
title: 권한 정책
methodology: policy
---

<!--
  권한 정책 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/policy/authz.md
  형식·신뢰도 규약: ../_README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 권한 통제 지점 {#authz-points}

클래스·메서드의 권한 어노테이션(@PreAuthorize/@Secured/@RolesAllowed 등) 통제 지점. 어노테이션
존재·위치는 [확정], role 표현식의 의미는 [추정](P3 LLM 보강 대상). 권한 어노테이션이 없는
엔트리포인트(통제 누락 후보)는 후속 단계에서 routes 대조로 식별한다.

| 대상 | 권한 어노테이션 | 범위 |
