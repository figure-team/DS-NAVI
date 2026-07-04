# W4 설계 — 위험 모듈 리포트 (risk-report)

> 작성: 2026-07-05 · 브랜치: `feat/si-expansion` · 로드맵: `SI_EXPANSION_ROADMAP.md` P5(W4)
> 목적: 복잡도·크기·미도달·변경빈도·팬인/팬아웃을 합산한 "위험 Top N" — PM 주간보고용 정량 지표.

## 1. 목표

- 프로그램(=program-inventory 단위)별 위험 점수를 **결정론적으로** 산출하고 Top N 을 SI 문서로 노출.
- 수용 기준(로드맵): ① 지표별 계산 근거 문서화(본 문서 §3 + 문서 산출물 §5 의 산정기준 절), ② 동일 commit 에서 byte-diff=0 결정론(git 지표는 census.gitCommit 앵커로 고정).
- 재사용 우선: 신규 계산기는 **순환복잡도 근사**와 **git 변경빈도** 2개뿐. 나머지는 기존 산출물 조인.

## 2. 입력 (전부 기존 산출물 재사용)

| 지표 | 출처 | 비고 |
|---|---|---|
| LOC | `program-inventory.json` `programs[].loc` | wc -l 관례 (`program-inventory/index.ts` 기존 구현) |
| 미도달 | `slices.json` `ownership[]` `status === 'unreached'` | 파일 단위. W2 배치 진입점 반영 후 값이므로 배치 오판 없음 |
| 팬인 | `edges.json` + `impact/reach.ts` `computeFanIn` | distinct-source in-degree. allowedKinds 는 impact 관례 따름(§3.4) |
| 팬아웃 | `edges.json` `edges[]` source 별 distinct-target 집계 | 전용 헬퍼 신규(대칭 구현) |
| 복잡도 | **신규** `risk-report/complexity.ts` | tree-sitter Java AST 워크(§3.1) |
| 변경빈도 | **신규** `risk-report/churn.ts` | `git log --numstat` (§3.2) |

- 스코프: `program-inventory.json` 의 programs 전체 중 **type=`test` 제외**(위험 랭킹 오염 방지) — 제외 수는 `stats.excluded` 로 표면화(W3 관례, 침묵 누락 금지).

## 3. 지표 계산 근거 (결정론)

### 3.1 순환복잡도 근사 (java 한정)
- `parseSource('java', src)` (기존 `domain-map/tree-sitter.ts`) 로 파싱 후 결정 포인트 카운트:
  - `if_statement`, `for_statement`, `enhanced_for_statement`, `while_statement`, `do_statement`, `catch_clause`, `ternary_expression`
  - `switch` 는 case 라벨 수(`switch_label` 중 default 제외)
  - `binary_expression` 중 연산자 `&&`/`||`
- 파일 복잡도 = Σ(메서드별 1 + 결정포인트). 메서드 0개(인터페이스 등)면 0.
- **비 java(jsp/kotlin/xml/sql)는 `complexity: null` + notes `[미확인] 복잡도 미측정(<ext>)`** — 침묵 누락 대신 미측정 카운트를 `stats.measured.complexity` 로 표면화(W9 커버리지 철학 선반영).

### 3.2 git 변경빈도 (churn)
- 수집: `execFileSync('git', ['-C', root, 'log', '--numstat', '--no-renames', '--format=%H', '--', '.'])` 1회 실행 → 파일별 `{commits, linesChanged(add+del)}` 집계. census.ts 의 execFileSync try/catch→null 패턴 재사용.
- **결정론**: HEAD(=census.gitCommit)가 같으면 이력이 같으므로 byte-diff=0. 리포트에 `gitCommit` 앵커 기록. `--no-renames` 로 rename 휴리스틱 변동 배제(한계로 명시: rename 전 이력 미승계).
- git 없음/실패 → 전 프로그램 `churn: null` + `meta.churnAvailable=false` + notes `[미확인] git 이력 없음`.
- 범위: 전체 이력(레거시 분석 특성상 누적 빈도가 유의미). "최근 N개월" 윈도는 백로그(§9).

