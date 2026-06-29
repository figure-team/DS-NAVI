# 도메인 정책서 + DB 분석 단일화 설계서

> 두 묶음을 함께 설계한다.
> **(1) plan A — db-schema 분석 단일화:** DDL→테이블/컬럼/제약 파싱을 `/understand-map`이 단독 소유하고, `/understand-policy`·`/understand-docs`는 `.spec/map/db-schema.json` 소비자가 된다.
> **(2) 도메인 정책서(신규):** 카테고리별 정책서(용어/데이터/검증/권한)와 별개로, 한 **업무 도메인**의 흐름과 그 안의 **조건 분기**(권한·상태·계산)를 정리한 정책서를 코드에서 유추한다.
>
> 데모(jpetstore)뿐 아니라 일반 프로젝트 적용을 전제로 한다.
>
> **근거 소스 (2026-06-29 조사 반영):**
> - `packages/legacy-core/src/db-schema/extract.ts` — 정적 `.sql` DDL/dataload 파서(정책서 P0). 3-Tier(`ddl+data`/`ddl`/`code-only`). **라이브 연결·사용자 질문 없음.**
> - `packages/legacy-core/src/domain-map/extract.ts` — `scanDomainMap`(census→routes→edges→slices→candidates→jpaModel→coverage→fingerprints, 174~199행). `extractJpaModel`이 scan 시점에 `jpa-model.json` 산출(186~187행) — db-schema 통합의 선례.
> - `packages/legacy-core/src/domain-map/types.ts` — `SkeletonReportSchema`(domain/flow/step 노드 + `stepSources`{relPath,line,className}), `ConfirmedDomainSchema`(key/name/roots/aliasKeys), `CandidatesReport`/`SlicesReport`.
> - `packages/legacy-core/src/doc-generator/builders/db-spec.ts` — DB 명세서. `nodesWithTag(nodes,'table','schema')`로 그래프 노드에서 테이블 목록을 잡고, JPA `@Table`·MyBatis XML로 보완. **DDL 스키마(컬럼/PK/FK/CHECK)는 미사용.**
> - `scripts/understand-map.mjs` / `scripts/understand-policy.mjs` / `scripts/understand-docs.mjs` — CLI 래퍼.
> - 선행 설계: `POLICY_DOC_DESIGN.md`(카테고리 정책서), `DOMAIN_MAP_DETAIL_DESIGN.md`(도메인 맵).
> - jpetstore 수작업 PoC: `examples/jpetstore-6/.understand-anything/doc-output/policy-domain-order.md`.

---

## 0. 배경 · 현재 동작

**파이프라인 위치.** 정책서는 2단계(산출/분석, `docs`/`rtm`/`impact`와 동급). 단계 요약:

```
0. /understand-init     프로젝트 초기화(.spec/ scaffold)
1. /understand          기본 구조 (upstream 베이스)
   /understand-map      결정론 도메인 맵 (census/routes/edges/slices/candidates + 도메인 경계)
2. /understand-docs     근거 기반 문서(as-built 5 / SI 3)
   /understand-rtm      요구사항 추적표
   /understand-impact   변경 영향도
   /understand-policy   정책서  ← 본 설계
```

**DB "분석"의 3개 층위 (현재).**

| 층위 | 무엇 | 어디서 | 산출 |
|---|---|---|---|
| ① census | `.sql` 파일 **발견**(lang=sql) | map + policy(중복) | `census.json` |
| ② 영속성 토폴로지 | 매퍼→SQL 연결(mybatis 엣지) | map | `edges.json`/`slices.json` |
| ③ db-schema | `.sql` DDL **내용 파싱**(테이블/컬럼/PK/FK/CHECK + 3-Tier) | **policy 단독** | `db-schema.json` |

→ ③ 스키마 내용 분석은 `understand-policy`에만 있다(중복 아님). 실제 중복은 ①(policy가 `buildCensus`를 재호출, `understand-policy.mjs:52`).
→ DB 명세서(`db-spec.ts`)는 ③을 **안 쓰고** 그래프 table/schema 노드 + JPA + MyBatis XML로 테이블을 잡는다 — 같은 "테이블"을 더 얕은 깊이로 본다(단절).

