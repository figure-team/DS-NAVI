---
docId: 09_impact-analysis
title: 영향도 분석서
methodology: as-built
---

<!--
  영향도/의존성 분석서 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/impact-analysis.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
  ITO 변경관리용: 어떤 컴포넌트가 변경 시 파급이 큰지(고영향) + 도메인 간 결합.
-->

## 고영향 컴포넌트 {#impact-hotspots}

피의존수(fan-in)·전이 영향 파일수 기준 상위 컴포넌트. 변경 시 파급이 큰 핫스팟.
fan-in/fan-out 은 depends_on/imports/calls 엣지 집계 → [확정]. 전이 영향 파일수는 impact
엔진(reach) 결과. 레이어=노드 layer. 컴포넌트=파일 경로(근거 file:line). 피의존수 내림차순.

| 컴포넌트 | 피의존수(fan-in) | 의존수(fan-out) | 전이 영향(파일수) | 레이어 |

## 도메인 간 의존 {#cross-domain-deps}

도메인 경계를 넘는 의존(결합). skeleton 의 교차 도메인 의존 엣지 → [확정] + 근거 건수.
출발/도착 도메인, 가중치, 근거 건수. 가중치 내림차순.

| 출발 도메인 | 도착 도메인 | 가중치 | 근거 건수 |
