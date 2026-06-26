# 정책서(.md) 생성 설계서

> 코드·DB 신호에서 **정책서(.md)** 를 생성한다. 정책서는 기존 9종 산출물과 달리 **규범(prescriptive)** 문서라 코드에서 100% 도출되지 않으며, **기존 문서가 있을 수도/없을 수도** 있어 **신규 생성 + ingest·대조** 두 경로를 모두 지원한다.
> 정책값의 권위 소스가 코드보다 **DB(스키마 + 공통코드/룩업 테이블)** 인 카테고리가 많아, **DB 분석을 선행 기반(P0)** 으로 둔다.
>
> **근거 소스 (2026-06-26 조사 반영):**
> - `packages/legacy-core/src/doc-generator/` — 기존 템플릿 기반 문서생성(9종) 엔진. `types.ts`(GeneratedDoc/Claim/Evidence), `doc-set.ts`(DOC_SET), `methodology/registry.ts`(방법론 레지스트리)
> - `packages/legacy-core/src/domain-map/java-facts.ts` — tree-sitter Java 팩트(ClassFact: `annotations[]`, FieldFact·MethodFact `annotations[]`, `ClassKind='enum'`) — 정책 신호의 결정론 기반
> - `packages/legacy-core/src/jpa/` — `@Entity/@Table/@Column`/제약/관계 추출 + **3-Tier 신뢰 사다리**(CONFIRMED/INFERRED/UNVERIFIED, `[추정]`) — 본 설계의 신뢰도 모델 원형
> - `packages/legacy-core/src/mybatis/` — 매퍼 SQL → 테이블·컬럼·CRUD
> - `packages/dashboard/vite.config.ts` — DocsView 서버(`/doc-list.json`·`/doc-content.json`·`POST /doc`), `doc-overrides.json`(편집/확정)
> - 선행 설계: `DOC_GENERATION_DESIGN.md`(템플릿 문서생성), `RTM_TAB_DESIGN.md`(원장/근거 모델)

---

## 0. 배경 · 현재 동작

`understand-docs` 는 템플릿(`templates/doc/*.md`, `{#binding-key}` 섹션) + 빌더 함수 + `DOC_SET` 레지스트리 + 방법론 그룹(`as-built`/`si-standard`)로 **9종**을 생성한다. 모든 셀은 **근거(file:line) 기반 claim**이며, CONFIRMED는 근거 0이면 안 되고(`evidence/enforce.ts`), 추정은 `[추정]` 태그, 상태는 `DocStatus`(DRAFT→APPROVED)로 사람이 확정한다. 결정론(Date.now/random 미사용).

**현재 DB 정보는 전부 코드 역추론이다.** `jpa/extract.ts`(어노테이션)와 `mybatis/extract.ts`(SQL)에서 테이블·컬럼·CRUD를 *추정*할 뿐, **DDL 파서가 없다.** 실제 제약조건(NOT NULL/UNIQUE/FK/CHECK)·인덱스·컬럼주석·공통코드 데이터 행은 분석에 들어오지 않는다.

---

## 1. 정책서의 성격 — 왜 기존 9종과 다른가

| 축 | 기존 9종 (as-built/si-standard) | 정책서 (policy) |
|---|---|---|
| 도출 | 코드 100% 추출 | 코드·DB 신호 + **규범적 진술**(코드만으론 불완전) |
| 기존 문서 | 없음(항상 신규 생성) | **있을 수도/없을 수도** → ingest·대조 필요 |
| 핵심 산출 | 사실(fact) 나열 | 정책 + **준수/위반 대조 상태** |

→ 기존 인프라(템플릿+빌더+DocsView+서버)를 **확장**하되, 정책 고유의 두 가지를 추가한다:
1. **신호→정책 매핑 스캐너** (코드 + DB 신호 병합)
2. **기존 문서 ingest·reconcile 경로** (준수/위반/미정의/문서에만)

---

## 2. 정책 카테고리 ↔ 신호 매핑

> 사용자 정의 9개 항목. 각 항목의 **앵커(file:line)는 결정론으로 확보**, 규범 진술·일부 값은 LLM 보강 + `[추정]`.

