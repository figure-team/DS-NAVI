# 기능 점검 가이드 — 직접 실행 명령어 모음

> 목적: 지금까지 개발한 전 기능을 하나씩 직접 실행해 점검하기 위한 명령어 정리.
> 기준 커밋: demo/jpetstore-6 `9458e43` (Scheme A 2.8.0-ktds.4 · Scheme B 0.3.0, 2026-07-06 작성).
> 모든 명령은 **레포 루트**(`code-2/`)에서 실행. 대상 프로젝트:
> - 소형(벤더링 완료): `examples/jpetstore-6`
> - 스케일(587파일): `/home/jk/projects/ktds/apm-project/egov-cop`

## 0. 선행 준비 (1회)

```bash
pnpm install
pnpm --filter @ktds/legacy-core build        # 엔진 빌드(스크립트 전부의 전제)
pnpm --filter @understand-anything/core build
```

전체 테스트/린트(스모크):

```bash
pnpm test                                     # 루트 297
(cd ktds-legacy-plugin/packages/legacy-core && npx vitest run)   # 953 (golden 게이트 포함)
```

> **주의**: `.spec/`(스캔 산출물·캐시)은 gitignore 라 커밋돼 있지 않다. §2~§6(문서·RTM·
> 정책·화면·영향도)은 `.spec/map` 을 읽으므로 **반드시 §1 scan(+confirm)을 먼저 실행**할 것
> (fail-closed — 없으면 안내 후 종료). 커밋된 것은 `.understand-anything/`(벤더링 데모
> 데이터)뿐이다.

---

## 1. 코어 분석 파이프라인 — understand-map

```bash
# 스캔(census→routes→edges→slices→candidates + db-schema/인터페이스/배치/프로그램/위험/커버리지)
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 scan

# 도메인 경계 표 확인(사람 게이트 제시용, 쓰기 없음) → 확정 → 요약
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 plan
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 confirm --auto-approve --by <담당자>
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 map

# LLM 채움 파이프라인(번들 조립 → fill/<key>.json 작성 후 → 인용 기계검증 + emit)
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 bundle
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 emit

# 노드 상세 템플릿(계층별, 프로젝트 override 우선) 조회
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 templates
```

- 산출물: `examples/jpetstore-6/.spec/map/*.json`, `.understand-anything/domain-graph.json`
- **점검 포인트(scan 출력)**: 인터페이스 0건이 "스캔했고 없음"으로 명시되는지, 프로그램 74본 + 잠정 FP([추정]) 줄, 위험 랭킹 줄, `◐ 부분 지원 소스 N파일` 줄, `캐시: 재사용/재추출` 줄.
- 결정론: 같은 명령 2회 → 산출물 byte-diff=0.

### 1-a. 증분 스캔(P8, scan-cache)

```bash
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 scan            # 2회째부터 캐시 재사용
node ktds-legacy-plugin/scripts/understand-map.mjs examples/jpetstore-6 scan --no-cache # 전체 재추출 강제

# 수용 기준 자동 검증(1파일 수정 재실행 ≤ full 20% + byte-diff=0, 대상 파일 자동 원복)
node ktds-legacy-plugin/scripts/qa-incremental-bench.mjs /home/jk/projects/ktds/apm-project/egov-cop
```

- 기대: eGov에서 `AC-1 … PASS`, `AC-2 … PASS` (실측 기록 15.1%).

### 1-b. 언어 커버리지 매트릭스(P9)

```bash
# 문서 drift + "실측 ⊆ 매트릭스 주장" 검증(두 타깃)
node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs examples/jpetstore-6 /home/jk/projects/ktds/apm-project/egov-cop
# 매트릭스 선언(matrix.ts) 변경 시 문서 재생성
node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write
```

- 문서: `docs/ktds/COVERAGE_MATRIX.md`. 기대: `PASS`, 미지원 0건 + "주장했으나 실측 0건" 셀 WARN 목록(정상 — 수동 리뷰 대상 표기).

