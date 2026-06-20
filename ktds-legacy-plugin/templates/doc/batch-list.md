---
docId: 08_batch-list
title: 배치 작업 목록
methodology: as-built
---

<!--
  배치 작업 목록 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/batch-list.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 배치 작업 목록 {#batch-list}

배치/스케줄 진입점 1건 = 표 1행. 트리거/진입점/위치는 routes 의 batchEntries 추출 사실 →
[확정] + 근거(file:line). 스케줄(cron 식)은 추출되면 [확정], 없으면 [추정]. 설명=핸들러 요약.
배치ID=BAT-001.. (entryId 정렬 순서).

| 배치ID | 작업명 | 트리거 | 진입점 | 스케줄 | 설명 |