---

## 1. plan A — db-schema 분석 단일화

**원칙: "구조 스캔은 `/understand-map`이 전담, 소비자는 `.spec/map/`을 읽기만."**

```
[1단계] /understand-map  ← DB "분석" 단일 소유
   └─ db-schema 스캔(DDL → 테이블/컬럼/PK/FK/CHECK, 3-Tier)
      → .spec/map/db-schema.json

[2단계] 소비자 (재스캔 0회)
   ├─ /understand-docs   → DB 명세서(db-spec)   ← 문서 생성은 여기 그대로
   │      그래프 노드 목록 grounding에 db-schema 컬럼/제약 병합
   ├─ /understand-policy → 데이터 정책서 등(카테고리)
   └─ 도메인 정책서(신규) → db-schema + 도메인 경계(skeleton/confirmed-plan) 조합
```

**통합 지점.** `scanDomainMap`(extract.ts) 안, `extractJpaModel`(186~187행) 바로 옆에 `extractDbSchema` + `writeMapArtifact(DB_SCHEMA_FILENAME, …)` 한 쌍을 추가한다. census가 이미 `.sql`을 분류(1번)하므로 **입력 추가 비용 0**. `jpa-model.json`과 동일 패턴(census 파생·scan 시점·`.spec/map/` 기록·다운스트림 동기 로드).

**소비자 전환.**
- `understand-policy.mjs`: `extractDbSchema` 직접 호출 제거 → `.spec/map/db-schema.json` **있으면 로드·없으면 생성**(맵 미실행 단독성 보존).
- `db-spec.ts`: `nodesWithTag('table','schema')` 목록에 `db-schema.json`의 컬럼·PK/FK/CHECK를 병합해 DB 명세서 품질 상향.

---

## 2. DB 소스 모델 — 정적 + 라이브 감지 게이트

**라이브 DB 연결은 현 범위에서 구현하지 않는다.** 대신:

```
[발견 — 정적, 무연결]
 1. .sql 스키마 있나?            census lang=sql + DDL 추출 > 0
 2. 라이브 DB 신호 정적 탐지?     pom/gradle JDBC 드라이버, application.{yml,properties} datasource URL
                                 → liveDbSignals[] (벤더·연결문자열 후보, file:line 근거). 연결 안 함.

[게이트 — 라이브 신호가 있으면 .sql 유무와 무관하게 항상 사용자에게 묻는다]
 · liveDbSignals 비어있지 않음 → SKILL이 표출:
     "라이브 DB(<벤더>) 감지됨. [.sql N개 있음 / 없음]
      · 권장: 라이브 스키마를 .sql로 덤프해 넣기 (최신·권위)
      · 또는 기존 .sql 그대로 사용
      · 또는 라이브 연결 (추후 지원)"
   → 사용자 선택 전까지 정적 .sql이 잠정 baseline.
 · liveDbSignals 비어있음 → .sql 있으면 정적 파싱 / 없으면 code-only (조용히, 안 물음)
```

**근거.** 레거시는 `.sql` 마이그레이션이 *있어도* 실제 배포 DB와 어긋날 수 있다. 라이브 감지는 "권위 소스가 따로 있을 수 있다"는 신호이므로, `.sql`이 있어도 사용자에게 알린다.

**결정론·안전.** 엔진은 `liveDbSignals[]`만 결정론으로 기록한다(정적 탐지). "묻기"는 블로킹 프롬프트가 아니라 `/understand-map confirm`과 동일한 **사람 게이트**(SKILL 층). 자격증명은 도구에 유입되지 않으며(덤프 ingest 모델 C), NON-TTY·`byte-diff=0` 불변식 유지. 라이브 연결(자격증명·드라이버·가변 스키마)은 향후 별도 단계.

---

## 3. 도메인 정책서

