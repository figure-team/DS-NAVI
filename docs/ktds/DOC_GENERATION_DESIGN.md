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
- **D2 — 템플릿 런타임 로드 + 생성 연결. ✅ 완료(커밋 200c4d3·b5c9f2d·d4fcfa9).**
  - D2.1 `doc-template.ts`: parseDocTemplate(frontmatter + `## 라벨 {#바인딩키}` + 표 컬럼 헤더 1줄)
    + applyDocTemplate(제목·헤딩·컬럼·순서 덮어쓰기, 컬럼 수 같을 때만 rename=매트릭스 안전,
    반복 섹션=테이블별 N섹션 지원). Section 에 binding key(additive). 테스트 +16.
  - D2.2 신규 빌더 4종 + `doc-set.ts`(DOC_SET: docId↔빌더↔템플릿). 기존 5+SI3 에 key 부여.
    **현실 제약 반영**: MyBatis 라 table 노드 없음 → 07_crud-matrix 는 **기능×DAO(매퍼)** + 메서드명
    CRUD 추론([추정], 테이블 단위는 Tier B). 09 는 calls 엣지 fan-in/out + reach + 도메인쌍.
    테스트 +19(골든 4 + applyDocTemplate 라운드트립=기본 템플릿 byte-identical). legacy-core 574.
  - D2.3 understand-docs.mjs: 템플릿 로드(override→폴백) + 9종 생성 + `.md` 출력
    (`.understand-anything/doc-output/<docId>.md`). 입력=**디스크 fill 그래프 + routes.json**.
    ⚠️ **buildMap 호출 금지**: buildMap→emitDomainGraph 가 domain-graph.json 을 결정론 skeleton 으로
    재-emit(LLM 채움 소실)함. understand-docs 는 디스크 그래프를 읽기만(비파괴). 채움 갱신은
    understand-map `map`→`emit` 으로만.
  - 잔여(refine): si-기능명세서 행 신뢰도가 domain 노드 filePath 부재로 [추정] — domainMeta.ktdsClaims
    인용을 행 근거로 승계하면 [확정] 승격 가능(후속).
- **Tier B — MyBatis 테이블 추출. ✅ 완료(커밋 b4fd99f).** `src/mybatis`(parseMapperXml/
  buildMyBatisModel, 정규식): 문별 CRUD(문 종류)·테이블(FROM/JOIN/INTO/UPDATE)·컬럼(INSERT/UPDATE).
  → crud-matrix=**기능×테이블**(CRUD를 SQL 문에서 [확정], 근거=Mapper XML file:line), si-테이블정의서=
  테이블별 컬럼([확정]). understand-docs 가 매퍼 XML 스캔→모델→input. legacy-core 586.
- **CRUD 핸들러 정밀화. ✅ 완료(커밋 38706b9).** 파일 단위 사용메서드 라벨의 CRUD 과다귀속 해소:
  `reachableMethods`(method-calls.ts) 로 흐름 핸들러(entryPoint Class#method)에서 BFS 도달하는 매퍼
  메서드만 귀속(buildByTablePrecise). understand-docs 가 method-calls.json 전달. graph 없으면 파일단위
  폴백. 실측: editAccount=ACCOUNT RU, newAccount=CR, signon=R(과거 셋 다 CRU 동일 → 정정). legacy-core 589.
- **D3 — 편집/확정 + 대시보드. ✅ 완료(커밋 fa0b25f 대시보드 + 직전 dev서버).**
  - dev서버(vite.config): GET /doc-list.json · GET /doc-content.json?docId= · POST /doc(토큰 게이트,
    docId 실존=traversal 방지·approver 필수). 편집은 `.understand-anything/doc-overrides.json` 오버레이
    (생성물 doc-output 불변, 재생성 생존). 레코드=확정, audit append-only. content 우선=오버레이.
  - DocsView: 좌측 목록(제목+확정 배지)+우측 본문(monospace 뷰/textarea 편집). 저장=즉시 확정 →
    TrustBadge '✓ 확정(approver)' 반영. approver=approverHandle/localStorage/1회 입력. App '산출물' 탭+풀페이지.
  - 헤드리스 QA: 9문서·편집→저장→확정(qa-user) 배지+내용 반영, 콘솔 에러 0. dashboard 129·코어불변식 ∅.
  - 본문 GFM 표 렌더 ✅(커밋 833a59c, react-markdown + remark-gfm, 다크테마 표). DocsView i18n 은
    ko 리터럴 유지(사용자 확정: ko 충분).

> **기능 완결**: D1(템플릿 9종)·D2(런타임 로드+생성)·Tier B(테이블 추출)·CRUD 정밀화·D3(편집/확정)
> 전부 완료. 사용자 정의 흐름(템플릿→생성→커스텀→편집/확정→화면 반영) 충족.

## 4. 핵심 결정 (node-detail 재사용)
- 템플릿 형식·출처우선순위·편집즉시반영 = node-detail 동형([[code-atlas-template-runtime]]).
- 편집·확정·서버저장·approver·audit = node-overrides P3 동형([[node-detail-edit-design]]).
- claim **생성은 코드 로직**(그래프 질의)이라 템플릿은 **표시 구조만**(헤딩·제목·컬럼·순서·바인딩키)
  외부화. 바인딩키는 고정 어휘(생성기가 아는 값만 채움) — node-detail 의 섹션 id 와 동일 철학.
- 결정론·근거 보존: 기본 템플릿=현 빌더 출력 → byte-diff 0. 사람 확정은 confidence 아닌 별도 축.

## 5. 검증 게이트 (매 단계)
legacy-core 테스트(현 592) · 골든 스냅샷(doc-generator/methodology) · 코어불변식 `git diff ua-base
-- understand-anything-plugin/packages/core`=∅ · dashboard build/test(D3) · jpetstore-6 실측.

## 6. 근거율 현황 (jpetstore-6 실측) + 0% 진단
| 문서 | 근거율 | 비고 |
|---|---|---|
| si-인터페이스정의서·si-테이블정의서·06_program-list·09_impact-analysis·si-기능명세서 | 100% | file:line [확정] |
| 01_tech-stack | 92% | pom.xml 의존성 [확정] + 언어 [추정](커밋 db1facd) |
| 07_crud-matrix | ~50% | DB 접근 흐름만 [확정], 포워딩 전용 흐름은 접근 없음(정상) |
| 02_architecture | 0% | **구조적 한계**: 의존(depends_on/imports) 엣지가 skeleton 그래프(contains_flow/flow_step/calls)에 없음 → 레이어/의존 [추정]. 해소하려면 edges.json(파일 의존)을 DocInput 에 주입하는 후속 필요. |
| 08_batch-list | 0% | 정상 — 배치 0개(빈 표). |

**0% 해소 이력:** 01_tech-stack(빈 문서)·si-기능명세서(인용 미승계)는 커밋 db1facd 로 근거화. 남은
02_architecture 는 edges.json 주입(후속) 필요 — 그 외 전부 근거 있음.
