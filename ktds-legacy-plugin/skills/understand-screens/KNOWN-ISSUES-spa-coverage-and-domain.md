# understand-screens — 알려진 결함 (SPA 커버리지 & 도메인 배정)

> 상태: **수정 완료(2026-07-23)** — 도구/스킬 레벨. 아래 "## 수정 완료" 참조.
> 최초 관측: 2026-07-23, m-project(`apps/bo` React 백오피스) 화면설계서 생성 중
> 관측자: 오케(Claude Opus 4.8) · 지시자: 오너
> 범위: React/Vue 등 **클라이언트 라우팅 SPA**(상태 기반 네비, 화면별 URL 없음)에서 재현
>
> ⚠️ 아래 "증상/근본 원인/수정 제안" 절은 최초 진단 기록(historical)이다 — 실제로 무엇이
> 바뀌었는지는 문서 끝 "## 수정 완료 (2026-07-23)" 를 볼 것.

---

## 증상 (오너 지적)

m-project `apps/bo` 화면설계서를 생성했더니:

1. **"왜 13개만 나오지?"** — bo 실화면은 43개(placeholder 제외)인데 캡처는 13개뿐(골든패스 12 + 로그인 1)에서 멈춤.
2. **"왜 다 기타야?"** — 캡처된 화면 전부 `domain`=none → 대시보드 화면설계서 탭에서 전량 "기타" 그룹에 뭉침.
3. **"왼쪽 내비가 거의 공통인데 화면마다 다 표시된다"** — 공통 UI(좌측 내비·상단바)를 화면마다 통째로 주석. 실측 결과 전체 주석의 **63%(1,382/2,200)가 공통 크롬**, 화면 고유 내용은 37%뿐. 오너 의도는 공통 부분을 "공통"으로 한 번만 묶는 것이었는데 반영 안 됨.
4. **"화면 크게 보기는 없나?"** — 대시보드 화면설계서 탭에 캡처 **확대 보기(라이트박스/줌)가 없음**. 이미지가 `MAX_CAPTURE_WIDTH`(1120px)·`75vh`로 캡되고 `<img>`에 클릭 확대 핸들러가 없어, 원본(1440×900) 세부를 화면 안에서 크게 볼 수 없다.

네 증상 모두 **조용한 축소/부풀림/제약**이었다 — 도구가 "화면 완료 / 검증 통과"로 보고해, 커버리지가 좁고(1) 그룹핑이 죽고(2) 주석이 공통 크롬으로 부풀고(3) 열람이 캡에 걸린(4) 사실이 산출물·뷰 표면에 드러나지 않았다.

---

## 근본 원인

### 결함 1 — SPA는 시나리오로만 커버되는데, 커버리지 하한/전수 유도가 없다

- bo는 `react-router` 없는 **상태 기반 SPA**: 모든 화면이 URL `/` 하나, 네비는 React 상태(아코디언 메뉴 클릭)로 전환된다.
- 그래서 capture의 두 자동 발견 경로가 **구조적으로 0건**을 낸다:
  - **URL 크롤**(`a[href]` 추적): 로그인 화면 외엔 따라갈 링크가 없다(메뉴가 `<button>` + 상태).
  - **routes-census 보조 시드**: `.spec/map/routes.json`은 Kotlin **REST 엔드포인트**(JSON API)라 화면이 아니다 → GET-safe 목록성 시드 0건.
- 결국 커버리지 = **호스트가 손으로 짠 시나리오 수**가 전부다. 이번엔 `screens.sweep.spec.ts` 골든패스 12개만 시나리오로 옮겨서 딱 그만큼만 나왔다.
- 도구는 "실화면이 43개인데 12개만 시나리오가 있다"는 **커버리지 갭을 계산·경고하지 않는다**. `unmatchedJsps`는 JSP 앱 전용 커버 지표라 SPA엔 무력(0건 = 전수처럼 보임).

### 결함 2 — 공통 크롬(좌측 내비·상단바)이 화면마다 통째로 반복 주석됨

캡처 엔진(`understand-screens-capture.mjs`)의 `EXTRACT_SELECTOR = 'a[href], button, input, select, textarea, [onclick]'`가 **페이지의 모든 인터랙티브 요소를 화면마다 전부** 주석으로 만든다. 앱 셸의 좌측 내비게이션·상단바처럼 **거의 모든 화면에 공통인 크롬**을 "공통 UI"로 분리(factoring)하는 로직이 주석 산출 단계에 없다.

m-project `apps/bo` 실측(43 실화면 · 2,200 주석):

