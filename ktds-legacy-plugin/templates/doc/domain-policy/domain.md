---
docId: policy-domain
title: 도메인 정책
methodology: domain-policy
---

<!--
  도메인 정책서 기본 템플릿(플러그인 기본, 사람 편집 가능).
  도메인당 1문서가 이 템플릿으로 렌더된다 — docId/title 은 도메인별로 치환된다
  (policy-domain-<key> / "도메인 정책 — <표시명>"). 위 frontmatter 의 docId/title 은 자리표시.
  프로젝트 override: <proj>/.understand-anything/doc/domain-policy/domain.md (있으면 우선).
  섹션 키({#...})는 빌더와 매칭되어야 한다(domain-composition / domain-flows / domain-branches).
  신뢰도·근거 열은 렌더러가 자동 부가하므로 여기 열에는 넣지 않는다. 열 이름은 바꿔도 되나
  개수는 빌더와 같아야 적용된다(구성 2 · 흐름 2 · 분기 3).
-->

## 도메인 구성 {#domain-composition}

도메인을 이루는 멤버 클래스(운영 소스, 테스트 제외). 파일 근거를 동반한다.

| 클래스 | 파일 |

## 업무 흐름 {#domain-flows}

도메인의 진입점별 업무 흐름(emit 된 도메인 그래프 기준). 진입점 file:line 을 근거로.

| 흐름 | 진입점 |

## 조건 분기 (위치·조건식 = 확정 · 업무분류 = 보강) {#domain-branches}

흐름 안의 결정 지점(if/switch/삼항). 위치·조건식·종류는 결정론 [확정], 업무 분류
(권한/상태/계산/검증)·의미는 LLM 보강에서 [추정]. 분기 0이면 "조건 없음"을 단정한다.

| 메서드 | 조건식 | 분기 종류 |
