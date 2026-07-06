# 업무 지도(구 도메인 메뉴) 재설계 — WORK_MAP

> 2026-07-06 사전 설계 확정. 메뉴별 개편 프로그램의 1번 타자(도메인 메뉴).
> **디자인 불변 원칙**: DS-NAVI light 토큰·컴포넌트 언어(rounded-xl 카드, border-subtle,
> accent, Pretendard, GroundedBar/CitationChip/VerdictBadge) 그대로 — 레이아웃·IA만 재설계.

## §1 문제 정의

1. **랜딩이 화면 크기와 안 맞음** — 화면1(DomainMapView)은 대형 헤더(34px 타이틀+서브텍스트)
   +통계바+카드 그리드를 세로로 쌓은 문서형 레이아웃이라 페이지 전체가 스크롤됨.
   뷰포트 채움형이 아니고, 도메인/기능 수가 늘면 파악 불가.
2. **기능 목록 스케일 한계** — 화면2(FlowListView) 좌측 320px 평면 리스트는 검색/필터가
   없어 기능 수십~수백 개 도메인(eGov급)에서 무한 스크롤.
3. **흐름도가 코드 관점뿐** — FlowSpineView(코드 스파인)는 개발자용. PM/PL·현업용
   **업무 흐름도**(판단분기 순서도, 예시 work_flow.png)와 **시스템 흐름도**(구성도+타 시스템
   연동, 예시 system_flow.png)가 없음.

## §2 확정 결정 (2026-07-06 사용자 확정)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 메뉴 | **단일 메뉴 유지 + "업무 지도"로 개명**. 경로 `/domains`는 유지(딥링크·QA 스크립트 보존) |
| D2 | 랜딩 | **시스템 구성도형 랜딩** — 도메인 박스+기능 칩+타 시스템 연동 패널이 뷰포트에 맞춤. 첫 화면 = 시스템 흐름도(요구 1번과 화면 크기 문제 동시 해결) |
| D3 | 업무 흐름도 | **도메인 단위 + LLM fill 확장** — 도메인당 1장의 업무 프로세스 순서도(분기 포함). fill 스키마에 businessFlow 추가, 기존 인용 기계검증(emit) 통과 필수, fill 없으면 결정론 순차 폴백 |

## §3 정보 구조(IA) / 라우팅

```
NavRail: "업무 지도" (구 "도메인", t.drawer.domain 라벨만 변경)
/domains                     ← 랜딩 = 시스템 구성도 (화면 A)
/domains/:domainId           ← 도메인 워크스페이스 (화면 B)
  ?view=business             ←   업무 흐름도 탭
  ?view=code&flow=<id>       ←   기능(코드 흐름) 탭 — 기존 ?flow= 의미 보존
```

- URL이 진실(FRONT_REDESIGN 원칙 유지). `?view=` 미지정 시: businessFlow 데이터 있으면
  business, 없으면 code(기존 동작과 동일하게 열림).
- 기존 딥링크 `/domains/:id?flow=` 는 code 탭으로 해석 — **하위호환 파손 0**.

## §4 화면 설계

### 화면 A — 랜딩 = 시스템 구성도 (DomainMapView 대체)