> **재설계 노트(중요):** 초기 설계는 도메인 정책서를 "구성/흐름/분기" 코드구조 인벤토리로 잡았으나,
> 사용자 표준(`study/Policy/정책서.md`)은 **SI 정책 정의서**다. 핵심은 **"조건(IF) → 처리(THEN)"
> 의사결정 테이블**. 아래는 그 재설계(§0~§8) 기준이다.

### 3.1 입력 계약 (실측 산출물 기반)

```
1) candidates.json        → 도메인 경계 + 멤버 파일(files[].relPath)
2) domain-graph.json(emit)→ 흐름(flow)·도메인 표시명 (없으면 흐름 빈배열·표시명=key 로 degrade)
3) db-schema.json         → 코드/룩업 테이블·주석 (plan A로 map이 생성) → §2 용어·§3 상태값
   + 도메인 .java 의 Java enum → §3 상태값
```

`confirmed-plan/skeleton` 대신 **실제 가용 산출물(candidates + emit된 domain-graph)**을 쓴다(스킬 실행 환경에서 그것들이 늘 존재). 분기 스캔 대상 = 후보 멤버 `.java` ∪ flow 진입점 `.java`(액션빈은 후보 멤버에 안 잡혀도 업무 분기가 밀집 → 흐름·분기 커버리지 일치), 운영 소스만(테스트 제외).

### 3.2 분기 스캐너 (IF + THEN)

- **대상 한정:** 도메인 경계 안의 `.java` 만 스캔(전역 노이즈 없음).
- **추출:** tree-sitter Java AST 순회 — `if/else if/switch/삼항` + **조건식(IF)** + **처리 본문(THEN)** + file:line + 소속 메서드/클래스.
  - THEN: if=consequence 블록 요약 / 삼항="결과 : 대안" / switch=공란. 공백 정규화·중괄호 제거·길이 캡.
- **출력:** `BranchSignal{relPath,line,className,methodName,kind,condition,then}`. IF·THEN·위치 = `[확정]`, 정책명·우선순위·의미 = 보강 `[추정]`.
- **enum 추출:** 같은 패스에서 Java enum(이름+상수) → §3 상태값 시드.

### 3.3 문서 구조 — SI 정책 정의서 §0~§8 (`policy-domain-<key>.md`)

| § | 섹션 | 채움 |
|---|---|---|
| 0 | 문서정보 · 개정이력 | 스캐폴드(관련 산출물=멤버 클래스 `[확정]`) |
| 1 | 개요(목적·적용범위·소유부서) | 적용범위=클래스 `[확정]`, 나머지 스캐폴드 |
| 2 | 용어 정의 | DB 주석·enum 자동 채움(없으면 스캐폴드) |
| 3 | 상태값 정의 | 코드테이블 dataload 행·enum 상수 자동 채움 |
| **4** | **정책 규칙 — 의사결정 테이블 ★** | **분기 → `정책ID(PL-001..) \| 정책명 \| IF \| THEN \| 우선순위 \| 예외/비고`** |
| 5 | 예외 및 엣지 케이스 | 스캐폴드 |
| 6 | 처리 흐름(의사코드) | 메서드별 `IF→THEN`(결정론) |
| 7 | 검증 시나리오 | PL-ID 참조 스캐폴드 |
| 8 | 미결 사항 | 정직한 갭(상태값 미정의 등) 자동 시드 |

**§4가 중심.** IF=조건식·THEN=분기 본문·근거=file:line 은 `[확정]`, 정책명·우선순위·예외는 LLM 보강. 분기 0이면 "무조건 처리(조건부 정책 부재)"를 코드 근거로 단정.

**스캐폴드 표기 규약:** `《 》`=빈칸(사람 입력) · `《YYYY-MM-DD》`=형식 안내 · `제안값 [추정]`=도구/LLM 제안(괄호 없이).

### 3.4 정책 토픽 자동 분리

