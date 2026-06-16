# ADR-006: 대시보드 교차계층 흐름 뷰 — 도메인 모드 독립 페이지화 (도메인 지도 → 흐름 목록 → 메인 스파인)

- 상태: **Accepted** — deep-interview(요구 결정화, 모호도 100%→11%) → omc-plan 합의(Planner/Architect/Critic 2회 반복) → 구현 + 헤드리스 스크린샷 검증 + 사용자 실사용 피드백 반영(다수 라운드). 작성·구현 2026-06-15~16. 미게시(피처 브랜치 `feat/cross-layer-flow-view`).
- 결정 범위: **understand-anything 대시보드**(ktds 소유 — ADR-003 분기 정책: merge 시 ours·선별 cherry-pick). 분석 파이프라인·엔진 무수정.
- 관련: ADR-001(`/understand-map` — 도메인/흐름/step 노드·`contains_flow`/`flow_step` 엣지 원천), ADR-002(영향도 — 오버레이 2채널·도메인 뷰), ADR-004(위키 "문서" 뷰 토글 패턴 — 본 ADR의 헤더 탭 통합 선례), deep-interview 스펙 `di-codeatlas-001`.

---

## 1. 배경 (Context)

### 1.1 통증 — "흐름을 한 번에" 못 본다

레거시 인수 개발자(1순위 사용자)가 U-A 구조 그래프(코드 탭)를 볼 때, 노드가 **계층(Layer)별로 묶여** 배치된다. 한 기능 흐름이 API→Service→DAO→DB 계층을 가로지를 때, 교차계층 연결이 `PortalNode`(계층 경계의 진입/진출 stub)로 끊겨 **각 계층을 따로 봐야 한다**. 즉 "이 진입점이 어디까지 어떻게 흐르나"를 한 화면에 추적할 수 없다. deep-interview(`di-codeatlas-001`)가 이 통증의 정체를 규명: 그래프가 나빠서가 아니라 **계층 기반 레이아웃이 교차연결을 쪼개기 때문**.

### 1.2 데이터 현실 (검증됨 — 추정 아님)

- `GraphNode`에 **layer 필드 없음**. layer 소속은 `Layer.nodeIds[]`로만 존재하고 도메인맵 emit은 `layers: []`. → step 노드는 계층 태그를 안 들고 다닌다.
- 흐름 내 순서 = `flow_step` 엣지 `weight`(단조증가 계약, `z.number().min(0).max(1)`). 기존 `DomainGraphView`의 `Math.round(weight*10)`은 11버킷으로 뭉개는 **잠재 버그** — 새 코드는 raw weight + 안정 id 정렬.
- step 노드에 per-node 호출 엣지·`branches[]` 없음. 흐름의 시퀀스는 `flow_step` 순서가 전부.
- `domain-graph.json` 픽스처가 리포에 없었음 → 테스트/검증 차단 → 픽스처 선행 제작이 전제.

## 2. 결정 (Decision)

### D1 — 도메인 모드 = 프로토타입 3화면 독립 전체화면

도메인 탭은 기존 React Flow `DomainGraphView`를 **대체**하고, 사용자 승인 프로토타입(`prototypes/flow-spine-prototype.html`)의 3화면으로 구성한다:

1. **도메인 지도 랜딩**(`DomainMapView`) — "열자마자 여기부터" 조망 진입점. 랜딩 헤더 + stats bar + 도메인 카드 그리드(아이콘=도메인명 키워드→이모지 매핑, 결정론 폴백).
2. **흐름 목록**(`FlowListView`) — 마스터-디테일. entryType별 그룹 + 흐름 행(메서드 배지/경로/설명/step 수) + 흐름 선택 시 하단 **인라인 스파인** + "전체화면".
3. **교차계층 스파인**(`FlowSpineView`) — 진입점 1개의 백엔드 호출 체인을 수평 레인(API→Service→DAO→DB(+Other))으로 **연속 관통**, 포털 없음. 상단 topbar(뒤로+메서드+경로+설명) + 우측 사이드바(선택 흐름 + 노드 상세).

### D2 — 레이아웃: JS 직접 좌표(A2), ELK 미사용

스파인은 의미상 **고정 4(+1)열 컬럼 핀**이라 ELK의 위상 기반 ranking과 충돌한다. 프로토타입 `renderSpineLayout`을 순수 함수 `computeSpineLayout(steps)`로 포팅(컬럼 x = 계층 인덱스, y = 컬럼 내 누적). 동기·단위테스트 가능·초기 페인트 저렴. ELK는 v2에서 임의 호출 엣지 자동 라우팅이 필요할 때의 폴백으로 문서화(미소비).

### D3 — `deriveLayer` 휴리스틱 (load-bearing, 엔진 미emit 보완)

