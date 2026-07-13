# 구조 그래프의 /understand-map 이관 — STRUCTURE_FROM_MAP

> 2026-07-14 설계(사용자 결정: /understand 은퇴 + 구조 메뉴는 map 데이터로 유지).
> 판정: **가능** — 소비처 전수 조사(2026-07-14, 본문 §2)와 map 산출물 실측 근거.
> 관련: PIPELINE_ORDER.md(파이프라인 순서), DOMAIN_HIERARCHY_DESIGN.md(상단도메인),
> domain-card-grounding(codegraph 차용 미래 항목 — §5에서 착수).

## §1 배경 / 사용자 결정

| # | 결정 |
|---|---|
| D1 | **/understand(U-A KG 생성)는 더 이상 사용하지 않는다.** 모든 기능의 데이터 기반을 /understand-map 산출물로 통일 |
| D2 | **구조 메뉴 그래프는 유지**하되, 데이터를 /understand-map 이 만든 도메인·구조 정보로 대체 |

동기: 데이터 일관성 — 두 파이프라인(/understand LLM 분석 ↔ /understand-map 결정론)이 서로 다른
시점·커밋의 산출물을 만들면 하류(화면·RTM·영향도)가 어긋난다. 뿌리를 map 하나로 통일한다.

## §2 가능 판정 근거 (소비처 전수 조사 요약)

**KG 로드 진입점은 단 하나** — `dashboard/src/app/Root.tsx:92`가 `knowledge-graph.json`을
fetch→`validateGraph`→store. 구조 탭·검색·코드뷰어 allowlist·홈 통계가 전부 이 스토어를 본다.
따라서 **같은 파일명으로 스키마 호환 그래프를 emit하면 대시보드 수정이 거의 0**이다.

**구조 탭 최소 데이터 계약**(실측): `nodes[{id,type,name,complexity,tags,filePath}]` +
`edges[{source,target,type}]` + `layers[{id,name,nodeIds}]` + project 메타(name·languages·
frameworks·description·analyzedAt·gitCommitHash) + 유효 노드 ≥ 1. 불변식 = **node.id 정합성**
(엣지·레이어·오버레이·allowlist·편집 API 전부 id 참조; validateGraph 가 참조 무결성 강제).

**map 산출물 ↔ 계약 충족 매트릭스**:

| 계약 요소 | map 재원 | 판정 |
|---|---|---|
| file 노드(+filePath) | census.json(전 파일·lang — JSP 포함) | ✅ 결정론 |
| class 노드 | method-calls.json callerClass/File | ✅ |
| table 노드 | db-schema.json(DDL file:line — impact 엔진 요구 필드 일치) | ✅ |
| 의존 엣지 | edges.json 6종(import/field-type/ctor-param/injection/mapper-xml/extends) | ✅ kind 매핑 |
| calls 엣지 | method-calls.json(파일 단위 집계) | ✅ |
| contains 엣지 | file→class(method-calls), 도메인→file(slices ownership) | ✅ |
| layers | step-layer(api/service/dao/db) + routes(진입점) | ✅ |
| project 메타 | census lang 집계·routes framework·gitCommit(Date) | ✅ 결정론 |
| summary/tags/complexity | LLM 없음 → §5 전략(결정론 폴백+fill 차용) | ⚠️ 품질 트레이드오프 |
| tour | 빈 배열 허용(fatal 아님) | ✅ |

**엔진 측 KG 소비처**(전부 계속 동작): screens JSP 전수 대조(listJspFilesFromGraph — census가
JSP를 포함하므로 오히려 커버리지 확대), impact table catalog(type:table — db-schema 재원이
동일해 정합 향상), impact overlay id 조인(file id 규약 유지로 통과), orchestrator
loadProjectGraph(파일이 존재하므로 통과), bundle KG 힌트(옵션 — 자기 산출 재귀 소비로 무해).

**결론: 가능.** 유일한 실질 트레이드오프는 노드 요약·태그의 LLM 품질(§5)과
diff 오버레이(/understand 재실행 diff 전제 — §7)다.

## §3 아키텍처 결정 — 동일 경로 KG 호환 emit

**채택**: `/understand-map`에 **구조 emit(S6.5)** 신설 — map 산출물에서 **U-A KG 스키마 호환**
`knowledge-graph.json`을 결정론 생성해 **같은 경로**에 쓴다.

- 근거: 소비처(대시보드 Root·검색·allowlist·screens·impact)가 전부 무수정 동작. 스키마는
  U-A core의 validateGraph(4-티어 관용)를 그대로 통과시키는 것이 목표 — core 무접촉.
- `project.description`에 생성 주체를 명기(`"ktds /understand-map 결정론 구조 그래프"`)하고
  `ktdsStructure: { generatedFromCommit }` 확장 필드(passthrough)로 낡음 대조를 지원한다.
- **기각한 대안**: ① 새 파일(structure-graph.json)+대시보드 로더 폴백 — 소비처 전부에 분기
  추가(수정면 최대), dual-load·allowlist·오버레이 id 공간 이원화 위험. ② 구조 탭이
  domain-graph를 직접 렌더 — 구조(파일/클래스/테이블) ≠ 도메인(업무 흐름) 관점이라
  기능 상실, WT-A 구조 탭 UX(펼침·랭크) 재작업 필요.

## §4 데이터 매핑 명세

노드 id 규약(불변식 — 기존 소비처와 일치): file=`file:<relPath>`, class=`class:<relPath>#<Class>`,
table=`table:<name>`, 도메인 컨테이너는 KG에 넣지 않음(도메인 관점은 domain-graph 담당,
dual-load 병합이 이미 존재).

