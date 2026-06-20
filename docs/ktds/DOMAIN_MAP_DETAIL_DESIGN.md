# 도메인 지도 — 상세 패널(근거·검증) 재설계 설계서

> 상태: **설계 확정, 구현 대기.** 작성: 도메인 분류·LLM 채움(S8)·인용검증(S9) 구현 직후.
> 목적: 채움/검증으로 **생산한** 근거(file:line 인용)·검증 상태를 도메인 지도 화면에 **노출**한다.

## 1. 배경 / 문제
- 파이프라인은 도메인별 `ktdsClaims`(요약/엔티티/업무규칙/교차도메인 + 인용 `{filePath,line,snippet}`)와
  `verify-report`(citation `status`, claim `verdict`=GROUNDED/NEEDS_REVIEW, `groundedPct`)를 생산한다.
- 그러나 대시보드는 **인용·검증을 단 한 곳도 읽지 않는다**. NodeInfo가 엔티티/업무규칙 *텍스트*만 표시.
- 결과: "근거 기반(file:line grounded)"이라는 핵심 가치가 화면에서 **비가시**.

## 2. 확정 결정 (5)
1. **초점**: 도메인 상세 패널 재설계 — 요약·엔티티·업무규칙·교차도메인을 각 항목의 **인용 칩 + ✓/⚠ 배지 + 근거율**과 함께.
2. **인용 UX**: 인용 칩 → 클릭 시 **코드뷰어가 file:line으로 점프**(기존 하단 슬라이드 코드뷰어 재사용).
3. **패널 위치**: **카드 인라인 확장**. 도메인 카드 클릭 → 그 자리에서 펼쳐져 상세 표시 → `기능 보기` 버튼으로 FlowListView(화면 2) 이동. 재클릭 시 접힘. 그리드 맥락 유지.
4. **카드는 순수 도메인 개요**: 요약/엔티티/업무규칙/교차도메인 + 근거율만. **기능(흐름)은 개수만** 표시("기능 N개"), 기능 이름·기능별 인용은 카드에 두지 않는다(화면 2/3 소관). 레벨 분리는 §4.0 참조.
5. **용어: "흐름" → "기능"** (사용자 표시 라벨만). 각 흐름 = 진입점 1개가 구현하는 사용자 기능이며 per-기능 상세(화면2/3 + 근거)는 인터랙티브 기능 명세에 해당 → P4 `03_feature-spec`과 용어 통일.
   - **표시 라벨**(locales `흐름`, "흐름 N개", 화면 제목 등): "기능"으로 변경.
   - **내부 모델/코드**(`flow:` id, 노드 type `"flow"`, `contains_flow` 엣지, `FlowListView`/`FlowSpineView`/`flowModel`): **"flow" 유지**(스키마·엔진·블루프린트 동기화 전반을 건드리는 대규모 리팩터 회피). "표시는 기능, 내부는 flow".

## 3. 데이터 보강 (백엔드 — 작음)
근거(ktdsClaims)와 검증(verify-report)이 두 파일로 분리되어 있다. **emit이 노드에 합쳐 임베드**해 대시보드가
`domain-graph.json` 하나만 소비하게 한다(verify-report 별도 fetch는 와이어 증가 → 비채택).

- `emitFilledDomainGraph`/`fill-pipeline`에서 verify 결과를 노드에 주입:
  - 각 `ktdsClaims[].citations[]`에 `status`(ok/path-escape/no-file/line-out-of-range/text-mismatch/trivial-snippet)
  - 각 `ktdsClaims[]`에 `verdict`(GROUNDED/NEEDS_REVIEW)
  - 도메인 `domainMeta.groundedPct`(number), `domainMeta.groundedCount`/`reviewCount`
- 결정론 유지(정렬·stable JSON). `[확인 필요]` 텍스트 마커는 현행 유지(중복 표기 OK — UI는 verdict로 ⚠ 처리).
- 미채움 도메인: ktdsClaims 없음 → 패널은 "채움 전(결정론 라벨)" 안내.

### 4.0 레벨 분리 (핵심 원칙)
데이터는 도메인/기능(flow)/단계(step) 3레벨이고, **카드는 도메인 레벨만** 보여준다.

| 레벨 | 채움 필드 | 개수 특성 | 표시 위치 |
|---|---|---|---|
| 도메인 | summary, entities[], businessRules[], crossDomain[] | 도메인당 1묶음(기능 수와 무관, 채움이 큐레이션) | **카드** |
| 기능(flow) | flow.name, flow.summary + 인용 | 많음(상품추가/삭제/즐겨찾기…) | 화면 2 ✅ (구현·커밋) |
| 단계(step) | step.name, step.summary + 인용 | 더 많음 | 화면 3 ✅ (구현·커밋) |