실무에서 정책은 **도메인이 아니라 정책 토픽(상태값 코드그룹) 단위**다(도메인 1개 ≠ 정책 1개). `splitByTopic`이 한 도메인을 그 **상태값 그룹을 참조하는 분기**별 토픽 + 잔여(처리 정책) 토픽으로 분리한다. 분기가 그룹의 코드값(≥3자)/그룹명(≥4자)을 참조할 때만 분리하고, **강한 근거가 없으면 단일 유지**(보수적, 오분리 방지). docId=`policy-domain-<key>-<group>`, 잔여=`policy-domain-<key>`.

---

## 4. 신뢰도 · 근거 규약 (기존 정책서와 동일)

- `[확정]` — 반드시 `file:line` 근거 동반(분기 위치·조건식·DDL 제약·어노테이션 원문).
- `[추정]` — 분기의 업무적 의미, 계산 조건부 해석, DB 주석 없는 용어 정의 등.
- `[확인 필요]` — 코드 밖 정책(보존기간·운영 규정), 데이터 주도 정책 의심, 하드코딩 플레이스홀더.
- **합성 금지** — 소스에 없는 정책을 지어내지 않는다. **앵커 보존** — 결정론 표의 행·근거를 지우지 않고 덧붙인다.

---

## 5. 구현 이력 (완료)

**Part 1 — db-schema 단일화 (plan A):**

| 단계 | 작업 |
|---|---|
| **PA1** | db-schema를 `scanDomainMap`에 통합 + `discover.ts`(라이브 신호 정적 탐지) + `liveDbSignals[]` |
| **PA2** | `understand-policy` 가 `.spec/map/db-schema.json` 로드(맵 미실행시만 자체 생성) |
| **PA3** | DB 명세서(`si-테이블정의서`/`05_db-spec`)가 DDL 컬럼/PK/FK/CHECK grounding |
| PA-gate | 외부 라이브 DB 감지 시 `.sql` 덤프 권장(내장형 제외) |

**Part 2 — 도메인 정책서:** 1차(PD1~PD4, 코드구조 인벤토리) → **재설계(R1~R4, SI 정책 정의서)**

| 단계 | 작업 |
|---|---|
| **R1** | 분기 스캐너 **THEN(처리 본문) 추출** (`branch-scanner.ts`) |
| **R2/R3** | 빌더 **§0~§8 의사결정 테이블** 양식 재작성 + 템플릿 교체 (`methodology/domain-policy.ts`) |
| **R4** | SKILL §0~§8 보강 지침(IF/THEN 업무언어·충돌 처리 규칙) |
| **①** | 정책 토픽 자동 분리 `splitByTopic`(상태값 그룹 참조 분기 단위) |
| **②** | Java enum 추출 `extractEnums` → §3 상태값/§2 용어 |
| **③** | §2 용어/§3 상태값 자동 채움 `deriveTerms`/`deriveStatusCodes`(코드테이블·주석, 내용참조 scoping) |
| 부수 | 스캐폴드 표기 규약 일관화(`《 》`/형식힌트/제안값) |
| ~~PL~~ | 라이브 DB 연결 — **추후(현 범위 제외)** |

생성 경로: `understand-policy <root> domain` — `assembleDomainPolicies`(candidates+domain-graph+db-schema 로드 → 분기·enum·상태값 조립 → 토픽 분리) → `domain-policy` 방법론 → 템플릿 적용(docId/title 복원) → 렌더.

**1단계(스크립트=결정론 시드) + 2단계(Claude=업무 해석)가 한 세트** — 스킬로 호출하면 Claude가 §4 IF/THEN을 업무 언어로, 정책명·우선순위·예외를 채운다.

---

## 6. 불변 · 범위

- **불변 게이트:** 전부 ktds 영역(`legacy-core`/`ktds-legacy-plugin`). UA core 무수정(`ua-base` 태그 대조).
- **결정론:** 모든 산출 `byte-diff=0`(동일 commit 재실행). `Date.now`/`random` 미사용.
- **단계별 정지:** 각 P단계 후 커밋·사용자 컨펌.
- **범위 제외(현재):** 라이브 DB 연결, 자격증명 처리, 벤더별 드라이버.