```
┌ 헤더 1줄: eyebrow(업무 지도·프로젝트명) + 타이틀(축소) + 통계 인라인(5도메인·22기능·81노드) ┐
│ ┌─ <시스템명> 시스템 ────────────────────────────┐   ┌─ 타 시스템 연동 ──────┐ │
│ │  ┌─ 🛒 주문 ──────────┐ ┌─ 👤 계정 ─────────┐  │   │ 인터페이스(송신/수신)   │ │
│ │  │ GroundedBar(컴팩트) │ │ …               │  │◄─►│  0건 — 스캔 완료·없음  │ │
│ │  │ 주문생성 · 주문조회  │ │                 │  │   ├─ DB ─────────────────┤ │
│ │  │ +2 more            │ │                 │  │   │ HSQLDB(내장) 13테이블  │ │
│ │  └────────────────────┘ └─────────────────┘  │   ├─ 배치 ────────────────┤ │
│ │  (auto-fill 그리드, 내부만 스크롤)              │   │ 0건 — 스캔 완료·없음   │ │
│ └───────────────────────────────────────────────┘   └───────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **뷰포트 맞춤**: 페이지 스크롤 금지(h-full 고정), 시스템 박스 내부 그리드만 스크롤.
  헤더는 1줄(타이틀 34px→20px, 서브텍스트 제거, 통계바를 헤더 우측 인라인으로).
- **도메인 박스** = 기존 카드의 정보 흡수(아이콘·색·근거율 GroundedBar·기능 칩 상위 N개
  +“+N more”). 박스 클릭 → 워크스페이스. 기능 칩 클릭 → `?view=code&flow=` 딥점프.
  우상단 ⤢ = 기존 DomainCardDetail 모달 재사용(근거 상세).
- **타 시스템 연동 패널**(우측 고정 폭): 인터페이스 송신/수신·DB·배치. 데이터 원천은
  §5 system-map. **0건은 "스캔 완료·없음"으로 정직 표기**(빈 패널 숨김 금지 — P1 인터페이스
  스캔의 음성 보고 원칙 준용). system-map 부재(구버전 산출물) 시 패널에 "연동 데이터 없음 —
  /understand-map scan 재실행" degrade 문구.
- 도메인 5개(jpetstore)·30개(중형)에서 모두 성립: 박스 그리드 auto-fill minmax(260px).

### 화면 B — 도메인 워크스페이스 (FlowListView 개편)

```
┌ 브레드크럼(업무 지도 › 주문) + 도메인명 + 요약 1줄 + GroundedBar ─────────────┐
│ [업무 흐름도] [기능 N] ← 탭(view=)                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ view=business: 업무 프로세스 순서도(§4-1)                                    │
│ view=code:     좌측 기능 목록(스케일 대응 §4-2) + 인라인 코드 스파인(기존)      │
└──────────────────────────────────────────────────────────────────────────┘
```

#### §4-1 업무 흐름도 탭 (신규)

- **렌더 스택**: 기존 React Flow + ELK(direction=DOWN, 기존 elkEdgePointMap 커스텀 엣지
  재사용 — [[dashboard-edge-routing]]) — 신규 라이브러리 없음.
- **노드 3종**(work_flow.png 어휘): 시작/종료(pill), 활동(rounded rect — 기존 카드 토큰),
  판단(diamond, 나가는 엣지에 YES/NO 라벨). 색은 도메인 색 + 기존 노드 토큰 조합(신규 팔레트
  금지).
- **활동 노드의 flowRef**: 해당 기능(flow) 연결 시 노드에 기능 뱃지 표시, 클릭 →
  `?view=code&flow=` 전환(업무→코드 드릴다운 = 관점 연결).
- **근거 표면**: 노드 선택 시 하단/우측에 인용 칩(기존 CitationChip). fill 미작성 도메인은
  **결정론 폴백**: flows 순차 나열 순서도(분기 없음) + "업무 흐름 미채움 — 순차 근사" 배너.
- 저장물이 없거나 검증 실패(NEEDS_REVIEW)면 해당 노드 [확인 필요] 배지 — 기존 정직성 규약.

#### §4-2 기능 목록 스케일 대응 (기존 탭 개선)

- 목록 헤더에 **검색 입력**(이름/경로/메소드 부분일치) + **필터 칩**(그룹 http/batch/…,
  메소드, 근거 verdict) — 모두 클라이언트 필터(결정론).
- 그룹 헤더 접기/펼치기. 기능 300+ 대비 목록 가상화(단순 windowing, 라이브러리 추가 없이
  IntersectionObserver 또는 수동 슬라이스 — 구현 시 계측 후 결정).
- 접힘 레일(44px 번호 레일)·인라인 스파인·전체화면 동선은 유지.

## §5 데이터 설계

### system-map.json (신규 산출물, 결정론)

- 생성: understand-map scan 마지막 stage(스캐너 추가 패턴 = scanDomainMap stage+
  writeMapArtifact+배럴 재수출 — [[si-expansion-roadmap]] 관례).
- 내용: `{ interfaces: {outbound[], inbound[], scanned: true}, db: {vendor, tier,
  tables[], live[]}, batch: {jobs[], scanned}, generatedFromCommit }` —
  interfaces.json/db-schema.json/batch-jobs.json 의 대시보드용 요약(재스캔 아님, 조인만).
- 배포: `.understand-anything/system-map.json` + dev 서버 protected endpoint 등재
  (vite.config.ts) + sync:demo 목록(8→9파일) + 스키마 검증(기존 schema 게이트).

### DomainFill.businessFlow (fill 스키마 v 확장)

```jsonc
"businessFlow": {                    // 선택 필드 — 없으면 폴백(하위호환)
  "nodes": [{ "id": "n1", "kind": "start|activity|decision|end",
              "label": "재고 확인",  // 업무 언어
              "flowRef": "flow:...", // 선택 — 실존 flow id 검증(유령 참조 거부)
              "citations": [...] }], // activity/decision 은 min 1 (기존 규약)
  "edges": [{ "from": "n1", "to": "n2", "label": "YES" }]
}
```

- emit 기계검증 확장: 인용 실존(±2줄 스니펫 대조, 기존 검증기 재사용), flowRef 실존,
  그래프 정합(고아 노드·중복 id·start/end 각 1+·**decision 나가는 엣지 2+ 및 분기 라벨
  필수** 검증 — P4 리뷰 C1/C7). 실패 시 해당 도메인 businessFlow 기각(rejected +
  `domainMeta.businessFlowRejected` 사유 표면화) — 도메인 전체 기각 아님(부분 수용).
  사이클(재시도 루프)은 허용(의도 명문화). **한계(정직성)**: 기계검증은 인용의 *실존*
  검증이지 분기 근거의 *진위* 검증이 아니다 — 실존 라인을 인용한 오답 분기는 사람
  검수 몫(SKILL §6-4 지침 + decision 분기 성립 게이트로 여지 축소).
- domain-graph.json 에는 도메인 노드 `domainMeta.businessFlow` 로 병합(스키마 버전 bump,
  대시보드 스키마 검증 동시 갱신).
- SKILL(understand-map fill 안내) 프롬프트에 businessFlow 작성 지침 추가 — 분기는 코드
  근거(if/예외 처리) 또는 businessRules 근거가 있을 때만, 창작 금지.

## §6 단계 계획 (stop per phase — 단계마다 실측+사용자 컨펌)

| 단계 | 내용 | 검증 |
|---|---|---|
| ✅ P1 | 메뉴 개명 + 랜딩 구성도(화면 A) — system-map 없으면 연동 패널 degrade | 시각 QA 14항목 통과(1920/1366 무스크롤·박스5·degrade·칩 딥링크·모달), 루트 297+대시보드 132 green |
| ✅ P2 | system-map.json 산출물 + 연동 패널 실데이터 | jpetstore(인터페이스0·hsqldb내장13·배치0)·eGov(0건+suspect1·멀티벤더 비내장) 실측, 재실행 byte-diff=0, 시각 QA "실데이터(P2)" 통과 |
| ✅ P3 | 워크스페이스 탭 구조 + 기능 목록 스케일(검색/필터/접기/점진 windowing) | eGov(216기능) 실측: 첫 렌더 437ms·초기 DOM 100행(53% 절감)·스크롤 전량 로드 +326ms·검색 반응 97ms → IntersectionObserver 점진 windowing 채택(§4-2 "계측 후 결정" 이행). 스모크 16항목 통과(?flow= 하위호환 포함) + P1 시각 QA 14항목 재통과. 부수 수정 3건: ?flow= 딥링크 첫 로드 복원 무산(store→URL 동기화가 그래프 도착 전 param 삭제 — 기존 버그), 딥링크 진입 시 랜딩 transient 마운트로 토큰 없는 system-map fetch 403, 라우터 초기 location 이 게이트가 지운 ?token= 재유입. **적대적 리뷰 2종 disposition**: 코드 R1(HIGH, 미사용 import 로 tsconfig.app 빌드·lint 실패 — vitest 만 green 이었음)·R2(flowApplied 도메인 전환 미리셋)·R4(filterKey 구분자 충돌→JSON 직렬화)·R5(검색 NFC 정규화) 수정, 비평 C1(탭 push→replace, 형제 규약 정합)·C2(파셋 계산 flowFacets 추출+단위테스트 — **jpetstore·eGov 는 세 파셋 균일이라 칩 비노출이 정상**)·C3(접힘 레일 windowing 우회→동일 창+센티널)·C4(ARIA roving tabindex·화살표 키·tabpanel 연결)·C7(번호 비연속 툴팁) 수정 + 센티널 재발화 stall 차단(observer 를 windowSize 성장마다 재생성). C5 는 문구 한정으로 처리: **하위호환 보장 범위 = `?flow=` 딥링크·`/domains`**(순수 `/domains/:id` 는 P5 fill 후 기본 탭이 business 로 바뀜 — §3 설계 의도, D3 사용자 확정). C6(business 전환 시 ?flow= 유지)은 선택 보존 의도로 채택. 대시보드 146 green(신규 workspaceFilter 14) |
| ✅ P4 | businessFlow: fill 스키마+emit 검증+결정론 폴백+순서도 뷰 | legacy-core: BusinessFlowSchema(activity/decision 인용 min1·start/end 면제, superRefine)+validateBusinessFlow(중복 id·고아·끝점 미실존·start/end 1+·flowRef 도메인 스코프)+applyFills 부분 수용(실패 시 `#businessFlow` 만 기각)+verify 항목화(ref `<domainId>#businessFlow[<nodeId>]`, 기각 도메인 집계 제외)+embedVerification 장식(노드 verdict/인용 status, 카드 지표에서 businessFlow 제외). 대시보드: parseBusinessFlow(방어적, 이탈 시 폴백)+buildSequentialFallback(순차 근사+배너)+BusinessFlowView(React Flow+ELK DOWN+ElkEdge 재사용, pill/rect/diamond+YES/NO 라벨+⚠ 배지+근거 바+flowRef 드릴다운). SKILL §6-4 작성 지침(분기는 코드/businessRules 근거 시만·창작 금지). **발견 수정**: react-router 함수형 setSearchParams 의 prev 가 렌더 스냅샷이라 드릴다운 navigate 를 스테일 값으로 덮어씀 → 3개 라이터(view 전환·flow 동기화·드릴다운)를 라이브 window.location.search 기준으로 정합. 시각 스모크: 폴백(catalog 5기능 순차+배너+드릴다운) + 채움(주입 픽스처 — diamond·YES/NO·⚠·기본탭 business) 11항목 통과, 스크린샷 확인. 스위트: legacy-core 967(신규 businessFlow 9, 1차 실행 1건 플레이크 — 재실행 2회 green) · 대시보드 149(신규 3) · 루트 314 green. **적대적 리뷰 2종 disposition**: 비평 C1(HIGH, decision 나가는 엣지 2+ 미검증→게이트 추가)·C7(분기 라벨 필수)·C2(기각 vs 미채움 배너 뭉갬→domainMeta.businessFlowRejected 표면화+배너 분기)·C3(폴백 스케일 상한 30+"…외 N건" 집계 노드)·C5(RejectedItem 에 구조적 kind — ref 접미 파싱 제거)·C9(core DomainMetaSchema 에 businessFlow/businessFlowRejected 명시 필드 — passthrough 우회 해소)·C8(verify 코멘트 정정) 반영, 코드 MED(비즈 IIFE 매 렌더 재계산→useMemo — 자가 선수정 확인)+LOW(라벨 오버플로 title/keep-all·SKILL ~30자 힌트) 반영. **채택 안 함**: C4 분기근거 진위의 기계검증은 불가 — 기계검증=인용 실존임을 §5 에 명기(사람 검수 몫), C6 window.location 읽기는 BrowserRouter 전제의 실용 해(라우터 함수형 prev 스테일 경합의 유일 결정 수단)로 유지·주석 명기, 사이클은 재시도 루프 의도로 허용 명문화. 검증 스위트 재실행: domain-map 334 · 대시보드 151 green |
| ⬜ P5 | jpetstore 데모 fill 재생성(LLM)+벤더링+qa 시각 스모크 | 골든 게이트(citationCount 증가 반영), 재벤더링 커밋 |

