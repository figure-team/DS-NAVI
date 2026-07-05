# W8 증분 분석 설계 — scan-cache (P8)

> 로드맵: `SI_EXPANSION_ROADMAP.md` W8/P8. 변경 파일만 재분석해 실 SI(수천~만 파일) 재실행
> 비용을 상수항+변경분으로 낮춘다. 캐시 키=파일 내용 해시, 산출은 파일 단위 파티션+병합.

## 1. 목표 · 수용 기준

- **AC-1 (속도)**: eGov cop(587파일)에서 1개 java 파일 본문 수정 후 재실행(scan) 시간이
  전체(full) 재실행의 **≤ 20%**.
  - 측정 기준은 **엔진 내부 스캔 구간**(`scanDomainMap` 진입~반환, `performance.now`) —
    node 기동+엔진 import(~0.5s)는 파일 수와 무관한 고정비라 증분의 대상이 아니며,
    실 SI 만 파일 스케일에서는 비중이 소멸한다. 벤치 스크립트가 두 값(엔진/벽시계)을
    모두 출력해 은폐 없이 기록한다.
- **AC-2 (동일성)**: 증분 재실행 산출물은 full 재실행과 **byte-diff=0**
  (`.spec/map/*.json` 전 파일). 무변경 재실행도 byte-diff=0(기존 결정론 불변식 유지).
- **AC-3 (정직성)**: 캐시 동작을 침묵시키지 않는다 — scan 출력에 재사용/재추출 건수 표기,
  `--no-cache` 로 전체 재추출 강제 가능, 캐시 손상·버전 불일치는 조용한 오동작 대신
  전체 재추출로 degrade(경고 로그).

## 2. 실측 기초 — 시간이 어디에 쓰이나 (2026-07-05, eGov cop 587파일)

| 스테이지 | 시간 | 성격 |
|---|---|---|
| census | 41ms | fs walk — 매회 필요 |
| **routes** | **706ms** | **전 java 트리시터 파싱** + ctx(상수/composed) + 추출 |
| **edges** | **604ms** | **전 java 재파싱** → JavaFileFacts → 전역 인덱스·해소 |
| slices/candidates | 7ms | 인메모리 병합 |
| jpa / db-schema | 29/42ms | 소량 파싱·텍스트 |
| **interfaces** | **512ms** | **전 java 재파싱** → RawSignal + 텍스트 의심신호 |
| batch-jobs/program-inventory | 44ms | 병합·조인 |
| **risk-report** | **283ms** | **전 java 재파싱**(복잡도) + churn(git 3ms) |
| fingerprints | 27ms | 전 파일 sha256 |
| (buildMap 시) **method-calls** | **410ms** | **전 java 재파싱** → 팩트 → 전역 해소 |

핵심: **동일한 java 파일을 스테이지마다 다시 파싱**(scan 4회 + buildMap 1회)하는 것이
지배 비용(≈2.5s/2.7s). 병합·해소·조인 단계는 전부 합쳐도 ~100ms 수준.

## 3. 아키텍처 — 파일단위 팩트 캐시 + 전역 병합 재계산

원칙: **파일 내용의 순수 함수인 "파일단위 팩트"만 캐시**하고, 파일 간 결합이 필요한
전역 단계(클래스 인덱스, 참조 해소, slices, candidates, 조인, 백분위, 의심신호, 프로퍼티
인덱스, 정렬·id 부여)는 **항상 재계산**한다. 전역 단계가 원래 싸기 때문에(§2) 이 분할로
byte-diff=0 이 구조적으로 보장된다 — 캐시 히트 시 재사용되는 값이 full 스캔이 그 파일에서
계산했을 값과 **정확히 동일 객체**이고, 병합 코드는 공유되므로.

```
buildCensus ──▶ fingerprints(전 파일 sha256, 1회) ──▶ ScanCacheSession
                                                        │
   각 스캐너: 파일마다  hash 일치? ──예──▶ 캐시 팩트 재사용
                          │아니오/무효
                          ▼
                    파싱+추출 → 캐시에 기록
                                                        │
   전역 병합(인덱스·해소·정렬·조인) ◀── 팩트(캐시+신규 혼합) ──┘
   finalize: 삭제 파일 프루닝 + .spec/cache/scan-facts.json 결정론 기록
```

### 3.1 저장소 — `.spec/cache/scan-facts.json`

단일 JSON(섹션별 파티션, relPath 정렬, 결정론 직렬화):

```jsonc
{
  "schemaVersion": 1,              // 캐시 파일 골격 버전
  "sections": {
    "java-facts@v1": {             // 섹션명@버전salt (+ 필요 시 configHash)
      "salt": "v1",
      "entries": { "src/A.java": { "hash": "ab12…", "value": { …JavaFileFacts } } }
    },
    "spring-routes@v1": { … },
    "interface-signals@v1:cfg-<hash8>": { … },
    "complexity@v1": { … }
  }
}
```