| # | docId(정책서) | 결정론 신호 (재사용 소스) | DB 의존 | 갭(LLM/추가스캔) |
|---|---|---|---|---|
| 1 | `policy-glossary` 용어/도메인 사전 | ClassFact 이름, JpaEntity 컬럼, **DDL 컬럼주석**, 테이블/enum 노드 | ◎ | 의미 설명 |
| 2 | `policy-status` 상태값 정책 | `ClassKind==enum`, **공통코드 테이블 행**, 도메인 step | ◎ | `if status==`·전이 메서드 |
| 3 | `policy-authz` 권한 매트릭스 | Field/Method `annotations`(`@PreAuthorize` 등), routes, 미들웨어 | △ | role 표현식 파싱 |
| 4 | `policy-account` 회원/계정 정책 | account 도메인 flow, 인증 routes, 세션/토큰 config | △ | 비번정책 상수 |
| 5 | `policy-validation` 업무 규칙 | 필드 `annotations`(`@NotNull/@Pattern/@Size`) | ○ | 금액/한도 분기 |
| 6 | `policy-billing` 과금/정산/환불 | 결제 도메인 flow, mybatis CRUD, **요율 테이블 행** | ◎ | 세율/수수료 리터럴 |
| 7 | `policy-data` 데이터 정책 | **DDL 제약·FK·인덱스**, JpaEntity, mybatis 테이블 | ◎ | 보존기간 |
| 8 | `policy-integration` 연동/외부 정책 | 외부호출 edges, config(타임아웃/재시도) | ✕ | 계약 의미 |
| 9 | `policy-security` 보안 정책 | 암호화/마스킹 호출, 감사로그, `annotations` | △ | 정책 의도 |

DB 의존 ◎(권위) 5종 = **상태값·용어·과금·데이터**(+권한이 데이터기반일 때). 나머지는 코드 근거가 더 강함.

---

## 3. DB 분석 (P0 기반) — 3-Tier 정적 .sql 스캐너

라이브 DB 커넥터는 **만들지 않는다**(범위·보안 회피). 대신 **소스 트리의 .sql을 정적 파싱**하고, 자산 유무에 따라 **3-tier로 우아하게 degrade**한다. `if(hasDDL)` 분기를 박는 게 아니라 **입력 어댑터가 발견한 자산만큼 신뢰도를 올린다**(JPA 모듈 신뢰 사다리와 동일 철학). 정책서의 "기존 문서 있을 수도/없을 수도"를 DB에 그대로 적용한 것 — 현 대상엔 .sql이 없어 Tier 3로 떨어질 뿐, 능력 자체는 다음 프로젝트에서 켜진다.

| Tier | 입력 (있을 때) | 산출 → 정책 근거 | 신뢰도 |
|---|---|---|---|
| 1 | DDL `.sql` (CREATE TABLE) | 컬럼·타입·제약(NOT NULL/UNIQUE/FK/CHECK)·인덱스·**주석** → 데이터·용어 정책 | CONFIRMED |
| 2 | dataload/seed `.sql` (INSERT) | 공통코드·**상태값·요율 행** → 상태·과금 정책 | CONFIRMED |
| 3 | .sql 없음 | JPA/MyBatis 코드 역추론(현재 상태) | INFERRED `[추정]` |

**신규 모듈** `packages/legacy-core/src/db-schema/`:
- `ddl-scan.ts` — CREATE TABLE/ALTER 파서(제약·FK·인덱스·COMMENT)
- `dataload-scan.ts` — INSERT 행 추출(공통코드/상태/요율 테이블 식별)
- `merge.ts` — JPA/MyBatis 코드신호와 병합(**DDL이 코드추론을 override**)
- 출력 `.spec/map/db-schema.json` → 정책 신호 스캐너 + 기존 **SI 테이블정의서/CRUD 매트릭스**가 공유 소비(정책 전용 작업 아님)

