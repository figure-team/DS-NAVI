---
docId: 02_architecture
title: 아키텍처 설계서
methodology: as-built
---

<!--
  아키텍처 설계서(현행 시스템 분석) 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/architecture.md
  형식·신뢰도 규약: _README.md 참조.
-->

## 레이어 {#layers}

시스템을 구성하는 계층(api/service/dao/db 등)과 구성요소 수. layer 집계에서 채운다([추정]).

## 의존 방향 {#dependencies}

모듈/계층 간 의존 방향. depends_on·imports 엣지에서 채운다([확정]).

## 순환 의존 후보 {#cycles}

탐지된 순환 의존(있으면). 순환탐지 결과에서 채운다([확인 필요] — 동적 호출 미반영 가능).
