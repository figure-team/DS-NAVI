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
| 미도달 | `slices.json` `ownership[]` `status === 'unreached'` | 파일 단위. W2 배치 진입점 반영 후 값. **비점수 플래그**(리뷰 C3 — 뷰 forward 미추적 오탐이 랭킹 지배 방지) |
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
- 수집: `execFileSync('git', ['-C', root, 'log', '--numstat', '--no-renames', '--format=', '--', '.'])` 1회 실행 → 파일별 `{commits, linesChanged(add+del)}` 집계. census.ts 의 execFileSync try/catch→null 패턴 재사용. 모노레포 하위 루트는 `rev-parse --show-prefix` 로 좌표계 정합.
- **결정론**: 동일 저장소 상태(동일 커밋 + **전체 이력**)에서 byte-diff=0. 리포트에 `gitCommit` 앵커 기록. `--no-renames` 로 rename 휴리스틱 변동 배제(한계: rename 전 이력 미승계). **shallow clone 은 잘린 이력이라 같은 커밋에서도 값이 달라짐 → `--is-shallow-repository` 감지 시 null degrade**(리뷰 R1).
- git 없음/실패/shallow → 전 프로그램 `churn: null` + `meta.churnAvailable=false` + notes `[미확인]`.
- 범위: 전체 이력(레거시 분석 특성상 누적 빈도가 유의미). "최근 N개월" 윈도는 백로그(§9).
- 한계(문서화): 복잡도·LOC 는 **작업트리 파일** 기준 — dirty 트리에선 gitCommit 앵커만으로 재현 불가(clean 전제, 리뷰 C6). git 이 인용부호로 감싸는 특수 파일명은 churn 0 처리(R7).

### 3.3 정규화·합산·등급
- 각 지표를 **측정된 프로그램 집합 내 백분위 랭크**(0~1, 동점=평균 랭크)로 정규화 — min-max 대비 아웃라이어 왜곡 없음, 결정론. 이진탐색 O(n log n)(리뷰 R8).
- 점수 가중치(리포트 meta 에 기록, **휴리스틱 seam — 점수는 서수(순위)로만 해석**, 리뷰 C7): 복잡도 0.25 · 변경빈도 0.25 · LOC 0.15 · 팬인 0.15 · 팬아웃 0.10. **미도달은 점수 미포함**(§2 표 참조, 리뷰 C3).
- **미측정 지표는 해당 프로그램에서 가중치 재정규화**(측정된 지표만으로 합산) — null 을 0 취급하면 jsp 가 조직적으로 과소평가되는 왜곡 방지. 어떤 지표가 빠졌는지 notes 에 기록. 유효 지표 0 이면 score 0 + `[미확인]` 노트(NaN 방지).
- **무분산 지표(측정값 전부 동일)는 전 프로그램에서 가중합 제외 + `meta.degenerateMetrics` 표면화**(리뷰 C2) — 단일 벤더링 커밋의 churn 처럼 "측정됐지만 신호 없음"이 상수 오프셋으로 점수를 부풀리는 것 방지.
- 등급: **프로젝트 내 상대 밴드**(리뷰 C1 — 백분위 가중평균은 0.5 로 수축해 고정 임계는 무변별: 실측 상1/중51/하0). 상 = 점수 상위 10%(최소 1본), 중 = 상위 30%, 하 = 나머지, 동점은 묶음 선두 순위 공유(상향). 절대 판정 아님을 산출물에 명시.
- 정렬: (score desc, filePath asc) — 동점 결정론.
- 주요요인(factors): 점수 기여 지표 중 정규화 값 상위 2개(0·무분산 제외).
- 알려진 한계(문서화·백로그): java(6지표)와 비 java(지표 부분집합) 점수는 서로 다른 지표 집합·모집단 백분위의 합산이라 눈금이 엄밀히 통약되지 않음(리뷰 C5) — Top N 행 신뢰도 강등([추정])으로 표면화, 언어별 분리 랭킹은 백로그.

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
- 리뷰 반영 필드: `meta.degenerateMetrics`(무분산 지표), `stats.complexityUnmeasured`(확장자별 미측정 분해 — kotlin 침묵 누락 방지, 리뷰 C8). normalized 에 unreached 없음(비점수).

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
- kotlin 복잡도(tree-sitter kotlin 문법 미탑재 — 현재 [미확인]+커버리지 callout).
- 중복 코드 지표(로드맵 언급) — 토큰 해시 기반, 별도 계산기 필요해 범위 외.
- 리뷰 파생(§12): 위험 행 단위 사람 override 원장(C4 — 현재는 문서 편집·확정 D3), 언어별 분리 랭킹(C5), 가중치 감도분석(C7), churn 스트리밍 파서(R5), dirty 트리 시 커밋 blob 판독(C6).

## 10. 진행 현황

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| P5-a 설계 | ✅ | | 본 문서 |
| P5-b 계산기 | ✅ | | complexity.ts(AST 결정포인트) + churn.ts(--show-prefix 로 모노레포 vendored 좌표계 처리) + 단위테스트 11 |
| P5-c 리포트 빌더+배선 | ✅ | | buildRiskReport(백분위·재정규화·factors) + mini 픽스처 오라클(수기 검산) + scanDomainMap 배선 |
| P5-d SI 문서 | ✅ | | si-위험모듈리포트(산정기준/Top N/커버리지 3섹션) + DOC_SET 12종 + 템플릿 + xlsx 자동 병기 확인 |
| P5-e 실측+리뷰 | ✅ | | 적대적 리뷰 2종(비평 8건·코드 8건) 반영 — §12. 858 green·byte-diff=0 재확인 |

