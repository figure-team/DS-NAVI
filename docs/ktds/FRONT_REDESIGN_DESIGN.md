# U-A 대시보드 프론트 전면 재구축 설계 (FRONT_REDESIGN)

> 워크트리: `front` / 브랜치: worktree-front (demo/jpetstore-6 기반)
> 상태: **P0 승인 완료(2026-07-02) → P1 구현 완료 — 사용자 확인 대기**
> 결정사항(2026-07-02 확정): 프론트 전면 재구축 · react-router 경로 라우팅 · IA 신설계 · **좌측 NavRail · 홈 신설 · 모바일 반응형 통합 · 라이트 테마 + KT 레드**(레퍼런스: KT DS **DS-APM** 제품 화면, 팔레트 추출 완료 — §6)
> 시안: `docs/ktds/front-redesign/mockup-shell-home.html` (+.png)

---

## 1. 현행 진단 (요약)

| 항목 | 현행 | 문제 |
|---|---|---|
| 라우팅 | 없음. `viewMode`(Zustand) 하나로 6개 뷰 전환 | 탭별 URL 없음 → 새로고침 시 초기화, 딥링크·뒤로가기 불가 |
| 셸 | `App.tsx` 995줄 모놀리스 | 탭 버튼 하드코딩, `!isDomainPage && !isDocsPage && !isRtmPage` 식 숨김 조건 산재 |
| 상태 | `store.ts` ~1,000줄 단일 스토어 | 네비게이션 상태(viewMode/activeDomainId/activeFlowId/selectedNodeId)와 데이터·UI 상태 혼재 |
| 토큰 | dev 서버 기동 시 일회성 토큰 → `?token=` → sessionStorage 저장 후 URL에서 제거 | 방식 자체는 유지 가능. URL이 비어 있으므로 라우팅 도입에 장애물 없음 |
| 서버 | `vite.config.ts` 내장 미들웨어(~1,400줄, 엔드포인트 25개) | **이번 범위에서 제외** — 프론트는 API 클라이언트로 감싸기만 한다 |
| fetch | 각 컴포넌트에서 `?token=` 수동 첨부 | 중앙 클라이언트 부재 |
| 모바일 | `MobileLayout` 별도 컴포넌트 트리 | 라우팅 도입 시 통합 필요 |

---

## 2. 사용자 여정과 IA

### 페르소나·여정 (SI/APM 컨텍스트)

1. **이해(Understand)** — 분석가/신규 투입 개발자: 프로젝트 개요 → 도메인 지도 → 기능 흐름 → 코드 구조 → 소스 확인
2. **변경(Change)** — PL/개발자: 요구사항 접수(RTM 인테이크) → 영향도 분석 → 구조에서 확인 → 추적표 확정
3. **산출(Deliver)** — PM/PL: 문서 생성 → 편집 → 확정(승인자)
4. **참고(Reference)** — 전원: 위키 문서, 전역 검색

### 새 IA — 상위 6개 섹션

```
홈(/)  도메인(/domains)  구조(/structure)  추적표(/rtm)  산출물(/deliverables)  위키(/wiki)
```

- **홈 신설**: 현재 사이드바에 숨어 있는 `ProjectOverview`를 랜딩 페이지로 승격. 프로젝트 요약 + 각 여정 진입 카드 + 최근 활동(영향도 잡, 최근 확정 문서/RTM).
- **도메인이 이해 여정의 기본 진입**(business-first), 구조는 technical 뷰로 병렬 배치.
- knowledge graph 모드(`kind: "knowledge"`)는 `/knowledge` 별도 라우트로 분리(현행 자동전환 로직 대체).
- 전역 요소(섹션 소속 아님): 옴니박스 검색(Cmd+K), 코드 뷰어 오버레이, 영향도 잡 인디케이터, 테마, 단축키 도움말.

---

## 3. 라우트 맵

