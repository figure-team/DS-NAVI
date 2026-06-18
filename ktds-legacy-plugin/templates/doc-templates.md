# 산출물 문서 기본 템플릿 (Component 5)

> 목적: 산출물 생성 시 **각 문서가 동일한 구조**를 따르도록 하는 기본 템플릿(AC-36).
> 적용: doc-generator(`@ktds/legacy-core` doc-generator) + SI표준 방법론 모듈(보완 C).
> 이 파일은 플러그인에 동봉되어 사람이 편집 가능하며, 렌더러가 런타임에 로드한다(편집 즉시 반영).
> 데이터 모델: `GeneratedDoc{docId,title,methodology,sections[]}` · `Section{heading,prose?,claims[]}` ·
> `Claim{text,confidence,evidence[],requiresHumanReview}`. confidence 는 `CONFIDENCE_VALUES` 단일 소스와 일치.

---

## 0. 공통 문서 계약 (모든 문서 공유)

모든 산출물 문서는 아래 골격을 **반드시** 동일하게 따른다.

```markdown
---
docId: <문서ID>            # 예: 03_feature-spec | si-기능명세서
title: <문서 제목>
methodology: <as-built | si-standard>   # 방법론 모듈
status: DRAFT | UNDER_REVIEW | APPROVED | RETURNED
sourceCommit: <git hash>
evidenceRate: <0.0~1.0>     # CONFIRMED 비율(근거 보유 claim)
---

# <문서 제목>

> 상태: <status> · ktds doc-generator · 근거 기반 자동 생성

## <섹션 제목>

<선택적 산문(prose) — host(Claude) 주입, 골든 diff 비대상>

<!-- claims:FENCE:OPEN -->
- [확정] <주장 텍스트>. 근거: `path:line`
- [확정(AI)] <AI 합성 주장>. 근거: `path:line`
- [추정] <추론 주장>.
- [확인 필요] <동적/불명 주장>.
<!-- claims:FENCE:CLOSE -->

_(항목 없으면 "_(항목 없음)_")_
```

**신뢰도 태그 규약 (4단계, CONFIDENCE_VALUES 단일 소스):**
| 태그 | confidence | 의미 | 근거 의무 |
|---|---|---|---|
| `[확정]` | CONFIRMED | 코드 증거(file:line)로 직접 확인 | `근거: path:line` ≥1 (필수) |
| `[확정(AI)]` | CONFIRMED_AI | AI 합성이나 근거 앵커 보유 | 가능하면 앵커 |
| `[추정]` | INFERRED | 구조/관례 기반 추론 | 가능하면 앵커 |
| `[확인 필요]` | UNVERIFIED | 동적/불명/근거 미확보 | — |

**규칙(evidence enforcement):**
- `[확정]`(CONFIRMED)은 근거 0이면 저장 차단(status=RETURNED).
- 섹션/문서 INFERRED 비율 > 0.6 → 승인 차단(APPROVED 불가).
- **사람 확정은 confidence 레벨이 아니라 doc-state(APPROVED + approver + 감사 로그)로 기록**한다.

---

## 1. as-built 참조 문서 (현행 5종 — 구조 명문화)

### 01_tech-stack.md — 기술 스택
| 섹션 | claim 형태 | 근거원 |
|---|---|---|
| 언어 | `사용 언어: {lang}` | project.languages |
| 프레임워크 / 주요 라이브러리 | `프레임워크/라이브러리: {fw}` | project.frameworks |
| 모듈 | `모듈: {name} — {summary}` | module 노드 |

### 02_architecture.md — 아키텍처
| 섹션 | claim 형태 | 근거원 |
|---|---|---|
| 레이어 | `레이어: {name} ({N}개 구성요소) — {desc}` `[추정]` | layers |
| 의존 방향 | `의존: {src} → {tgt} ({type})` | depends_on/imports 엣지 |
| 순환 의존 후보 | `순환 의존 후보: {a → b → a}` `[확인 필요]` | detectCycles |

