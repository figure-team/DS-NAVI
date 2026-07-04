# W5 설계 — RTM ↔ 테스트 시나리오 연계 + RTM 잔여(R6/R7)

> 작성: 2026-07-05 · 브랜치: `feat/si-expansion` · 로드맵: `SI_EXPANSION_ROADMAP.md` P6(W5)
> 선행: `RTM_TAB_DESIGN.md`(v2 모델 §5.1 `_fields` 예약, R6/R7 정의), `RTM_HANDOFF.md`(잔여 목록)
> 목적: RTM 기능 행별 단위테스트 시나리오 초안(정상/예외/경계, 전부 [추정]) — 요구사항↔테스트 추적성. RTM 잔여 R6(시각QA)·R7(사용자 정의 필드) 흡수.

## 1. 목표·수용 기준 (로드맵)

- ① jpetstore RTM 실측 **기능 행 전체**에 시나리오 생성(0건 행 없음 — 침묵 누락 금지).
- ② 시나리오 행 단위 **확정 라운드트립** 동작(기존 rtm-overrides 추정→확정 재사용).
- ③ **시각QA(playwright) 통과**(R6) — RTM 탭 주요 화면 헤드리스 검증.
- ④ R7 사용자 정의 필드 — §5.1 예약 슬롯(`_fields`) 활성화(추가/삭제 UI + 값 편집).

## 2. 생성 방식 — 결정론 템플릿 (LLM 불요)

RTM 기능 행에는 이미 결정론 시드가 있다: `entryPoint`(라우트+method), `implementation`(파일), `data`(테이블×CRUD), 연관 요구의 `acceptanceCriteria[].kind`(branch/precondition/postcondition/exception/rule). 레포 관례상 **코드 근거가 있으면 결정론 생성**(LLM 은 근거 없는 TO-BE 전용 — RTM_STEP_FLOW_DESIGN §"LLM이 채우는 이유")이므로 시나리오 초안은 템플릿 인스턴스화로 만든다. 단 시나리오는 검증 전 초안이므로 **전부 `INFERRED`([추정])**, 근거는 원천 셀의 evidence 승계.

행당 생성 규칙(종류별 결정론, 시드 없으면 생략 대신 축소형 생성 — 0건 행 금지):
| 종류 | 시드 | 템플릿(요지) |
|---|---|---|
| 정상(normal) | entryPoint(라우트) + data(CRUD) | Given 유효 입력 → When `<METHOD> <path>` 호출 → Then 정상 응답 + `<테이블(CRUD)>` 반영 |
| 예외(exception) | AC kind=exception(있으면 AC 문장 인용), 없으면 필수입력 누락/권한 없음 일반형 | Given 부적합 입력/상태 → When 호출 → Then 오류 처리(AC: "…") |
| 경계(boundary) | data 존재 시 0건/최대치, entryPoint 파라미터 유무 | Given 경계 데이터(0건·최대) → When 호출 → Then 안전 처리 |

- entryPoint 없는 행(서비스/공통): When 을 "핵심 메서드 직접 호출(구현: `<파일>`)"로 축소 생성 + notes `[미확인] 진입점 없음 — 절차는 사람 보강`.
- 시나리오 ID: `TS-<fnId>-<N|E|B><seq>` (fnId 는 이미 안정 id — 재스캔 안정, 내용 아닌 좌표 기반).
- AC 연계: exception 시나리오는 원 AC id 를 `acId` 로 기록(요구↔AC↔시나리오 추적선). AC.tests[](TestRef, 결과 기록)와는 별개 축 — 시나리오=설계 초안, TestRef=수행 결과(기존 모델 유지, 시나리오 확정 후 caseId 로 TestRef 연결은 사람 몫·범례 안내).

## 3. 데이터 모델 — rtm.json `testScenarios[]` (top-level)