| 경로 | 화면 | 대체하는 현행 상태 |
|---|---|---|
| `/` | 홈(프로젝트 개요) | 사이드바 ProjectOverview |
| `/domains` | 도메인 지도 | `viewMode="domain"` |
| `/domains/:domainId` | 흐름 목록(+인라인 스파인) | `activeDomainId` |
| `/domains/:domainId/flows/:flowId` | 흐름 스파인 | `activeFlowId` |
| `/structure` | 구조 그래프 | `viewMode="structural"` |
| `/structure?level=class&node=<id>&overlay=diff` | 상세도·선택·오버레이 | `detailLevel`, `selectedNodeId`, overlay 토글 |
| `/rtm` | 추적표 원장 | `viewMode="rtm"` |
| `/rtm/intake/:sid` | 새요청 5단계 인테이크 | RtmView 내부 상태 |
| `/rtm/requests/:reqId` | 요구사항 상세 | RtmView 내부 상태 |
| `/deliverables` | 산출물 목록 | `viewMode="docs"` |
| `/deliverables/:docId` | 문서 편집/확정 | DocsView 내부 상태 |
| `/wiki` , `/wiki/*` | 위키 리더(경로=문서 경로) | `viewMode="wiki"` |
| `/knowledge` | 지식 그래프 | `viewMode="knowledge"` |
| 그 외 | `/`로 redirect | — |

**전역 쿼리 파라미터**: `?code=<path>&line=<n>` — 코드 뷰어 오버레이는 어느 라우트에서든 열리는 전역 레이어이므로 쿼리로 표현(딥링크 가능, 라우트 이동에도 유지 여부 선택 가능).

**토큰 가드**: 라우트가 아니라 루트 레이아웃의 가드로 구현. `?token=` → sessionStorage 저장·URL 제거(현행 로직 유지) → 토큰 없으면 현재 경로를 보존한 채 TokenGate 렌더 → 검증 통과 시 그 자리에서 원래 경로 렌더. 딥링크 URL이 게이트를 거쳐도 살아남는다.

**라우팅 방식**: react-router v7(라이브러리 모드) `createBrowserRouter`. dev 서버는 Vite SPA fallback 기본 지원. 데모 정적 빌드는 `basename=import.meta.env.BASE_URL` + 호스팅 404 fallback(또는 데모만 HashRouter 스위치 — P1에서 확정).

---

## 4. 앱 셸 설계

```
┌──┬────────────────────────────────────────────────────────────┐
│  │ ⌕ 옴니박스(Cmd+K)   홈 › 도메인 › 주문   [컨텍스트 액션] ⚙︎ ?│  ← TopBar
│홈├────────────────────────────────────────────────────────────┤
│도│                                                            │
│메│                                                            │
│인│                      페이지 (Outlet)                        │
│구│                                                            │
│조│                                                            │
│추│  ┌──────────────────────────────────────────────────────┐  │
│산│  │  코드 뷰어 (전역 슬라이드업, ?code= 있을 때)            │  │
│위│  └──────────────────────────────────────────────────────┘  │
└──┴────────────────────────────────────────────────────────────┘
 ↑ NavRail: 아이콘+라벨, 접힘 토글(64px ↔ 220px), 하단에 테마·단축키
```

- **NavRail(좌측)**: 6개 섹션 + 하단 유틸(테마, 도움말, 접힘). 현행 상단 탭(5개 버튼 인라인) 대체. 섹션이 늘어도(정책서 등 예정) 수직 확장 가능.
- **TopBar**: ① 옴니박스(전역 검색 — 노드/흐름/문서/요구사항 통합, Cmd+K), ② 라우트 기반 브레드크럼(현행 도메인 전용 브레드크럼 일반화), ③ **컨텍스트 액션 슬롯** — 각 페이지가 자기 액션(구조: 상세도·필터·경로찾기·영향도 / RTM: 새요청 등)을 포털로 주입. `!isXxxPage` 숨김 조건 체인을 구조적으로 제거.
- **전역 레이어**: 코드 뷰어(슬라이드업/모달), 영향도 잡 인디케이터+토스트, 온보딩 오버레이 — 셸에 1회 마운트.
- **모바일**: 별도 `MobileLayout` 트리 폐기 → 동일 라우트에서 NavRail이 하단 탭바로, 사이드 패널이 드로어로 변형(반응형). 기존 MobileBottomNav/MobileDrawer 로직 흡수.

---

## 5. 화면별 설계

### 5.1 홈 `/` (신설)

```
┌────────────────────────────────────────────────┐
│  {프로젝트명}                       분석 {날짜}  │
│  요약 문장 (graph.project.description)          │
│  [파일 N] [클래스 N] [도메인 N] [흐름 N] [요구 N] │  ← 스탯 타일
├──────────────┬──────────────┬──────────────────┤
│ 도메인 지도 →  │ 코드 구조 →   │  추적표 →         │  ← 여정 진입 카드
│ 미니 프리뷰    │ 미니 프리뷰    │  AS-IS n · TO-BE m│
├──────────────┴──────────────┴──────────────────┤
│ 최근 활동: 영향도 잡 · 최근 확정 문서 · 최근 요구사항 │
└────────────────────────────────────────────────┘
```

