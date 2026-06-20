# 산출물 문서 생성 — 템플릿 기반 생성 + 편집/확정 설계

> 브랜치 `ktds-code-atlas`. 사용자가 정의한 기능: **각 문서 유형별 템플릿을 확인해 그 구조에
> 맞춰 내용을 채운 `.md` 를 생성**하고, 템플릿/생성물 모두 사용자가 수정 가능하며, 수정 시
> **확정(사용자명)** 상태가 되어 화면에 반영된다. node-detail 2축 모델(템플릿 P4 + 편집/확정 P3)을
> **문서 단위**로 적용. 새 세션은 이 문서부터 읽을 것.

## 0. 사용자 정의 흐름 (원본 의도)
1. **(선행)** SI에서 필요로 하는 문서를 조사 → 문서별 **기본 템플릿**을 먼저 만들어 둔다.
2. **(생성)** 프로젝트 분석 후 docs 생성 시 각 문서 템플릿을 확인 → 템플릿 구조에 맞춰 `.md` 생성.
3. **(커스텀)** 템플릿은 사용자가 수정 가능(플러그인 기본 + 프로젝트 override).
4. **(편집·확정)** 생성된 `.md` 를 사용자가 수정 가능 → 화면 반영 → 수정 시 **확정(사용자명)** 상태.

## 1. SI 산출물 조사 결과 (2026-06-20)
출처: CBD SW개발 표준 산출물 가이드(NIA 기반) + SI 실무 산출물 목록.
- 분석: 요구사항정의서, 유스케이스명세서, 현행시스템분석서, 용어사전, 요구사항추적표.
- 설계: 아키텍처설계서, 클래스설계서, 인터페이스설계서, 기능명세서/화면정의서, ERD,
  테이블정의서, 프로그램목록, 코드정의서, 메뉴구성도, DB설계서, 시험케이스.

**우리 도구 제약 = file:line 근거 가능 여부**(정적분석). 근거 가능한 문서만 [확정] 생성,
나머지는 [추정]/[확인 필요] 또는 범위 밖.

## 2. 확정 문서 세트 (근거 가능 9종, 사용자 승인 2026-06-20)
| docId | 문서 | 근거원 | 빌더 현황 |
|---|---|---|---|
| 01_tech-stack | 기술 스택 | project.languages/frameworks · module | buildTechStack 존재 |
| 02_architecture | 아키텍처 설계서 | layers · depends_on/imports · 순환탐지 | buildArchitecture 존재 |
| si-기능명세서 | SI 기능명세서 | domain 노드 · domainMeta | buildSiFeatureSpec 존재 |
| si-인터페이스정의서 | SI 인터페이스정의서 | routes 추출 | buildSiInterfaceSpec 존재 |
| si-테이블정의서 | SI 테이블정의서 | table/schema · JPA/MyBatis(P6) | buildSiTableSpec 존재 |
| 06_program-list | 프로그램 목록 | file/class 노드(census) | **신규 빌더 필요** |
| 07_crud-matrix | CRUD 매트릭스 | flow→dao→table · 매퍼 SQL/메서드 | **신규 빌더(매퍼 SQL 판정)** |
| 08_batch-list | 배치 작업 목록 | routes.batchEntries | **신규 빌더(추출 보유)** |
| 09_impact-analysis | 영향도 분석서 | fan-in/out 엣지 · impact reach · 교차도메인 | **신규 빌더(impact 재사용)** |

Tier A 3종(07~09)은 SI/ITO 수요 큼 + 근거 강함이라 추가(사용자 승인). 범위 밖(근거 약함):
요구사항정의서·시험케이스·데이터전환·운영매뉴얼 등. Tier B(메뉴/화면·코드정의서·클래스설계서·
ERD)는 추출 보강 필요 → D2 이후 점진 확장 후보.

## 3. 단계 (stop-per-phase)
- **D1 — 기본 템플릿(선행). ✅ 완료.** `templates/doc/` 에 9종 + `_README.md`
  (형식·바인딩키 어휘·신뢰도 규약). `doc-templates.md` 헤더의 잘못된 "런타임 로드" 문구 정정
  (계약 스펙으로 역할 명확화). 기본값(헤딩·컬럼·docId)은 **현재 빌더 출력과 1:1**로 인코딩 →
  D2 연결 시 골든 스냅샷 보존.
- **D2 — 템플릿 런타임 로드 + 생성 연결.** 엔진에 순수 파서 `parseDocTemplate`(node-template.ts
  의 parseNodeDetailTemplate 동형: frontmatter + `## 라벨 {#바인딩키}` + 표 컬럼 헤더 1줄).
  understand-docs.mjs 가 IO(프로젝트 override → 플러그인 폴백, loadNodeDetailTemplate 동형).
  빌더는 헤딩/제목/컬럼을 **템플릿에서** 가져오고(바인딩키로 매핑), 미정의 시 DEFAULT 상수 폴백.
  신규 빌더 4종: 06_program-list(file/class), 07_crud-matrix(flow→dao→table + 매퍼 SQL C/R/U/D
  판정), 08_batch-list(routes.batchEntries), 09_impact-analysis(fan-in/out + impact reach +
  교차도메인 엣지). 게이트: 골든 스냅샷(기존 5종=현출력) 불변 + 신규 4 doc 스냅샷.
- **D3 — 편집/확정 + 대시보드.** 생성 `.md` 를 대시보드에서 보기/편집 → dev서버 `POST /doc`
  (토큰+화이트리스트, node-overrides 패턴) → `<proj>/.understand-anything/doc-output/<docId>.md`
  저장(생성물과 분리) → 저장=즉시 **확정(approver)** (doc-overrides.json: editedAt+approver+audit).
  대시보드 문서 뷰 + `확정(사용자명)` 배지(TrustBadge 재사용). approver=understanding.config.approver.

## 4. 핵심 결정 (node-detail 재사용)
- 템플릿 형식·출처우선순위·편집즉시반영 = node-detail 동형([[code-atlas-template-runtime]]).
- 편집·확정·서버저장·approver·audit = node-overrides P3 동형([[node-detail-edit-design]]).
- claim **생성은 코드 로직**(그래프 질의)이라 템플릿은 **표시 구조만**(헤딩·제목·컬럼·순서·바인딩키)
  외부화. 바인딩키는 고정 어휘(생성기가 아는 값만 채움) — node-detail 의 섹션 id 와 동일 철학.
- 결정론·근거 보존: 기본 템플릿=현 빌더 출력 → byte-diff 0. 사람 확정은 confidence 아닌 별도 축.

## 5. 검증 게이트 (매 단계)
legacy-core 테스트(현 539) · 골든 스냅샷(doc-generator/methodology) · 코어불변식 `git diff ua-base
-- understand-anything-plugin/packages/core`=∅ · dashboard build/test(D3) · jpetstore-6 실측.