| 구분 | 수치 |
|---|---|
| 공통 크롬(내비 리프·시스템/그룹 헤더 + 상단바) | **1,382 (63%)** |
| 실제 화면 내용 | 818 (37%) |
| 화면당 평균 | 크롬 32.1 vs 실내용 19.0 |

- 아코디언 내비라 **펼쳐진 시스템의 리프가 그 시스템 전 화면에 동일 반복**(징수분배 22 리프 → 22 화면 전부에 38 크롬). 화면 고유 내용이 크롬에 파묻힌다.
- 상단바 8종(내 승인함·개발 도크·로그아웃·탐색 필터·⌘K·근거 OFF·저장·이 화면 저장)은 43화면 전부 반복.
- 참고: 스킬 문서의 "공통 크롬 제외"는 `domain-assign`의 **도메인 투표**에만 적용되고, **주석 산출·화면설계서 표시**에는 없다.

**오너 의도(회상)**: 입력항목·버튼이벤트·링크 주석을 만들 때, 다수 화면에 공통으로 나오는 부분은 화면마다 반복하면 번잡하니 **"공통"으로 한 번만 묶는** 설계였는데, 현재 캡처는 좌측 내비가 거의 공통임에도 화면마다 모두 표시된다.

### 결함 3 — `assign-domains`의 배정 축이 전부 서버 렌더 신호에 의존

`domain-assign.ts`의 4축:
- ① 핸들러 근거 조인 — 주석 `handler.evidence[].file` → 확정 플랜 roots
- ② 뷰파일 조인 / ③ 뷰폴더 파생 / ④ 화면 id URL 경로 파생

SPA에선 **네 축 모두 신호가 없다**:
- 핸들러 확정 0%(React DOM 요소엔 서버 핸들러 근거가 없다 — client fetch는 routes.json과 조인 안 됨).
- JSP/뷰폴더 없음.
- 화면 id URL 경로 = `screen:(root)__s_<scenario>` → URL 부분이 `(root)` 하나라 ④가 플랜 키를 못 뽑음(시나리오 접미 `__s_trust-register`의 `trust`를 안 본다).

→ 43/43 미배정 → 전량 "기타".

### 결함 4 — 대시보드 화면설계서 탭에 캡처 확대 보기(라이트박스/줌)가 없음

> ⚠️ 이 결함은 **다른 패키지**다 — 캡처 도구(ktds-legacy-plugin)가 아니라 **understand-anything-plugin 의 대시보드**(`packages/dashboard/src/components/ScreenSpecView.tsx`). 화면설계서 산출물을 "보는" 쪽 문제라 같은 파일에 함께 정리한다.

- 캡처 이미지가 `MAX_CAPTURE_WIDTH = 1120` px + `maxHeight: "75vh"` 로 캡된다(원본 PNG 1440×900).
- 이미지 `<img>`(ScreenSpecView.tsx ~1123행)에 **클릭 확대 핸들러가 없다** — 라이트박스/줌/전체화면 미구현(클릭 핸들러는 코드뷰어 열기용뿐).
- 결과: 밀도 높은 백오피스 화면(폼·표)의 세부를 뷰 안에서 크게 볼 수 없어, 원본 PNG(`.understand-anything/screens/*.png`)를 따로 열어야 한다.

---

## 이번 세션의 수동 우회 (임시방편 — 근본 수정 아님)

1. **전수 커버**: `apps/bo/src/systems/{trust,royalty,center,rules}.tsx`에서 `placeholder:true` 제외 실화면 43개를 파싱 → 각 화면에 로그인+시스템확장+클릭+capture 시나리오를 **호스트가 생성**(`understanding.config.json`).
   - 상태 SPA라 **화면=시나리오 1:1 필수**(capture는 `page.url()`로 화면 id를 만드는데 URL이 항상 `/`라, 한 시나리오에 capture 여러 개 넣으면 서로 덮어씀 → 시나리오 id로만 구분됨).
   - 시스템은 로그인 직후 **전부 collapsed**라 각 시나리오에 `button[aria-expanded]:has-text("<시스템>")` 확장 클릭을 넣어야 함(초기엔 신탁관리가 기본 확장이라 가정했다가 6건 timeout — 오판).
2. **도메인 정밀 배정**: `assign-domains`를 못 쓰므로 `.spec/map/bo-screen-domain-map.json`(화면 key→플랜 도메인 키)을 손으로 작성해 `screens.json`의 `screens[].domain`에 직접 주입. `assign-domains`는 재실행 금지(주입값을 미배정으로 덮음).

우회 결과: 44화면 / 2208주석 / 설명 100% / 도메인 43/44.
**문제: 다음 사람이 이 리포에서 스킬을 그냥 돌리면 또 13개·전부 기타로 돌아간다.** 우회가 산출물에만 있고 도구엔 없기 때문.