→ **기능이 N개여도 카드는 기능을 나열하지 않는다**(개수만). 기능별 상세·기능별 코드 인용은 화면 2/3.

## 4. UI 설계 — 카드 인라인 확장 (순수 도메인 개요)
```
┌ 장바구니                      근거율 83% ███████░  ✓5 ⚠1 ┐   ← 헤더(접힘 시도 동일)
│ 기능 5개 · 노드 35개                                          │   ← 기능은 '개수만'(이름·인용 없음)
│ 요약   사용자 장바구니 담기/조회/수량변경      ✓ [Cart.java:32]        │
│ 엔티티(3)  · Cart 직렬화 도메인 객체           ✓ [Cart.java:18]        │
│ 업무규칙(2)· 세션 보관                         ✓ [Cart.java:18]        │
│           · 무료배송 5만원                     ⚠ 근거 없음(확인 필요)   │  ← NEEDS_REVIEW 강조
│ 교차도메인(1)· 주문 체크아웃 시 참조           ✓ [CartActionBean:45]  │
│                                              [ 기능 보기 → ]          │
└──────────────────────────────────────────────────────┘
```
- 카드 헤더: 이름 + 근거율 바 + GROUNDED/확인필요 카운트(접힘 상태에서도 신뢰도 한눈에).
- **기능/노드는 개수만**("기능 N개 · 노드 M개") — 기능 이름 칩·기능별 인용은 카드에 두지 않는다(§4.0).
- 확장부 항목군: 요약/엔티티/업무규칙/교차도메인 각각 텍스트 + 인용 칩 + ✓/⚠ 배지.
- **긴 목록(엔티티/업무규칙) 처리**: 기본 top-N(예: 5) + "N개 더보기"(확장부 내부 스크롤), **⚠ NEEDS_REVIEW 항목 상단 고정**(신뢰도 우선). 한 항목에 인용 다수면 대표 인용 1개 + `+N` 칩(펼치면 나머지).
- `NEEDS_REVIEW`: ⚠ + 좌측 보더/색 강조, 인용 없음 명시.
- `기능 보기` 버튼 → `navigateToDomain(card.id)`(화면 2 진입).
- 한 번에 하나만 확장(아코디언) — 그리드 레이아웃 점프 최소화.

## 5. 인용 → 코드뷰어 (뷰어 확장 필요)
현재 `openCodeViewer(nodeId)`는 **노드 ID** 기준 + `node.lineRange` 하이라이트. 인용은 임의 `(filePath, line)`.
- 신규 store 액션 **`openCodeViewerAt(filePath, line)`**: 그래프 유래 path-allowlist에 `filePath`가 있으면
  콘텐츠 fetch + **단일 라인** 하이라이트/스크롤. 없으면 칩 비활성(+툴팁 "소스 미포함").
- `CodeViewer.tsx`: `(filePath, line)` 직접 입력 경로 + 단일 라인 하이라이트 추가(기존 lineRange 경로와 공존).
- 인용 파일은 대개 step `filePath`라 allowlist에 포함됨(엣지 케이스만 비활성).

## 6. 변경 파일
| 영역 | 파일 | 변경 |
|---|---|---|
| 백엔드 | `emit.ts`, `fill-pipeline.ts` | verify 결과를 노드 ktdsClaims/domainMeta에 임베드 (+테스트) |
| store | `store.ts` | `openCodeViewerAt(filePath,line)` + codeViewer 상태에 (filePath,line) |
| 뷰어 | `components/CodeViewer.tsx` | filePath/line 직접 + 단일 라인 하이라이트 |
| 신규 | `components/DomainCardDetail.tsx` | 확장 상세부(항목군 렌더) |
| 신규 | `components/CitationChip.tsx` | `[file:line]` 칩 + status 배지 + 클릭 점프 |
| 신규 | `components/GroundedBar.tsx` | 근거율 바 + 카운트 |
| 데이터 | `utils/domainData.ts` | claims/verdict/groundedPct 파싱 헬퍼 + DomainCard 확장 |
| 화면 | `components/DomainMapView.tsx` | 카드 클릭=확장 토글, `기능 보기`=navigate, 기능 개수만 표시 |
| i18n | `locales/*.ts` | 근거율/확인필요/인용/소스미포함/기능보기 라벨 + **표시 라벨 "흐름"→"기능" 일괄 변경**(statFlows·flowCount·화면제목 등; 내부 flow id/타입은 불변) |

