# /understand --lite 모드 설계 — 전 파일 기계 티어 + 최소 LLM

> 작성: 2026-07-09. Phase 2 속도 개선(티어링·매퍼 기계화, 2.8.0-ktds.14) 후속.
> 목표: 분석 소요를 **시간 단위 → 분 단위**로 낮추는 근본 해결. egov(6,101파일) 기준 **~2.5시간 → ~5분**.
> 전제 실측: `.omc/plans/understand-phase2-speedup-plan.md` — LLM이 전체 소요의 98%+ (결정론 구간 56초 vs Phase 2 LLM ~155분).

---

## 1. 배경 / 문제

- `/understand`의 비용 본질은 "파일별 LLM 요약"이다. 구조(노드/엣지 골격, 함수/클래스, import, calls)는
  이미 전부 결정론 스크립트가 생산한다 (tree-sitter, Phase 3.5 콜 리졸버, ktds.14 기계 티어).
- 반면 하류 기능 대부분은 **노드 존재/filePath**만 소비한다 — 요약문 품질을 소비하는 곳은
  구조탭 노드 상세 표시뿐이다 (근거: §6 영향 분석).
- ktds 데모 흐름에서 `/understand-chat`·`/understand-explain`(요약 품질의 주 소비자 후보)은
  **사용하지 않음**을 확인 (2026-07-09, 사용자 확인).

## 2. 기각된 대안 (재제안 금지)

| 대안 | 기각 사유 |
|---|---|
| /understand 미사용 + 구조 메뉴 제거 | 코드 뷰어 allowlist가 KG filePath 집합 기반이라 **전역 사망**(도메인 메뉴의 파일:라인 근거 열람 포함). 지식그래프 메뉴·diff·impact 오버레이·screens 재검사 연쇄 손실. |
| 파일 노드 제거(큰 묶음 노드만 생성) | 파일 노드가 KG 의존 기능들의 조인 키 — diff·allowlist·screens·impact가 전부 파손. 위 안과 같은 손실을 지불하며 시간은 더 씀. |
| /understand + /understand-map 파이프라인 통합 | ktds-legacy는 업스트림(U-A) 추종 전략을 위해 의도적으로 분리된 플러그인. U-A `intermediate/`는 스키마 보장 없는 임시물이라 결합 시 업스트림 갱신이 legacy 기능을 깨뜨림. map의 독립 실행성(선행=init뿐)·결정론 보장도 훼손. |

## 3. 모드 정의

```
/understand --lite          # 신설: 전 파일 기계 생성 + 레이어 LLM 1콜, 투어 생략
/understand --full          # 기존 full 동작 그대로 (3티어 혼합 라우팅, ktds.14)
/understand                 # 무플래그 = 상태 기반 해석 (아래) — 신규 프로젝트 기본값은 lite
```

**무플래그 모드 해석 (lite가 신규 기본값, 단 무단 다운그레이드 금지)**:

| 기존 상태 | 해석 |
|---|---|
| 그래프 없음 (신규) | **lite** ← 기본값 변경(2026-07-09 사용자 결정) |
| 그래프 디스크에 없으나 **git 추적 중**(삭제됨 — 데모/벤더링 레포) | **질문** — restore / lite 재빌드 / full 재빌드 중 선택. 복구 가능한 full 그래프를 lite로 덮어쓰는 사고 방지 (2026-07-09 라이브 검증에서 발견된 맹점) |
| meta `analysisMode: "lite"` | lite 재생성 |
| meta `analysisMode: "full"` 또는 analysisMode 없는 레거시 KG | **기존 full 증분/결정 로직** — 무플래그 재실행이 full 요약을 템플릿으로 덮어쓰는 사고 방지. lite로 내리려면 `--lite` 명시 필요 |

- **lite**: Phase 2에서 tier 무시하고 **전 배치를 기계 생성**. LLM은 Phase 1 스캐너(프로젝트 서사,
  실측 38k 토큰)와 Phase 4(아키텍처 레이어) 2콜뿐. Phase 5(투어) 생략.
  나머지 결정론 단계(스캔 스크립트·배치·merge·콜 리졸버·tested_by 링커·지문)는 전부 동일.
- **비가역 아님**: lite 후 `--full` 재실행 시 같은 노드 id 체계 위에 상위 품질 KG로 교체(업그레이드 경로, §7).
- meta.json에 `analysisMode: "lite" | "full"` 기록 → 대시보드/증분 로직이 모드 인지 가능.

## 4. 파이프라인 변경 설계

