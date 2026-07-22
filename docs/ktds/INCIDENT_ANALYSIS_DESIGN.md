# 장애 분석 메뉴 설계서 — DS-APM RCA 리포트 → 해결방안 제시

> 상태: **제안 — 사용자 승인 전** (2026-07-22, **v2 — 실측 드롭 파일 반영 재작성**)
> 범위: 신규 최상위 메뉴 "장애 분석"(/incident) + 파이프라인 스킬 + 이력 원장.
> 규약: UA core 무수정(ktds-legacy additive), 각 Phase 완료 시 사용자 확인 정지.
> v1→v2: 입력 계약을 자체 제안 JSON에서 **DS-APM 실물 리포트(.md+frontmatter) 수용**으로 전환.

## 0. 배경 — 왜 별도 메뉴인가

DS-APM(SigNoz 포크, `../ds-apm`)이 장애 RCA 리포트를 분석 프로젝트 내 드롭 폴더
(가칭 `<projectRoot>/ds-hub/장애/`, **폴더명 미확정**)에 기록하면, 우리는 그 장애를
분석해 해결방안을 제시한다. 요청 세션(인테이크)에 파일을 넣는 것과 형태는 비슷하지만
분리하는 이유(사용자 결정 2026-07-22):

1. **성격이 다르다** — 요청 세션은 기획 유입(신규/변경 요구), 장애는 운영 유입(사고 대응).
2. **DS-APM 연계 확장 여지** — SOP 딥링크·RCA 이력 연동 등 기능이 이 메뉴에 붙는다.
3. **이력 관리 필요** — 변경·영향처럼 원장+스냅샷으로 장애 건별 이력을 남긴다.
4. **IA 관례 충족** — "메뉴 = 고유 산출물 1:1"(`RTM_TAB_DESIGN.md:108` 계열 관례).
   인테이크는 고유 산출물이 없어 메뉴가 반려됐지만, 장애 분석은 고유 산출물
   (`incident-history/` 원장 + 건별 해결방안서)이 생기므로 메뉴 신설이 관례에 부합한다.

## 1. 확인된 사실 (2026-07-22 실측)

### 1.1 ★ 드롭 파일 실물 — `2026-06-23_rca_checkout.md` (DS-APM 제공 예시)

`~/projects/ktds/apm-project/2026-06-23_rca_checkout.md` 실측(단, **다른 프로젝트를 분석한
예시** — 본문 file:line 은 우리 분석 대상이 아닌 레포의 경로):

- **형식 = 마크다운 + YAML frontmatter** (v1 에서 제안했던 JSON 아님):
  - frontmatter 5필드: `runId`(hex) · `service` · `createdAt`(RFC3339) ·
    `confidence`(high|medium|low) · `baselineCommit`
  - 본문 한국어 섹션 3개: `## 근본 원인` / `## 수정 제안` / `## 한계`
  - 파일명 패턴: `<YYYY-MM-DD>_rca_<service>.md`
- **file:line 근거는 본문 산문에 인라인** — "위치: pkg/…/sop_document.go:340
  (latestApprovedSOPDocumentByID), 같은 파일 311 (…), frontend/…/sopMetadata.ts:30 (…)"
  형태. 구조화 필드가 아니므로 **결정론 파서로 추출**해야 한다.
- **에러 로그가 없을 수 있다** — 예시의 한계 섹션: "에러 시그니처/로그가 비어 있어, 방금
  바뀐 코드의 잠재 결함을 근거로 추정함(실제 장애 재현 미확인)". 즉 RCA 는 ①실제 장애
  기반일 수도, ②코드 변경 추정 기반일 수도 있다 — 설계는 둘 다 수용해야 한다.
- **없는 필드**: incidentId·alertFingerprint·severity·errorLog·링크 — v1 제안에 넣었던
  이 필드들은 실물에 없다. 건 식별자는 **`runId`** 뿐이다.
- **한계 섹션은 신뢰도 정보** — "자동 적용되지 않음"(HITL)·미확인 사항 명시. UI/해결방안서가
  이를 삼키면 과신 유발 — 그대로 승계 표기해야 한다.