재사용: ProjectOverview의 데이터 소스(meta/graph), layerStats. 신규: 진입 카드, 활동 피드(기존 job/override 데이터 조합).

### 5.2 도메인 `/domains/**`

3화면 여정(지도→흐름목록→스파인)은 **검증 완료된 현행 뷰를 그대로 재사용**하고, 단계 전환만 URL로 승격. 브레드크럼은 셸 TopBar로 이동. `DomainMapView`/`FlowListView`/`FlowSpineView` 내부의 `setActiveDomain(...)` 호출을 `navigate(...)`로 치환.

### 5.3 구조 `/structure`

`GraphView` + ELK/ElkEdge 파이프라인 그대로. 변경점:
- 우측 사이드바(Info/Files)는 유지하되 셸의 표준 사이드 패널 컴포넌트로 재작성(접힘 가능).
- 헤더의 상세도·노드타입 필터·범례·오버레이 토글·영향도 버튼 → TopBar 컨텍스트 액션 슬롯 + 그래프 위 플로팅 툴바로 재배치.
- `selectedNodeId`/`detailLevel`/overlay → URL 쿼리 동기화(공유 가능한 "이 노드 봐" 링크).

### 5.4 추적표 `/rtm/**`

`RtmView`(원장·뷰2개·행 편집/확정) 재사용. 인테이크 5단계와 요구사항 상세를 하위 라우트로 분리 — 새로고침해도 인테이크 세션(`sid`) 복원(현행 `/rtm-intake-status?sid=` API 그대로 활용).

### 5.5 산출물 `/deliverables/**`

`DocsView`의 목록/본문을 목록 페이지와 문서 페이지로 분리. 문서별 URL로 확정 요청 시 링크 공유 가능.

### 5.6 위키 `/wiki/*`

`WikiReader` + FileExplorer 재사용. 문서 경로 = URL 경로.

---

## 6. 디자인 시스템

### 방향 확정 (2026-07-02): 다크 럭셔리 → **라이트 테마 + KT 레드**

레퍼런스는 KT DS의 **DS-APM** 제품 화면(`/home/jk/projects/ktds/apm-project/image.png`) — 좌측 NavRail + 라이트 배경 + KT 레드 액센트. DS-NAVI가 같은 제품군으로 보이도록 이 디자인 언어를 따른다. 다크는 P4 이후 테마 엔진 프리셋으로 선택 지원(차단 요소 아님).

### 토큰 구조 (3층) — 팔레트 확정값 (DS-APM 스크린샷 추출)

```
1층 brand
  --kt-red:          #e60012   로고 전용
  --brand-primary:   #d81b2c   UI 액센트(내비 활성 인디케이터, 버튼, 링크)
  --brand-tint:      #fcedee   액센트 연한 배경(알림 패널 등)
  --brand-emphasis:  #c0461e   수치 강조(러스트) — DS-APM 핵심지표 계열

2층 semantic (라이트)
  --bg-root: #f4f5f7  --bg-surface: #fcfcfd  --bg-card: #ffffff  --bg-hover: #eff0f3
  --text-primary: #1a1b1f  --text-secondary: #43474e  --text-muted: #6b727b
  --border-subtle: #e6e8ec  --border-medium: #d5d8de
  --accent: var(--brand-primary)
  --status-ok: #1a7f37  --status-warn: #b45309  --status-error: #c11322  --status-info: #175cd3

3층 component: 노드 타입 색(--color-node-*), 레이어 색 등 도메인 특화 — P4에서 라이트 배경 기준 재도출
```