> **검증 주의**: 현 워크트리엔 장난감 `schema.sql`(2테이블, INSERT 없음)뿐이라 Tier 1/2를 입증할 입력이 없다. P0 회귀는 **DDL+DML 리치 fixture**를 작성해 Tier 1/2 결정론 경로를 고정하고, jpetstore fixture는 Tier 3 폴백 회귀로 쓴다.

---

## 4. 아키텍처 — 하이브리드 2단계 + 대조

```
[P0] DB 분석            db-schema 스캐너(DDL+dataload, 3-tier) → db-schema.json
        │
[P1] 신호 스캔          policy-signal-scanner
        │   ← java-facts.ClassFact(annotations) + jpa + mybatis + routes + domain-graph + db-schema
        │   → PolicySignal[] (category, anchor file:line, raw signal, confidence)
        │
[P3] LLM 보강(신규)     /understand-policy SKILL → agent가 앵커 소스 읽어
        │   → PolicyItem 규범 진술 작성, 추정은 [추정], CONFIRMED는 근거≥1 강제(evidence/enforce.ts)
        │
[P4] 대조(ingest)       기존 .md 있으면 파싱 → 각 항목 vs 신호 대조
        │   → policyStatus: 준수 | 위반 | 미정의(코드에만) | 문서에만(미구현)
        ▼
[P5] 표면화             doc-output/policy-*.md + doc-overrides.json + DocsView "정책서" 그룹
```

---

## 5. 데이터 모델

기존 `GeneratedDoc`/`Claim`/`Evidence`(`doc-generator/types.ts`) **재사용 + 최소 확장**:

- `MethodologySchema` 에 `'policy'` 추가 (types.ts:13) — `z.enum(['as-built','si-standard','policy'])`
- `ClaimSchema` 에 선택 필드 추가 (기존 소비자 무영향):
  ```ts
  policyStatus: z.enum(['준수','위반','미정의','문서에만']).optional()  // reconcile 전용
  ```

**신규** `packages/legacy-core/src/policy/types.ts`:
```ts
PolicyCategory = z.enum([
  'glossary','status','authz','account','validation','billing','data','integration','security'
])
PolicySignal = { category, anchor: Evidence, signal: string, confidence }   // 스캐너 산출
PolicyItem   = { category, statement: string, claims: Claim[], policyStatus? } // 문서 항목
```
모든 배열은 생산자에서 명시 키로 정렬(결정론). 신뢰도는 `../types.js` `CONFIDENCE_VALUES` 단일 소스.

---

## 6. 두 경로 — 신규 생성 vs ingest·대조

**신규 생성** (기존 문서 없음):
1. 신호 스캐너 → PolicySignal[] (앵커 확보)
2. SKILL 오케스트레이션: agent가 앵커 소스를 읽어 정책 진술 작성 → PolicyItem
3. 코드/DB 근거 없는 진술은 `[추정]`, 근거 있으면 CONFIRMED(근거≥1 강제)

**ingest·대조** (기존 문서 있음 — `.understand-anything/policy-input/<category>.md`):
1. 기존 .md 파싱 → 항목 단위 정규화(정형 아닐 수 있어 LLM 보조)
2. 각 항목을 신호와 대조 → `policyStatus`:
   - **준수**: 문서 정책 ↔ 코드/DB 신호 일치
   - **위반**: 문서 정책 ↔ 신호 불일치
   - **미정의**: 코드/DB엔 있으나 문서에 없음(코드에만 존재)
   - **문서에만**: 문서엔 있으나 코드/DB 신호 없음(미구현 가능)
3. 대조 섹션 + 항목별 배지로 렌더

---

## 7. 표면화 (기존 인프라 재사용)

- **출력**: `.understand-anything/doc-output/policy-*.md` (자동 `/doc-list.json` 인식)
- **편집/확정**: `POST /doc` + `doc-overrides.json` **그대로 재사용**
- **DocsView**(`packages/dashboard/src/components/DocsView.tsx`): methodology 그룹에 **"정책서"** 라벨 추가, 항목별 **준수/위반/미정의/문서에만 배지**(소폭 추가)
- **서버 신규 엔드포인트 불필요**. 선택적으로 대시보드 재생성 트리거 `POST /policy-generate`(rtm-change 패턴) — 후속

