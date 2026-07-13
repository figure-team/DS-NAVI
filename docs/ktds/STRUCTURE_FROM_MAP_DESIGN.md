# 구조 메뉴의 /understand-map 이관 — STRUCTURE_FROM_MAP (v2)

> 2026-07-14 v2 — 사용자 정정 반영: 구조 메뉴는 파일/클래스 그래프 재생성이 아니라
> **도메인 계층 4뎁스 드릴다운 그래프**다. v1(파일·클래스 KG 재생성안)의 소비처 조사·
> 최소 KG emit 은 §6(트랙 B)으로 흡수. 판정: **가능**(뎁스별 재원 실측 §3).
> 관련: PIPELINE_ORDER.md, DOMAIN_HIERARCHY_DESIGN.md, WORK_MAP_DESIGN.md.

## §1 사용자 확정 (2026-07-14)

| # | 결정 |
|---|---|
| D1 | /understand(U-A KG 생성)는 ktds 워크플로에서 은퇴 — 데이터 기반을 /understand-map 으로 통일 |
| D2 | 구조 메뉴 그래프는 유지하되, **도메인 계층 드릴다운 그래프**로 재정의한다: |

```
뎁스1  상단도메인들이 연결된 그래프           (그룹 노드 + 그룹 간 의존선)
뎁스2  누른 상단도메인 + 그 서브도메인 그래프   (그룹 → contains → 서브도메인 + 서브 간 의존선)
뎁스3  누른 서브도메인 + 업무흐름도            (도메인 → businessFlows[] 노드)
뎁스4  누른 업무흐름도 + 기능흐름도 그래프      (업무 순서도 + flowRef 로 연결된 코드 flow/step)
```

**현재와의 차이(정확히)**: 지금 구조 메뉴는 /understand 산출 KG(파일·클래스·함수)를 렌더하고,
도메인 계층은 업무 지도 메뉴에 **카드/리스트**로만 존재한다. 위 4뎁스 "그래프" 뷰는 현재 없다
— 이번 개편으로 신설한다. (참고: "관계선 금지"는 업무 지도(/domains) 카드 랜딩에 대한 확정
이었다 — 구조 메뉴는 그래프 뷰가 정체성이므로 연결선이 본질이고 이번 요구사항 자체가 연결
그래프다.)

## §2 판정 — 가능

구조 메뉴가 요구하는 4뎁스가 전부 **/understand-map 산출물에 이미 존재**한다(§3 실측).
LLM 재분석·신규 스캔 없이 렌더 계층만 만들면 된다. /understand 은퇴로 영향받는 나머지
KG 소비처(코드뷰어·검색·홈 통계·screens 전수 대조·임팩트 카탈로그)는 트랙 B(§6)로 분리해
해결한다 — 구조 메뉴와 독립적으로 진행 가능.

## §3 뎁스별 데이터 재원 (mmobile 실측, 2026-07-14)

| 뎁스 | 노드 | 연결선 | 재원(실측) |
|---|---|---|---|
| 1 | 상단도메인 13개 | 그룹 간 의존 | `domain-graph.json ktdsMap.groups` + `domain-map.json crossDomain.edges`(도메인 간 의존·evidence 동봉)를 그룹 멤버십으로 집계 |
| 2 | 그룹 1 + 서브도메인 N | 그룹→서브(contains) + 서브 간 의존 | groups.memberKeys + crossDomain.edges 를 그룹 내부로 필터 |
| 3 | 서브도메인 1 + 업무흐름도 M | 도메인→흐름도(contains) | domain 노드 `domainMeta.businessFlows[]`(mmobile 84도메인 전부 채움·title 보유) |
| 4 | 업무 순서도 + 기능흐름도 | 순서도 내부 edges + `flowRef` | businessFlow `{nodes(kind:start/activity/decision…, citations), edges}` + 노드별 `flowRef: "flow:…"` → flow 노드 → `flow_step` steps(8,511) |

부가 실측: domain-graph 의 `calls` 엣지(8,467)는 전부 도메인 내부(교차 0) — **도메인/그룹 간
연결선의 유일한 재원은 domain-map.json crossDomain** 이므로 대시보드가 이 파일을 추가로
읽어야 한다(신설 메뉴들과 같은 `.spec/map` 서빙 경로 이미 존재).

## §4 뷰 설계 (구조 메뉴 재정의)

