# W9 언어 커버리지 매트릭스 + degrade 정의 설계 (P9)

> 로드맵: `SI_EXPANSION_ROADMAP.md` W9/P9. 언어/프레임워크별 스캐너 지원 수준을 명시하고,
> 미지원 신호를 침묵 누락 대신 "커버리지 리포트에 미지원 N건"으로 표면화한다.

## 1. 목표 · 수용 기준

- **AC-1 (단일 진실 소스)**: 지원 수준 선언은 코드 한 곳(`coverage-report/matrix.ts`)에만
  존재한다. 사람용 문서 `docs/ktds/COVERAGE_MATRIX.md` 는 그 선언에서 **생성**되며,
  drift(문서 ≠ 선언)는 CI 테스트가 잡는다.
- **AC-2 (실측 정합)**: 매트릭스가 `none` 이라 주장하는 (언어, 기능) 조합에서 실제
  산출물이 나오면 검증 실패 — 즉 "실측은 항상 매트릭스 주장의 부분집합". jpetstore ·
  eGov cop 두 타깃에서 자동 검증 스크립트(`qa-coverage-matrix.mjs`) 통과.
  (역방향 — full 주장인데 실측 0건 — 은 프로젝트에 그 신호가 없을 수 있어 검증 대상이
  아님을 명시. 과대 주장 방지는 문서가 아니라 각 기능의 자체 테스트가 담당.)
- **AC-3 (미지원 표면화)**: 분석 유관 소스 언어인데 **어떤 기능도 덮지 않는**(전 기능
  none) 파일 수를 coverage.json `langSupport.unsupportedFiles` 로 계상하고 렌더/scan
  출력에 `[미확인]` 으로 노출. kotlin/Pro*C 파일이 섞인 픽스처로 회귀 고정.
  (최초 정의는 "핵심 구조분석(routes·edges·complexity) none" 이었으나 jpetstore 실측에서
  sql(db-schema full 지원)·cmd(batch 지원)가 "미지원"으로 오보되는 결함이 드러나 정정 —
  구조분석 요약은 행별 `core` tier 로 유지.)

## 2. 현황 — 지원 사실의 근거 (실코드 좌표)

| 기능(capability) | 지원 언어(근거) |
|---|---|
| census/프로그램 목록 | 전 언어(확장자 분류 `SOURCE_LANG_BY_EXT` + 미지 확장자 = 확장자 자체) |
| routes(진입점) | java full(spring/stripes), xml partial(web.xml 서블릿), jsp partial(페이지), typescript/tsx/javascript partial(next.js 라우트) |
| batch | java full(@Scheduled/main/quartz-java/executor/timer), xml partial(quartz/task/spring-batch), sh·bat·cmd partial(java 실행 라인), crontab(lang=other 포함 — 경로 관례 `isCrontabPath`) |
| edges(구조 의존) | java full(import/injection/…), xml partial(*Mapper.xml namespace/mybatis) |
| method-calls | java full |
| interfaces | java full(클라이언트 카탈로그+config seam), xml·sql partial(db-link), properties(플레이스홀더 해석 보조) |
| jpa | java full |
| db-schema | sql full(DDL/dataload), java·xml·properties 라이브 신호 보조 |
| complexity(위험) | java full — 그 외 **미측정 null**(risk-report 가 이미 [미확인] 노트) |

kotlin·python 등은 census 계상만 되고 구조분석이 전무 — 지금은 coverage.json 의
`files.byLang` 숫자에 묻혀 침묵. 이것이 W9 가 없애려는 사각.

## 3. 설계

### 3.1 단일 소스 — `coverage-report/matrix.ts`

```ts
type CoverageTier = 'full' | 'partial' | 'none'
interface LangCoverage { tier: CoverageTier; note: string }   // note 는 근거/한계 요약
interface CapabilityCoverage {
  key: 'routes' | 'batch' | 'edges' | 'method-calls' | 'interfaces' | 'jpa' | 'db-schema' | 'complexity'
  label: string
  byLang: Record<string, LangCoverage>   // 명시 없는 언어 = none
}
export const COVERAGE_MATRIX: CapabilityCoverage[]
/** 분석 유관 소스 언어 — 미지원이면 "묻힘"이 아니라 "미지원 N건"으로 셀 대상. */
export const ANALYSIS_RELEVANT_LANGS: Set<string>  // java,xml,jsp,sql,kotlin,python,typescript,tsx,javascript,sh,bat,cmd,groovy,scala,cs,c,cpp,pc,pks,pkb,cbl …
/** 핵심 구조분석 기능 — 이 셋이 전부 none 인 언어의 파일이 "핵심 미지원". */
export const CORE_CAPABILITIES = ['routes', 'edges', 'complexity']
export function computeLangSupport(census): LangSupport
export function renderCoverageMatrixMd(): string   // 사람용 문서 생성(결정론)
```

- degrade 정의: `none` = 산출물에 절대 나타나지 않아야 함(실측 검증 대상),
  `partial` = 특정 관용구/프레임워크만(각 note 에 범위 명기), `full` = 그 언어의 일반
  코드에서 동작(한계는 note).
- crontab 은 확장자 무관(경로 관례)이라 lang 행으로 못 싣는다 — batch note 에 명기.

### 3.2 coverage.json 통합 — `langSupport` (optional, 하위호환)

