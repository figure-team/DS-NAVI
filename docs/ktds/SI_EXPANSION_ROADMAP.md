# DS-NAVI 기능 확장 로드맵 — SI/ITO PM·PL 실무화

> 작성: 2026-07-04 · 브랜치: `feat/si-expansion` (base: demo/jpetstore-6)
> 배경: PM/PL 관점 기능 점검 결과, "코드 이해"는 완성 단계이나 "관리·정량화·보고"와 분석 커버리지 사각지대(인터페이스·배치)가 비어 있음.
> 범위 확정: 점검 보고서 3장(추가 서비스) 전체 7건 + 4장(보완) 중 **보안 게이트 제외** 4건 + RTM 잔여(R6/R7, e2e).

## 0. 진행 원칙

- **단계 게이트**: 워크스트림마다 ①상세 설계문서(`docs/ktds/*_DESIGN.md`) → ②구현 → ③jpetstore(필요시 eGov cop) 실측 검증 → ④사용자 컨펌 후 다음으로.
- **브랜치**: `feat/si-expansion`에서 개발 → 워크스트림 완결 시 demo/jpetstore-6 머지 → 기능 커밋만 main cherry-pick(관례 유지).
- **결정론 우선**: 스캐너류는 동일 commit에서 byte-diff=0. LLM 보강은 [추정] 마킹 + file:line 근거 필수(기존 관례).
- **산출물 원장**: 각 워크스트림 산출물은 `.spec/` 하위 JSON(기계) + md(사람) 이원화, 기존 doc-state 확정 플로우 재사용.

## 1. 워크스트림 정의

### W1. 인터페이스 정의서 — `분석 커버리지`
- **목적**: 대외/대내 연계 전수 추출 — HTTP 클라이언트 호출(RestTemplate/WebClient/HttpClient/feign), DB link, 파일 송수신, MQ(JMS/Kafka), 소켓.
- **확장 지점**: `legacy-core/src/interface-scan/`(신규) — 기존 census·call-chain 스캐너 패턴 재사용. `/understand-map`에 `interfaces` 단계 추가 or 독립 `/understand-interface`.
- **산출물**: `.spec/map/interfaces.json` + 인터페이스 정의서 md(방향·프로토콜·엔드포인트·데이터·호출 위치 file:line). 대시보드 산출물 탭 노출.
- **수용 기준**: 픽스처(`fixtures/interface-scan/`) 스냅샷 전수 green + jpetstore 0건 음성 케이스 고정(조사 결과 jpetstore는 outbound 신호 없음) + eGov cop 실측, byte-diff=0, 미해석 항목은 [미확인]으로 남김(침묵 누락 금지). 상세: `INTERFACE_SCAN_DESIGN.md`.

### W2. 배치/스케줄 잡 인벤토리 — `분석 커버리지`
- **목적**: cron/Quartz/`@Scheduled`/shell 잡 전수 추출. 도달성 분석의 "진입점 없음=데드코드" 오판 해소(배치 진입점 등록).
- **확장 지점**: `legacy-core/src/batch-scan/`(신규). 도달성 스캐너에 배치 진입점 주입.
- **산출물**: `.spec/map/batch-jobs.json` + 배치 정의서 md(잡명·트리거·주기·진입점·콜체인 요약).
- **수용 기준**: jpetstore(배치 적으면 fixture 보강) + eGov cop 실측. 도달성 리포트에서 배치 코드가 데드코드로 분류되지 않음을 회귀로 고정.

### W3. 프로그램 목록 + 규모·공수 산정 근거 — `정량화`
- **목적**: 감리 필수 '프로그램 목록'(화면/서비스/배치/공통) + FP 산정 기초자료(트랜잭션 기능 후보=라우트·화면, 데이터 기능 후보=테이블) 자동 추출.
- **확장 지점**: census+routes+db-schema+W1/W2 결과 취합 리포트 — `legacy-core/src/program-inventory/`(신규).
- **산출물**: `.spec/map/program-inventory.json` + 프로그램 목록 md + FP 후보 집계표(단순/보통/복잡 분류는 [추정] 마킹).
- **의존**: W1, W2 (연계·배치 프로그램 유형 포함 위해).
- **수용 기준**: jpetstore 22화면 실측치와 화면 수 일치, 테이블 수 = db-schema와 일치.