**URL 규약**(URL이 진실 — FRONT_REDESIGN 원칙):

```
/structure                          → 뎁스1 (그룹 그래프)
/structure?group=g:common           → 뎁스2 (그룹+서브도메인)
/structure?domain=domain:com        → 뎁스3 (서브도메인+업무흐름도)
/structure?domain=…&bf=<fillIndex>  → 뎁스4 (업무흐름도+기능흐름도)
```

- 노드 클릭 = 한 뎁스 아래로(드릴다운), 브레드크럼 = 위로(업무 지도와 동일 관례).
  기존 `?node=&level=&overlay=` 파라미터는 KG 뷰 은퇴와 함께 제거(딥링크는 /structure 로 폴백).
- **뎁스1·2 (신규 그래프)**: 노드 = 그룹/도메인 카드형 노드(이름·서브도메인/기능 수·근거율),
  엣지 = 의존 방향·강도(evidence 수를 weight 로) + **클릭 시 evidence 팝오버**(어떤 파일이
  어떤 파일에 의존하는지 crossDomain.edges.evidence 의 kind·source·target 나열 — 확정 ①).
  레이아웃은 기존 ELK 라우팅 재사용(dashboard-edge-routing 교훈: ELK 포인트 직접 렌더).
- **뎁스3**: 좌측 서브도메인 정보 + 업무흐름도 노드들(제목 카드) — 클릭 시 뎁스4.
- **뎁스4 (기존 뷰 재사용)**: 업무 순서도는 **BusinessFlowView 그대로**, `flowRef` 배지 클릭
  시 해당 기능흐름도(FlowSpineView, flow_step 스파인)를 같은 화면에 병렬/토글 렌더.
  신규 렌더러 0개 — 재사용 2 + 신규 그래프 1(뎁스1·2 공용).
- **groups 없는 프로젝트**(jpetstore 등): 뎁스1을 건너뛰고 뎁스2(서브도메인 그래프)에서 시작
  (확정 ③ — 가상 "전체" 그룹은 만들지 않음).
- **기존 파일/클래스 KG 뷰는 완전 제거**(확정 ② — "코드 뷰" 토글 잔존 없음). WT-A 의 펼침·
  랭크 감기 코드는 KG 뷰와 함께 은퇴, 구 딥링크(`?node=&level=`)는 /structure 폴백.
- 업무 지도 메뉴와의 관계: 업무 지도 = 카드/목록 중심 워크스페이스(현행 유지), 구조 =
  같은 데이터의 **그래프 관점** 드릴다운. 상호 딥링크(구조 뎁스3 ↔ 업무 지도 워크스페이스).

## §5 데이터 로드 변경 (대시보드)

- domain-graph.json(이미 로드) + **domain-map.json 추가 로드**(crossDomain — `.spec/map`
  서빙 경로 기존 활용, 404 시 연결선 없는 노드만 렌더로 degrade).
- **KG(knowledge-graph.json) 하드 의존 해제**: Root 의 로드 실패를 fatal 배너에서
  "KG 없음 = 구조 KG 뷰 없음" 소프트 처리로 완화(트랙 B와 연동).

## §6 트랙 B — /understand 은퇴에 따른 잔여 KG 소비처 처리

구조 메뉴가 KG를 더 이상 렌더하지 않아도, 소비처 전수 조사(2026-07-14)에서 확인된
잔여 의존이 남는다. **최소 결정론 KG emit**(v1 설계의 축소판)으로 해결한다:

- map 이 census(파일·JSP)+db-schema(테이블)만으로 **최소 KG**(file/config/schema/table 노드,
  contains/defines_schema 엣지, summary=결정론 한 줄)를 같은 경로에 emit.
- 이것으로 유지되는 것: 코드뷰어 allowlist(filePath), 검색(파일 검색), 홈 통계,
  screens JSP 전수 대조(listJspFilesFromGraph), 임팩트 테이블 카탈로그(type:table),
  orchestrator loadProjectGraph(하드 throw 회피).
- **보안 표면 사인오프(적대 리뷰 C2, 2026-07-14)**: allowlist 가 "LLM 이 노드화한 부분집합"
  에서 "census 전 파일"로 넓어진다. 하드 시크릿 캐리어(.env/.pem/.key/.jks/.p12/keystore/
  id_rsa 류)는 **노드화 제외**로 원천 차단한다. `.properties`/`.yml` 은 레거시 분석의 중심
  파일이라 유지(기존 LLM KG config 노드 관례와 패리티) — 접근은 원타임 토큰 게이트 뒤이며,
  평문 크리덴셜이 든 프로젝트를 다룰 때는 토큰 유출(스크린샷·로그 공유)에 유의한다.