### 03_feature-spec.md — 기능 명세
| 섹션 | claim 형태 | 근거원 |
|---|---|---|
| 업무 도메인 | `업무 도메인: {name} — {summary}` | domain 노드(summary 인용 시 CONFIRMED) |
| 엔터티 · 업무 규칙 | domainMeta(entities·businessRules) | domainMeta |
| 처리 흐름 | `흐름: {name} — {summary}` | flow 노드 |
| 처리 단계 | `처리 단계: {name} — {summary}` | step 노드(file:line) |

### 04_api-spec.md — API 명세
| 섹션 | claim 형태 | 근거원 |
|---|---|---|
| 엔드포인트 | `엔드포인트: {name} — {summary}` | endpoint/route 노드 |
| 라우팅 / 미들웨어 | `라우팅/미들웨어: {src} → {tgt}` | routes/middleware 엣지 |

### 05_db-spec.md — DB 명세
| 섹션 | claim 형태 | 근거원 |
|---|---|---|
| 테이블 / 스키마 | `테이블/스키마: {name} — {summary}` | table/schema 노드 |
| 데이터 접근 | `데이터 접근: {src} →읽기/쓰기→ {tgt}` | reads_from/writes_to 엣지 |

---

## 2. SI표준 정형 문서 (보완 C — v1 3종)

> 한국 SI 제출 서식. 공통 계약(§0) 공유 + 표 중심 정형 양식. 각 행에 **근거(file:line) + 신뢰도 태그** 열 필수.

### si-기능명세서.md (← 03_feature-spec 재구성)
```markdown
## {도메인명} 도메인

| 기능ID | 기능명 | 설명 | 진입점 | 관련 API | 관련 테이블 | 업무규칙 | 신뢰도 | 근거 |
|--------|--------|------|--------|----------|-------------|----------|--------|------|
| {FN-001} | {기능명} | {설명} | {entryPoint} | {route} | {table} | {rule} | [확정] | `path:line` |
```
- 도메인별 섹션 반복. entryPoint/entryType(http·cli·event·cron)는 domainMeta에서.
- 업무규칙은 domainMeta.businessRules(없으면 `[추정]`/빈칸).

### si-인터페이스정의서.md (← 04_api-spec 재구성)
```markdown
## API 목록

| API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 | 신뢰도 | 근거 |
|--------|------|------|-----------------|------|------|------|--------|------|
| {API-001} | POST | /orders | OrderController.placeOrder | {req} | {res} | {auth} | [확정] | `web/OrderController.java:42` |
```
- 경로·메서드·핸들러는 라우트 추출(CONFIRMED). 요청/응답/인증은 추론 시 `[추정]`.

### si-테이블정의서.md (← 05_db-spec + 보완 B 재구성)
```markdown
## {테이블명}

| 컬럼 | 타입 | PK | FK | NULL | 설명 | 신뢰도 | 근거 |
|------|------|----|----|------|------|--------|------|
| ORDER_ID | NUMBER | ✓ | | N | 주문ID | [확정] | `schema/orders.sql:3` |
```
- MyBatis = Mapper XML SQL 슬라이스 근거. JPA = `@Table/@Column` 명시(확정) 또는 암묵 명명전략(`[추정]`, 보완 B BF1).

---

## 3. 템플릿 적용 규칙 (생성 일관성)
1. 문서 생성기는 **반드시 위 섹션 순서·헤딩·열 구조**를 따른다(결정론 skeleton).
2. 모든 표 행 = 1 claim. 근거 열은 `path:line`(앵커) 또는 `[추정]`/`[확인 필요]`.
3. 산문(prose)은 섹션 본문에만, claim 펜스 밖. 골든 스냅샷은 skeleton(펜스 내)만.
4. SI표준 모듈은 as-built 노드·엣지 데이터를 재구성할 뿐, **새 사실을 지어내지 않음**(grounding 보존).
5. 방법론 교체(as-built ↔ si-standard) 시 동일 그래프에서 다른 템플릿만 적용.