## 11. 실측 결과 (2026-07-05, 리뷰 반영 후)

- jpetstore-6: 랭킹 대상 52본(test 18 제외), 복잡도 측정 24(미측정 분해: jsp 20·xml 8), churn 은 수집됐으나 **무분산(전 파일 commits=1, 단일 벤더링 커밋) → 자동 제외 + 커버리지 표기**(eGov cop 등 실이력 타깃에서 유의미해짐), 미도달 20(비점수 플래그), 등급 분포 상 6·중 10·하 36(상대 밴드).
- Top: 1위 Item(팬인 3+복잡도 25) → Order(cx 58) → CatalogActionBean(팬아웃 5) → … java 허브/복잡 클래스가 상위, 미도달 JSP 는 상위에서 퇴출(리뷰 C3 반영 효과). 육안 타당.
- 결정론: `.spec/map/risk-report.json` 동일 커밋 2회 sha256 동일(리뷰 반영 후 재확인).
- **부수 발견·수정(W3 잠복 오탐)**: `src/site/**` maven xdoc 4파일이 본문 코드 예제의 `<mapper` 부분 문자열로 mapper-xml 프로그램/MyBatis 모델에 오분류 — 위험 Top 에 대형 미도달 파일로 부상하며 발견. 루트 요소 판별 `isMapperXmlDocument`(mybatis/extract.ts) 신설, 3개 사이트(program-inventory·understand-docs.mjs·understand-rtm.mjs) 교체 + parseMapperXml 게이트. jpetstore 프로그램 74→70본, 매퍼 11→7. 회귀 테스트 2종(mybatis 단위 + risk mini xdoc 픽스처).

## 12. 적대적 리뷰 반영 (2026-07-05)

### 설계 비평(critic) — 8건 전부 처리
| # | 심각도 | 요지 | 처분 |
|---|---|---|---|
| C1 | HIGH | 백분위 합산+고정 임계 → 등급 무변별(실측 상1/중51/하0) | **반영** — 상대 밴드(상위 10%/30%, 동점 상향)로 재정의, 산출물에 "절대 판정 아님" 명시, 커버리지에 등급 분포 |
| C2 | HIGH | 무분산 churn 이 상수 오프셋으로 점수 부풀림 + "52/52 측정" 착시 | **반영** — 무분산 지표 자동 감지 → 가중합 제외 + meta.degenerateMetrics + 커버리지 행 |
| C3 | HIGH | 미도달 JSP 가 Top 지배(뷰 forward 미추적 오탐 반사) + 재정규화가 저신뢰 플래그 증폭 | **반영** — 미도달을 점수에서 제거, 비점수 플래그(열·통계)로 분리 + 한계 문구 |
| C4 | HIGH | Top N 전 행 CONFIRMED 하드코딩(설계 §5 위반) + 행 단위 사람 override 부재 | **반영(전자)** — 전 지표 측정 행만 [확정], 미측정 포함 행 [추정]. 행 단위 override 원장은 **백로그**(문서 편집·확정 D3 으로 커버, 템플릿에 안내) |
| C5 | MED | java/비 java 지표집합·모집단 상이 — 점수 통약불가 | **부분 반영** — 행 [추정] 강등 + 산정기준에 "측정 집합 내 순위" 명시. 언어별 분리 랭킹 백로그 |
| C6 | MED | shallow clone·dirty 작업트리 결정론 구멍 | **반영(shallow)** — 감지→null degrade. dirty 는 한계 문서화(clean 전제) |
| C7 | MED | 가중치 매직넘버·유효가중 상이 | **부분 반영** — "휴리스틱 seam·서수 해석" 코드/산출물 명시. 감도분석 백로그 |
| C8 | LOW/MED | "비 java" 뭉뚱그림이 kotlin 침묵 누락 은폐 | **반영** — stats.complexityUnmeasured 확장자별 분해 + kotlin callout |

### 코드 리뷰(reviewer) — CRITICAL/HIGH 0건, 8건 처리
| # | 심각도 | 요지 | 처분 |
|---|---|---|---|
| R1 | MED | shallow clone 에서 "byte-diff=0" 문구 거짓 | **반영** — --is-shallow-repository 감지→null + 테스트(file:// shallow clone) |
| R2 | MED | buildRiskReport 실패가 선행 산출물 유실 | **반영** — try/catch, riskReport null degrade(반환 타입 nullable) |
| R3 | MED | 재정규화가 측정 적은 파일 과대평가 가능 | **완화** — C3(미도달 제거)+C4(행 [추정])로 완화, eGov 실측 시 재확인 |
| R4 | LOW | xml-stylesheet PI 매퍼 거짓음성 | **반영** — PI 반복 허용 정규식 + 테스트 |
| R5 | LOW | maxBuffer 초과 시 churn 전량 소실 | **문서화** — 스트리밍 파서 백로그 |
| R6 | LOW | 화살표 switch 다중 라벨 과소계상 | **반영** — 쉼표 보정 + 테스트(문자열 case 쉼표 과대계상은 한계 주석) |
| R7 | LOW | git 인용 파일명 churn 0 침묵 | **문서화** — 소스 파일명 실질 미발생 |
| R8 | LOW | percentileRanks O(n²) | **반영** — 이진탐색 O(n log n) |