### 1-c. LLM 정확도 골든셋(P10)

```bash
node ktds-legacy-plugin/scripts/qa-golden-score.mjs examples/jpetstore-6
```

- 기대: 6지표 100% `PASS — 기준선 대비 회귀 없음`. 갱신은 사람 게이트: `--update-baseline --yes` / `--update-golden --yes`(동시 사용 금지).
- 열화 검출 체험: `.understand-anything`만 임시 폴더에 복사해 그 폴더를 대상으로 실행 → 인용 유효율 0% FAIL(exit 1).

---

## 2. SI 산출물 문서 14종 — understand-docs

```bash
node ktds-legacy-plugin/scripts/understand-docs.mjs examples/jpetstore-6
```

- 산출물: `examples/jpetstore-6/.understand-anything/doc-output/` — .md + .xlsx 병기:
  `01_tech-stack · 02_architecture · 06_program-list · 07_crud-matrix · 08_batch-list · 09_impact-analysis`
  `si-기능명세서 · si-테이블정의서 · si-인터페이스정의서 · si-배치정의서 · si-프로그램목록 · si-위험모듈리포트 · si-단위테스트시나리오 · si-실적요약보고서` + `rtm.xlsx`(5시트)
- 점검: xlsx가 LibreOffice에서 열리는지, 문서 주장마다 file:line 근거·[추정]/[미확인] 마킹, 편집·확정은 대시보드 산출물 탭에서.

## 3. 요구사항 추적표(RTM) — understand-rtm / rtm-intake

```bash
node ktds-legacy-plugin/scripts/understand-rtm.mjs examples/jpetstore-6
```

- 산출물: `.understand-anything/rtm.json`(+ rtm-requirements.json). AS-IS 기능 28 + TO-BE 요구 2(카카오 로그인 데모) + 테스트 시나리오 84(정상/예외/경계, [추정]).
- **신규 요청 인테이크(5단계)** 는 라이브 스킬 플로우(`/understand-rtm` — §9 참고)가 주 동선. CLI 단계 검증:

```bash
node ktds-legacy-plugin/scripts/rtm-intake.mjs validate <identified.json>
node ktds-legacy-plugin/scripts/rtm-intake.mjs project examples/jpetstore-6 <sid>
```

- 행 확정·시험 탭·사용자 필드는 대시보드 추적표 탭에서(§8).

## 4. 정책서 — understand-policy

```bash
node ktds-legacy-plugin/scripts/understand-policy.mjs examples/jpetstore-6
```

- 산출물: `doc-output/policy-*.md` — 도메인 정책서(SI 정책 정의서 §0~§8), 코드+DB 신호 매핑, 토픽 자동 분리. 중간 산출(db-schema/policy-signals)은 `.spec/map/` 재사용.

## 5. 화면설계서 — understand-screens

```bash
# 캡처는 라이브 앱 필요(playwright) — 상태/검증 먼저
node ktds-legacy-plugin/scripts/understand-screens.mjs examples/jpetstore-6 status
node ktds-legacy-plugin/scripts/understand-screens.mjs examples/jpetstore-6 validate
node ktds-legacy-plugin/scripts/understand-screens.mjs examples/jpetstore-6 capture   # jpetstore 앱 기동 상태에서
```

- 벤더링된 22화면(①②③ 이벤트 배지 3구역 + 범례)은 대시보드 화면설계서 탭에서 바로 확인 가능(§8).

## 6. 변경영향도 — understand-impact

```bash
node ktds-legacy-plugin/scripts/understand-impact.mjs examples/jpetstore-6 seeds
node ktds-legacy-plugin/scripts/understand-impact.mjs examples/jpetstore-6 precedents --domain 주문 --top 5
# analyze 는 --path <파일> 반복 지정 필수(fail-closed) — seeds 출력에서 파일을 고른다
node ktds-legacy-plugin/scripts/understand-impact.mjs examples/jpetstore-6 analyze \
  --path src/main/java/org/mybatis/jpetstore/service/OrderService.java
```