```jsonc
// RtmModelSchema 에 optional 추가(schemaVersion 2 유지 — 하위호환 확장)
"testScenarios": [ {
  "id": "TS-FN-001-N1",
  "fnId": "FN-001", "reqId": "REQ-…"|null, "acId": "AC-…"|null,
  "kind": "normal"|"exception"|"boundary",
  "title": "주문 생성 정상 처리",
  "given": "…", "when": "…", "then": "…",       // 3열 편집 단위
  "confidence": "INFERRED",                        // 확정 시 오버레이가 CONFIRMED 승격
  "evidence": [{ "file": "…", "line": 1 }],       // 원천 셀 evidence 승계
  "notes": ["[미확인] …"]                          // 축소 생성 사유 등
} ]
```

- 생성기: `rtm/test-scenarios.ts` `buildTestScenarios(model: RtmModel): RtmTestScenario[]` — buildRtm→applyRequirements 뒤, applyOverlay 앞에서 호출(understand-rtm.mjs 파이프라인). 순수·결정론(정렬: fnId, kind(N<E<B), seq).
- 커버리지: `coverage.tests` 는 기존 TestRef 축 유지. 시나리오 축은 `coverage.scenarios { total, byKind, confirmed }` 추가(있으면 UI 타일).

## 4. 확정 라운드트립 — 오버레이 `_scenarios` 섹션

- `.understand-anything/rtm-overrides.json` 에 예약 접두 관례로 `_scenarios` 추가:
  `{"_scenarios": {"<tsId>": {"editedCells": {"title"?/"given"?/"when"?/"then"?}, "approver", "at", "audit": []}}}` — 기존 `_requirements` 와 동형. `apply-overlay.ts` `splitOverlay` 가 `_` 키를 이미 스킵하므로 하위호환.
- `applyOverlay` 확장: `_scenarios` 를 model.testScenarios 에 병합 — 편집 셀 덮어쓰기 + **해당 시나리오 confidence → CONFIRMED**(기능 행과 달리 시나리오는 확정=검토 완료 의미 명확, 근거는 승계분 유지). 미존재 tsId 는 무시 대신 diagnostics 경고(스캔 재생성으로 사라진 초안 표면화).
- dev 엔드포인트: `POST /rtm-scenario-override` (vite.config.ts — `/rtm-override` 와 동형: tsId 존재 검증·editedCells 화이트리스트·approver 필수·audit append-only).

## 5. 산출물 — SI 문서 + xlsx

- **si-단위테스트시나리오** (DOC_SET 13종째, W4 패턴 재사용): `DocInput.rtm?: RtmModel` 추가(understand-docs.mjs 가 rtm.json 로드 — rtm.xlsx 용으로 이미 읽음), `buildSiTestScenarios(input)` — §1 작성 기준(생성 규칙·[추정] 안내·TestRef 연결 안내), §2 시나리오 원장 표(시나리오ID·기능ID·기능명·요구ID·구분·제목·Given·When·Then — 확정 행 [확정]/초안 [추정], evidence 승계), §3 커버리지(행당 3종 충족·축소 생성 카운트). 템플릿 `templates/doc/test-scenarios.md`. xlsx 는 docToSheets 자동.
- **rtm.xlsx 5번째 시트** "테스트 시나리오"(rtmToSheets 확장, `RtmLike.testScenarios` optional) — 원장 내보내기 일관성.

## 6. 대시보드 — RtmView 시험 서브뷰 + R7 필드

- **시험 서브뷰**: view 토글에 4번째 탭 `시험`(기능/요청/현황과 병렬). 기능별 그룹 표(시나리오ID·구분·제목·G/W/T·상태[초안/확정]) + 행 클릭 → 드로어에서 G/W/T 편집 → 확정(`POST /rtm-scenario-override`, 승인자 resolveApprover 재사용). FunctionDrawer 에도 해당 기능 시나리오 요약 카운트 배지.
- **R7 사용자 정의 필드**(§5.1 활성화): 필드 정의는 `_fields` 섹션(`{id: "custom:<slug>", label, scope: "function", createdBy, at}`), 행 값은 기존 `editedCells["custom:<id>"]`(스키마 이미 수용 — record(string,string)). UI: 기능 뷰 표 헤더 끝 `+필드` 버튼(라벨 입력→정의 등록), 커스텀 열 헤더 메뉴로 삭제(정의만 제거, 값 비파괴 보존 — §5.1). 값 편집은 기존 셀 편집·확정 경로 그대로. 엔드포인트: `POST /rtm-override` 에 `kind: "field-def"` 분기(정의 추가/삭제, audit 기록). applyOverlay 가 `_fields` 를 `model.customFields[]` 로 노출 + 행 `custom` 값 병합.
- xlsx: 커스텀 필드는 기능(AS-IS) 원장 시트에 동적 열로 추가(rtmToSheets — 정의 순).