### 3.3 정규화·합산
- 각 지표를 **측정된 프로그램 집합 내 백분위 랭크**(0~1, 동점=평균 랭크)로 정규화 — min-max 대비 아웃라이어 왜곡 없음, 결정론.
- 가중치(리포트에 기록, seam 으로 조정 가능): 복잡도 0.25 · 변경빈도 0.25 · LOC 0.15 · 팬인 0.15 · 팬아웃 0.10 · 미도달(이진) 0.10.
- **미측정 지표는 해당 프로그램에서 가중치 재정규화**(측정된 지표만으로 합산) — null 을 0 취급하면 jsp 가 조직적으로 과소평가되는 왜곡 방지. 어떤 지표가 빠졌는지 notes 에 기록.
- 등급: score ≥ 0.66 `상`, ≥ 0.33 `중`, 그 외 `하`. 정렬: (score desc, filePath asc) — 동점 결정론.
- 주요요인(factors): 정규화 값 상위 2개 지표명 기록(보고서 가독성).

### 3.4 팬인/팬아웃 엣지 종류
- import 엣지는 노이즈(팬인 급팽창)라 impact 관례의 allowedKinds(구현 시 `impact/reach.ts` 기본값과 동일하게 맞춤)를 따르고, 사용한 kinds 를 `meta.edgeKinds` 로 리포트에 기록.

## 4. 산출물 — `.spec/map/risk-report.json`

- 로드맵 원문은 `.spec/report/risk.json` 이나, 파이프라인에 `.spec/report/` 디렉터리가 없고 전 산출물이 `writeMapArtifact`→`.spec/map/` 단일 관례(coverage.json 포함)이므로 **`.spec/map/risk-report.json` 으로 통일**(설계 변경 명시).
- 형태(zod 스키마 `RiskReportSchema`):

```jsonc
{
  "gitCommit": "…",            // census.gitCommit 앵커
  "meta": { "weights": {…}, "edgeKinds": […], "churnAvailable": true, "topN": 20 },
  "stats": {
    "programs": 64,             // 랭킹 대상(test 제외)
    "excluded": { "test": 10 },
    "measured": { "complexity": 40, "churn": 64 },  // 지표별 측정 커버리지
    "unreached": 3
  },
  "items": [ {
    "programId": "PGM-…", "filePath": "…", "type": "service", "domain": "order", "layer": "…",
    "metrics": { "loc": 320, "complexity": 41, "fanIn": 7, "fanOut": 3,
                 "churnCommits": 12, "churnLines": 890, "unreached": false },
    "normalized": { "loc": 0.91, "complexity": 0.97, … },  // 백분위
    "score": 0.83, "grade": "상", "factors": ["complexity", "churn"],
    "notes": []                  // [미확인] 마킹 등
  } ]
}
```

- items 는 **전 프로그램**(랭킹 대상 전체) 포함 — Top N 절단은 문서(md) 렌더 시에만.

## 5. SI 문서 — `si-위험모듈리포트` (10번째 문서)

- `doc-generator/methodology/si-standard.ts` 에 `buildSiRiskReport(input)` 추가, `DocInput.riskReport?` 배선, `DOC_SET`(doc-set.ts) + `siStandardMethodology.buildDocSet` 양쪽 등록 + `templates/doc/` 템플릿.
- 섹션: ①산정 기준(지표 정의·가중치·정규화 방식 — 수용기준 "계산 근거 문서화"의 사용자 노출면) ②위험 Top 20 표(순위·프로그램ID·파일·유형·도메인·점수·등급·복잡도·LOC·변경빈도·팬인/팬아웃·미도달·주요요인) ③지표 커버리지(측정/미측정 카운트, 제외 내역).
- 표 행 confidence: 전 지표 측정 행 `높음`, 미측정 지표 포함 행 `중간`(사유 evidence 기재) — 기존 GeneratedDoc confidence 관례.
- **xlsx 는 무배선 무료**: `docToSheets` 가 table 섹션을 자동 시트화(W7 검증 완료 경로).
- 대시보드 구조탭 위험 오버레이(로드맵 '선택')는 **이번 범위 제외 → 백로그**(§9). 영향도 오버레이 패턴 재사용 가능함만 확인.

## 6. 파이프라인 배선

- `extract.ts` `scanDomainMap`: programInventory 직후 stage 추가 —
  `const riskReport = buildRiskReport(projectRoot, { census, edges, slices, programInventory, churn: collectGitChurn(projectRoot) })` → `writeMapArtifact(projectRoot, RISK_REPORT_FILENAME, riskReport)` → 반환 객체 포함.