이 형식은 ds-apm 내부 구조와 일치: `RCAResult`(`pkg/ruler/coderca/rcaresult.go:12-19` —
RootCause/ProposedFix/Confidence/Limitations/BaselineCommit)를 md 로 렌더한 것.
confidence 클램프(high|medium|low, 미상→low)도 동일(`rcaresult.go:89-98`).

### 1.2 재사용할 검증된 자산

- **이력 원장 패턴**: `vite.config.ts:1404-1553` — `impact-history/ledger.json`(최신 앞,
  상한 50) + jobId 스냅샷 + WAL reconcile(서버 재시작 내구). **인테이크 코드영향(P6)이
  "스스로 같은 형식으로 원장에 남기는" 선례가 이미 있다**(`vite.config.ts:1404` 주석) —
  장애 분석도 같은 방식으로 impact 원장과 공존 가능.
- **영향 엔진**: `understand-impact.mjs:135-140` — `analyze --path <실존파일>` fail-closed.
  자연어를 받지 않으므로 시드 매핑은 host 몫(확인 게이트) — 기존 규약 그대로.
- **세션 워크스페이스**: `rtm/SessionView.tsx`(좌 270px 원장 + 우 콘텐츠),
  `ChangeImpactView.tsx:757` `lg:grid-cols-[270px_minmax(0,1fr)]` — 검증된 레이아웃.
- **헤드리스 LLM 실행 규약**: [[llm-common-refactor]] spawn/영속/모델 규약 — 해결방안서
  생성 단계가 따른다.
- 2026-07-20 라이브 실증: `.spec` 인용 유도 시 RCA 가 "영향 업무: order 도메인 flow"를
  `domain-map.json`·`fill/order.json` 인용으로 명시 — 비즈니스 영향 매핑이 연동 고유 가치.

### 1.3 메뉴 등록 표면 (Explore 실측)

- 신규 메뉴 = 4파일: `app/routes.tsx:21-50`(라우트) · `app/shell/NavRail.tsx:42-54`
  (NavItem push, **순서=push 순서**, 라벨은 한글 리터럴 하드코딩이 관례) ·
  `app/shell/menuIcons.tsx:87-112`(`iconForMode` case 추가) ·
  `app/viewModePaths.ts:8-19`+`store/types.ts:10-20`(ViewMode union). 모바일 `MobileTabBar.tsx` 미러.
- store 는 신규 슬라이스 파일 관례(`store/index.ts:5-11`) — `incident-slice.ts` 신설.
- **임의 디렉터리 열람 엔드포인트는 없다** — readdir 3곳 전부 고정 디렉터리 스코프.
  드롭 폴더 열람은 명시 엔드포인트 신설이 필수.
- 엔드포인트 추가 = `vite.config.ts:2606-2647` allowlist 체인 + 핸들러 블록
  (`:2833-2859` impact-history 핸들러가 템플릿).

## 2. 결정 (제안)

### 2.1 입력 계약 — DS-APM RCA 리포트를 실물 그대로 수용

**우리가 스키마를 발명하지 않는다 — DS-APM 실물(.md+frontmatter)이 계약이다.**

- **경로**: `<projectRoot>/ds-hub/장애/<YYYY-MM-DD>_rca_<service>.md` (폴더명 가칭 —
  DS-APM 측과 협의 후 확정, §5). 서버 코드에서는 **상수 1곳**(`INCIDENT_DROP_DIR`)으로
  격리해 경로 변경을 흡수한다.
- **필수 수용 조건(파싱 게이트)**: frontmatter 에 `runId`+`service` 존재, 본문에
  `## 근본 원인` 섹션 존재. 이를 못 넘는 파일도 **원장에 unparseable 로 기록**한다
  (ds-apm 의 "unparseable raw 미영속 → 디버깅 불가" 교훈의 역적용) — 원문은 보존,
  분석만 차단.
- **관용 파싱**: confidence 미상→low 클램프(ds-apm 과 동일 규칙), `## 수정 제안`/`## 한계`
  부재 허용(빈 값), frontmatter 여분 필드 무시(전방 호환 — DS-APM 이 severity·링크 등을
  추가해도 깨지지 않음).