---

## 수정 제안 (도구/스킬 레벨)

### 결함 1

- **A. SPA 네비 전수 유도**: capture 전, 프로젝트가 SPA면(라우트가 REST-only + `a[href]` 크롤 0건이면) "화면은 시나리오로만 커버된다"를 **명시 경고**하고, 실화면 후보 수를 추정해 커버리지 갭을 보고한다.
  - 가능하면 nav 정의(예: `systems/*.tsx`의 `{key,label}` 리프)에서 **시나리오 초안 자동 생성**을 옵션 제공(placeholder 필드 감지 제외). 최소한 스킬 문서에 "골든패스만 짜지 말고 전수 리프를 짜라"를 규율로 박는다.
- **B. 커버리지 지표 SPA 대응**: `unmatchedJsps` 외에, "발견된 nav 리프 대비 캡처된 화면" 비율을 SPA 지표로 산출·경고.

### 결함 2 (공통 크롬 분리)

- **F. 공통 크롬 검출·분리**: N개 화면 중 임계(예 ≥80%) 이상에 동일 `(kind, label, selector/href/formAction)`로 등장하는 주석을, 화면별 `annotations`에서 빼고 문서 1곳의 **"공통 UI(내비게이션·상단바)" 범례**로 승격. 아코디언처럼 시스템 단위로만 공통인 리프는 **시스템 스코프 공통**으로 별도 묶음(전역 공통과 구분).
  - 대안(구조 기반): 앱 셸의 **영역(region) 셀렉터**(예 `nav`, `header`, `[role=navigation]`, `.lc-nav`)를 config로 받아 그 안의 요소는 "공통 크롬"으로 태깅하고 화면별 표시에서 접는다. 빈도 기반보다 결정론적.
- **G. 표시 기본값**: 화면설계서 탭은 기본적으로 **화면 고유 내용 주석만** 배지로 그리고, 공통 크롬은 "공통 UI" 토글/별도 범례로 접어둔다(현재는 크롬이 배지 번호를 다 차지해 ①②③이 내비까지 밀림).
- mechanicalHash 영향: 공통 분리는 **표시/그룹핑 계층**에서 하고 기계 사실(주석 자체)은 보존하는 편이 안전(봉인 불변 유지). 또는 분리를 결정론 파생 단계로 두고 해시 재정의.

### 결함 3 (SPA 도메인 배정)

- **C. SPA용 배정 축 추가**: 화면 id의 **시나리오 접미(`__s_<id>`)** 또는 `scenario`/`title`을 토큰화해 확정 플랜 키와 매칭(예: `trust-register`→`trust`, `royalty-settlement`→`royalty`). ④ URL 축을 시나리오 축까지 확장.
- **D. 배정 힌트 입력 지원**: `config.screens` 또는 별도 override 파일로 **화면→도메인 매핑**을 결정론 주입하는 공식 경로(이번 수동 `bo-screen-domain-map.json`을 1급 입력으로 승격). `assign-domains`가 이 힌트를 최우선 축으로 소비하고 재실행해도 보존.
- **E. 조용한 실패 금지**: 배정 0/N이면 validate가 **경고가 아니라 눈에 띄게** 보고(현재는 "assign-domains로 재배정 가능" 정보성 한 줄이라 놓치기 쉬움).

### 결함 4 (대시보드 확대 보기)

- **H. 클릭 확대(라이트박스)**: `ScreenSpecView.tsx` 캡처 `<img>`에 클릭 핸들러를 달아, 오버레이로 **원본 크기 + 주석 배지**를 전체 표시하고 클릭/Esc 로 닫는다. 자족적 추가(understand-anything-plugin/packages/dashboard).
  - 보강: 오버레이 안에서 휠 줌/드래그 팬, 또는 최소한 `MAX_CAPTURE_WIDTH` 캡 해제한 100% 뷰. 접근성(포커스 트랩·Esc)도 함께.

---

## 재현 절차

```
# m-project에서
node .../understand-screens.mjs <root> scaffold   # baseUrl 8080 추정, scenarios []
# → routes census 269건 → 크롤 시드 0건 (REST뿐, 화면 아님)  ← 결함 1 신호
# 골든패스 12개만 시나리오 작성 후 capture → 13화면
# fill → merge → validate → "도메인 배정 0/13"  ← 결함 2
```

## 관련 파일

