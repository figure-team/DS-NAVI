---
name: understand-map
description: 결정론 도메인 맵 — 전수 census/라우트/콜체인/도달성 스캔 (.spec/map/*.json, 동일 commit byte-diff=0)
argument-hint: ["[projectRoot]", "[scan]"]
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

## 선행

- `/understand-init` 로 `understanding.config.json` 생성.
- (선택) U-A `/understand` 로 `.understand-anything/knowledge-graph.json` 생성 → 교차검증/힌트.

## 후속 (로드맵)

- `plan`/`confirm` (도메인 경계 사람 게이트) — P2.
- `bundle`/`emit` (LLM 채움 + 인용 검증 + domain-graph.json) — P2/P4.

## 출력 해석

스캔 요약(파일/라우트/엣지/슬라이스 개수)을 한국어로 보고하고, `.spec/map/` 산출물 경로를 안내한다.
