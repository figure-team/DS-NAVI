# U-A 대시보드 프론트 전면 재구축 설계 (FRONT_REDESIGN)

> 워크트리: `front` / 브랜치: worktree-front (demo/jpetstore-6 기반)
> 상태: **P0 진행 — 셸·홈 시안 제작 완료, 사용자 승인 대기**
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

## 9. 리스크·미결

- ~~KT DS 팔레트 미확보~~ → **해소**: DS-APM 스크린샷에서 추출 완료(§6). 단 공식 브랜드 가이드 대비 검증은 미실시 — 실 가이드 입수 시 1층 토큰만 교체.
- **라이트 전환 파급** — 그래프 노드/레이어/엣지 색(3층)이 전부 다크 배경 기준 → P4에서 라이트 기준 재도출 필요(구조·도메인 뷰 시각 QA 필수).
- **데모 정적 빌드 × BrowserRouter** — BASE_URL 하위 배포 + 404 fallback 검증 필요. 실패 시 데모 한정 HashRouter(P1에서 결정).
- **MobileLayout 통합** — 별도 트리 폐기가 P2 범위를 키움. 필요 시 P2에서는 현행 유지 후 P5로 이연 가능.
- **store 대수술** — RTM/도메인 뷰가 store 액션에 깊게 결합(예: `clearActiveFlow`). P2에서 액션→navigate 어댑터를 두고 점진 치환.
- **upstream 추적** — 전면 재구축 후 U-A upstream 대시보드 변경의 cherry-pick은 사실상 포기(포크 확정). `ua-base` 게이트는 core에만 유효 유지.
