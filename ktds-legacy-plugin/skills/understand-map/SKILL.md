---
name: understand-map
description: 결정론 도메인 맵 — 전수 census/라우트/콜체인/도달성 스캔 + 도메인 경계 확정 + 요약 (.spec/map/*.json, 동일 commit byte-diff=0)
argument-hint: ["[projectRoot]", "[scan|plan|confirm|map|bundle|emit|templates]"]
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

## 5) 번들 (LLM 채움 입력 조립)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> bundle
```

skeleton 이 있어야 한다(없으면 안내 후 종료). 도메인별로 **LLM 채움 입력 묶음**을 `.spec/map/bundle/<key>.json` 에 조립한다. 각 묶음은:

- **노드 구조**: 도메인의 흐름(flow)·단계(step) id 와 진입점/진입유형, 흐름별 단계 체인.
- **근거 후보**: 각 단계 대상 파일의 **실제 소스 슬라이스**(앵커 라인 주변, 인용 가능한 텍스트) — charCap 초과분은 `slice=null` + `sliceOmitted` 로 정직하게 보고(조용한 누락 금지).
- **결정론 신호**: 파일 경로·앵커 라인·클래스명, (KG 존재 시) 파일 노드의 summary/tags 기회 보강.

산출: `.spec/map/bundle/<key>.json` (동일 입력 byte-diff=0).

## 6) 호스트(Claude) 채움 — fill 작성 (인용 의무)

번들과 emit 사이에서 **호스트(Claude)가 도메인당 1회** 채움을 수행한다:

1. `.spec/map/bundle/<key>.json` 을 읽는다.
2. 그 안의 소스 슬라이스·구조 신호만 근거로, 도메인/흐름/단계의 `name`·`summary`·`entities`·`businessRules`·`crossDomainInteractions` 을 작성한다.
3. **단계 상세(P2/P4 계층별):** 각 step 의 `layer` 를 보고 `nodeDetailTemplate.byLayer[layer]` 의 섹션들을 그 `promptHint` 지시대로 `steps[].detail[<섹션id>]` 에 채운다. 템플릿은 **계층별 파일**(`templates/node-detail/{api,service,dao,db,other}.md`, 사람 편집 권위·런타임 로드)에서 온다. 기본 시그니처 — api=role+request, service=role+businessLogic, dao=role+persistence, db=role+schema, other(unknown)=role+dataShape. 각 섹션은 step slice 에서 인용. 메서드·호출관계는 채우지 않는다(결정론 — 엔진이 calls 엣지로 보유).
4. **업무 흐름도(`businessFlow`, WORK_MAP §5 — 선택):** 도메인당 1장의 업무 프로세스 순서도를 `businessFlow: { nodes[], edges[] }` 로 작성한다. 노드 `kind` 는 `start|end|activity|decision`, `label` 은 **업무 언어**(코드 심볼 금지 — "재고 확인" ○, "checkInventory()" ✕)로 **짧게(~30자)** — 노드 상자가 고정 크기라 긴 라벨은 잘린다. 규칙:
   - `activity`/`decision` 은 `citations` 1개 이상 필수(사실 주장) — **분기(decision)는 코드 근거(if/예외 처리) 또는 businessRules 근거가 있을 때만** 만든다. 근거 없는 분기 창작 금지 — 확신 없으면 순차로 두라.
   - `start`/`end` 는 구조 마커라 인용 면제, 각각 1개 이상 필수.
   - `activity` 가 특정 기능에 대응하면 `flowRef` 에 **이 도메인의** flow id 를 단다(유령/타 도메인 참조는 emit 이 기각). 대시보드가 이 앵커로 업무→코드 드릴다운을 연결한다.
   - `edges` 의 분기 라벨은 `label`("YES"/"NO"/"재고 있음" 등)로. 고아 노드·중복 id·끝점 미실존은 emit 이 **businessFlow 만 기각**한다(도메인 fill 은 유지 — 기각 사유가 rejected 로 보고되니 고쳐서 재emit).
   - 미작성 시 대시보드는 기능 순차 나열 폴백을 그린다 — **억지로 만들지 말 것**(품질 우선).
5. 결과를 `.spec/map/fill/<key>.json` 에 `DomainFill` 스키마로 쓴다.

**계약(반드시 준수):**

- 모든 **사실 주장**(summary/entities/businessRules/crossDomainInteractions/흐름 summary/단계 summary/**단계 detail 섹션**)에 `citations` 1개 이상 필수. 각 인용은 `{ filePath, line, snippet }` — `filePath` 는 프로젝트 루트 상대 경로, `line` 은 1-based, `snippet` 은 **그 라인의 실제 텍스트(8자 이상, 식별자성 토큰 포함)**.
- `domainId`/`flowId`/`stepId` 는 번들에 있는 id 만 사용한다(모르는 ID·다른 도메인 ID 는 emit 단계에서 항목 단위 기각).
- 구조 필드(filePath/lineRange/entryPoint 등)는 채우지 않는다(read-only — emit 이 보존).
- 도메인 표시명(`name`)만 인용 면제(명명이라). 그 외 텍스트는 근거 없으면 쓰지 않는다.
- 채움은 **도메인 단위 멱등**이다 — 실패/누락 도메인의 `fill/<key>.json` 만 다시 쓰면 그 도메인만 재반영된다.

> 채우지 않은 도메인은 emit 에서 **결정론 라벨 폴백**(도메인=key 표제화, 흐름=진입점, 단계=파일명)으로 빈 이름 대신 구조명을 갖는다(하이브리드: 채움 우선, 미채움은 결정론 라벨).

## 7) Emit (인용 기계검증 + 도메인 그래프 산출)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> emit
```

채움 파이프라인을 실행한다: `fill/<key>.json` 읽기 → skeleton 에 적용(구조 read-only, 도메인 밖 ID 기각) → **인용 기계검증**(경로 실존 → 라인 범위 → 정규화 스니펫↔실파일 텍스트 일치; path-escape/no-file/line-out-of-range/text-mismatch/trivial-snippet 차단) → NEEDS_REVIEW 강등(ok 인용 0개 항목 텍스트 앞에 `[확인 필요] ` 마커, **삭제 금지**) → emit.

- ok 인용이 1개라도 있으면 항목은 `GROUNDED`, 0개면 `NEEDS_REVIEW`(텍스트 보존 + 마커).
- 부분 채움 허용 — pending(미작성)/invalid(스키마 실패)/rejected(도메인 밖 ID) 를 보고하고 채워진 도메인만 반영한다.
- 근거율(`groundedPct`)·인용 ok 율을 한국어로 보고한다(인용 실존율의 측정기).

산출:
- `.understand-anything/domain-graph.json` — U-A KnowledgeGraph 호환(version/project/nodes/edges/layers/tour + ktdsMap). 대시보드가 fetch 해 도메인 뷰를 그린다.
- `.spec/map/verify-report.json` — 인용 검증 리포트(도메인별 항목/인용 status/근거율).

동일 입력 재실행 byte-diff=0(NEEDS_REVIEW 마커는 보존).

## 선행

- `/understand-init` 로 `understanding.config.json` 생성.
- (선택) U-A `/understand` 로 `.understand-anything/knowledge-graph.json` 생성 → 교차검증/힌트.

## 출력 해석

각 단계 요약을 한국어로 보고하고, `.spec/map/` 산출물 경로를 안내한다.
전체 순서: scan → plan → confirm → map → bundle → (호스트 fill 작성) → emit.
