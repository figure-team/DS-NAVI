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

### 3.1 입력 계약 (confirm 전제)

```
1) confirmed-plan.json   → 경계·이름 (key/name/roots): "어떤 도메인이며 무엇이라 부르나"
2) skeleton.json         → 흐름(flow)·단계(step) + stepSources(relPath·line·className)
3) db-schema.json        → 도메인이 만지는 테이블의 물리 스키마 (plan A로 map이 생성)
 (+4) method-calls.json  → (선택) 메서드 정밀 분기 귀속 — skeleton step은 파일단위(P3 보강)
```

skeleton은 `confirm`(사람 게이트) 이후에만 생성된다(`buildMap`이 confirmed-plan 있을 때 skeleton/emit). 따라서 **도메인 정책서는 `/understand-map confirm`까지 끝난 프로젝트에서만 동작**한다(카테고리 정책서는 맵 독립). 도메인 경계는 사람이 확정해야 의미가 있으므로 자연스러운 의존.

### 3.2 분기 스캐너(D2) — 가장 어려운 단계

- **대상 한정:** `skeleton.stepSources`가 가리키는 클래스/파일만 연다 → 도메인 경계 안의 코드만 스캔(전역 분기 노이즈 없음).
- **추출:** java-facts(tree-sitter)에 `if/else if/switch/case/삼항` 노드 + **조건식 원문** + file:line + 소속 메서드/클래스 캡처.
- **계산식:** `BigDecimal multiply/add/reduce` 등 계산 지점 위치 — 조건부 여부 판정 입력.
- **출력:** `BranchSignal[]`(도메인키·flow·조건식·위치). 분기 위치·조건식 = `[확정]`, 정책 여부·의미 = 후속 보강 `[추정]`.

### 3.3 문서 구조 (도메인당 1문서 `policy-domain-<key>.md`)

`policy-domain-order.md`(PoC) 형식:

1. **도메인 구성** — 포함 클래스/역할 (결정론).
2. **업무 흐름(Flow)** — 진입점별 단계 (skeleton 흐름 + 서술).
3. **흐름 내 조건/분기 정책** — 표: `흐름 | 조건(분기식) | 분기별 동작 | 종류(권한/상태/계산/검증) | 신뢰도 | 근거`.
4. **계산·처리 규칙** — 계산식 + **조건부 여부**(분기 없으면 "조건 없음"을 근거로 단정).
5. **핵심 발견** — 코드 기반 단정(예: "상품 종류별 차등 계산 정책 부재 — 단일 단가 합산").

**핵심:** 분기가 없으면 "조건 없음"이 정직한 산출물(가치 있는 발견). 데이터 주도 정책(요율 테이블 등 분기 없는 계산)은 코드만으론 놓칠 수 있음 → `[확인 필요]`.

---

## 4. 신뢰도 · 근거 규약 (기존 정책서와 동일)

- `[확정]` — 반드시 `file:line` 근거 동반(분기 위치·조건식·DDL 제약·어노테이션 원문).
- `[추정]` — 분기의 업무적 의미, 계산 조건부 해석, DB 주석 없는 용어 정의 등.
- `[확인 필요]` — 코드 밖 정책(보존기간·운영 규정), 데이터 주도 정책 의심, 하드코딩 플레이스홀더.
- **합성 금지** — 소스에 없는 정책을 지어내지 않는다. **앵커 보존** — 결정론 표의 행·근거를 지우지 않고 덧붙인다.

---

## 5. 구현 P단계

| 단계 | 작업 | 주요 파일 |
|---|---|---|
| **PA1** | db-schema를 `scanDomainMap`에 통합 + `discover.ts`(라이브 신호 정적 탐지) + `db-schema.json`에 `liveDbSignals[]` 필드 | `domain-map/extract.ts`, `db-schema/discover.ts`(신규), `db-schema/types.ts` |
| **PA2** | policy 소비자 전환(있으면 로드·없으면 생성) | `scripts/understand-policy.mjs` |
| **PA3** | docs `db-spec`가 db-schema 소비(컬럼/제약 grounding) | `scripts/understand-docs.mjs`, `builders/db-spec.ts`, `builders/shared.ts` |
| **PA-gate** | SKILL이 `liveDbSignals` 존재 시 .sql 덤프 권장 표출 | `skills/understand-policy/SKILL.md`(또는 understand-map) |
| **PD1** | 분기 스캐너(D2) — skeleton.stepSources 대상 if/switch/삼항+조건식 추출 | `legacy-core/src/domain-policy/`(신규), `java-facts` 확장 |
| **PD2** | `domain-policy` 방법론 + 템플릿(§3.3 구조), 도메인당 1문서 | `methodology/domain-policy.ts`, `registry.ts`, `templates/doc/domain-policy/*.md` |
| **PD3** | 생성 경로 — `understand-policy` 도메인 모드(confirm 전제 입력 로드) | `scripts/understand-policy.mjs` |
| **PD4** | SKILL 보강 지침 — 분기→정책 분류, 계산 조건부 판정 | `skills/understand-policy/SKILL.md` |
| ~~PL~~ | 라이브 DB 연결 — **추후(현 범위 제외)** | — |

**의존:** PA1 → PD3(도메인 정책서가 `db-schema.json`을 맵에서 읽음). 그래서 Part 1(PA) 먼저.

---

## 6. 불변 · 범위

- **불변 게이트:** 전부 ktds 영역(`legacy-core`/`ktds-legacy-plugin`). UA core 무수정(`ua-base` 태그 대조).
- **결정론:** 모든 산출 `byte-diff=0`(동일 commit 재실행). `Date.now`/`random` 미사용.
- **단계별 정지:** 각 P단계 후 커밋·사용자 컨펌.
- **범위 제외(현재):** 라이브 DB 연결, 자격증명 처리, 벤더별 드라이버.