- **키 = 파일 내용 sha256 앞 16자** — `incremental/computeFileFingerprints` 재사용(기존
  fingerprints.json 과 같은 함수·같은 값). 스캔 시작 시 1회 계산해 캐시 검증과
  fingerprints.json 기록에 공용.
- **버전/무효화**: `schemaVersion`(골격) + 섹션별 salt(추출기 로직 개정 시 수동 bump —
  각 추출기 파일 헤더에 "팩트 스키마 변경 시 salt bump" 규약 명기). salt 불일치 섹션은
  통째로 폐기·재구축. 자동 감지(빌드 해시 연동)는 백로그.
- **손상/부재**: JSON 파싱 실패·구조 이상 → 캐시 없음으로 간주(경고 1줄), 전체 재추출.
  절대 크래시하지 않는다.
- **프루닝**: finalize 때 현재 census 에 없는 relPath 엔트리 제거(삭제 파일), 현재
  실행에서 확인(재사용 or 재기록)된 엔트리만 유지 → 무한 성장 없음.
- `.spec/cache/` 는 파생물 — 분석 대상 프로젝트의 `.gitignore` 에 추가 권장
  (커밋해도 무해: 내용 해시 검증이 있어 낡은 캐시는 자동 무효).

### 3.2 스캐너별 캐시 규칙

| 섹션 | 값(파일단위 팩트) | 파일 외 의존 → 무효화 규칙 |
|---|---|---|
| `java-facts` | `JavaFileFacts`(edges·method-calls **공유** — 동일 `extractJavaFacts` 출력) | 없음(순수). 전역 ClassIndex·해소는 매회 재계산 |
| `spring-routes` | ctx 기여분(상수·composed) + 추출 결과(spring/stripes 라우트, java 배치 W1+W2) + **consumed-ctx 기록** | 병합 ctx 는 전 파일 기여분(캐시 포함)으로 매회 재구축. 파일의 라우트 재사용 조건 = hash 일치 **AND** 기록된 consumed 항목이 새 병합 ctx 와 전부 동치 |
| `interface-signals` | `RawInterfaceSignal[]`(scanJavaInterfaces 출력) | 섹션 salt 에 **configHash**(`interfaceScan.clients` JSON sha256 앞 8자) 포함 — config 변경 시 섹션 전체 무효. 플레이스홀더 해석·병합·의심신호·프로퍼티 인덱스는 매회 재계산 |
| `mybatis-ns` | 파일별 MyBatis 네임스페이스 배열(edges 전용) | 없음(순수). 소비부가 정렬 순회라 배열 저장으로 동일 결과 |
| `complexity` | `{c: number \| null}`(countJavaComplexity, null=판독/파싱 실패 — 노트 재생) | 없음(순수). 백분위·등급은 매회 재계산 |
| `jpa-facts` | 파일별 JPA 기여분(entities/repositories/unresolved — 실패 메시지 포함) | 없음(순수). 사전필터 미스는 빈 팩트로 캐시(재실행 시 판독까지 생략) |
| `sql-facts` | .sql 파일별 DDL/데이터로드 파싱 결과(+실패 메시지) | 없음(순수). 병합(중복·COMMENT 부착·행 합성·tier)은 매회 재계산 — 병합이 테이블 객체를 변조하므로 get 깊은 복사가 전제 |

**consumed-ctx 기록(spring-routes 정밀 무효화)**: `extractSpringRoutes` 는 전역 ctx 를
`.get/.has` 로만 소비한다(spring.ts:71,77,256,297-298). 추출 시 기록용 래퍼 ctx 를 끼워
그 파일이 실제 조회한 키·결과(부재 포함)를 저장한다. 재사용 검증은 "기록된 조회를 새
ctx 에 재생했을 때 결과가 전부 같은가" — 다른 파일의 상수 변경이 이 파일의 라우트에
실제 영향을 줄 때만 재추출된다(전역 ctxHash 방식의 과잉 무효화 회피, 소비 없는 파일은
ctx 가 아무리 바뀌어도 재사용).

**파싱 실패 파일**: 현재 동작(조용히 제외)을 팩트 `null` 로 캐시해 매회 재파싱 시도를
피하되, 산출 동작은 full 과 동일하게 유지.

### 3.3 캐시하지 않는 것 (매회 재계산 — 이유 명기)

- census, fingerprints: 변경 감지의 기준 그 자체.
- 텍스트 스캔류(jsp/web.xml/xml 배치/shell/crontab/의심신호/프로퍼티/bean-index):
  파싱이 아니라 정규식·텍스트 라인 스캔이라 이미 싸다. 캐시 표면적을 늘릴 실익이 없다.
  (만 파일 스케일에서 병목으로 실측되면 백로그.)
- 전역 병합 전부(§3 원칙). churn(git log): 3ms.
- 참고: 최초 설계에서 jpa/db-schema 도 이 목록이었으나, 웜 실행 실측에서 상대 비중이
  커져(각 ~50ms — AC-1 22.1% 미달의 원인) `jpa-facts`/`sql-facts` 섹션으로 승격했다(§8).