```jsonc
"langSupport": {
  "unsupportedFiles": 15,                // 어떤 기능도 덮지 않는 소스 파일 총수(best=none)
  "byLang": [                            // census 에 존재하는 분석 유관 언어만, lang 정렬
    { "lang": "kotlin", "files": 12, "best": "none", "core": "none",
      "capabilities": [ { "key": "routes", "tier": "none" }, … ] },
    { "lang": "sql",    "files": 3,  "best": "full", "core": "none", "capabilities": [ … ] },
    { "lang": "java",   "files": 172, "best": "full", "core": "full", "capabilities": [ … ] }
  ]
}
```

- `best` = 전 기능 최고 tier(미지원 판정 기준), `core` = CORE_CAPABILITIES(routes·edges·
  complexity) 최고 tier(구조분석 요약 — sql 처럼 best=full·core=none 조합이 정보값).
- `unsupportedFiles` = best none 언어들의 파일 합.
- 렌더(`renderCoverageReport`): `unsupportedFiles > 0` 이면
  `⚠️ 스캐너 미지원 소스 N파일 (kotlin 12·python 3) [미확인] — COVERAGE_MATRIX.md 참조`.
- scan CLI 출력에도 동일 1줄(침묵 누락 금지).

### 3.3 문서 — `docs/ktds/COVERAGE_MATRIX.md` (생성물)

`renderCoverageMatrixMd()` 출력(기능×언어 표 + tier 범례 + degrade 정의 + note).
생성/갱신: `node scripts/qa-coverage-matrix.mjs --write`. 손편집 금지(헤더에 명기).

### 3.4 자동 검증 — `scripts/qa-coverage-matrix.mjs`

1. **drift**: `docs/ktds/COVERAGE_MATRIX.md` == `renderCoverageMatrixMd()` (byte).
2. **실측 부분집합 검증**(타깃별, scan 실행 후 산출물 대조):
   - routes.routes[].filePath 의 lang → 매트릭스 routes tier ≠ none
   - routes.batchEntries[].file lang → batch tier ≠ none (crontab 예외 명시 처리)
   - edges.edges[] source/target lang → edges tier ≠ none
   - method-calls.calls[] callerFile lang → method-calls ≠ none
   - interfaces.items[].callSites[].file lang → interfaces ≠ none
   - jpa entities/repositories relPath lang → jpa ≠ none
   - db-schema tables[].relPath lang → db-schema ≠ none
   - risk-report items complexity ≠ null → filePath lang 의 complexity ≠ none
3. **미지원 표면화 검증**: coverage.json langSupport.unsupportedCoreFiles ==
   매트릭스 × census 로 재계산한 값.
   종료 코드: 전부 통과 0, 아니면 1(모순 목록 출력).
   대상: `qa-coverage-matrix.mjs <projectRoot>` — jpetstore(examples/jpetstore-6)와
   eGov cop 둘 다 실행이 수용 기준.
4. drift 는 CI 테스트(`coverage-matrix.test.ts`)로도 이중 고정(스크립트 미실행 대비).

## 4. 검증 계획

- 단위: computeLangSupport — kotlin/pc/python 혼입 픽스처에서 미지원 카운트·byLang tier,
  java-only 프로젝트에서 0건, 문서 렌더 결정론(2회 동일).
- drift 테스트: docs 파일 vs 렌더 byte 비교(재생성 안내 메시지 포함).
- e2e: scanDomainMap 픽스처(kt 파일 포함) → coverage.json langSupport 표면화 + 렌더 문구.
- 실측: 두 타깃 스크립트 통과 결과를 §7 에 기록.

## 5. 백로그 (명시)

- 매트릭스의 tier 를 스캐너 코드에서 자동 도출(선언-구현 이중화 제거) — 현재는 선언이
  실측 검증으로 담보됨. kotlin/Pro*C 실지원(매트릭스 행 승격). eGov 세대(3.x/4.x)
  프레임워크 축 — 현재는 언어 축만(프레임워크는 note 로).

## 6. 진행 현황 (ledger)

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계(본 문서) | ✅ | | |
| matrix.ts + coverage 통합 | ✅ | | langSupport(best/core 분리 — 실측이 sql/cmd 오보 결함을 잡아 정정) |
| 문서 생성 + 검증 스크립트 + 실측 | ✅ | | §7 — 두 타깃 PASS, 941+297 green |
| 적대적 리뷰 2종 + disposition | ⬜ | | |

## 7. 실측 결과 (2026-07-05)

`qa-coverage-matrix.mjs --write examples/jpetstore-6 <egov-cop>`:

- 문서 drift 없음(COVERAGE_MATRIX.md == matrix.ts 렌더) — CI 테스트로 이중 고정.
- jpetstore(148파일): 실측 ⊆ 매트릭스 주장, 모순 0건 · 스캐너 미지원 0건.
- eGov cop(587파일): 실측 ⊆ 매트릭스 주장, 모순 0건 · 스캐너 미지원 0건.
- 미지원 표면화는 kotlin/Pro*C 혼입 픽스처 e2e 로 회귀 고정(coverage.json
  `langSupport.unsupportedFiles`=1·렌더 `[미확인]` 경고·스키마 라운드트립).
- **설계 교정 1건(정직 기록)**: 최초 "핵심 구조분석(none) 기준" 헤드라인이 jpetstore
  실측에서 sql 3(db-schema full 지원)·cmd 1(batch 지원)을 "미지원"으로 오보 →
  기준을 "전 기능 none(best)"으로 정정하고 구조분석 요약은 행별 core tier 로 분리.
- 테스트: legacy-core 941(신규 7: 매트릭스 단위 5·drift 1·e2e 1) + 루트 297 green.