### W4. 위험 모듈 리포트 — `정량화`
- **목적**: 복잡도(순환복잡도 근사)·파일 크기·중복·미도달 코드·git 변경 빈도·콜 팬인/팬아웃을 합산한 "위험 Top N". PM 주간보고용 숫자.
- **확장 지점**: `legacy-core/src/risk-report/`(신규). tree-sitter 기반 복잡도 근사 + `git log --numstat` 수집.
- **산출물**: `.spec/report/risk.json` + md 리포트 + 대시보드 구조탭 위험 오버레이(선택, 영향도 오버레이 패턴 재사용).
- **수용 기준**: 지표별 계산 근거 문서화, 동일 commit 결정론(git 지표는 커밋 범위 고정 시).

### W5. RTM ↔ 테스트 시나리오 연계 + RTM 잔여 — `요구사항 심화`
- **목적**: RTM 행(요구사항)별 단위테스트 시나리오 초안 생성(정상/예외/경계, 전부 [추정]) → 요구사항-테스트 추적성 확보. RTM 잔여 R6(시각QA)·R7(사용자필드) 흡수.
- **확장 지점**: `legacy-core/src/rtm/` 확장 + RtmView에 테스트 열/서브뷰.
- **산출물**: rtm.json에 `testScenarios[]` + 테스트 시나리오 md. 확정 플로우는 기존 행단위 추정→확정 재사용.
- **수용 기준**: jpetstore RTM 실측 행 전체에 시나리오 생성, 확정 라운드트립 동작, 시각QA(playwright) 통과.

### W6. 주간/월간 실적 요약 — `보고`
- **목적**: 기간(git 범위) diff → 작업 실적·변경 모듈·RTM 진척(추정→확정 전환 수)을 사람 말로 요약. `next-weekly-review.md` 흐름의 일반화.
- **확장 지점**: `/understand-diff` 확장 or `/understand-report`(신규 스킬). 결정론 수집(커밋·파일·RTM 상태 diff) + LLM 요약(마킹).
- **수용 기준**: 이 레포 자체 최근 1주로 실측, 커밋에 없는 내용 날조 0(요약은 수집된 사실만 인용).

### W7. xlsx 내보내기 — `산출물 포맷`
- **목적**: 발주처 제출용 — RTM·인터페이스 정의서·프로그램 목록·테이블 정의서를 xlsx로. (hwp는 hwpx 검토 후 별도 판단, 이번 범위는 xlsx 우선.)
- **확장 지점**: `legacy-core/src/export/` 확장(exceljs 등 의존성 1개 추가, vendor-deps 반영). 대시보드 ExportMenu 연동.
- **의존**: W1, W3 (내보낼 산출물이 먼저 존재해야 실익).
- **수용 기준**: 4종 산출물 xlsx 생성, 열 구성은 SI 표준 양식 근사, LibreOffice 열림 확인.

### W8. 증분 분석 — `플랫폼`
- **목적**: 변경 파일만 재분석. 실 SI 수천~만 파일 대응. 캐시 키=파일 해시, 산출 JSON은 파일 단위 파티션+머지.
- **확장 지점**: `/understand-map` 파이프라인에 캐시 레이어(`.spec/cache/`). 스캐너별 무효화 규칙(콜체인은 양끝 파일 변경 시).
- **의존**: W1/W2 스캐너 완성 후(스캐너 추가마다 캐시 규칙 재작업 방지).
- **수용 기준**: eGov cop에서 1파일 수정 후 재실행 시간 ≤ 전체의 20%, 결과는 full 재실행과 byte-diff=0.

### W9. 언어 커버리지 매트릭스 + degrade 정의 — `플랫폼`
- **목적**: 언어/프레임워크(Java/Spring/MyBatis/JPA/JSP/eGov 세대/Pro*C…)별 스캐너 지원 수준 명시. 미지원 신호 감지 시 침묵 누락 대신 "커버리지 리포트에 미지원 N건" 명시.
- **산출물**: `docs/ktds/COVERAGE_MATRIX.md` + coverage-report에 미지원 카운트 통합.
- **수용 기준**: jpetstore·eGov cop 두 타깃에서 매트릭스 자동 검증 스크립트 통과.

### W10. LLM 보강부 정확도 골든셋/회귀 — `품질`
- **목적**: LLM 보강 산출물(정책서 서술·RTM 분해·도메인 요약)의 오류율 측정 체계. jpetstore 골든셋(사람 확정본) 대비 채점.
- **산출물**: `fixtures/golden/` + 채점 스크립트(구조 일치율·근거 유효율(file:line 실존)·핵심 항목 재현율).
- **수용 기준**: 지표 3종 산출 + 기준선 기록, 이후 변경 시 회귀 비교 가능.