### 3.4 배선 — API 는 추가만(비파괴)

- `scanDomainMap(projectRoot, opts?: { cache?: boolean })` — 기본 **on**. 세션을 만들어
  `extractRoutes/extractEdges/extractInterfaces/buildRiskReport(복잡도)/buildMethodCallGraph`
  에 **옵션 인자**로 전달(생략 시 기존 동작 그대로 → 기존 테스트·소비자 무영향).
- fingerprints 계산을 스캔 **선두**로 이동(캐시 검증·fingerprints.json 기록 공용).
  기록 내용은 동일 함수·동일 census 이므로 byte-diff 불변.
- CLI(`understand-map.mjs`): `--no-cache` 플래그, scan 출력에
  `캐시: 재사용 N·재추출 M (변경 c·추가 a·삭제 d)` 1줄.
- `buildMap` 경로의 method-calls 도 같은 세션의 `java-facts` 섹션을 공유.

## 4. 결정론 · 정직성 불변식

- 캐시 파일 자체도 결정론: relPath·섹션 정렬, 타임스탬프 없음 — 동일 commit 에서
  scan 2회 후 캐시 파일 byte-diff=0.
- 산출물 결정론(AC-2)은 §3 분할이 구조적으로 보장 — 회귀 고정은 벤치+단위테스트 이중.
- 캐시가 만드는 어떤 분기도 침묵하지 않는다: 재사용 통계 출력, degrade 경고, salt 규약.

## 5. 검증 계획

1. **단위테스트**(`scan-cache/scan-cache.test.ts` + 각 스캐너 증분 케이스):
   라운드트립·hash 불일치 미스·salt/스키마 불일치 폐기·손상 JSON degrade·프루닝·
   consumed-ctx 무효화(파일 A 의 상수 변경 → A 미소비 파일은 재사용, 소비 파일은 재추출)·
   configHash 변경 시 interface 섹션 무효·파싱실패 null 캐시.
2. **동일성 테스트**: 픽스처 프로젝트에서 (a) full → (b) 1파일 수정 후 증분 → (c) 캐시
   삭제 full — (b)==(c) 를 산출물 문자열로 단언.
3. **벤치**(`scripts/qa-incremental-bench.mjs`, eGov cop):
   cold full → warm 무변경 → 1파일 본문 수정 증분 → `--no-cache` full 재실행과
   `.spec/map/*.json` 전 파일 byte-diff 검증 + 시간 비율 출력. 실측치는 §7 에 기록.

## 6. 백로그 (이번 범위 밖, 명시)

- 캐시 샤딩/JSONL(만 파일에서 단일 JSON 로드가 병목이 되면), jpa·텍스트 스캔류 캐시,
  salt 자동화(빌드 해시), skeleton/bundle/emit 단계 증분, 대시보드 재수집 버튼과의 연동
  (W6 백로그와 합류), `understanding.config.json` 의 scanCache seam.

## 7. 진행 현황 (ledger)

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계(본 문서) | ✅ | | 실측 분해 §2 포함 |
| scan-cache 모듈+배선 | ✅ | | 섹션 7종(java-facts 공유 포함), CLI `--no-cache`+통계 출력 |
| 테스트·eGov 실측 | ✅ | | §8 — AC-1 14.7% PASS·AC-2 byte-diff 0 PASS, 932+297 green |
| 적대적 리뷰 2종+disposition | ⬜ | | |

## 8. 실측 결과 (2026-07-05, eGov cop 587파일·java 172)

`scripts/qa-incremental-bench.mjs`(재현 하네스, 대상 파일 자동 원복) 출력:

| 단계 | 시간 | 비고 |
|---|---|---|
| cold full(캐시 없음) | 2642ms | 프로세스 첫 실행(JIT 콜드) 포함 |
| warm 무변경 | 292ms (**11.0%**) | byte-diff 0건, 재사용 1032엔트리 |
| 증분(1파일 수정) | 340ms | 컨트롤러 1본 본문 append |
| full(`--no-cache`) | 2317ms | JIT 웜 상태의 보수적 분모 |

- **AC-1: 340/2317 = 14.7% ≤ 20% PASS** (독립 프로세스 교차 측정에서도 458/2409 = 19.0%).
- **AC-2: byte-diff=0 PASS** — warm·증분 모두 full 과 `.spec/map/*.json` 전 파일 일치.
- 섹션별 재추출(1파일 수정 시): 7섹션 모두 해당 1파일만 재추출, 나머지 전부 재사용.
- 캐시 크기: eGov cop 기준 `.spec/cache/scan-facts.json` ≈ 1.6MB.
- 회귀: legacy-core 932(신규 16 포함) + 루트 297 전부 green. consumed-ctx 전파는
  e2e(`incremental-scan.test.ts`)로 고정 — 상수 정의 파일만 수정해도 소비 파일 라우트가
  갱신되고, 미소비 파일은 재사용 유지.