- 현행 테마 엔진(`themes/`, CSS 변수 주입)은 구조가 건전하므로 **엔진은 유지, 토큰 스키마와 프리셋만 신설**.
- KT DS 컬러는 1층에만, 화면 코드는 2·3층만 참조.
- **레드의 역할 분리**: 브랜드 레드(#d81b2c)는 인터랙션 액센트 전용, 상태 오류는 별도 `--status-error`(#c11322) + 아이콘/라벨 동반 — 색만으로 오류를 표현하지 않는다.
- 타이포: DM Serif 폐기 → **Pretendard**(본문·헤딩) + 모노(코드·로그). 수치는 산세리프 세미볼드(스탯 타일 규격).
- 스탯/차트류는 dataviz 스킬 기준을 따르고, P4에서 그래프 노드·차트 카테고리 팔레트는 `validate_palette.js`로 검증 후 확정.

### shared/ui 프리미티브

Button, IconButton, Tabs, SegmentedControl, Badge, Panel, Modal, Drawer, Tooltip, EmptyState, StatTile — 현재 화면마다 인라인 Tailwind로 반복되는 패턴을 승격. 신규 화면부터 사용, 기존 화면은 P5에서 점진 치환.

---

## 7. 코드 구조

```
src/
  app/                    # 엔트리·라우터·프로바이더
    routes.tsx            # 라우트 정의 (§3)
    providers.tsx         # I18n, Theme, QueryClient(도입 시)
    shell/                # NavRail, TopBar, Breadcrumb, ContextActions(포털), GlobalLayers
    guards/TokenGate.tsx
  features/
    home/  domains/  structure/  rtm/  deliverables/  wiki/  knowledge/
    code-viewer/  search/  impact/
    (각 feature: components/ hooks/ api.ts store.ts(필요시))
  shared/
    api/client.ts         # fetch 래퍼: 토큰 자동 첨부, 401/403 → 게이트 재진입, DEMO_MODE 분기(dataUrl 로직 이관)
    ui/                   # §6 프리미티브
    theme/                # 토큰·프리셋 (기존 themes/ 이관)
    hooks/  utils/
  locales/                # 유지
```

**상태 원칙**: 네비게이션 상태의 단일 진실은 URL. `viewMode`/`activeDomainId`/`activeFlowId`/`setViewMode` 등은 store에서 제거하고 라우터 훅으로 대체. store에는 ①서버 데이터(그래프·오버레이·오버라이드) ②순수 UI 상태(패널 열림, 필터)만 남기고 feature별 슬라이스로 분해. `store.test.ts`의 네비 관련 테스트는 라우팅 테스트로 이관.

---

## 8. 단계별 계획

각 단계 종료 시 사용자 확인 후 다음 단계 진행(기존 phase-stop 관례). 검증 게이트: `pnpm test` green + playwright 시각 QA(기존 헤드리스 셋업 재사용) + 데모 빌드(`build:demo`) 확인.

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P0** | 본 설계 확정 + KT DS 팔레트 확보 + 셸/홈 비주얼 시안 | 사용자 승인 |
| **P1 기반** | react-router 도입, `app/` 셸 뼈대(NavRail·TopBar·가드), `shared/api` 클라이언트, 기존 뷰 6개를 새 라우트에 **그대로 마운트** | 모든 현행 기능이 새 URL에서 동작, 딥링크·새로고침 유지 |
| **P2 해체** | App.tsx 소멸: 컨텍스트 액션·단축키·코드뷰어·모바일을 feature/셸로 이관, store 네비 상태 → URL | `viewMode` 삭제, 기능 동등성 시각 QA |
| **P3 심화 라우팅 + 홈** | 홈 페이지 신설, 도메인/RTM/산출물/위키 하위 라우트·쿼리 동기화 | §3 라우트 맵 전체 동작 |
| **P4 디자인 시스템** | 토큰 3층 스키마 + KT DS 팔레트 + 타이포 + shared/ui, 셸에 적용 | 시안 대비 시각 QA 통과 |
| **P5 화면 리디자인** | 홈→도메인→구조→추적표→산출물→위키 순 화면별 폴리시 | 화면별 시각 QA |
| **P6 마감 QA** | 전체 회귀(테스트+시각), 데모 빌드, 문서 갱신 | 전부 green |

---

## 8.5 P1 구현 기록 (2026-07-02)

- **신규 구조**: `src/app/`(routes, Root=토큰가드+데이터로딩+셸, shell/NavRail·TopBar, legacy/LegacyDashboard, ViewModeUrlBridge, viewModePaths) + `src/shared/api/client.ts`(토큰·dataUrl 이관). App.tsx는 995줄 → 13줄(RouterProvider).
- **과도기 동기화**: `ViewModeUrlBridge`가 URL↔store.viewMode 양방향 동기화(ref 가드로 바운스 방지). store 내부 viewMode 변경 지점(openWikiDoc·navigateToDomain·MobileDrawer·knowledge 자동전환)을 P1에서 무수정 흡수 — P2에서 navigate() 치환 후 브리지 제거.
- **store 수정 2건**: ① `setGraph`의 viewMode→structural 리셋 제거(딥링크가 로드 시점에 되돌려지는 버그) ② `setDomainGraph`의 structural→domain 자동 플립 제거 — "열자마자 도메인 랜딩"은 index 라우트 `IndexRedirect`(domain-graph 조회 완료 대기 → /domains 또는 /structure, 쿼리 보존)로 이관.
- **레거시 헤더 이관**: 프로젝트명·뷰 탭 그룹 → NavRail/TopBar, ThemePicker·ImpactJobIndicator → TopBar. 산출물/추적표 풀페이지는 레거시 헤더 자체를 숨김(자체 툴바 보유). 나머지 컨텍스트 액션은 P2에서 슬롯화.
- **QA 어포던스**: `?onboard=skip`(기존 `onboard=force`와 대칭) — 헤드리스 스크린샷용.
- **검증**: 딥링크 4종(/structure /domains /rtm /deliverables) + "/" 자동랜딩 스크린샷 확인, 전체 테스트 green.

## 8.6 P2 구현 기록 (2026-07-02)

- **viewMode 삭제 완료 — URL이 네비게이션의 단일 진실**. `store.viewMode`/`setViewMode` 제거, 컴포넌트는 `useViewMode()`(라우트 파생, hooks/useViewMode.ts), 훅 불가 문맥(단축키)은 `currentMode()`(viewModePaths, BASE_URL 스트립). ViewModeUrlBridge·LegacyDashboard 삭제.
- **섹션별 페이지**: `app/pages/` — GraphWorkbench(구조/지식/위키 공용 본체, mode prop) + Structure/Knowledge/Wiki/Domains/Rtm/Deliverables Page. knowledge 자동전환은 StructurePage의 `isKnowledgeGraph → Navigate("/knowledge")`로.
- **셸 전역 레이어**(`shell/ShellLayout.tsx`): 단축키+도움말 모달, 온보딩, 코드뷰어(슬라이드업+모달), 경로찾기/영향도 모달, 검증·오류 배너, 모바일 분기. TopBar에 도메인 브레드크럼(구 레거시 헤더에서 승격)과 도움말 버튼 합류.
- **구 setViewMode의 정리 반쪽** → `resetTransientOnSectionChange`(셸이 섹션 변경 시 호출, 마운트 제외). "선택을 들고 점프"(NodeInfo 문서/도메인 점프)는 `markPreserveTransientOnce`로 1회 보존 — 원자성 유지.
- **크로스섹션 점프 재배선**: NodeInfo(도메인 흐름·관련 문서), DomainClusterNode(더블클릭), MobileDrawer(뷰 토글) → navigate(). MobileLayout 등 4개 컴포넌트 viewMode 읽기 → useViewMode.
- **lint 완치**: eslint-plugin-react-hooks 등록(rules-of-hooks=error, exhaustive-deps=warn), fixtures lint 제외, 미사용 import 4건 제거, DocsView 정규식의 리터럴 BOM → `﻿` 이스케이프. `pnpm lint` 0 errors.
- **검증**: 빌드+lint+테스트(297+132) green, 딥링크 4종 시각 QA(RTM/산출물은 P1과 픽셀 수준 동일 = 파리티).
- 미이관 잔여(의도): MobileLayout 반응형 통합의 시각 개편은 P5, 컨텍스트 액션의 TopBar 슬롯화·옴니박스는 P3~P5에서(현재는 GraphWorkbench 자체 툴바로 응집).

## 8.7 P3 구현 기록 (2026-07-03)

- **홈 신설**: `/` = HomePage(app/pages/HomePage.tsx) — P0 승인 시안 구조를 다크 토큰으로 구현(라이트는 P4). 스탯 타일(파일·클래스·도메인·기능 흐름·추적 기능) + 여정 진입 카드(도메인 칩/구조/추적표) + 산출물 문서 요약(doc-list.json, 확정/초안 배지) + 위키 카드(있을 때). rtm.json/doc-list.json은 홈에서 직접 fetch — 없으면 해당 요소만 숨김. NavRail 홈 항목(end 매칭), IndexRedirect 삭제 — "열자마자 도메인 랜딩"(di-ds-navi-001)은 **홈 랜딩으로 대체**(홈이 도메인 지도 진입 카드를 1순위로 제공).
- **도메인 하위 라우트**: `/domains/:domainId`(흐름 목록) + `?flow=`(인라인 스파인 선택). §3의 `/flows/:flowId`는 **구현하지 않음** — 화면3(전체화면 스파인)이 이미 제거돼 `activeFlowId`는 모바일 가드·브레드크럼용 흔적 기관이고, 실제 화면 상태는 인라인 `selectedFlowId`라 쿼리가 정확한 매핑. DomainsPage가 URL→store 단방향 동기화(navigateToDomain/clearActiveDomain 재사용, 그래프 로드에도 재적용) + ?flow= 양방향(replace). 전환 버튼 전부 navigate() 재배선: DomainMapView 카드/상세, FlowListView·DomainGraphView 지도 복귀, TopBar 브레드크럼 루트, NodeInfo 흐름 점프(`/domains/:id`), DomainClusterNode 더블클릭(`/domains/:id`).
- **구조 쿼리 동기화**: `/structure?node=<id>&level=class` — 그래프 로드 후 1회 적용(URL→store), 이후 replace 미러(store→URL). "이 노드 봐" 공유 링크 성립.
- **버그 픽스(딥링크 검증 중 발견)**: ① `/domains/:domainId` 딥링크가 늦게 도착한 setGraph의 activeDomainId 리셋에 지도로 되돌아감 → DomainsPage 동기화를 그래프 로드에도 반응하게 ② `?node=` 선택이 **StrictMode 이중 fetch의 두 번째 setGraph**에 지워짐(store.subscribe 스택 추적으로 실증) → setGraph가 새 그래프에도 존재하는 선택은 보존(재분석 리로드 시 선택 유지 UX 개선 겸).
- **검증**: 홈·/domains/domain:account·/structure?node=(Category.java NodeInfo 렌더) 스크린샷 확인, 빌드+lint+테스트 green.
- 미이관 잔여(의도): RTM 인테이크(/rtm/intake/:sid)·산출물(:docId)·위키(/wiki/*) 하위 라우트 — 해당 뷰 내부 배선이 커서 P5 화면 리디자인과 함께. 옴니박스는 P4~P5.

## 8.8 P4 구현 기록 (2026-07-03)

- **기본 테마 = `ktds-light`**(프리셋 배열 첫 항목·DEFAULT_THEME_CONFIG): §6 팔레트 그대로 — 배경 #f4f5f7/#fcfcfd/#fff/#eff0f3, 텍스트 3단, 중립 보더(#e6e8ec/#d5d8de, 액센트 파생 오버라이드), KT Red 액센트 스와치(#d81b2c/#b91525/#e8404f) + 라이트 대안 스와치. 다크 4종·light-minimal은 프리셋으로 존치(ThemePicker 선택 가능).
- **테마 엔진 확장**: 적용 순서 재정렬(모드 extras → 액센트 → 파생 → 프리셋 colors 최후승) — 프리셋이 파생값(보더·엣지)을 오버라이드 가능. `MODE_EXTRAS`로 3층 토큰(지식 노드·레이어·diff 색)을 다크/라이트 모드별 스위치 — 프리셋 전환 시 잔류값 방지.
- **첫 페인트(FOUC) 기준도 라이트**: index.css @theme 기본값을 ktds-light와 동일하게 교체. `--color-kt-red`(#e60012, 로고 전용) 신설, NavRail에 kt ds 로고 마크.
- **타이포**: 기본 산세리프 = Pretendard Variable(jsdelivr CDN, dynamic subset). DM Serif는 헤딩 폰트 옵션으로 존치(엔진 기본 serif→sans).
- **골드 하드코딩 스윕**: `#d4a574`/`rgba(212,165,116,α)` 잔재 7파일(GraphView·RtmView·FlowListView·FlowSpineView·ContainerNode·DocsView·domainData) → `var(--color-accent)`/`color-mix(액센트 α%)`/레이어 토큰. 단 GraphView **기본 엣지**는 액센트가 아닌 중립 `--color-edge` 토큰으로 교정(레드 엣지는 diff 오버레이로 오독됨) — 강조(선택 0.8·경로 0.5) 엣지만 액센트.
- **스토리지 키 v2**(`ua-theme-v2`): 리브랜딩 기본값 1회 적용(기존 저장 테마 무효화).
- **검증**: 홈·도메인 지도·흐름 목록·구조(중립 엣지 확인)·RTM 라이트 스크린샷, 시안(mockup-shell-home) 대비 구조 일치. build·lint·테스트(297+132) green.
- 잔여(P5): 내부 화면의 다크 전제 하드코딩 폴리시 — FlowListView METHOD 배지 팔레트, RTM 상태색, ExportMenu SVG 스냅샷(다크 고정), 온보딩 카피. 노드/차트 카테고리 팔레트의 dataviz `validate_palette.js` 검증도 P5 폴리시에서.

## 8.9 P5 구현 기록 (2026-07-03)

- **브랜딩 피드백 반영**: NavRail의 `kt ds` 로고 마크 제거(DS-NAVI 단독), 프리셋 `ktds-light`→`ds-navi-light`·"KT DS Light"→"DS-NAVI Light", 스와치명 "KT Red"→"Red", `--color-kt-red` 삭제. 팔레트 값 자체(§6)는 불변.
- **시맨틱 토큰 2계열 신설**(모드별 MODE_EXTRAS + @theme 라이트 기본값): `--color-status-{ok,warn,error,info}`(§6의 상태·액센트 분리 원칙 구현), `--color-method-{get,post,put,delete,any,batch,event,flow}`(HTTP 메서드 카테고리).
- **하드코딩 → 토큰 배선**: RtmView 상태 상수(OK/BAD/WARN/NFR/FAINT/GOLD_DIM), FlowListView·FlowSpineView 메서드 배지(bg는 15% color-mix), CodeViewer prism 테마 모드 스위치(vsDark↔github), ExportMenu SVG는 내보내기 시점 테마 계산값을 굽는 방식(단독 파일은 CSS 변수 해석 불가).
- **온보딩 카피 재작성**(ko·en): 업스트림 범용 카피(지식그래프/Overview/Learn) → 새 IA 5단계(홈 여정·URL 딥링크·도메인 지도→스파인·구조 그래프·부가 기능). ja/zh/zh-TW/ru는 구 카피 잔존(후속).
- **노드 팔레트 dataviz 검증**: 라이트 13색을 `validate_palette.js`로 검증 — 채도 미달 5색·대비 미달 1색 교정 후 **전 항목 통과**(CVD 9.8은 노드 라벨=보조 인코딩으로 합법). ds-navi-light 프리셋·@theme 기본값에 반영.
- **버그 픽스**: `?flow=` 딥링크가 StrictMode 이중 setGraph에 지워짐(P3의 selectedNodeId와 동일 패턴) → setGraph가 domainGraph 존재 시 activeFlowId/selectedFlowId도 보존(도메인 상태는 domainGraph 소관).
- **검증**: 스파인 딥링크(라이트 레이어 색+인용 칩)·온보딩·구조 class 레벨 스크린샷, build·lint·테스트 green.
- 잔여(P6 또는 후속): RTM/산출물/위키 하위 라우트, MobileLayout 반응형 통합, 데모 정적 빌드 검증, 비주요 로케일 온보딩 카피.

## 9. 리스크·미결

- ~~KT DS 팔레트 미확보~~ → **해소**: DS-APM 스크린샷에서 추출 완료(§6). 단 공식 브랜드 가이드 대비 검증은 미실시 — 실 가이드 입수 시 1층 토큰만 교체.
- **라이트 전환 파급** — 그래프 노드/레이어/엣지 색(3층)이 전부 다크 배경 기준 → P4에서 라이트 기준 재도출 필요(구조·도메인 뷰 시각 QA 필수).
- **데모 정적 빌드 × BrowserRouter** — BASE_URL 하위 배포 + 404 fallback 검증 필요. 실패 시 데모 한정 HashRouter(P1에서 결정).
- **MobileLayout 통합** — 별도 트리 폐기가 P2 범위를 키움. 필요 시 P2에서는 현행 유지 후 P5로 이연 가능.
- **store 대수술** — RTM/도메인 뷰가 store 액션에 깊게 결합(예: `clearActiveFlow`). P2에서 액션→navigate 어댑터를 두고 점진 치환.
- **upstream 추적** — 전면 재구축 후 U-A upstream 대시보드 변경의 cherry-pick은 사실상 포기(포크 확정). `ua-base` 게이트는 core에만 유효 유지.