- 파일 간 의존·클래스·계층(layers)은 넣지 않는다 — 구조 뷰가 KG 렌더를 은퇴했으므로 불필요.
  (v1의 edges/method-calls/step-layer 매핑은 폐기 — 문서 이력은 git 에.)

**명령어별 호환 매트릭스 — "새 프로젝트에서 /understand-map 만 돌리면?"** (트랙 B 완료 기준):

| 명령 | KG 의존 | 트랙 B 이후 |
|---|---|---|
| /understand-map | 자기 산출(bundle KG 힌트는 옵션) | ✅ 정상 |
| /understand-screens | JSP 전수 대조(listJspFilesFromGraph) | ✅ 정상 — 최소 KG 가 census 전 파일 포함이라 대조 커버리지 오히려 확대. 단 Stage A 는 원래 별도 선행(understanding.config.json + 앱 기동) 필요 |
| /understand-policy | 없음 | ✅ 정상 |
| /understand-rtm | 없음(domain-graph·routes·method-calls) | ✅ 정상 |
| /understand-impact | table 카탈로그(type:table)·overlay 인덱스·KG 유사도 | ✅ 동작 — table·file 노드는 최소 KG 가 제공. ⚠️ KG 유사도 가중(similar_to/related — /understand 산출 엣지)만 비활성 → 선례 검색은 도메인/토큰 매칭으로 동작(기존 폴백 경로) |
| /understand-docs·report·onboard·init | 없음(문안만 갱신) | ✅ 정상 |
| /understand-dashboard | Root 하드 의존·검색·홈 통계·코드뷰어 allowlist | ✅ 동작 — allowlist 는 census 기반이라 오히려 확대. ⚠️ 검색·홈 통계는 파일/테이블 수준으로 얇아짐(클래스·함수 노드 없음 — LLM KG 고유 가치의 의도된 포기) |
| 구조탭 임팩트 오버레이 토글 | KG 뷰 위 하이라이트 | ⚠️ KG 뷰 제거와 함께 소멸 → **P2 에서 4뎁스 그래프의 도메인/흐름 하이라이트로 재이식**(impact.json 이 도메인×흐름 귀속을 이미 보유). 변경·영향 메뉴 자체는 무영향 |

## §7 검증 계획

1. 뎁스별 시각 QA(mmobile: 그룹 13 → g:common 6서브 → com 업무흐름도 → flowRef 기능흐름도;
   jpetstore: 그룹 없음 → 뎁스2 시작 폴백).
2. crossDomain 404·빈 그룹·businessFlows 없는 도메인(결정론 폴백 flow만) degrade 확인.
3. 트랙 B: 최소 KG 가 validateGraph 통과 + screens validate·임팩트 토글·코드뷰어 회귀.
4. 스케일: mmobile 뎁스2 최대 11서브(콘텐츠), 뎁스4 flow_step 스파인 — 기존 뷰 재사용이라
   신규 리스크는 뎁스1·2 그래프뿐(노드 ≤ 15 — 위험 낮음).

## §8 구현 단계 / 미결

| 단계 | 내용 |
|---|---|
| P1 | 대시보드: 뎁스1·2 그래프 뷰 + URL 규약 + domain-map.json 로드 |
| P2 | 뎁스3·4: businessFlows 목록 + BusinessFlowView/FlowSpineView 연결(flowRef 점프) + 임팩트 오버레이의 도메인/흐름 하이라이트 재이식 |
| P3 | 트랙 B: 엔진 최소 KG emit + Root 하드 의존 완화 |
| P4 | /understand 은퇴 문안(스킬·PIPELINE_ORDER 갱신) + 기존 KG 뷰 제거·딥링크 폴백 |
| P5 | 시각 QA(mmobile·jpetstore) + 데모 데이터 재생성 |

**확정(2026-07-14 사용자)**: ① evidence 팝오버 포함 ② 기존 KG 뷰 완전 제거 ③ 그룹 없는
프로젝트는 뎁스1 건너뛰기. 잔여 미결 없음 — 구현 착수 대기.