## 7. 구현 단계 + 검증 게이트
1. **백엔드 임베드**: emit이 status/verdict/groundedPct를 노드에 주입. 게이트: legacy-core 테스트 그린 + jpetstore emit 후 노드에 status 존재 확인.
2. **코드뷰어 점프**: `openCodeViewerAt` + 단일 라인. 게이트: dashboard build + 헤드리스로 칩 클릭→뷰어 라인 열림.
3. **CitationChip / GroundedBar** 컴포넌트 + 단위 테스트.
4. **DomainCardDetail + DomainMapView 통합**(아코디언). 게이트: dashboard 테스트 그린.
5. **locales + 헤드리스 시각 검증**: 채운 도메인(인용·배지) + 미채움 도메인(채움 전 안내) 둘 다.
- 전역: 코어 불변식 0, 결정론(byte-diff 0), 기존 테스트 무회귀.

## 8. 리스크 / 오픈 이슈
- **인용 파일이 소스 allowlist에 없을 때**: 칩 비활성 + 안내(조용한 실패 금지).
- **미채움 도메인**(결정론 라벨만): 패널은 "채움 전" 안내 + `bundle→emit` 유도.
- **모바일**: 인라인 확장 그리드 리플로우 — 한 번에 하나 확장으로 완화, 코드뷰어는 전체화면 모달 경로.
- **결정론**: groundedPct는 정수 1자리(verify.ts pct와 동일 규칙) 재사용.
- **용어 "흐름→기능"은 표시 라벨만**: 내부 모델(`flow:` id, 노드 type `"flow"`, `contains_flow`, `FlowListView`/`FlowSpineView`/`flowModel`)은 불변 — 스키마·엔진·블루프린트 동기화 전반을 건드리는 대규모 리팩터 회피("표시는 기능, 내부는 flow"). 내부 id까지 통일은 별도 큰 작업으로 분리.
- 화면 2(기능 목록)·화면 3(스파인) 근거·검증 노출은 본 설계의 1차 범위 밖이었으나 후속으로 **구현·커밋 완료**(§9.3) — 우선순위는 도메인 카드(화면 1)였다.

---

## 9. 구현 상태 / 트레이드오프 (세션 핸드오프)

> 화면1 도메인 카드(근거·검증) **5단계 전부 구현·검증·커밋 완료.** 화면2/3 근거·검증 노출도
> **후속으로 구현·커밋 완료**(§9.3). 본 설계의 모든 화면 작업이 완결됨.

### 9.1 완료 커밋
| 단계 | 커밋 | 내용 |
|---|---|---|
| 1 | `4d3b891` | 백엔드 emit `embedVerification` — verify(status/verdict/groundedPct)를 노드 domainMeta.ktdsClaims 에 임베드(단일소스) |
| 2 | `ffb2754` | store `openCodeViewerAt(filePath,line)` + CodeViewer 단일라인 하이라이트·scrollIntoView |
| 3 | `4133248` | `CitationChip`/`GroundedBar` 컴포넌트 + grounding i18n(6종) |
| 4 | `7e6a9bc` | `DomainCardDetail` + DomainMapView 아코디언 + App.tsx 도메인페이지 코드뷰어 마운트 |
| 5 | `050e706` | 표시 라벨 "흐름"→"기능" 일괄(6종 locale + emit 결정론 라벨) |

검증 상태: dashboard build ✓ · dashboard 테스트 110 · legacy-core 511 · 코어불변식 0 ·
헤드리스 E2E(카드 확장→근거율·인용칩·⚠·코드뷰어 점프, 잔존 "흐름" 0).

### 9.2 핵심 트레이드오프 (왜 이렇게 했나)
- **하이브리드 채움**(결정론 라벨 + LLM fill): 항상 보이는 얕은 라벨 vs 풍부하지만 host(Claude)
  오케스트레이션 의존·환각 가능. 환각은 S9 인용검증→NEEDS_REVIEW 강등으로 완화(삭제 아님).
- **단일소스 임베드**(ktdsClaims를 domain-graph 노드에) vs verify-report 별도 fetch: 대시보드가
  한 파일만 읽음(단순) ↔ domain-graph.json 비대 + emit↔verify 결합. → 임베드 채택.