- 결과는 `impact-overlay.json` → 대시보드 구조 탭의 영향도 오버레이 토글로 시각 확인.

## 7. 실적 요약 — understand-report

```bash
# 이 레포 자체가 가장 좋은 실측 대상(커밋 많음). 도메인 그래프 불요(단독 동작).
node ktds-legacy-plugin/scripts/understand-report.mjs . --weeks 1
node ktds-legacy-plugin/scripts/understand-report.mjs . --month 2026-07
node ktds-legacy-plugin/scripts/understand-report.mjs . --range 2572453..HEAD
```

- 점검: 직전 기간 대비 증감 행, 생성물 분리 집계(벤더링 xlsx가 헤드라인 churn을 오염시키지 않는지), 커밋에 없는 내용 날조 0.

## 8. 대시보드 (라이브)

```bash
pnpm --filter @understand-anything/dashboard sync:demo    # 벤더링 데이터 → public (dev 용)
pnpm dev:dashboard -- --port 5321                         # 5199/5198 점유 가능 → 별도 포트 권장
# 정적 확인만이면: pnpm --filter @understand-anything/dashboard build:demo && pnpm --filter @understand-anything/dashboard preview:demo
#   (단, RTM 인테이크 등 쓰기 동선은 dev 서버에서만 동작 — preview 는 404)
```

- 점검 동선: 홈 → 도메인(흐름·근거 인용) → 구조(ELK 엣지, 위험/영향 오버레이 토글) → 추적표(행 확정, 시험 탭, 사용자 필드) → 산출물(문서 편집·확정, xlsx 다운로드) → 화면설계서(22화면+배지) → 위키 → 지식그래프
- QA 파라미터: `?onboard=skip`(온보딩 생략), `?theme=<presetId>`(1회성 테마)
- 딥링크/새로고침/뒤로가기 동작 확인(react-router SPA)

## 9. Claude Code 스킬로 실행(라이브 플로우)

캐시에 로컬 빌드를 동기화한 뒤 새 세션에서 스킬 호출:

```bash
pnpm --filter @ktds/legacy-core build
rsync -a --exclude node_modules ktds-legacy-plugin/ ~/.claude/plugins/cache/understand-anything/ktds-legacy/0.1.0/
```

- 스킬: `/understand-map` `/understand-docs` `/understand-rtm`(인테이크 5단계는 여기서) `/understand-policy` `/understand-impact` `/understand-report` `/understand-screens` `/understand-onboard`
- 원스톱: `/understand-onboard` = init → scan → confirm → map → emit → docs → 커버리지 (CLI: `node ktds-legacy-plugin/scripts/understand-onboard.mjs <projectRoot> --by <handle>`)

## 10. 부속 장치

```bash
node scripts/version-sync-check.mjs                       # 버전 7매니페스트 정합
node ktds-legacy-plugin/scripts/qa-rtm-visual.mjs         # RTM 시각 스모크(playwright, dev 서버 필요)
# 성능 계측(perf-measure)은 훅으로 자동 — 실행 후 .spec/perf/latest.md 확인
```

---

## 참고

- 전 산출물은 **결정론**(동일 commit 재실행 byte-diff=0) — 점검 중 재실행해도 벤더링본과 어긋나지 않음.
- 스캔·문서 생성은 확정 원장을 건드리지 않음(확정은 항상 사람 게이트).
- 설계문서(각 기능의 수용 기준·리뷰 disposition): `docs/ktds/*_DESIGN.md`, 로드맵 ledger: `docs/ktds/SI_EXPANSION_ROADMAP.md`.
- P11(멀티 시스템 맵)은 보류 중 — 재개 시 두 타깃 송신 0건 문제로 합성 픽스처 + 음성 검증 전략 필요.