엔진이 layer를 안 내보내므로 **net-new** 분류기를 작성: `className → filePath/relPath → name` 우선순위로 `api|service|dao|db|unknown` 매핑(`*Controller/*Rest`→api, `*Service`→service, `*Mapper/*Dao/*Repository`→dao, UPPER_SNAKE/.sql/table→db, facade/manager/handler/Job→unknown). 이는 스파인 x축 전체를 좌우하므로(틀린 계층=틀린 컬럼) **unknown ≤15% 수치 게이트**를 테스트 어설션으로 둔다. `classify.ts`는 skip-set이지 분류기가 아님 — 어휘 영감만 차용.

### D4 — 통합 헤더 + 탭, 도메인은 풀블리드

헤더에 `[구조 · 도메인 · 문서]` 탭 + `[Diff · 영향도]`를 통합(ADR-004 "문서" 토글 패턴 확장). 도메인 탭일 때 U-A 크롬(우측 사이드바·SearchBar·코드뷰어·범례·DiffToggle·FilterPanel) 전부 숨기고 풀페이지 프로토타입을 렌더, 헤더엔 브레드크럼(도메인 지도 › 도메인 › 흐름). **구조/문서/knowledge 탭은 기존 동작 불변**. Diff/영향도는 도메인 페이지 v1에서 제외.

### D5 — v1 범위

백엔드 흐름만(검증 가능한 Spring 라우트~MyBatis/JPA 호출 체인). **곁가지 접기(branch chips)는 v2** — 엔진이 per-step branch 데이터를 안 내보내므로 v1에서 구현 시 데이터 날조(P2 위반). 프론트(React/Vue) 흐름·불확실 구간 v2. 기존 `domain-graph.json`만 사용, 엔진 재설계 없음.

## 3. 결과 (Consequences)

### 얻는 것
- 레거시 인수 개발자가 도메인 지도로 전체 그림을 잡고, 한 흐름의 교차계층 경로를 **한 화면 연속**으로 추적(통증 직접 해소).
- 엔진/파이프라인 무수정 — 기존 산출물(`domain-graph.json`) 재활용. 구조/문서 뷰 회귀 없음.

### 감수/리스크
- **R1(HIGH)**: `deriveLayer`가 휴리스틱(엔진 ground truth 없음). 완화: 엔진 토큰 어휘 재사용 + 가시적 `unknown` 레인 + ≤15% 게이트 + 단위테스트. v2 경계 = 엔진이 per-step `role`/`layer` emit.
- **R2**: 곁가지·per-step 호출 데이터 부재 → v1은 선형 스파인만(곁가지 접기 v2로 명시 컷, AC 날조 회피).
- **R3**: 픽스처 realism — `public/domain-graph.json`(합성 Spring 전자상거래)이 unknown 경로·100스텝 규모·0스텝 에러상태를 실제로 운동시켜야 함.

## 4. 구현 (파일)

신규: `src/components/{DomainMapView,FlowListView,FlowSpineView,flowSpineLayout}.tsx`, `src/utils/{flowLayer,domainData}.ts`, `public/domain-graph.json`(픽스처) + 생성기 `scripts/gen-domain-graph.mjs`, 테스트 `flowLayer.test.ts`/`flowSpineLayout.test.ts`.
수정: `src/App.tsx`(헤더 탭 통합 + 도메인 풀페이지 분기 + Escape 텔레스코핑), `src/store.ts`(`activeFlowId`/`selectedFlowId`/`navigateToFlow`/`clearActiveFlow` + stale-id 가드 + 도메인 그래프 로드 시 도메인 랜딩), `src/components/{FlowNode,MobileLayout}.tsx`, `src/index.css`(레인 토큰 `--color-layer-*` + 스파인 노드 호버), `src/locales/*.ts`(`flowView`/`domainMap`/`flowList` × 6 로케일, `typeof en` parity).

### 검증
- 단위테스트(Vitest): `deriveLayer` 버킷 + unknown ≤15% 게이트, `computeSpineLayout` 좌표 불변, `flow_step` weight 단조-distinct 정렬(JSON 라운드트립). 전체 87 통과.
- `tsc -b` 0 에러, `build` 성공, `eslint`(변경 파일) clean.
- 헤드리스(Playwright) 스크린샷: 도메인 지도 랜딩·흐름 목록·인라인/전체화면 스파인·우측 사이드바(선택 흐름+노드 상세)·전체화면 topbar·전체화면↔흐름목록 라운드트립 선택 보존.

## 5. 후속 (v2 / Open)

- 곁가지 접기(점진적 공개) — 엔진 per-step `role`/`layer`/`calls` emit 후.
- 프론트엔드(React/Vue) 흐름.
- Diff/영향도 오버레이의 도메인 페이지 투영(ADR-002/003 채널 재사용).
- 라이트 테마용 레인 색 튜닝(현재 `:root` 상속).
- 전체화면 전환 애니메이션 — 현재 `fadeSlideIn`(프로토타입 `.screen.active` 전환과 동치); 인라인→전체 모핑은 미구현.