- 캡처 도구(ktds-legacy-plugin): `packages/legacy-core/src/screen-capture/{domain-assign,scaffold,discover}.ts`, `scripts/understand-screens-capture.mjs` — 결함 1·2·3
- 스킬(ktds-legacy-plugin): `skills/understand-screens/SKILL.md` (§Stage B 채움 계약 / 규모 게이트) — 결함 1·2·3
- 대시보드 뷰(understand-anything-plugin): `packages/dashboard/src/components/ScreenSpecView.tsx` (`MAX_CAPTURE_WIDTH`, 캡처 `<img>` ~1123행) — 결함 4
- 이번 우회 산출물(m-project): `.spec/map/bo-screen-{leaves,domain-map}.json`, `understanding.config.json`(screens.scenarios 43건)

---

## 수정 완료 (2026-07-23)

네 결함 모두 도구/스킬 레벨로 수정. 산출물이 아니라 **도구**에 우회를 편입해, 다음 사람이
리포에서 스킬을 그냥 돌려도 조용히 축소되지 않게 했다. 전 테스트 green(legacy-core 1447 ·
dashboard 388), 엔진 재빌드·대시보드 vite 빌드 exit 0.

### 결함 1 — SPA 커버리지 정직 경고 (경고+지표, 자동 시나리오 생성은 사람 몫)
- `scaffold.ts` — routes 존재 + GET-safe 시드 0건이면 `summary.spaSuspected=true` + 노트에
  "SPA 의심 — 골든패스만 짜지 말고 전수 화면을 시나리오로(1:1)". (test 2건)
- `understand-screens-capture.mjs` — 크롤이 발견한 앱 내부 내비 링크(`crawlNavKeys`)를 집계해,
  ≤1 + routes 존재면 캡처 요약에 **SPA 커버리지 갭 경고**(크롤/시나리오/시나리오정의 수 명시).

### 결함 2 — 공통 크롬 분리 (표시층 확장 + region 셀렉터 config)
- 엔진: config `screens.chromeSelectors`(기본 `nav/header/aside/[role=navigation|banner|complementary]`)
  → 캡처가 `el.closest(sel)` 로 각 요소에 `annotation.region` 태그를 결정론 기록.
  `region` 은 **mechanicalProjection 밖**이라 기존 산출물 해시 전부 불변(seededFrom 동형).
- 대시보드: `computeCommonHrefs`(링크 25%, 유지) 위에 `computeCommonChrome`/`isCommonChrome` 추가 —
  ① region 태그(구조 신호) 최우선 ② 비링크는 kind|label 80% 빈도 폴백(버튼 과잉 접기 방지).
  표뿐 아니라 **캡처 배지 오버레이도** 기본 접힘, "공통 UI(내비·상단바)" 토글로 함께 펼침. (test 4건)
- ★버튼 내비(SPA 좌측 메뉴)는 `kind:'action'`(href 없음)이라 구 링크 전용 접기가 안 걸렸던 게 근본 —
  region + 비링크 빈도 축이 이걸 잡는다.

### 결함 3 — SPA 도메인 배정 (override 힌트 + 시나리오 토큰)
- `domain-assign.ts` 축 추가:
  - **축 D** — `.spec/map/screen-domain-map.json`(화면 id→도메인 키) 1급 힌트, **최우선**·재실행 보존
    (수동 `screens[].domain` 을 assign 이 덮던 문제 해소 — 힌트가 파일에 산다).
  - **축 C** — 화면 id `__s_<scenario>` 접미·`scenario` 필드 토큰화 → 플랜 키 매칭(SPA URL=(root) 폴백).
  - **축 E** — assign/validate 가 0/N·저배정을 **눈에 띄게 경고** + 힌트 파일 경로 안내.
  - `byMethod` 에 `override`·`scenarioToken` 추가. (test 6건)

### 결함 4 — 대시보드 확대 보기 (라이트박스)
- `ScreenSpecView.tsx` — 캡처 우상단 "⤢ 크게 보기" → 원본 크기(크롭 없음) + 배지 오버레이
  전체화면 라이트박스. Esc/백드롭 클릭 닫기, 배경 스크롤 잠금, `role=dialog aria-modal`.

### 새 입력/설정 요약
- config: `screens.chromeSelectors: string[]`(기본 시맨틱 랜드마크 — 커스텀 셸은 클래스/id 추가).
- 힌트 파일: `.spec/map/screen-domain-map.json` = `{ "screen:...": "domainKey" }`(이번 수동
  `bo-screen-domain-map.json` 을 1급 입력으로 승격). assign-domains 최우선 축, 재실행 보존.
- 재캡처 필요: region 태그·SPA 커버리지 신호는 **새 capture** 부터 생긴다(기존 산출물은 대시보드
  빈도 기반 접기만 동작 — region 은 재캡처 시 채워짐, 해시는 불변).
