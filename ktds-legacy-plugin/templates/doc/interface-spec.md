---
docId: si-인터페이스정의서
title: SI 인터페이스정의서
methodology: si-standard
---

<!--
  SI 인터페이스정의서(API) 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/interface-spec.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## API 목록 {#api-list}

라우트 1건 = 표 1행. 경로/HTTP/핸들러는 라우트 추출 사실 → [확정] + 근거(file:line).
요청/응답/인증은 그래프에 없어 추론 → [추정]. API_ID=API-001.. (routeId 정렬 순서).

| API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 |

## 대외 연계(송신·라우트 외 수신) {#outbound-list}

interfaces.json(W1 결정론 스캔) 1건 = 표 1행. 탐지·엔드포인트는 코드/설정 근거(file:line)
→ [확정], 대상시스템은 추론 → [추정], 동적 조립 등 미해석 엔드포인트는 [미확인].
IF_ID=IF-<프로토콜>-001.. (protocol, file, line 정렬 순서).

| IF_ID | 프로토콜 | 방향 | 대상시스템 | 엔드포인트 | 데이터 | 상태 |