- **건 식별자 = `runId`** (실물의 유일 키). 같은 서비스 재발 시 파일이 누적되므로
  파일명이 아닌 runId 로 중복 수령을 멱등 처리한다.
- **협의 항목(계약 문서에 명시, 현 설계는 없이도 동작)**: severity·알람 핑거프린트·
  에러 로그 원문·DS-APM 딥링크 URL 의 frontmatter 추가 여부.

### 2.2 산출물 — 메뉴 1:1 자산

- 원장: `.understand-anything/incident-history/ledger.json` (+ WAL, 상한 50) —
  impact-history 와 동형.
- 건별: `.understand-anything/incidents/<runId>/`
  - `report.md` — 드롭 파일 원문 사본(불변 보존)
  - `report.json` — 파싱 결과(frontmatter + 섹션 텍스트 + **추출된 file:line 후보 목록**)
  - `seed.json` — 시드 매핑 결과(후보별 census 대조 판정: matched | not-in-project | ambiguous)
  - `impact.json` · `impact-verify-report.json` — analyze 스냅샷(루트 슬롯 아닌 격리 보관)
  - `resolution.md` — 해결방안서(LLM, file:line 인용 필수)

### 2.3 파이프라인 — 신규 스킬 `understand-incident` + `scripts/incident.mjs`

단계(요청 세션과 동형의 스텝 게이트, 각 단계 결과는 건 디렉터리에 영속):

1. **① 수령** — 드롭 md 파싱(frontmatter+섹션 분리), 파싱 게이트 판정, `incidents/<runId>/`
   생성, 원문 사본. 결정론(CLI).
2. **② 시드 매핑** — 결정론 우선: `근본 원인`·`수정 제안` 본문에서 file:line 패턴
   (`경로.확장자:숫자`)을 정규식 추출 → census 실존 파일과 대조.
   - **basename 보조 매칭**(P1 픽스처 검증 실측): 실물 리포트의 `수정 제안`은 축약 표기
     (`sop_document.go:340` 처럼 basename 만)를 쓴다 — basename 이 census 에서 유일하면
     해당 파일로 해소, 다의면 ambiguous. "같은 파일 N" 앵포라는 무시해도 안전(시드는
     파일 단위라 이미 잡힌 경로에 흡수됨).
   - 판정 3종: **matched**(시드 확정) / **not-in-project**(이 프로젝트에 없음) /
     **ambiguous**(부분 일치 다수).
   - **전량 not-in-project 이면 "다른 프로젝트의 리포트일 수 있음" 경고** — 실측 예시가
     정확히 이 케이스(checkout 서비스 ≠ jpetstore). DS-APM 서비스→레포 매핑 오류를
     우리 쪽에서 감지하는 유일한 지점이다.
   - matched 0건 또는 ambiguous 존재 시 `[확인필요]` 사용자 확인 게이트(understand-impact
     의 host 역할 규약 그대로). **LLM 추측으로 시드를 만들지 않는다**(fail-closed).
   - 에러 로그가 없는 "코드 변경 추정" RCA(실측 한계 명시)도 이 경로로 동일 처리 —
     file:line 이 본문에 있는 한 시드는 나온다.
3. **③ 영향 분석** — `understand-impact analyze --path <시드>` 재사용(엔진 무수정).
   영향 API/DB/업무흐름/연관모듈 산출. 결과는 §2.2 스냅샷으로 격리 보관하고,
   인테이크 P6 선례대로 **impact 원장에도 같은 형식으로 append**(kind 구분 필드).
4. **④ 해결방안서** — LLM 이 `resolution.md` 작성. 근거 게이트([[rtm-change-menu-boundary]]
   교훈): 입력은 ①②③ 산출물로 한정("이 요약이 판단 입력의 전부" group-input 패턴),
   영향 단언은 ③ 엔진 결과만 인용, 코드 인용은 pre-cite 규약, 무근거 서술은 `[추정]` 표기.
   - 구성: 원인 요약 / 즉시 조치 / 근본 해결(수정 지점 file:line) / 영향 업무·데이터 /
     재발 방지 후보 / **한계 승계**.
   - **RCA `수정 제안`은 인용 표기로 승계**("DS-APM RCA 제안:")하고, `한계` 섹션은
     해결방안서 말미에 그대로 승계 + confidence 를 문서 머리에 표기 — "자동 적용되지
     않음"(HITL)·"실제 장애 재현 미확인" 같은 고지를 삼키지 않는다.
