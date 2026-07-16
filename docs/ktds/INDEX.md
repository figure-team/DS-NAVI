# docs/ktds 설계문서 인덱스

> 갱신: 2026-07-16. 문서가 많아 최신/낡음 혼동이 생겨 상태를 명시한다.
> 규칙: **새 설계문서를 추가·은퇴시키면 이 인덱스도 갱신할 것.** 설계문서는 demo 트리에만 존재(main은 lean).

## 현행 — 지금 기능의 단일 참조 (질문·작업 시 이 문서부터)

| 문서 | 주제 | 비고 |
|---|---|---|
| `PIPELINE_ORDER.md` | 기능(스킬) 실행 순서·데이터 의존·일관성 장치 | 순서 질문의 단일 참조 |
| `STRUCTURE_FROM_MAP_DESIGN.md` | 구조 탭 = map 기반 4뎁스 그래프 (v2) | v1(파일/클래스 KG안)은 폐기, git 이력에만 |
| `DATA_MAP_REDESIGN_DESIGN.md` | 데이터 맵(/data) 5탭·ERD | §7 코드탭 제거·§11 ERD 2차 결정 기록 |
| `DOMAIN_HIERARCHY_DESIGN.md` | 도메인 계층(그룹/서브도메인) | mmobile 13그룹/84서브 랜딩 |
| `UNDERSTAND_LITE_DESIGN.md` | /understand lite 기본값 | 기각 대안 기록 포함 |
| `UNDERSTAND_SCALE_WORKFLOW_DESIGN.md` | 대규모 Phase2 Workflow 팬아웃 | v2.1 |
| `RTM_INTAKE_ANSWER_DESIGN.md` | ①식별 [확인필요] 답변 경로 (A1~A7) | 구현 완료(ktds.21), §9.1 시각QA 미실측 |
| `RTM_INTAKE_WORKSPACE_DESIGN.md` | 새 요청 = 추적표 "요청 세션" 탭 워크스페이스 | 사용자 확정, W1~W5 구현 대기 |
| `RTM_IMPACT_GATE_DESIGN.md` | 인테이크↔impact 근거 게이트 (2차 개정판) | **제안 상태 — 사용자 승인 전** |
| `FEATURE_VERIFICATION_GUIDE.md` | 전 기능 점검 절차 | ⚠️ emit을 fill 없이 돌리면 그래프 클로버 주의 포함 |
| `VERSION_TRACKING.md` | 버전 체계 | Scheme A(5파일)+Scheme B(2파일) |
| `front-redesign/` (pmpl-proto.html 등) | 디자인 프로토 원본 | 신규 메뉴 탭/표 스타일의 수치 기준 |
| `rtm-proto.html` | RTM v2 UI 프로토 | RtmView가 이와 동형 |

## 완결 — 구현 끝, 이력·결정 근거 참조용 (현행 코드와 다를 수 있음 — 코드가 진실)

- **SI 확장 P1~P10 계열**: `SI_EXPANSION_ROADMAP.md`(ledger) · `INTERFACE_SCAN_DESIGN.md` · `BATCH_SCAN_DESIGN.md` · `PROGRAM_INVENTORY_DESIGN.md` · `RISK_REPORT_DESIGN.md` · `WORK_SUMMARY_DESIGN.md` · `INCREMENTAL_SCAN_DESIGN.md` · `COVERAGE_MATRIX_DESIGN.md` · `GOLDEN_SET_DESIGN.md` · `XLSX_EXPORT_DESIGN.md` — P11(멀티 시스템 맵)만 사용자 보류
- **문서·정책 계열**: `DOC_GENERATION_DESIGN.md` · `POLICY_DOC_DESIGN.md` · `POLICY_DOMAIN_DESIGN.md`(SI 정책 정의서 §0~§8) · `NODE_DETAIL_EDIT_DESIGN.md` · `DOMAIN_MAP_DETAIL_DESIGN.md`(§9/§10 codegraph 평가)
- **RTM 계열**: `RTM_TAB_DESIGN.md`(:108 "탭=렌즈" IA 관례의 출처 — 이 조항은 여전히 구속력) · `RTM_STEP_FLOW_DESIGN.md` · `RTM_TEST_SCENARIO_DESIGN.md`
- **대시보드 계열**: `FRONT_REDESIGN_DESIGN.md`(:57↔:290 라우트 분리 반려 이력의 출처) · `WORK_MAP_DESIGN.md`(§8 ledger) · `IMPACT_ANALYZE_BUTTON_DESIGN.md`
- **기록**: `IMPLEMENTATION_PROGRESS.md`(Code Atlas P0~P6 커밋표) · `COVERAGE_MATRIX.md`(생성물 — **손편집 금지**, drift CI 검사) · `evidence/`

## ⚠️ 낡은 서술 주의 (알려진 드리프트 — 인용 전 확인)

- `RTM_HANDOFF.md` — 2026-06-24 스냅샷. 이후 rtm/ 15파일 분할·v2 UI·5단계 인테이크·답변 경로로 대개편됨. 개념 모델(§1·§3 연산 단일소스)만 유효, 커밋표·UI 서술은 낡음.
- `RTM_STEP_FLOW_DESIGN.md:143` — 세션을 `rtm-intake/session.json` 단일 파일로 그리나 구현은 `rtm-intake/<sid>/session.json`(복수). "단일 세션" 근거로 오용 금지.
- `RTM_TAB_DESIGN.md:145/148-149/264` — 인테이크가 impact 엔진으로 [확정] 근거 산출한다고 규정했으나 미구현(이 드리프트가 `RTM_IMPACT_GATE_DESIGN.md`의 주제).
- `STRUCTURE_FROM_MAP_DESIGN.md` 이전의 구조 탭 서술 전반(구 `/structure` 라우트, KG 뷰) — 라우팅 통일로 `/domains?tab=structure`가 현행.
