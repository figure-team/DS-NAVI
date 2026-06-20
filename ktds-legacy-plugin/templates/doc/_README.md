# 산출물 문서 템플릿 (doc-generator 기본 템플릿)

> SI 산출물 문서 생성의 **기본 템플릿 세트**. 각 파일 = 문서 1종.
> node-detail 템플릿과 동형으로 **플러그인 동봉 + 사람 편집 가능 + 런타임 로드 대상**이다.
> (런타임 로드·생성 연결은 doc-generator 구현 단계에서 — 현재는 템플릿 권위 정의.)

## 출처 우선순위 (런타임)
1. 프로젝트 override: `<project>/.understand-anything/doc/<docId>.md` (있으면 우선)
2. 플러그인 기본: `ktds-legacy-plugin/templates/doc/<file>.md` (이 디렉터리)

편집은 즉시 반영(재빌드 불필요) — node-detail 패턴과 동일.

## 템플릿 형식

각 템플릿은 frontmatter + 섹션 목록이다.

```markdown
---
docId: <문서 ID>          # 생성기 builder 와 매핑되는 안정 키
title: <문서 제목>         # 표시 제목(편집 가능)
methodology: as-built | si-standard
---

## <섹션 헤딩> {#<바인딩키>}

<채움 지시 프로즈 — 생성기가 무엇으로 채울지 안내. 생성물 본문엔 안 들어감.>

| <컬럼1> | <컬럼2> | ... |     ← 표 섹션만. 컬럼명은 편집 가능.
```

규칙:
- **섹션 헤딩**: `## 라벨 {#바인딩키}`. `{#바인딩키}`는 생성기가 채울 그래프 데이터를 가리키는
  **고정 어휘**(아래 표). 헤딩 라벨·순서는 자유 편집, 바인딩키는 생성기가 아는 값만 채워짐
  (모르는 키 = 빈 섹션 + 프로즈만). node-detail 의 `## 라벨 {#id}` 와 동일 컨벤션.
- **표 섹션**: 헤딩 아래 `| 컬럼 | ... |` 헤더 **1줄**로 컬럼을 정의(편집 가능). **신뢰도·근거 열은
  렌더러가 자동 부가**하므로 여기 적지 않는다(도메인 컬럼만).
- **목록 섹션**: 컬럼 헤더 줄이 없으면 불릿 목록(claim 1개 = 1줄).
- **매트릭스 섹션**(`#crud-matrix`): 고정 열(`| 기능 |`)만 템플릿에 두고, 나머지 열(테이블)은
  분석 데이터로 자동 생성. 셀=C/R/U/D.
- 헤딩 앞 제목(`#`)/주석(`<!-- -->`)/프로즈는 무시(채움 지시·설명용).

## 신뢰도 태그·근거 규약 (4단계, CONFIDENCE_VALUES 단일 소스)

| 태그 | confidence | 의미 | 근거 의무 |
|---|---|---|---|
| `[확정]` | CONFIRMED | 코드 증거(file:line) 직접 확인 | `근거: path:line` ≥1 (필수) |
| `[확정(AI)]` | CONFIRMED_AI | AI 합성이나 앵커 보유 | 가능하면 앵커 |
| `[추정]` | INFERRED | 구조/관례 기반 추론 | 가능하면 앵커 |
| `[확인 필요]` | UNVERIFIED | 동적/불명/근거 미확보 | — |

- `[확정]`은 근거 0이면 저장 차단. 섹션/문서 INFERRED 비율 > 0.6 → 승인 차단.
- **사람 확정은 confidence 가 아니라 문서 단위 `확정(사용자명)` 상태**(approver + 감사 로그)로 기록.
  생성된 `.md` 를 사용자가 편집·저장하면 그 문서는 확정 상태가 된다(node-overrides 패턴 동형).

## 기본 세트 (근거 가능 9종)

| 파일 | docId | 문서 | 근거원 |
|---|---|---|---|
| tech-stack.md | 01_tech-stack | 기술 스택 | project.languages/frameworks · module 노드 |
| architecture.md | 02_architecture | 아키텍처 설계서 | layers · depends_on/imports 엣지 · 순환탐지 |
| feature-spec.md | si-기능명세서 | SI 기능명세서 | domain 노드 · domainMeta |
| interface-spec.md | si-인터페이스정의서 | SI 인터페이스정의서 | routes 추출 |
| table-spec.md | si-테이블정의서 | SI 테이블정의서 | table/schema 노드 · JPA/MyBatis(P6) |
| program-list.md | 06_program-list | 프로그램 목록 | file/class 노드(census) |
| crud-matrix.md | 07_crud-matrix | CRUD 매트릭스 | flow→dao→table · 매퍼 SQL/메서드 |
| batch-list.md | 08_batch-list | 배치 작업 목록 | routes.batchEntries |
| impact-analysis.md | 09_impact-analysis | 영향도 분석서 | fan-in/out 엣지 · impact reach · 교차도메인 엣지 |

## 바인딩키 어휘 (생성기가 채우는 값)

| 바인딩키 | 채움 | 섹션형 |
|---|---|---|
| `#languages` | project.languages | 목록 |
| `#frameworks` | project.frameworks | 목록 |
| `#modules` | module 노드 | 목록 |
| `#layers` | layer 집계 | 목록 |
| `#dependencies` | depends_on/imports 엣지 | 목록 |
| `#cycles` | 순환 의존 후보 | 목록 |
| `#feature-list` | domain 노드(도메인별 행) | 표 |
| `#api-list` | routes(라우트별 행) | 표 |
| `#table-list` | table/schema 노드(테이블별 섹션) | 표(반복) |
| `#program-list` | file/class 노드 | 표 |
| `#crud-matrix` | flow×table CRUD(매퍼 SQL/메서드 판정) | 매트릭스 |
| `#batch-list` | routes.batchEntries | 표 |
| `#impact-hotspots` | fan-in/out + impact reach 상위 | 표 |
| `#cross-domain-deps` | 교차 도메인 의존 엣지 | 표 |
