---
name: understand-docs
description: 근거 기반 산출물 생성 — as-built 5종 / SI표준 3종 + 위키 볼트(.spec/docs, .spec/wiki), 모든 주장 file:line 근거
argument-hint: ["[projectRoot]", "[as-built|si-standard]"]
---

# /understand-docs

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).

확정된 도메인 맵에서 **온보딩/SI 산출물**을 생성한다. 모든 주장(claim)은 `file:line` 근거와 4단계 신뢰도 태그(`[확정]`/`[확정(AI)]`/`[추정]`/`[확인 필요]`)를 가지며(AC-9), 새 사실을 지어내지 않는다(grounding 보존).

## 실행

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-docs.mjs <projectRoot> [as-built|si-standard]
```

- 기본 방법론은 `as-built`. `si-standard` 로 한국 SI 정형 서식을 생성한다.
- 선행: `/understand-map confirm` 으로 도메인 경계를 확정해야 한다(미확정 시 안내 후 종료).

## 방법론 모듈 (보완 C, AC-23)

같은 그래프에서 **모듈을 교체하면 다른 문서셋/서식**이 산출된다.

- **as-built** (기본): 01_tech-stack · 02_architecture · 03_feature-spec · 04_api-spec · 05_db-spec.
- **si-standard** (AC-24): si-기능명세서 · si-인터페이스정의서(API) · si-테이블정의서(DB) — 표 중심 정형 서식, 각 행에 신뢰도 + 근거 열.

## 산출물

- `.spec/docs/` (또는 위키 볼트 내) 문서 마크다운.
- `.spec/wiki/` 위키 볼트: 문서별 `.md` + `index.md` 허브(방법론별 `[[문서ID]]` 위키링크 + "여기부터(start here)" 온보딩 경로, AC-27).
- HTML export 는 `exportHtml` 로 별도 생성 가능.

## 승인/감사 (P4.2)

- 문서 상태: DRAFT → UNDER_REVIEW → APPROVED/RETURNED.
- evidence enforcement: `[확정](CONFIRMED)` 근거 0 → 저장 차단(RETURNED); 문서 INFERRED 비율 > 0.6 → 승인 차단.
- 사람 확정은 doc-state(APPROVED + 승인자 + 감사 로그)로 기록.

## STALE 증분 재승인 (AC-26)

근거 노드의 fingerprint/commit 이 바뀌면 해당 claim/섹션만 STALE 로 표시되고, 변경된 claim만 증분 재승인한다(전체 재승인 아님).

## 출력 해석

생성된 문서 종류·근거율·위키 볼트 경로를 한국어로 보고한다.