5. **⑤ 이력 확정** — incident-history 원장 append(status: done), 스냅샷 상한 관리.

### 2.4 메뉴 UI — /incident "장애 분석"

- NavRail 그룹 "요구·변경"(추적표·변경·영향 옆), 라벨 하드코딩 관례 준수, `iconIncident` 신설.
- 레이아웃: 좌 270px 장애 원장(최신 앞; 행 = 날짜·service·근본 원인 첫 문장 요약 +
  **confidence 배지**(high/medium/low — severity 는 실물에 없음) + 상태 배지(신규/분석중/
  완료/실패/unparseable)) + 우 콘텐츠(RCA 리포트 카드 → 시드·영향 SectionCard
  (ImpactStepView export 재사용) → 해결방안서 뷰어). `?id=<runId>` 쿼리로 건 전환
  (리마운트 없는 같은 페이지 쿼리 — 라우트 분리 반려 선례 준수).
- 배지: **재스캔**(앵커 vs census, ChangeImpactView 로직 이식) + **커밋 불일치**
  (`baselineCommit` ≠ 스캔 census.gitCommit 이면 "장애 분석 커밋과 스캔 커밋이 다름"
  경고) + **한계 고지**(한계 섹션 존재 시 리포트 카드에 접이식 표시, 기본 펼침).
- store: `incident-slice.ts` 신설(원장·활성 건·잡 폴링), `store/index.ts` extends/스프레드 2줄.

### 2.5 엔드포인트 (vite dev 플러그인)

| 엔드포인트 | 역할 |
|---|---|
| `GET /incident-drops` | 드롭 폴더 readdir+파싱(미수령분 목록, runId 멱등 대조) — 워처 불필요, 조회 시 스캔 |
| `POST /incident-run` | `{ runId, targetStep }` 단계 실행(수령→시드→분석→해결방안) |
| `GET /incident-status` | 진행 폴링(rtm-intake-status 동형) |
| `GET /incident-history` | 원장(lazy reconcile) |
| `GET /incident-history-item` | 건별 스냅샷(파일 화이트리스트: report.md/report.json/seed.json/impact 2종/resolution.md) |

전부 allowlist 체인 등재 + 토큰 게이트. 실행 뮤텍스는 **incident 전용 1개 신설**
(rtmTracker/impact 와 별개지만 동시 1건 제약은 동일 — 원장 UI 는 "중단됨" 정직 표기).

### 2.6 경계 — 기존 메뉴와의 관계

- **변경·영향과**: 그쪽은 "시드/자연어 → 영향 열람" 렌즈, 여기는 "장애 사건 단위 +
  해결방안 문서" 산출물. ③이 impact 원장에 kind 표기로 남으므로 변경·영향에서도
  보이되(최신 배지 계약 유지), 해결방안서는 장애 메뉴에만.
- **요청 세션과**: 해결방안이 코드 변경 요청으로 이어지면 "요청 세션으로 승격" 버튼
  (resolution.md 요지를 새 요청 원문으로 전달) — DS-APM 검토 접점 ③(RCA→RTM 인테이크
  유입)의 구현 자리. P6 선택 과제.

## 3. 함정 · 제약 (설계에 반영됨)

- **census 오염**: 드롭 폴더가 분석 프로젝트 루트 안이므로 **WALK_SKIP_DIRS 에 드롭
  폴더명 등재 필수**(정확일치 — `.spec.bak-*` 오염 사고와 동형 위험). 드롭이 .md 라
  article 계열 스캔에 섞일 위험도 동일. P2 에 포함.