| Phase | full (현행) | lite (변경점) |
|---|---|---|
| 0 pre-flight | 증분/full 결정 | `--lite` 플래그 파싱. **lite는 항상 전체 재생성**(기계 생성이 분 단위라 증분 불필요·복잡도 회피) |
| 0.5 ignore | 동일 | 동일 |
| 1 SCAN | 결정론 스캔 | 동일 |
| 1.5 BATCH | tier 3값 산출 | 동일 (tier는 산출하되 lite에선 소비 안 함) |
| 2 ANALYZE | 티어별 LLM 팬아웃 + 기계 생성 | **`generate-machine-batches.mjs --all-tiers`** 한 번 — 전 배치 기계 생성. LLM 팬아웃·게이트·Workflow 전부 생략 |
| 3.5 콜 리졸버 | 결정론 | 동일 (call-graph.json은 Phase 1.5가 이미 생산) |
| 3/6 리뷰 | 조립 + 인라인 검증 | 인라인 검증(스키마 필수 필드)은 유지. LLM 리뷰 단계는 생략 |
| 4 ARCHITECTURE | LLM 1콜 (레이어) | **유지 — 즉흥 대체 금지** (2026-07-09 확정). 레이어 "정의"는 판단 작업 — egov 라이브 검증에서 세션이 이전 full run 레이어 재사용으로 우회했으나, 그건 git 이력에 KG가 있을 때만 가능한 일회성 트릭. 신규 프로젝트에서 경로 휴리스틱은 잘못된 계층을 만들 위험 → 결정론 스크립트안(assign-layers.mjs) **기각**. 스캐너 포함 lite의 LLM은 총 2콜(Phase 1 서사 + Phase 4 레이어) |
| 5 TOUR | LLM 1콜 | **생략** (온보딩 투어 미사용 확인. KG `tour` 필드는 빈 배열 — 스키마상 required collection이므로 `[]`로 채움) |
| 7 SAVE | meta/지문 | `analysisMode` 기록 추가 |

### 4.1 generate-machine-batches `--all-tiers` 확장

현행은 `tier === 'machine'` 배치만 처리. `--all-tiers`에서는:

- **code 파일 생성 규격** (신규):
  - 파일 노드: `file:<path>`, 템플릿 요약 — ko 예: `"Java 클래스 OrderService — 함수 12개, 클래스 1개 (850라인)"`.
    extract-structure `buildResult`의 functions/classes/exports/metrics를 그대로 사용.
  - **함수/클래스 자식 노드**: file-analyzer와 동일한 significance filter(함수 10+라인, 클래스 2+메서드
    또는 20+라인, export된 것)를 결정론 적용. `function:<path>:<name>` / `class:<path>:<name>`,
    템플릿 요약(`"함수 <name> (L<start>–<end>, 파라미터 N개)"`), `contains` 엣지(가중 1.0).
  - imports 엣지: batchImportData 전수 (현행 protocol과 동일).
  - JSP 포함 — code 분류이므로 이 경로로 생성되며 화면설계서 JSP 대조 요건(노드 존재) 충족.
- **light 파일(비매퍼 config/script/infra/sql)**: generic/카테고리별 템플릿으로 확장 —
  sql: 결정론 파싱(CREATE TABLE/INSERT 대상 테이블 카운트, 매퍼 파서와 동일 계열 regex),
  config/properties: 키 개수·최상위 섹션, script: 라인 수. 노드 타입은 file-analyzer 매핑 표
  (config/table/service/pipeline/resource) 준수.
- 매퍼 XML: ktds.14 구현 그대로 (defines_schema·변형쌍 엣지 포함).
- 출력·감사 계약 불변: batch-<i>.json + .done, audit-batches 커버리지(노드 ⊇ slice files) 유지.

### 4.2 SKILL.md 분기

- Phase 0에 `--lite` 인식 추가. Phase 2 서두에서 lite면:
  `[Phase 2/7] Generating all nodes deterministically (--lite, no LLM)...` 보고 후
  slice → `generate-machine-batches --all-tiers --locale …` → merge로 직행.
- opencode 경로: LLM 팬아웃 자체가 없으므로 CLI 드라이버 불필요 — 스크립트 실행만으로 동일 동작
  (플랫폼 무관, 별도 분기 불필요).

## 5. 예상 소요 (egov 6,101파일 기준)

| 구간 | 예상 |
|---|---|
| 스캔 + 배치 계산 | ~1분 (실측 56초) |
| 전 배치 기계 생성 (385배치/6,101파일) | ~1~2분 (파일 read + tree-sitter 재활용, 콜그래프는 기존 산출 재사용) |
| merge + 콜 리졸버 + 검증 + 지문 | ~2분 (완주 실측 준용) |
| Phase 4 레이어 LLM 1콜 | ~2~5분 |
| **합계** | **~5~10분** (사용량 한도 영향 사실상 0 — LLM 1콜) |

