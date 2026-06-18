---
name: understand-map
description: 결정론 도메인 맵 — 전수 census/라우트/콜체인/도달성 스캔 + 도메인 경계 확정 + 요약 (.spec/map/*.json, 동일 commit byte-diff=0)
argument-hint: ["[projectRoot]", "[scan|plan|confirm|map]"]
---

# /understand-map

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).

레거시 코드의 도메인/기능 분석을 **결정론으로** 생산한다. 구조는 LLM 이전에 확정되며(census·routes·edges·slices), 동일 commit 재실행 시 산출물이 byte 단위로 동일하다. 모든 사실은 `파일:라인` 근거를 갖는다(AC-9).

## 1) 스캔 (결정론)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> scan
```

산출: `.spec/map/{census,routes,edges,slices}.json`

- **census**: 전수 파일 인벤토리 + 언어 분류(ignore 필터 적용, relPath 정렬).
- **routes**: HTTP/배치 진입점 — Spring MVC/Boot 애너테이션, Next.js 파일 라우팅, Stripes ActionBean, JSP 페이지, web.xml 서블릿. 배치 진입점은 Spring `@Scheduled`/`main`, Quartz·`task:scheduled` XML.
- **edges**: 파일 의존 엣지(import·injection·field-type·ctor-param·extends·implements·impl·mybatis·mapper-xml). 미해소 참조는 조용히 버리지 않고 보고한다.
- **slices**: 진입점 기준 도달성(역/정) + 파일 소유권(sole/shared/unreached, depthCap 12).
- **계층(layer)**: ground-truth 신호로 동적 추론(하드코딩 4계층 아님; api/service/dao/db/unknown).

## 2) 계획 (도메인 경계 확인)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> plan
```

자동 분류된 도메인 후보를 **한국어 표**(키/루트수/진입수/파일수)로 보여준다. 쓰기 없음.
이 표는 자동 결과이며 확정 전 사람 검토가 필요하다(사람 게이트).

## 3) 확정 (사람 게이트)

```
# 미실행(표 + 안내만, NON-TTY 안전)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> confirm

# 확정 실행(후보를 그대로 수용해 확정 플랜 기록)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> confirm --auto-approve --by <담당자>
```

자동 확정은 하지 않는다. `--auto-approve --by <담당자>` 가 모두 있을 때만 `domain-plan.confirmed.json` 을 기록한다(없으면 표 + 안내만 출력하고 종료 코드 2). 도메인 `key` 는 불변(skeleton ID 의 닻)이며, 표시명만 개명할 수 있다(AC-31, LLM 제안명은 `renameDomain` 으로 적용).

산출: `.spec/map/domain-plan.confirmed.json` (재실행 결정론의 닻).

## 4) 요약 (우선순위 + 교차 도메인)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> map
```

확정 플랜이 있어야 한다(없으면 confirm 안내 후 종료). 도메인별 **온보딩 우선순위 랭킹**("여기부터 보세요", AC-32)과 **교차 도메인 의존 엣지**(AC-33)를 한국어로 보고한다.

- **우선순위(E-b, AC-32)**: `priorityScore = 복잡도*3 + 결합도*2 + 크기*1`(고정 정수 가중치). 정렬은 우선순위 DESC, 동점이면 key ASC. rank 는 1-based.
- **교차 도메인(E-c, AC-33)**: 서로 다른 도메인 파일 사이의 의존 엣지를 도메인 단위로 집계하되, 근거(evidence)는 실제 파일 엣지로 grounded 하게 보존(합성 금지). self-domain 엣지 제외.
- **요약(AC-3)**: 도메인별 흐름수/노드수/우선순위/grounded(모든 멤버 노드가 파일:라인 앵커 보유 시 true, AC-9)/대표 앵커.

> ℹ️ P2의 노드(step)는 **파일 단위 구조 도달성**으로 산출된다(슬라이스 기반). 메서드 단위 정밀 호출그래프(8종 receiver 해석)는 **P3**에서 정밀화된다 — 현재 노드수는 파일 입도 기준이다.

산출: `.spec/map/domain-map.json` (동일 commit 재실행 byte-diff=0).

## 선행

- `/understand-init` 로 `understanding.config.json` 생성.
- (선택) U-A `/understand` 로 `.understand-anything/knowledge-graph.json` 생성 → 교차검증/힌트.

## 후속 (로드맵)

- `bundle`/`emit-with-fill` (LLM name/summary 채움 + 인용 검증) — P4.

## 출력 해석

각 단계 요약을 한국어로 보고하고, `.spec/map/` 산출물 경로를 안내한다. scan→plan→confirm→map 순서로 진행한다.