---

## 8. 변경 지점 (구체 파일)

**legacy-core**
- `src/db-schema/{ddl-scan,dataload-scan,merge,types,index}.ts` (신규, P0)
- `src/policy/{types,signal-scanner,literal-scan,reconcile,index}.ts` (신규)
- `src/doc-generator/methodology/policy.ts` (신규) — MethodologyModule(id `'policy'`, buildDocSet 9종)
- `src/doc-generator/methodology/registry.ts` — REGISTRY에 policy 등록
- `src/doc-generator/types.ts` — methodology `'policy'`, Claim.policyStatus
- `templates/doc/policy/*.md` (신규 9개) — `{#binding-key}` 섹션 템플릿

**plugin/skill**
- `skills/understand-policy/SKILL.md` (신규) — 스캔→LLM보강→ingest 오케스트레이션
- `scripts/understand-policy.mjs` (신규) — `buildDocSet('policy')` 실행, doc-output 출력

**dashboard**
- `packages/dashboard/src/components/DocsView.tsx` — "정책서" 그룹 + 준수 배지
- (선택) `vite.config.ts` — `POST /policy-generate` 트리거

**tests/fixtures**
- DDL+DML 리치 fixture (P0 Tier 1/2 회귀)
- `src/db-schema/*.test.ts`, `src/policy/*.test.ts`

---

## 9. 단계 계획 (phase별 stop — ralph 관례)

| Phase | 범위 | 산출 | 검증 |
|---|---|---|---|
| **P0** | DB 분석 기반 | `db-schema/` 스캐너(DDL+dataload, 3-tier) + 리치 fixture | Tier 1/2/3 회귀(결정론) |
| **P1** | 정책 신호 스캐너 | `policy/{types,signal-scanner}` 코드신호+DB신호 병합 | jpetstore로 권한·데이터·용어·Validation 4종 앵커 추출 |
| **P2** | methodology 등록 | `policy.ts` 모듈 + 9 템플릿 + DOC_SET/registry 와이어링 | 템플릿 폴백 |
| **P3** | 신규 생성 경로 | `understand-policy` SKILL + 스크립트, LLM 보강, `[추정]`/근거강제 | doc-output 출력 |
| **P4** | ingest·대조 | `reconcile.ts` 준수/위반/미정의/문서에만 | 기존 .md fixture 대조 |
| **P5** | 표면화 + 검증/데모 | DocsView 그룹·배지, sync:demo, 시각 QA | vitest 전체 green |

> **PoC 우선순위**: 코드 근거가 강한 **권한·데이터·용어·Validation 4종** 먼저, DB·LLM 비중 큰 나머지(상태값·과금·계정·연동·보안)는 후속.

---

## 10. 규약 · 리스크 · 미해결

**규약(기존 계승)**
- 결정론: Date.now/random 미사용, 모든 배열 명시 키 정렬
- 근거강제: CONFIRMED claim은 근거(file:line)≥1, 미상은 `[추정]`(INFERRED)/`[확인 필요]`(UNVERIFIED)
- 사람 확정은 confidence가 아니라 `DocStatus`로 기록, 편집은 `doc-overrides.json`(재분석에도 보존)

**리스크**
1. **리터럴 신호 갭**: 세율/수수료 상수·정규식·`if status==` 분기는 java-facts 미캡처 → 권장: **앵커만 결정론, 값/진술은 LLM `[추정]`** (`literal-scan.ts`는 후속 결정론 보강 여지)
2. **현 워크트리 DB 자산 부재**: Tier 1/2 입증 불가 → 리치 fixture 필수(§3)
3. **ingest 입력 비정형**: 기존 정책서가 정형이 아닐 수 있어 항목 정규화에 LLM 의존

**미해결(차기 결정)**
- 9종 전부 vs 4종 PoC 우선(§9 권장: 4종 먼저)
- `literal-scan.ts` 결정론 추가스캔 깊이
- 대시보드 재생성 트리거 엔드포인트 채택 여부