- **카드=순수 도메인 개요, 기능은 개수만**: 오버플로 없음·한눈 신뢰도 ↔ 기능별 상세/인용은
  카드에 없음(화면2로 위임). 도메인 레벨 주장(요약/엔티티/규칙/교차)만 카드.
- **"표시는 기능, 내부는 flow"**: 스키마·엔진·블루프린트 동기화 대규모 리팩터 회피 ↔ 표시어
  (기능)와 내부 id(flow:*) 용어 divergence. 엣지타입(contains_flow/flow_step) 라벨은 유지.
- **인용 칩 항상 클릭 가능**(status ok 아니어도): 사용자가 주장 위치 직접 확인 ↔ 불일치 라인으로
  점프할 수 있음(amber+툴팁으로 표시). allowlist 미포함은 서버가 "source unavailable" graceful.
- **컴포넌트 렌더 단위테스트 생략**: testing-library/jsdom 미설치(무거운 dep 회피) ↔ 컴포넌트
  렌더 회귀는 store 단위테스트 + 헤드리스(playwright)로만 커버. 도입 시 CitationChip/GroundedBar/
  DomainCardDetail 렌더 테스트 추가 권장.

### 9.3 화면2(기능 목록)·화면3(스파인) 근거·검증 노출 — ✅ 완료·커밋
- **커밋 `0d25ba1`**: flow/step 노드용 claim 파서(`parseFlowStepClaim`, domainData) + 공유
  `VerdictBadge`(✓/⚠) + 화면2 FlowListView 행/센터헤더 근거(VerdictBadge+근거라벨+CitationChip) +
  화면3 FlowSpineView 노드 클릭 사이드바 step 상세 인용 + grounding i18n(7종). 백엔드 추가 0.
- **데이터 소스**: `embedVerification`(emit.ts)이 flow/step 노드에도 ktdsClaims(자기 ref 검증항목)를
  임베드 — 화면2는 flow 노드, 화면3는 step 노드의 `domainMeta.ktdsClaims`를 읽음(단일 소스).
- **재사용 자산**: `CitationChip`·`GroundedBar`·store `openCodeViewerAt`·App 도메인페이지 코드뷰어
  슬라이드업 + `parseDomainClaims` 동형 파서 패턴.
- **주의(현행 유지)**: 블루프린트 동기화 때 `KtdsNodeDetail`(공유 상세 패널) 제거됨 → 화면2/3 상세는
  각 컴포넌트 내부 렌더. NodeInfo(사이드바)는 도메인 풀페이지에서 숨김.
- **후속 폴리시(2026-06-20 세션)**: 화면2 행 레이아웃(기능명 위/시그니처 아래, `d2171ca`) ·
  http 흐름 path 를 핸들러 시그니처 대신 라우트 URL 로 표시(`2e35389`) · 포워딩 전용 핸들러에
  가짜 step 붙던 엔진 버그 수정(`5408c5d`, legacy-core skeleton 메서드 트레이스 권위화).
- **검증**: dashboard 129 · legacy-core 539 · 코어불변식 ∅ · jpetstore-6 실측(재생성)·헤드리스.

### 9.4 외부 참고 (codegraph OSS 평가 → §10 별도 문서/메모)

---

## 10. codegraph OSS 적용성 평가 (github.com/colbymchenry/codegraph)

> codegraph = **AI 에이전트용** 사전 인덱스 코드 지식그래프(SQLite+FTS5, tree-sitter 20+ 언어,
> 17+ 프레임워크 라우트 인식, 파일워치 증분, MCP 도구 4종). **LLM 미사용**(에이전트를 보조).
> 우리 = **사람용** 도메인/기능 추상화 + LLM 채움 + file:line 인용검증 + 대시보드/문서. 레이어가 다름.

### 적용 가능 (우선순위 순)
1. **[높음] 그래프를 MCP 도구로 노출** — codegraph 핵심 가치(에이전트가 파일 스캔 대신 그래프 질의 →
   토큰 ~16%↓·툴콜 ~58%↓). 우리 knowledge-graph/domain-graph/impact 를 `explore/node/search/callers`
   류 MCP 도구로 열면 **에이전트向 신규 채널**(현재는 사람向 대시보드/문서뿐). 우리 강점(도메인/기능
   추상화·인용)을 에이전트가 질의 가능. → 후속 큰 기능 후보.