- `buildRiskReport` 는 **순수 함수**(git 수집 `collectGitChurn` 은 분리, 주입식) — 픽스처 테스트에서 churn 을 고정 주입 가능.
- `src/index.ts` 배럴 재수출, DocInput 조립부에 riskReport 로드 추가.
- 복잡도 파싱은 async(parseSource) — buildRiskReport 는 async (interfaces/jpa stage 와 동일 패턴).

## 7. 검증

- 픽스처 `fixtures/risk-report/mini`: java(복잡도 유형별: if/for/switch/catch/삼항/&&||)+jsp(미측정)+미도달 파일 구성, `expected.json` 오라클 + 2회 실행 byte-diff=0 결정론 테스트(W3 관례).
- 복잡도 단위테스트: 구문별 카운트 정답 고정(예: if+else-if=2, switch case 3=3, `a&&b||c`=2).
- churn 단위테스트: tmp 디렉터리에 `git init` + 커밋 2개 시나리오로 `{commits, linesChanged}` 검증 + git 없는 디렉터리 → null.
- 실측: examples/jpetstore-6 재스캔 — vendored 파일의 churn 은 본 레포 이력 기준(실데이터, HEAD 고정 시 결정론). Top 20 육안 타당성 확인.

## 8. 단계

- P5-a: 본 설계문서 ✅
- P5-b: 계산기 — complexity.ts + churn.ts + 단위테스트
- P5-c: buildRiskReport(정규화·합산·스키마) + 픽스처 + extract.ts 배선
- P5-d: si-위험모듈리포트 문서 + DOC_SET/템플릿 + xlsx 확인
- P5-e: jpetstore 실측 + 적대적 리뷰 2종(critic/code-reviewer) + 반영 → 사용자 컨펌

## 9. 백로그

- 최근 N개월 윈도 churn(§3.2) — 앵커 커밋 날짜 기준 상대 윈도로 결정론 유지 가능.
- 대시보드 구조탭 위험 오버레이(영향도 오버레이 패턴 재사용).
- kotlin 복잡도(tree-sitter kotlin 문법 미탑재 — 현재 [미확인] 처리).
- 중복 코드 지표(로드맵 언급) — 토큰 해시 기반, 별도 계산기 필요해 범위 외.

## 10. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| P5-a 설계 | ✅ | | 본 문서 |
| P5-b 계산기 | ✅ | | complexity.ts(AST 결정포인트) + churn.ts(--show-prefix 로 모노레포 vendored 좌표계 처리) + 단위테스트 11 |
| P5-c 리포트 빌더+배선 | ✅ | | buildRiskReport(백분위·재정규화·factors) + mini 픽스처 오라클(수기 검산) + scanDomainMap 배선 |
| P5-d SI 문서 | ✅ | | si-위험모듈리포트(산정기준/Top N/커버리지 3섹션) + DOC_SET 12종 + 템플릿 + xlsx 자동 병기 확인 |
| P5-e 실측+리뷰 | 🔶 실측 완료 | | jpetstore: 56본 랭킹·복잡도 24측정·미도달 24·2회 실행 byte-diff=0. 적대적 리뷰 대기 |

## 11. 실측 결과 (2026-07-05)

- jpetstore-6: 랭킹 대상 56본(test 18 제외), 복잡도 측정 24(비 java 32 [미확인]), churn 가용(vendored 경로 → 본 레포 이력, 전 파일 commits=1 — 단일 벤더링 커밋이라 변별력 없음은 실데이터의 사실. eGov cop 등 실이력 타깃에서 유의미해짐), 미도달 24.
- Top: 1위 Item(팬인 3+복잡도 25, 유일 '상'), Order(cx 58), ActionBean 군(팬아웃), WEB-INF jsp 군(미도달+LOC). 육안 타당.
- 결정론: `.spec/map/risk-report.json` 동일 커밋 2회 sha256 동일.
- **부수 발견·수정(W3 잠복 오탐)**: `src/site/**` maven xdoc 4파일이 본문 코드 예제의 `<mapper` 부분 문자열로 mapper-xml 프로그램/MyBatis 모델에 오분류 — 위험 Top 에 대형 미도달 파일로 부상하며 발견. 루트 요소 판별 `isMapperXmlDocument`(mybatis/extract.ts) 신설, 3개 사이트(program-inventory·understand-docs.mjs·understand-rtm.mjs) 교체 + parseMapperXml 게이트. jpetstore 프로그램 74→70본, 매퍼 11→7. 회귀 테스트 2종(mybatis 단위 + risk mini xdoc 픽스처).
