---
name: understand-review
description: 변경분 실측 리뷰 — git diff가 보고한 실제 변경 파일을 시드로 도달성 영향(API/DB/흐름)을 결정론 산출하고, 사전 영향 분석(--sr)과 대조해 리뷰 체크리스트를 만든다.
argument-hint: ["[projectRoot]", "[--base <ref>]", "[--sr <SR-ID>]"]
---

# /understand-review

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·요약은 **한국어**로 한다.

`/understand-impact`("바꾸면 어디까지 영향?")의 짝 — **"실제로 바꾼 것"의 영향**을 답한다. `git diff`(base..워킹트리, 미커밋 변경 포함)가 보고한 변경 파일을 같은 결정론 엔진에 시드로 투입해, 리뷰어(PL)가 확인할 영향 API·DB 매퍼·업무 흐름 체크리스트를 `파일:라인` 인용과 함께 생성한다. 코드 리뷰·머지 전·배포 전 게이트 용도.

## 0) 전제
`/understand-map scan` 산출물(`.spec/map/`)이 있어야 하고, **git 저장소**여야 한다(아니면 안내 후 중단, exit 2). 실행 시 map을 자동 재스캔해 현재 코드 기준으로 계산한다(도메인 confirm 게이트는 건드리지 않음).

## 1) 실행
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-review.mjs <projectRoot> analyze [--base <ref>] [--sr <SR-ID>] [--by <핸들>]
```
- `--base` 생략 시 **마지막 map 스캔 시점 commit**이 기준(= "그때 이후 바뀐 것 전부"). 특정 브랜치/커밋 대비로 보려면 명시 (예: `--base origin/main`). ⚠️ **커밋된 변경을 리뷰할 땐 `--base`를 명시**하라 — 리뷰가 map을 재스캔해 기본 base가 HEAD로 이동하므로 재실행 시 "변경 없음"이 된다.
- untracked 신규 파일도 변경분에 포함된다(`git add` 불필요 — census와 동일 기준). 한글 등 비-ASCII 파일명도 정상 처리.
- `--sr <SR-ID>`: 사전 영향 분석 보관본(`.spec/impact/<SR-ID>/impact.json`)과 **대조** — "예측 밖 변경"(사전 영향 범위에 없던 파일이 바뀜)과 "예측 시드 중 미변경"(계획 변경/작업 누락 후보)을 경고하고, 리뷰 결과를 같은 SR 폴더에 보관한다(예측·실측 나란히).
- 변경이 0건이면 그대로 종료(임의 분석 없음). 삭제 파일은 도달성 시드가 될 수 없어 "수동 확인" 절로 분리된다.

산출: `.spec/map/review.json` + `review-verify-report.json`(예측 산출물 `impact.json`은 보존) + `docs/09_release/change-review-checklist.md`(읽기전용) + `.understand-anything/diff-overlay.json`(실측 채널) + `REVIEW_ANALYZED` 감사.

## 2) 결과 해석 (사용자에게)
- 체크리스트의 시드 = **실제 변경 파일**(git 사실, `[확정(AI)]`). 영향 절은 impact와 동일 의미론(상류=깨질 수 있는 호출자→API, 하류=의존 협력자→DB 매퍼).
- **예측 대조가 핵심 부가가치**: 예측 밖 변경이 있으면 "왜 이 파일까지 건드렸는지"를, 예측 시드 미변경이 있으면 "작업이 빠졌는지"를 리뷰에서 물어볼 것.
- 대시보드에서는 **Diff 토글(`d` 키)** 이 이 실측 결과를 표시한다 — 적색="변경됨"(진짜 변경), 호박색="영향받음". 예측은 별도 '영향도' 토글(`i` 키)이며 둘은 동시에 켜지지 않는다.

## 3) 한국어 보고
변경 N건(+삭제 M) · 상류/하류 · API/매퍼 · 예측 대조 결과 · 근거율을 요약해 보고하고, 체크리스트 경로를 안내한다.

> 이 문서는 **읽기전용 분석물**이다 — 검토·승인 상태기계 밖. 5종 문서의 확정/승인과 무관.
