---
name: understand-onboard
description: 가이드 1-명령 온보딩 — 신규 투입 개발자가 낯선 레거시 코드를 한 번에 분석(init→scan→자동 도메인 확정→도메인 그래프 emit→문서 생성→커버리지 리포트). 대시보드 도메인 지도까지 생성. granular 명령은 파워유저용으로 유지.
argument-hint: ["[projectRoot]", "[--by <handle>]", "[--skip-docs]", "[--methodology as-built|si-standard]"]
---

# /understand-onboard

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).

신규 투입 개발자를 위한 **단일 진입점**이다. 낯선 레거시 코드베이스를 한 번의 명령으로 분석해 도메인 지도·산출물·커버리지까지 만든다. 결정론 ktds 분석 체인을 순서대로 실행한다(각 단계는 기존 granular CLI 를 그대로 호출 — 파워유저용 granular 명령은 그대로 유지된다).

## 0) 전제
별도 선행 명령 없음. 온보딩이 **대시보드 도메인 지도(`domain-graph.json`)와 최소
`knowledge-graph.json`(코드뷰어·검색·화면설계 대조용)까지 자동 생성**한다 — 구조 메뉴는
map 산출(도메인 4뎁스 드릴다운)로 렌더되므로 `/understand`(U-A KG) 실행이 필요 없다
(STRUCTURE_FROM_MAP).

## 1) 1-명령 온보딩
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-onboard.mjs <projectRoot> [--by <담당자>] [--skip-docs] [--methodology as-built|si-standard]
```
체이닝 순서:
1. **init** — `.spec/` 스캐폴드 + config(outputLanguage=ko).
2. **map scan** — census/routes/edges/slices/candidates + **jpa-model**(보완 B) + **coverage**/**fingerprints**(보완 D) 산출(결정론).
3. **map confirm --auto-approve** — 자동 분류 도메인 경계를 **1차 자동 확정**(NON-TTY 안전). 정밀 경계는 선택적 후속.
4. **map** — 도메인 맵 요약(우선순위 랭킹 + 교차 도메인) + skeleton 산출.
5. **emit** — skeleton → **`.understand-anything/domain-graph.json`**(대시보드 도메인 지도). `fill/<key>.json` 이 없으면 **결정론 라벨 폴백**으로 미채움 노드를 채운다(카드/기능/스파인은 보이되 근거·검증 패널은 비어 있음). 근거까지 원하면 후속 `bundle → fill → emit`.
6. **docs** — 방법론 모듈(기본 `as-built`)로 5종 문서 + 위키 볼트 생성(모든 주장 `file:line` 근거).
7. **커버리지 리포트**(보완 D-c) — "분석이 코드의 몇 %를 정직하게 덮었나"(스캔 파일·계층 해소율·도달성·엣지 해소·cap 절단·비-Java 패스스루·JPA Tier C).

## 2) 자동 1차 패스의 의미 (정직성)
`--auto-approve` 는 **자동 분류 경계를 그대로 확정**한다(사람 검토 없이). 이는 빠른 1차 온보딩용이며, 정밀 도메인 경계가 필요하면 후속으로 `/understand-map plan → confirm` 을 재실행해 경계를 재정련한다(키 불변, 재실행 안전).

## 3) 증분 재스캔 (보완 D-b)
코드 변경 후 `/understand-onboard` 를 다시 실행하면 스캔이 fingerprint 로 변경 파일을 가린다(`.spec/map/fingerprints.json` 기준). **확정 도메인 플랜(domain-plan.confirmed.json)은 보존**되며(스캔은 confirm 을 건드리지 않음), 변경 파일에 근거를 둔 문서 claim 은 STALE 로 표시되어 **변경된 claim 만 증분 재승인**된다(전체 재승인 아님).

## 4) 다음 단계 (선택, 사용자 안내)
- **근거·검증 채움:** `/understand-map bundle` → `fill/<key>.json` 작성 → `emit`(도메인 카드 근거율·인용칩 노출).
- **정밀 도메인 경계:** `/understand-map plan` → `confirm`(자동 1차 경계 재정련).
- **변경 영향도 / 생성예측:** `/understand-impact`(역/정 도달성 + 선례 기반 `[변경]/[생성]/[영향]`).
- **구조 메뉴(도메인 드릴다운):** 추가 명령 불필요 — map 산출로 상단도메인→서브도메인→업무
  흐름도→기능흐름도 4뎁스가 렌더된다(상단도메인 계층은 `/understand-map group-input` →
  group-classify → confirm 으로 구성).

granular 명령(`/understand-init`·`/understand-map`·`/understand-docs`·`/understand-impact`)은 파워유저용으로 독립 동작한다(AC-10).