| KG 요소 | 생성 규칙 |
|---|---|
| file 노드 | census 전 파일. type: lang 기반(java/jsp/js→file, xml·properties·yml→config, sql→schema, md→document). name=basename |
| class 노드 | method-calls 의 callerClass 별 1개(파일당 다중 클래스 허용). contains: file→class |
| table 노드 | db-schema 테이블. filePath=DDL 파일, lineRange=DDL 위치. defines_schema: schema파일→table |
| 의존 엣지 | import→imports, extends→depends_on, field-type/ctor-param/injection→depends_on, mapper-xml→depends_on(mapper→xml) + references(dao파일→table, MyBatis 테이블 참조 시) |
| calls 엣지 | method-calls를 (callerFile→calleeFile) 페어로 집계, weight=호출수 정규화 |
| layers | step-layer 산식으로 파일별 계층(api/service/dao/db/기타) → layers[{id,name,nodeIds}] |
| complexity | 결정론 근사: 파일별 (메서드 수 + 의존 엣지 수) 버킷 → low/medium/high (산식은 상수로 고정, 테스트 스냅샷) |
| tags | 결정론: 진입점(routes 보유)="entry", 테스트 경로="test", 배치="batch" 등 census/routes 유도 |
| summary | §5 |

함수/메서드 노드는 **1차 제외**(스케일: mmobile 메서드 수만 개 — 구조 탭 성능·가독 리스크).
후속 옵션으로 진입점 핸들러 메서드만 승격을 남긴다(§9 미결).

## §5 summary 전략 — 결정론 폴백 + fill 차용

1. **P1(결정론 폴백)**: 구조 사실 한 줄 — 예: `"OrderService — service 계층 · 메서드 12 ·
   의존 4 · 도메인 order"`. 검색(name/tags/summary)과 노드 패널이 즉시 유의미.
2. **P2(fill 차용 — domain-card-grounding 의 "codegraph 차용" 항목 착수)**: domain fill 의
   step 설명은 file:line 인용을 갖는다 — 해당 파일 노드의 summary 로 차용(인용 검증 이미
   통과한 텍스트만, `[차용]` 태그). LLM 신규 호출 0회로 품질 보강.

## §6 파이프라인 통합 (PIPELINE_ORDER.md 갱신 대상)

```
[3] /understand-map map   → 기존 산출 + knowledge-graph.json(구조, 결정론)   ← S6.5
[4] bundle→fill→emit      → domain-graph.json 갱신 + (P2) summary 차용 시 KG 재emit
```

- [0] /understand 단계는 파이프라인에서 제거. KG 는 [3]의 산출물이 된다 —
  screens([5])의 "권장: knowledge-graph.json"이 자동 충족되는 순서가 됨(일관성 개선).
- 재실행 결정론: 동일 commit re-run 시 byte-diff=0(analyzedAt=commit 시각 규약 재사용).

## §7 /understand 은퇴 계획

1. 스킬 라우팅: understand-init/onboard/SKILL 문안에서 "/understand 선행 권장" 제거,
   "구조 그래프는 map 이 생성" 으로 교체. /understand 명령 자체는 U-A 플러그인에 존치
   (강제 삭제 아님 — 외부 사용자용), ktds 워크플로 문서에서만 제외.
2. **diff 오버레이**: /understand 재실행 diff 전제 → ktds 트랙에서는 비활성 유지
   (overlay json 404 시 토글 비활성 — 이미 개별 degrade). 필요해지면 map 재실행 diff 로 재설계.
3. 기존 프로젝트 마이그레이션: map 재실행([3])이 KG 를 덮어씀 — jpetstore(데모)·egov·mmobile
   순으로 재emit. 데모 벤더링 데이터 교체는 별도 커밋(demo 트랙).
4. meta.json·fingerprints.json 등 /understand 부속 산출물: 소비처가 개별 degrade 하므로 방치
   가능하나, 홈 타일 데이터 소스 점검 후 필요 시 map 산출로 대체(§9 미결).

## §8 검증 계획

1. **스키마 게이트**: 생성 KG 가 core validateGraph 를 노드/엣지 드롭 0으로 통과(단위 테스트).
2. **결정론**: 동일 commit 2회 emit byte-diff=0 스냅샷.
3. **소비처 회귀**: ① 구조 탭 시각 QA(jpetstore·mmobile — 펼침/레이어/검색/코드뷰어)
   ② screens validate 재실행(unmatchedJsps 전수 대조 소스 전환 후 통과 유지)
   ③ impact 토글(overlay id 조인) ④ 홈 통계 타일.
4. **스케일**: mmobile(파일 수천)·egov(6101파일) 구조 탭 렌더 성능 — WT-A 점진 공개가
   감당하는지 실측.

## §9 구현 단계 / 미결 질문

| 단계 | 내용 |
|---|---|
| P1 | 엔진 structure-emit(census/edges/method-calls/db-schema/step-layer→KG) + 스냅샷·검증 테스트 |
| P2 | map CLI 통합([3]에서 자동 emit) + SKILL/PIPELINE_ORDER 문안 갱신 |
| P3 | summary fill 차용([4] 연동) |
| P4 | 소비처 회귀 QA(구조탭·screens·impact·홈) + 스케일 실측 |
| P5 | /understand 은퇴 문안·데모 데이터 재생성·마이그레이션 |

**미결**: ① 진입점 핸들러 메서드 노드 승격 여부 ② complexity 산식 상수(버킷 경계)
③ 홈 타일 중 meta.json 의존분의 대체 여부 ④ 데모(jpetstore) KG 교체 시점(구조 탭 화면
검수 — WT-A 잔여 "화면 검수 미실시"와 묶어서 할지).