- 산출물 재생성 관례: 벤더링 갱신 시 골든 기준선 거버넌스(--update-baseline --yes) 경유.
- 테스트: 대시보드 빌드+기존 스위트 green 유지, 신규 검증 로직은 legacy-core 단위테스트.

## §7 수용 기준(AC)

- AC-1 랜딩이 1080p·노트북(1366×768)에서 페이지 스크롤 0(내부 스크롤만).
- AC-2 메뉴 라벨 "업무 지도", 기존 URL 전부 동작(/domains, /domains/:id?flow=).
- AC-3 시스템 구성도에 타 시스템 연동 패널 — 0건도 "스캔 완료·없음" 표기.
- AC-4 업무 흐름도: fill 채움 도메인은 분기 포함 순서도+노드 인용, 미채움은 순차 폴백+배너.
- AC-5 활동 노드 → 코드 흐름 딥점프(?view=code&flow=) 왕복 동작.
- AC-6 기능 목록 검색/필터 — eGov급(수백 기능)에서 리스트 조작 60fps 체감(계측 기록).
- AC-7 전 신규 데이터는 결정론(동일 commit byte-diff=0) + 스키마 게이트 통과.

## §8 진행 현황 ledger

- 2026-07-06: 사전 설계 확정(D1~D3, 사용자 3택 컨펌) — 본 문서 작성.
- 2026-07-06: **P1 완료** — 메뉴 "업무 지도" 개명(drawer.domain+breadcrumbRoot, 6로케일),
  DomainMapView 구성도형 재작성(컴팩트 헤더 1줄+시스템 박스(내부 스크롤 그리드, 도메인 박스
  +기능 칩 상위 4+"+N")+타 시스템 연동 패널(system-map.json 소비 계약 선배선, 404→degrade)),
  기능 칩 `?flow=` 딥링크·상세보기 모달(기존 DomainCardDetail) 유지. 시각 QA 스크립트
  qa-workmap-p1.mjs 14항목 통과(AC-1/2/3), 긴 도메인명·상세보기 버튼 겹침 수정(paddingRight 72).
  P2(system-map.json 산출물) 대기.
- 2026-07-06: **P2 완료** — legacy-core `src/system-map/`(buildSystemMap 조인+writeSystemMap,
  zod 스키마·단위테스트 5건), scanDomainMap 마지막 stage 배선(반환에 systemMap 포함),
  vite dev 미들웨어 protected endpoint+파일 매핑 분기(누락 시 knowledge-graph 오서빙 함정 —
  엔드포인트 목록과 fileName 체인 **둘 다** 추가해야 함), sync:demo 9파일. 대시보드 파서에
  suspectCount 추가 — 0건+의심신호>0 은 "탐지 못함" 가능성 경고(eGov 실증). extSuspect
  6로케일. 실측: jpetstore 결정론 OK·eGov suspect 1건 표면화.