- **다른 프로젝트 리포트 유입**: 실측 예시처럼 service 매핑이 어긋나면 본문 file:line 이
  전량 우리 census 에 없다 — ② not-in-project 전량 경고가 방어선. 침묵 진행 금지.
- **서빙 이중 등록**: 신규 파일 서빙 시 allowlist + `sync:demo` SPEC_FILES **양쪽** —
  빠지면 SPA 폴백 200+HTML 침묵 실종.
- **전역 뮤텍스**: 장애 다건 동시 분석 불가(한 건씩). 대기 표현은 "중단됨" 정직 표기.
- **impact 루트 슬롯**: ③은 루트 슬롯(`.spec/map/impact.json`) 을 스쳐가므로 실행 후
  스냅샷 격리 + 원장 세트 처리(최신 배지 어긋남 사고 방지, [[wt-views-impact-history]]
  불변식).
- **파일명 파싱 의존 금지**: 날짜·service 는 frontmatter 가 정본(파일명은 표시용) —
  파일명 규칙이 바뀌어도 깨지지 않게.
- **locale parity**: 메뉴 라벨은 하드코딩 관례를 따르되, i18n 키를 추가하는 경우
  `locales/parity.test.ts` 전 로케일 등재 필요.

## 4. 구현 단계 (Phase — 각 단계 완료 시 정지·사용자 확인)

| Phase | 내용 | 비고 |
|---|---|---|
| P1 | 계약 문서화: 실물 형식 명세 + jpetstore 픽스처 2건(①본문 file:line 이 jpetstore 실존 파일인 정상 건 ②실측 예시 같은 not-in-project 건) | 폴더 경로·frontmatter 확장은 **DS-APM 측(박진혁) 협의 항목** |
| P2 | `incident.mjs` CLI(ingest/seed/analyze/resolve) + `understand-incident` SKILL + WALK_SKIP_DIRS | 엔진 무수정 게이트 확인 |
| P3 | vite 엔드포인트 5종 + incident-history 원장(WAL) | impact-history 이식 |
| P4 | 메뉴 UI(등록 4파일 + incident-slice + IncidentView) | 좌원장/우콘텐츠 |
| P5 | 데모 시드(jpetstore 픽스처) + 라이브 e2e + 시각 QA | rtm-qa 레시피 준용 |
| P6(선택) | 요청 세션 승격 버튼 | RTM 인테이크 유입 접점 |

## 5. 미해결 (사용자/외부 결정 대기)

1. **드롭 폴더 경로·이름** — `ds-hub/장애/` 는 가칭(한글 폴더명 여부 포함). DS-APM 측 확정 필요.
2. **푸시 방식** — 파일 드롭(현 가정, 실물 파일 존재로 사실상 확인) 시 DS-APM 이 분석
   프로젝트 파일시스템에 쓸 수 있어야 함(동일 호스트/볼륨 전제 — 계약 문서에 명시).
3. **frontmatter 확장** — severity·알람 핑거프린트·에러 로그·딥링크 URL 추가 협의(§2.1).
4. **sync:demo/커밋 정책** — 드롭 폴더·incident 산출물을 데모 vendoring 에 포함할지.
5. **메뉴명** — "장애 분석" 가칭(장애 대응/장애 처리 대안).
6. **알림** — 새 드롭 감지 시 대시보드 배지/알림 여부(1차는 조회 시 스캔만).

---

## 추기 — 영향 이력 연합으로 이중 기록 폐지 (2026-07-22)

본 문서의 "impact 원장에도 같은 형식으로 append"(§2.3-③·§2.6 '한 번 돌리고 두 곳에서 본다')는
`IMPACT_LEDGER_FEDERATION_DESIGN.md` 로 **대체됐다**: analyze 는 `incidents/<runId>/` 정본과
incident-history 원장만 기록하고(jobId 는 병합 키로 원장에 잔존, `analyzedAt` 추가),
변경·영향 메뉴 노출은 대시보드 서버의 **읽기 시점 병합**이 맡는다. 열람 UX(변경·영향에서
`[장애]` 행 확인)는 동일하되 기록 주체가 원장별 1로 좁혀져 무잠금 경합·수명 불일치가 제거됐다.