### W11. 멀티 시스템 맵 — `장기`
- **목적**: 시스템(레포) 여러 개의 `.spec/`을 연합 — W1 인터페이스의 상대 엔드포인트 매칭으로 시스템 간 연계 지도.
- **의존**: W1 필수. 타깃 2개(jpetstore + eGov cop)로 최소 실증.
- **수용 기준**: 2-시스템 인터페이스 매칭 데모 + 대시보드 시스템 레벨 뷰(최소: 도메인맵 상위 계층).

## 2. 단계화 (의존성 순)

| 단계 | 워크스트림 | 근거 |
|---|---|---|
| P1 | W1 인터페이스 정의서 | 사각지대 1순위, W3/W7/W11의 선행 |
| P2 | W2 배치 인벤토리 | W1과 같은 스캐너 계열, 도달성 오판 해소 |
| P3 | W3 프로그램 목록/FP | W1·W2 취합, PM 정량화 시작 |
| P4 | W7 xlsx 내보내기 | 내보낼 산출물(RTM+W1+W3) 확보 직후가 최적 |
| P5 | W4 위험 리포트 | 독립적, P3와 병행 가능 |
| P6 | W5 RTM 테스트 연계+잔여 | RTM 계열 묶음 처리 |
| P7 | W6 실적 요약 | 독립적 |
| P8 | W8 증분 분석 | 스캐너 확장 완료 후 |
| P9 | W9 커버리지 매트릭스 | 스캐너 확정 후 문서화가 정확 |
| P10 | W10 정확도 골든셋 | LLM 산출물 안정화 후 |
| P11 | W11 멀티 시스템 맵 | 장기, 최후 |

## 3. 진행 현황 (ledger)

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 로드맵 | ✅ 작성 | - | 본 문서 |
| P1 W1 | ✅ 완료(리뷰 통과) | 410f9c7~8f5ffdb | 실측·결정론 검증 + 적대적 리뷰 2종(비평 8건 중 5건 반영·3건 백로그, 코드 7건 전건 수정) — `INTERFACE_SCAN_DESIGN.md` §9~10 |
| P2 W2 | ✅ 완료(리뷰 통과) | 08ab1b7~ | 핸들러 해석·신호 6종·batch-jobs.json·SI 배치정의서 + 적대적 리뷰 2종 반영 — `BATCH_SCAN_DESIGN.md` §9~10 |
| P3 W3 | ✅ 완료(리뷰 통과) | fd3940e~ | 프로그램 74본·도메인 조인·FP 하한(미분류 표면화) + 적대적 리뷰 2종 반영 — `PROGRAM_INVENTORY_DESIGN.md` §9~10 |
| P4 W7 | ✅ 완료(리뷰 통과) | c012eae~ | zero-dep xlsx 라이터·문서/RTM 병기·대시보드 다운로드 + 적대적 리뷰 2종 반영 — `XLSX_EXPORT_DESIGN.md` §8~9 |
| P5 W4 | ✅ 완료(리뷰 통과) | 61bfad4~ | risk-report.json(지표 5+플래그 1·백분위·상대밴드)·si-위험모듈리포트(12종째)·W3 매퍼 오분류 부수 수정 + 적대적 리뷰 2종(비평 8건·코드 8건) 반영 — `RISK_REPORT_DESIGN.md` §11~12 |
| P6 W5 | ✅ 완료(리뷰 통과) | e499966~ | testScenarios[](안정 id·확정 스냅샷 박제)·si-단위테스트시나리오(13종째)·rtm.xlsx 5시트·시험 탭·R6 스모크QA·R7 사용자 필드 + 적대적 리뷰 2종(비평 7건·코드 8건) 반영 — `RTM_TEST_SCENARIO_DESIGN.md` §11~12 |
| P7 W6 | ✅ 완료(리뷰 통과) | c0501fc~06d29f9 | /understand-report·work-summary.json·si-실적요약보고서(14종째)·생성물 분리 집계 + 적대적 리뷰 2종(비평 8건·코드 10건) 반영 — `WORK_SUMMARY_DESIGN.md` §11~12 |
| P8 W8 | ⬜ | | |
| P9 W9 | ⬜ | | |
| P10 W10 | ⬜ | | |
| P11 W11 | ⬜ | | |

## 4. 범위 외 (명시)

- **보안 게이트(Phase 2)**: 사용자 결정으로 이번 범위에서 제외. 전 스킬의 "비민감 샘플 전용" 제약은 유지.
- hwp 바이너리 포맷 직접 생성(hwpx 타당성만 W7에서 메모).