2. **[높음] 프레임워크/언어 라우트 추출 확대** — codegraph 17+ 프레임워크(Django/Express/Rails/Gin/
   Axum…)·20+ 언어 패턴. 우리 `routes/{stripes,nextjs}.ts` 패턴을 동형 확장하면 로드맵 "비-Java
   결정론 엔진"에 직접 기여. 라우트 DSL/데코레이터 인식 기법 참고.
3. **[중] SQLite+FTS5 저장/검색** — 대형 레포에서 JSON 재파싱 대비 빠른 심볼 검색·impact 질의.
   단 우리 결정론(byte-diff=0, stable JSON) 모델과 상충 → 캐시/인덱스 레이어로만(소스는 JSON 유지).
4. **[중] 파일워치 자동 증분** — 우리 fingerprint 증분(P6 보완 D)은 on-demand. native FS 이벤트
   디바운스 자동 재인덱싱은 라이브 UX 향상(에이전트/대시보드 자동 최신화).
5. **[중] 엣지 provenance 태깅 입도** — codegraph는 엣지마다 출처(direct/heuristic: swift-objc-bridge
   등) 태그. 우리 confidence(CONFIRMED/INFERRED/…)·unresolved 보고와 철학 일치 → 엣지 단위 출처
   태그 입도 보강 참고.

### 이미 보유 / 비채택
- **impact radius(전이 의존)**: 우리 impact 엔진(P5: reach/api/persistence/flow)이 이미 보유 +
  인용검증까지 → 더 정밀. 차용 불필요.
- **LLM 미사용 철학**: codegraph는 주장 생성을 안 하므로 검증 불요. 우리는 **LLM 의미 채움 + S9
  인용검증**이 차별점 → 유지(비채택).
- **번들 런타임/zero-dep 배포**: 우리 vendor-deps.sh(자급 node_modules)로 유사 목표 해결됨.

### 결론
codegraph와 우리는 **경쟁이 아니라 보완 레이어**(심볼·에이전트 vs 도메인·사람). 가장 가치 있는
차용은 **①MCP 에이전트 채널 + ②프레임워크/언어 추출 확대**. ③~⑤는 성능/UX 점진 개선 후보.

### 10.1 후속 보류 — 변경 영향도(impact)에 codegraph 차용 (실제 레포 검증 2026-06-19)
실 레포 검증 결과 §10 기술 사실 일치(MIT · SQLite+FTS5 · tree-sitter · MCP 4도구
explore/node/search/callers + impact/callees/files/status · LLM 미사용 · 16%↓/툴콜 58%↓ ·
native 파일워치). **impact 한정 판단:**
- **현재(Java/JVM-웹 레거시) = 비채택.** ⓐ codegraph 효율 레버는 "에이전트 grep/read 루프"를
  대체하는 것인데 우리 impact 는 결정론 엔진(edges.json BFS, 재스캔 0) → 줄일 에이전트 비용 없음.
  ⓑ codegraph `impact` = 범용 심볼 전이 ≈ 우리 `reach.ts` 의 부분집합. 우리는 4렌즈(reach/api/
  persistence/flow)+인용검증+신뢰도등급+생성예측까지 = 상위 분석. ⓒ Java 엣지 정밀도 우위:
  우리 엣지 `injection`/`ctor-param`(Spring DI)·`mapper-xml`(MyBatis)·servlet/Stripes/JSP 라우트는
  codegraph 범용 콜그래프가 안 만듦. ⓓ codegraph는 mutable SQLite+파일워치 ↔ 우리 byte-diff=0 결정론 충돌.
- **트리거: 폴리글랏 확장(Vue/React/Python/FastAPI 추가 예정)** → 그때 **하이브리드 재검토.**
  레이어 분리: ①전이 reach 그래프(BFS 백본)는 codegraph 엣지를 edges.json 포맷으로 **스냅샷**해
  입력 차용(JS/TS/Python 콜그래프 0빌드 회피) — codegraph가 React Router/Vue/Nuxt/FastAPI `@app.get`
  이미 커버. ②의미 렌즈(api 라우트·persistence/ORM·flow)는 우리가 소유 — `routes/{spring,stripes}.ts`
  패턴을 `routes/{fastapi,react-router,vue}.ts` + ORM 엣지로 확장(codegraph는 기법 참조만).
  통째 대체 아님, impact 엔진 유지.
- **도입 전 스파이크 1건(유일 리스크): 결정론** — 같은 commit에서 codegraph 인덱싱→정렬 export 가
  byte-diff=0 재현되는지(깨끗한 체크아웃 인덱싱이면 가능성 높지만 freshness 지향이라 검증 필수).