## 7. R6 — RTM 탭 시각QA(playwright)

- `scripts/qa-rtm-visual.mjs`(신규): legacy-core `loadPlaywright()` + screens-capture 의 launch/context/screenshot 패턴 재사용. dev 서버(고정 토큰·`--strictPort` 별도 포트, jpetstore 데이터) 대상.
- 시나리오: ①`/rtm?token=…&onboard=skip` 기능 뷰 렌더(행>0·4축 셀) ②시험 탭 → 시나리오 표 렌더 ③드로어 열기(evaluate 클릭) ④시나리오 확정 1건(승인자 주입) 후 [확정] 반영 ⑤`+필드` 로 커스텀 열 추가·값 편집 반영 ⑥각 단계 스크린샷 `.understand-anything/qa/rtm-*.png` + console error 0 단언.
- 실행 전제(HANDOFF §헤드리스 QA): CJK 폰트(fonts-noto-cjk), chromium executablePath 캐시, onboarding localStorage 억제 — 스크립트 헤더에 문서화. CI 아닌 수동 QA 게이트(실측 단계에서 실행·스크린샷 육안 확인).

## 8. 검증

- 생성기 단위테스트: 픽스처 RTM 모델(entryPoint 유/무, AC exception 유/무, data 유/무 분기) → 행당 3종·축소형·ID/정렬 결정론·2회 byte-diff=0.
- 오버레이 테스트: `_scenarios` 병합(확정 승격·미존재 tsId 경고·audit), `_fields` 정의/값 병합, 기존 오버레이 회귀(805~ 기존 rtm 테스트 유지).
- xlsx: rtmToSheets 5시트·커스텀 열 스냅샷. 문서: si-단위테스트시나리오 골든 + doc-set 라운드트립.
- 실측: jpetstore rtm.json 재생성 — 기능 행 전체 시나리오 보유 확인, 확정 1건 라운드트립, R6 스크립트 통과.

## 9. 단계

- P6-a: 본 설계문서 ✅
- P6-b: 엔진 — 스키마 + test-scenarios.ts + applyOverlay(`_scenarios`/`_fields`) + coverage.scenarios + understand-rtm.mjs 배선 + 테스트
- P6-c: 산출물 — DocInput.rtm + si-단위테스트시나리오 + 템플릿 + rtmToSheets 5시트/커스텀 열
- P6-d: 대시보드 — 시험 서브뷰 + 시나리오 확정 + R7 필드 UI + dev 엔드포인트
- P6-e: R6 시각QA 하네스 + jpetstore 실측 + 적대적 리뷰 2종 → 사용자 컨펌

## 10. 백로그(선반영 안 함)

- 시나리오 → AC.tests[] caseId 자동 연결(수행 결과 기록은 사람/도구 몫 — 범례 안내만).
- LLM 보강 레인(시나리오 문장 자연화) — 결정론 초안 위 선택 단계, W10 골든셋 이후.
- R6 의 CI 상시화(현재 수동 QA 게이트).

## 11. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| P6-a 설계 | ✅ | | 본 문서 |
| P6-b 엔진 | ⬜ | | |
| P6-c 산출물 | ⬜ | | |
| P6-d 대시보드 | ⬜ | | |
| P6-e 시각QA+실측+리뷰 | ⬜ | | |
