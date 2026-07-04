---
docId: si-배치정의서
title: SI 배치정의서
methodology: si-standard
---

<!--
  SI 배치정의서(W2) 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/batch-spec.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 배치 목록 {#batch-list-si}

batch-jobs.json(W2 결정론 스캔) 1건 = 표 1행. 트리거·스케줄·핸들러·도달범위는 코드/설정
근거(file:line) → [확정]. 배치명(핸들러 초안)은 추론 → [추정], 사람이 업무명으로 확정.
'해석'은 잡 구현 파일의 정적 해석 여부만 뜻함(배치 검증/운영 여부 아님):
해석됨 | [미확인] | 외부(shell·crontab — 프로젝트 밖 실행체).
BAT_ID 는 내용 파생 안정 id(재스캔에도 동일 배치 = 동일 id).

| BAT_ID | 배치명 | 트리거 | 스케줄 | 핸들러 | 도달범위(파일) | 해석 |