## 6. 영향 분석 (실측 근거, 2026-07-08~09 세션)

**무손상** — 노드 존재/경로 기반:
코드 뷰어 allowlist · /understand-diff 조인 · 화면설계서 unmatchedJsps 대조 · impact 구조탭 오버레이 ·
구조탭 그래프/레이어/그룹 접힘 · 함수/클래스 드릴다운(4.1로 결정론 생성) · calls/imports/contains/tested_by(경로규칙)/매퍼 엣지 ·
`.spec` 계열 메뉴 전부(도메인·RTM·산출물·데이터·변경·프로그램·품질·보고서·정책서) · 위키(wiki-graph.json 별도).

**품질 하향(동작 정상)**:
- 파일/함수 요약문 = 템플릿 (구조탭 노드 상세 표시 텍스트). 유일한 실질 트레이드.
- LLM 의미 엣지(related/depends_on 소량) 소실 — 구조 핵심 엣지는 전부 결정론이라 실손실 미미
  (egov 실측: 매퍼 related 448건은 결정론 대체 완료, 잔여 소량).

**소멸(수용 확인)**: 온보딩 투어(미사용), /understand-chat·explain 응답 깊이(미사용).

## 7. 업그레이드/증분 경로

- lite → full: `--full` 재실행으로 교체 (노드 id 동일 체계, 하류 조인 무영향).
- lite 후 무플래그 재실행: meta `analysisMode: lite`면 **lite 규칙으로 전체 재생성**
  (분 단위라 증분 이득 없음 — 단순성 우선). full KG에 무플래그 재실행은 기존 full 증분 로직 그대로(§3 표).
- full 후 `--lite` 명시 실행: 다운그레이드 경고 후 진행.

## 8. 검증 계획

1. 단위: `--all-tiers` code 생성기(함수/클래스 노드·significance filter·JSP)·sql/config 템플릿 골든 테스트.
2. jpetstore lite 완주: `/understand --lite` → merge 경고 0, 검증 issues 0, KG 스키마 통과,
   화면설계서 unmatchedJsps 회귀 없음, diff-overlay 조인 스모크.
3. 대시보드 QA(playwright 헤드리스 셋업 재사용): 구조탭 렌더·그룹 접힘·코드 뷰어·레이어 배치.
4. egov lite 실측: 총 소요 ≤10분 확인, 노드/엣지 수 full 대비 대조(파일 노드 동수, 요약만 상이).

## 9. 구현 단계

- **L1**: generate-machine-batches `--all-tiers`(code/sql/config 생성 규격) + 테스트 — **완료(2026-07-09)**
- **L2**: SKILL.md `--lite` 분기(Phase 0/2/5/7) + meta `analysisMode` + lite 기본값·삭제감지 안전규칙 — **완료(2026-07-09)**
- **L3**: jpetstore·egov 검증 + 대시보드 QA + 버전 범프(2.8.0-ktds.15) — egov 라이브 검증 완료, 대시보드 QA·범프 잔여

## 10. 라이브 검증 기록 (2026-07-09, egov 6,102파일)

- 스크립트 실행 합계 **~90초** (스캐너 에이전트 61초 + compute 5초 + slice 3초 + generate 9.9초 + merge·리졸버·지문 ~10초). LLM 토큰 **38,382**(스캐너 1콜). 벽시계 ~10분은 오케스트레이터 왕복·사람 응답 대기.
- 산출: **15,659노드/20,677엣지**, calls **6,382**(full 1,396의 4.6배 — 함수 노드 전수 효과), defines_schema 536, 변형쌍 1,071, 검증 issues 0, `analysisMode: "lite"`, tour 0.
- 검증 중 발견·반영 2건: ① Phase 0 삭제 감지 안전규칙(§3 표), ② Phase 4 즉흥 대체 금지 명문화(§4 표 — 실행 세션이 이전 레이어 재사용으로 우회했던 건).

## 11. 잔여 과제

- lite에서 SQL `definitions`(CREATE TABLE) 기반 `table:<path>:<name>` 서브노드 결정론 생성 — full(LLM)과의 노드 해상도 격차 899개 해소.
- Phase 1 스캐너 서사(이름·설명)의 결정론화 검토(manifest 추출) — 남은 38k 토큰마저 제거하는 선택지. 서사 품질 트레이드 검토 필요.
- 대시보드 헤드리스 QA(구조탭 렌더·그룹 접힘·코드 뷰어) + 버전 범프.
