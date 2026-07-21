---
name: understand-map
description: 결정론 도메인 맵 — 전수 census/라우트/콜체인/도달성 스캔 + 도메인 경계 확정 + 요약 (.spec/map/*.json, 동일 commit byte-diff=0)
argument-hint: ["[projectRoot]", "[scan|plan|confirm|group-input|map|bundle|fill-prep|fill-audit|fill-merge|emit|templates]"]
---

# /understand-map

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).
> 🖋 **문체:** LLM이 쓰는 모든 한국어 산문·라벨(§6 채움 전체)은 **문체 규약**을 로드해 따른다 — 프로젝트 override `.understand-anything/templates/style/ko-prose.md` → 없으면 `${CLAUDE_PLUGIN_ROOT}/templates/style/ko-prose.md`. 종결어미·번역투 금지·용어 표기·few-shot 예시가 담겨 있다(팬아웃 경로는 에이전트가 직접 로드한다 — 인자 불필요). **용어 기준:** `.understand-anything/templates/style/ko-terms.md`(사용자 확정, 최우선) → `.understand-anything/doc-output/policy-glossary.md`(코드 유래) 순으로 표기를 따른다 — 둘 다 없으면 생략, 용어집은 표기 기준일 뿐 인용 근거가 아니다.

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

자동 분류된 도메인 후보를 **한국어 표**(키/루트수/진입수/파일수/**확신도**)로 보여준다. 쓰기 없음.
이 표는 자동 결과이며 확정 전 사람 검토가 필요하다(사람 게이트).

- **확신도**: 높음(디렉터리 토큰 정합) > 중간(파일명 접두어 분할) > 낮음(폴백). 증거가 약한(낮음) 진입점은 상위 신호 도메인이 하나라도 있으면 **도메인을 만들지 않고 격리**(`_review`)되어 표 아래 별도 보고된다(조용한 누락 금지 — candidates.json `quarantined`).
- **관용 접두어**: 파일명 첫 토큰이 여러 디렉터리 그룹에 반복되면(벤더 접두어 `Egov*`/`Co*` 류) 도메인 키 후보에서 제외하고 보고한다(`conventionPrefixes`).
- **경계가 너무 굵게 잡혔으면 `split`**: 분류기는 네임스페이스 아래 **첫 분기 토큰 하나**만 도메인으로 잡는다(classify.ts 과반 하강). 디렉터리가 3단 이상인 코드에선 도메인 하나가 수백 흐름을 삼킨다 — egov 실측: `uss` 한 도메인 = 484흐름(하위 업무패키지 7개, 그 아래 31개). 이때 `{"op":"split","key":"uss"}` 로 한 단계 내린다(`uss.ion`/`uss.olh`/…). **반복 적용이 설계다** — 여전히 큰 `uss.ion`(262흐름)은 `split uss.ion` 으로 또 내린다. 적정 깊이는 도메인마다 달라 전역 인자로 받지 않는다. 분기가 없거나 계층 디렉터리(`web`/`service`)뿐이면 조용히 통과하지 않고 이유를 던진다.
  - 판단 기준: **도메인당 흐름 20개**(= fill 청크 1개)를 넘으면 split 후보다. 그 아래면 헤더 청크가 도메인 전체를 보므로 쪼갤 이득이 없다.
  - split 은 하위 도메인을 만든다 — 상단도메인이 필요하면 그 위에 §3-B `group` 을 얹는다(11그룹 × 65서브 형태). 도메인이 10개 안팎이면 그건 이미 상단도메인 층이라 group-classify 는 층만 늘린다.

## 3) 확정 (사람 게이트)

```
# 미실행(표 + 안내만, NON-TTY 안전)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> confirm

# 확정 실행(후보를 그대로 수용해 확정 플랜 기록)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> confirm --auto-approve --by <담당자>

# 경계를 고쳐 확정(사람/LLM 보정 연산을 자동 플랜 위에 결정론 적용)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> confirm --auto-approve --by <담당자> --ops <ops.json>
```

자동 확정은 하지 않는다. `--auto-approve --by <담당자>` 가 모두 있을 때만 `domain-plan.confirmed.json` 을 기록한다(없으면 표 + 안내만 출력하고 종료 코드 2). 도메인 `key` 는 불변(skeleton ID 의 닻)이며, 표시명만 개명할 수 있다(AC-31, LLM 제안명은 `renameDomain` 으로 적용).

**보정 연산(ops)**: plan 표를 보고 경계를 고칠 때는 ops JSON 배열을 `--ops` 로 준다. LLM 이 제안서를 쓰고 사람이 확정하는 흐름을 권장하며, ops 파일을 `.spec/map/domain-ops.json` 에 보관하면 재스캔 후에도 같은 결정이 재생된다(결정론 닻).

```json
[
  { "op": "merge", "from": "my", "into": "mypage" },
  { "op": "move", "root": "src/…/FooController.java", "to": "board" },
  { "op": "exclude", "key": "kimtest" },
  { "op": "rename", "key": "cs", "name": "고객센터" },
  { "op": "group", "key": "g:common", "name": "공통", "members": ["com", "comm", "commcode"] },
  { "op": "ungroup", "key": "g:common" },
  { "op": "split", "key": "uss" }
]
```

산출: `.spec/map/domain-plan.confirmed.json` (재실행 결정론의 닻).

### 3-B) 상단도메인 그룹 분류 — group-classify (LLM, DOMAIN_HIERARCHY)

서브도메인(경로 기반 결정론)이 수십 개로 많거나 공통/유틸 계열이 최상위에 병렬할 때,
**업무 대분류(상단도메인)** 층을 얹는다. 경로 규약이 어긋난 SI 코드에서도 의미 기준으로
묶이도록 **묶음 판단은 호스트(LLM)가**, **확정은 사람 게이트가** 맡는다. 그룹은 비파괴
오버레이 — 서브도메인 key·파일 귀속·fill 산출물은 불변이다.

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> group-input
```

1. 위 명령이 서브도메인 요약(key/name/roots/파일 수/대표 파일)을
   `.spec/map/group-input.json` 에 쓴다(전 소스를 읽지 않는다 — 이 요약이 판단 입력의 전부).
2. 호스트가 group-input.json 을 읽고 **업무 의미 기준**으로 그룹 ops 초안을
   `.spec/map/group-ops.suggested.json` 에 쓴다. 규율:
   - 상단도메인 6~15개 목표, 그룹당 서브도메인 **2개 이상**(1개짜리 그룹 남발 금지).
   - 그룹 key 는 `g:` 접두(예: `g:common`), name 은 한국어 대분류명(공통/고객/관리자/주문·결제…).
   - 확신 없는 서브도메인은 **어느 그룹에도 넣지 않는다**(미분류 허용, 지어내기 금지).
   - 각 그룹에 배정 근거 1줄을 함께 보고한다(사람 검토용 — ops 파일에는 넣지 않는다).
   - 비업무 디렉터리(temp/sample/example 류)는 그룹이 아니라 `exclude` 대상이다.
3. 사람 검토 후 확정: `confirm --auto-approve --by <담당자> --ops .spec/map/group-ops.suggested.json`
   (merge/exclude/rename 과 같은 ops 파일에 섞어도 된다 — 순서대로 적용).
4. 재실행 결정론: 확정 후에는 플랜의 `groups` 가 닻이다 — LLM 재호출 없이 재생된다.
   재분류가 필요할 때만 group-input 부터 다시 밟는다.

산출: 확정 플랜 `groups[]` → emit 시 `domain-graph.json` 의 `ktdsMap.groups` 로 투영 →
대시보드 업무 지도가 상단도메인 랜딩 + 서브도메인 좌측 내비로 렌더한다(그룹 없으면 평면 렌더).

> ⚠️ **낡은 플랜 재사용 금지**: 기존 확정 플랜이 있어도 분류기 개선·코드 변경으로 현재 후보와 어긋날 수 있다(`map` 이 "확정 플랜 드리프트" 경고로 표면화). **드리프트가 보고되면 낡은 플랜을 결정론 닻이라며 그대로 쓰지 말고 반드시 confirm 을 재실행해 재확정**한 뒤 map→bundle→fill 을 진행한다 — 낡은 경계로 bundle/fill 을 돌리면 도메인 수십 개 분량의 LLM 작업이 헛돈다.

## 4) 요약 (우선순위 + 교차 도메인)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> map
```

확정 플랜이 있어야 한다(없으면 confirm 안내 후 종료). 도메인별 **온보딩 우선순위 랭킹**("여기부터 보세요", AC-32)과 **교차 도메인 의존 엣지**(AC-33)를 한국어로 보고한다.

- **우선순위(E-b, AC-32)**: `priorityScore = 복잡도*3 + 결합도*2 + 크기*1`(고정 정수 가중치). 정렬은 우선순위 DESC, 동점이면 key ASC. rank 는 1-based.
- **교차 도메인(E-c, AC-33)**: 서로 다른 도메인 파일 사이의 의존 엣지를 도메인 단위로 집계하되, 근거(evidence)는 실제 파일 엣지로 grounded 하게 보존(합성 금지). self-domain 엣지 제외.
- **요약(AC-3)**: 도메인별 흐름수/노드수/우선순위/grounded(모든 멤버 노드가 파일:라인 앵커 보유 시 true, AC-9)/대표 앵커.
- **플랜 드리프트(planDrift)**: 현재 후보와 확정 플랜의 루트 어긋남(addedRoots/removedRoots)을 domain-map.json 에 싣고 CLI 가 ⚠️ 경고한다. 드리프트가 있으면 이 요약·skeleton 은 낡은 경계 기준 — **bundle/fill 진행 전 confirm 재확정 필수**.

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

## 6) 채움 — fill 작성 (인용 의무)

번들과 emit 사이의 LLM 채움 단계. **규모 게이트**로 경로를 고른다:

> **규모 게이트:** bundle 출력의 합계(도메인 수·총 흐름 수)를 본다 — **도메인 > 8 또는 총 흐름 > 60** 이면 아래 **팬아웃 경로(§6-B)** 를 쓴다(인라인 도메인당 채움은 그 규모에서 메인 컨텍스트가 폭발한다 — bundle CLI 가 같은 기준으로 ⚠️ 경고를 출력한다). 그 이하면 인라인 경로(§6-A)로 진행한다.

### 6-A) 인라인 경로 (기본 — 소규모)

**호스트(Claude)가 도메인당 1회** 채움을 수행한다:

1. `.spec/map/bundle/<key>.json` 을 읽는다.
2. 그 안의 소스 슬라이스·구조 신호만 근거로, 도메인/흐름/단계의 `name`·`summary`·`entities`·`businessRules`·`crossDomainInteractions` 을 작성한다.
3. **단계 상세(P2/P4 계층별):** 각 step 의 `layer` 를 보고 `nodeDetailTemplate.byLayer[layer]` 의 섹션들을 그 `promptHint` 지시대로 `steps[].detail[<섹션id>]` 에 채운다. 템플릿은 **계층별 파일**(`templates/node-detail/{api,service,dao,db,other}.md`, 사람 편집 권위·런타임 로드)에서 온다. 기본 시그니처 — api=role+request, service=role+businessLogic, dao=role+persistence, db=role+schema, other(unknown)=role+dataShape. 각 섹션은 step slice 에서 인용. 메서드·호출관계는 채우지 않는다(결정론 — 엔진이 calls 엣지로 보유).
4. **업무 흐름도(`businessFlows[]`, WORK_MAP §5 — 선택):** **단위 업무 프로세스별** 순서도를 `businessFlows: [{ title, nodes[], edges[] }, …]` 로 작성한다(1..N장, 최대 20). **한 도메인에 구별되는 업무 시나리오가 여럿이면 각각 별도 장으로 쪼갠다** — 예: 계정 도메인이면 "로그인" / "회원가입" / "계정 수정"을 한 장에 우겨넣지 말고 3장으로. `title` 은 프로세스 이름(업무 언어, ~20자, 인용 면제). 노드 `kind` 는 `start|end|activity|decision`, `label` 은 **업무 언어**(코드 심볼 금지 — "재고 확인" ○, "checkInventory()" ✕)로 **짧게(~30자)** — 노드 상자가 고정 크기라 긴 라벨은 잘린다. 규칙:
   - `activity`/`decision` 은 `citations` 1개 이상 필수(사실 주장) — **분기(decision)는 코드 근거(if/예외 처리) 또는 businessRules 근거가 있을 때만** 만든다. 근거 없는 분기 창작 금지 — 확신 없으면 순차로 두라.
   - `start`/`end` 는 구조 마커라 인용 면제, **각 장마다** 각각 1개 이상 필수. 노드 id 는 장 안에서만 유일하면 된다.
   - `activity` 가 특정 기능에 대응하면 `flowRef` 에 **이 도메인의** flow id 를 단다(유령/타 도메인 참조는 emit 이 기각). 대시보드가 이 앵커로 업무→코드 드릴다운을 연결한다.
   - `edges` 의 분기 라벨은 `label`("YES"/"NO"/"재고 있음" 등)로. 고아 노드·중복 id·끝점 미실존은 emit 이 **해당 장만 기각**한다(다른 장·도메인 fill 은 유지 — 기각 사유가 rejected 로 보고되니 고쳐서 재emit).
   - 미작성 시 대시보드는 기능 순차 나열 폴백을 그린다 — **억지로 만들지 말 것**(품질 우선). 프로세스가 진짜 1개뿐인 소형 도메인이면 1장이 정답이다.
   - (하위호환) 구형 단수 `businessFlow: { nodes, edges }` 도 여전히 수용되지만 신규 작성은 `businessFlows[]` 를 쓴다. 둘 다 있으면 복수형이 우선.
5. 결과를 `.spec/map/fill/<key>.json` 에 `DomainFill` 스키마로 쓴다.

**계약(반드시 준수):**

- 모든 **사실 주장**(summary/entities/businessRules/crossDomainInteractions/흐름 summary/단계 summary/**단계 detail 섹션**)에 `citations` 1개 이상 필수. 각 인용은 `{ filePath, line, snippet }` — `filePath` 는 프로젝트 루트 상대 경로, `line` 은 1-based, `snippet` 은 **그 라인의 실제 텍스트(8자 이상, 식별자성 토큰 포함)**.
- `domainId`/`flowId`/`stepId` 는 번들에 있는 id 만 사용한다(모르는 ID·다른 도메인 ID 는 emit 단계에서 항목 단위 기각).
- 구조 필드(filePath/lineRange/entryPoint 등)는 채우지 않는다(read-only — emit 이 보존).
- 도메인 표시명(`name`)만 인용 면제(명명이라). 그 외 텍스트는 근거 없으면 쓰지 않는다.
- 채움은 **도메인 단위 멱등**이다 — 실패/누락 도메인의 `fill/<key>.json` 만 다시 쓰면 그 도메인만 재반영된다.

> 채우지 않은 도메인은 emit 에서 **결정론 라벨 폴백**(도메인=key 표제화, 흐름=진입점, 단계=파일명)으로 빈 이름 대신 구조명을 갖는다(하이브리드: 채움 우선, 미채움은 결정론 라벨).

### 6-B) 팬아웃 경로 (대규모 — 도메인 > 8 또는 총 흐름 > 60)

egov 실증 방법론(1,255흐름·104청크 팬아웃, 근거율 100%)의 정식 경로. 핵심 = **인용 생산을 LLM 에서 제거**: fill-prep 이 흐름·단계마다 검증 통과가 보장된 pre-cite(실파일 결정론 추출)를 청크에 동봉하고, 에이전트는 그것을 **verbatim 복사**만 한다. 청크 페이로드는 메인 컨텍스트를 절대 거치지 않는다(에이전트가 각자 디스크에서 읽는다).

1. **모델 게이트** — 공통 모델 질문 규약(understand·screens·policy 채움과 동일 문안): 플랫폼이 대화형 질문(AskUserQuestion 등)을 지원하면 실행 시작 시 한 번 묻는다:
   - **세션 모델 (권장·기본)** — 요약문 품질 최우선, 현재 세션과 동일 모델 → `model: "inherit"`
   - **sonnet** — 품질·비용 균형. egov 1,255흐름 실증: 근거율 100%, 7.5M 토큰/27분 → `model: "sonnet"`
   - **haiku** — 최대 절감. 요약 품질·verbatim 인용 준수 위험이 있으나 감사 재디스패치가 보정 → `model: "haiku"`

   대화형 질문이 불가한 플랫폼이면 묻지 말고 기본값(세션 모델)으로 진행한다. effort 는 `low` 고정을 권장한다(채움은 pre-cite 위 명명·요약이지 열린 분석이 아니다).

2. 청크 준비:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> fill-prep
   ```
   번들을 흐름 20개 단위 자립 청크로 분해해 `.spec/map/fill-prep/<chunkId>.json` + `index.json` 을 쓴다(도메인별 첫 청크 = 헤더 청크 — 그 담당 에이전트가 도메인 요약·엔티티·규칙·업무 흐름도도 쓴다). `--chunk-flows N` 으로 조정 가능. pre-cite 미확보 건수가 보고되면 그대로 사용자에게 전달한다(조용한 누락 금지).

3. 청크 id 목록 추출(경로는 절대 경로):
   ```bash
   node -e "const d=require('<projectRoot 절대경로>/.spec/map/fill-prep/index.json');console.log(JSON.stringify(d.chunks.map(c=>c.chunkId)))"
   ```

4. `[fill] 팬아웃 — 청크 <N>개 (Workflow, background)...` 보고 후 **Workflow 도구** 호출:
   - `scriptPath`: `${CLAUDE_PLUGIN_ROOT}/scripts/map-fill-fanout.workflow.js`
   - `args`: `{ "projectRoot": "<절대경로>", "cliScript": "${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs 절대경로", "chunkIds": <3의 배열>, "model": "<모델 게이트 결과>", "effort": "low", "headerEffort": "medium", "language": "한국어" }`
   - `headerEffort` 는 헤더 청크(`<key>-000`) 전용 — 그 에이전트만 도메인 전 흐름 명부(`header.flowIndex`)를 훑어 요약·엔티티·규칙 + 업무 흐름도 최대 20장을 쓴다. 도메인당 1명뿐이라 비용 영향은 작고, `low` 로 두면 484흐름 도메인이 흐름도 1장으로 돌아온다(egov 실측). 기본값 `medium` 을 그대로 쓰면 된다.

   워크플로는 청크당 에이전트 1명을 팬아웃(각자 자기 청크를 디스크에서 읽어 `fill-frag/<chunkId>.json` 작성)하고, 결정론 감사(`fill-audit`: 존재 ∧ 스키마 ∧ id 정합 ∧ flow/step 커버리지)로 미완결 청크를 최대 2회 재디스패치한다.

   **Workflow 도구가 없는 플랫폼(예: opencode)?** 청크를 인라인으로 처리한다 — 각 `fill-prep/<chunkId>.json` 을 직접 읽어 §6-A 계약 + verbatim pre-cite 규칙대로 `fill-frag/<chunkId>.json` 을 작성(도메인당이 아니라 **청크당**이라 컨텍스트가 유계다). 병렬 에이전트 디스패치가 가능하면 5개씩 동시 처리한다.

5. 워크플로가 `{ totalChunks, filled, skippedByGuard, styleRevised, failed }` 를 반환하면:
   - `failed[]` 는 전부 사용자에게 보고한다(침묵 금지) — 병합은 있는 청크만으로 진행된다(누락 흐름은 emit 결정론 폴백).
   - `skippedByGuard > 0` 은 정보성: 이전 중단 실행이 완료한 청크의 재사용(멱등 재개)이다.
   - `styleRevised` 는 **문체 검수 라운드**(완결성 감사 후 자동 수행)가 재작성한 산문 필드 수다 — 검수는 문체 규약 위반 문장만 고치고 id·인용·신뢰도·구조는 건드리지 않는다(끄려면 args 에 `stylePass: false`).
   - 중단됐으면 그냥 재실행 — `fill-audit` 디스크 가드가 완료 청크를 건너뛴다.

6. 병합 → emit:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-map.mjs <projectRoot> fill-merge
   ```
   조각을 도메인별 `fill/<key>.json`(DomainFill)으로 결정론 병합한다(id dedupe·청크 선언 밖 id 버림 보고·헤더 미완결 도메인은 pending 유지). 병합 시 **표기 통일 렉시콘**(`templates/style/ko-lexicon.md`, 프로젝트 override 우선)이 산문 필드에 결정론 치환으로 자동 적용된다(인용 불변 — 치환 수는 🔤 로 보고). 병합 보고의 ⚠️(부분 병합/병합 불가/버림)를 사용자에게 전달한 뒤 §7 emit 으로 계속한다.

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
전체 순서: scan → plan → confirm → map → bundle → fill(§6 규모 게이트: 인라인 또는 fill-prep→Workflow 팬아웃→fill-merge) → emit.
