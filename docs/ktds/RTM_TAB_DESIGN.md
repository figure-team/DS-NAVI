# 요구사항 추적표(RTM) 탭 — 설계

> **단일 소스 설계.** SI/ITO 프로젝트에서 고객 요청(자연어 한 줄)을 받아 → 분해/매칭 →
> 요구사항을 **AS-IS(코드 근거) + TO-BE(요청 분해)** 가 한자리에 사는 **살아있는 추적 원장**으로
> 관리하는 RTM 탭. 첫 생성물은 전부 `[추정]`, 사용자 컨펌으로 행 단위 `[확정]`.
> 기존 자산(영향도 엔진·추정→확정 오버레이·문서 생성 파이프라인·TrustBadge)을 **엮는** 작업이며
> 새 발명이 아니다.

## 0. 목적 / 배경

- 대상: **SI/ITO** — 고객사가 신규/수정 기능을 자연어로 요청한다. 예) "알림 기능 만들어줘",
  "결제에 무통장입금 추가해줘". 상세 명세 없이도 **명확한 설계**가 되도록 한다.
- RTM은 단순 추적표를 넘어 **변경 작업지시서**처럼 작동: 무엇을 만들고(신규), 무엇을 고치고(변경),
  무엇을 걷어낼지(폐기/고아), 무엇을 검증해야 할지(테스트 공백)를 표 하나로 드러낸다.
- 신뢰성: LLM은 **제안(`[추정]`)만**, 확정 권한은 사람에게. 이 도구의 근거 철학("근거 없으면
  합성하지 말고 `[추정]` 표기")과 정확히 일치한다.

## 1. 개념 모델

핵심 관계: **요구사항(Requirement) 1 : N 기능(Function)**. 요구사항이 바뀌면 효과가 여러 기능에
걸친 **변경 묶음(changeset)** 으로 퍼지고, 요구사항은 시간축으로 **이력 체인(lineage)** 을 이룬다.

```
Requirement {
  id: "REQ-2", text: "결제는 무통장입금만 가능",
  status: ACTIVE | SUPERSEDED,
  supersedes: "REQ-1", supersededBy: "REQ-3" | null,
  source: { kind: "customer", raw: "결제 무통장도 되게" },   // 고객 원문
  changeset: {                                              // claude -p 제안 → [추정]
    removed:  ["FN-P03"],
    modified: ["FN-P01", "FN-P02"],
    added:    ["FN-P04"],
    revived:  []                                            // 이전에 폐기됐다 되살아난 기능
  }
}

Function {
  id: "FN-P01", name: "결제 처리", domainId: "payment",
  requirementHistory: ["REQ-1", "REQ-2", "REQ-3"],          // 파괴적 삭제 없음(감사 보존)
  trace: { entryPoint, implementation[], data(CRUD), test },// 각 셀 confidence+evidence
  // 상태는 저장하지 않고 "현행 head(REQ-3)" 기준으로 매번 재계산
  state: computeAgainstHead(requirementHistory)
}
```

**불변 규칙**
1. **현행 head 기준 재계산** — 기능의 상태(고아/현행/미구현)는 누적이 아니라 항상 요구사항 체인의
   현행(ACTIVE) 기준. → REQ-2가 죽인 카드 구현을 REQ-3가 **되살릴 수 있다**(REVIVED).
2. **파괴적 삭제 금지** — 폐기 요구사항/고아 구현은 지우지 않고 취소선·상태로만 표시. 실제 코드
   제거는 사람이 확정한 뒤에만. (되살아남을 가능성을 보존)
3. **고아(orphan)** — 코드에는 `[확정]`으로 실재하나 현행 요구사항이 없는 구현 = 제거/대체 후보.

상태/배지 어휘: `+신규` `~변경` `−삭제/폐기` `=부활` · `🚫고아` · `⚠미구현` · `✅구현·검증`
· `[추정]` ↔ `✓확정(이름)`.

## 1b. 상세 요구사항 모델 (v2) — 9개 빈틈 반영

상세 요구(여러 기능 + 여러 조건/분기/예외)와 SI RTM 실무 요건을 담기 위해 모델을 확장(schemaVersion 2).
핵심: **요구사항 → 인수조건(AC) → 기능**의 3계층 + 검증 스파인 + 메타/커버리지.

| # | 확장 | 어디에 |
|---|---|---|
| ① 인수조건(AC) | 검증 가능한 조건 1개 = AC. `kind`(분기/선행/후행/예외/일반) + `fnIds`(N:M 기능 매핑) | `Requirement.acceptanceCriteria[]` ↔ `Function.rules[]`(현행 AC 역집계) |
| ② 비기능(NFR) | `type: functional\|nonfunctional` + `nfrCategory` + `nfrScope`(횡단 귀속) | `Requirement` + `Function.nfrTags[]` |
| ③ 검증 스파인 | 시험결과(PASS/FAIL/NA/UNTESTED) + 결함 + **고객검수(signoff, 내부확정과 별개 2축)** | `AC.tests[]` + `Requirement.signoff` |
| ④ lifecycle | 접수→분석→설계→개발→시험→완료/보류/반려 | `Requirement.lifecycle` |
| ⑤ 메타 | 우선순위·요청자·출처문서·요청일·대상 릴리스 | `Requirement.priority` + `source.{requester,doc,section,requestedAt,targetRelease}` |
| ⑥ 커버리지/갭 | 요구 구현·검증·검수 집계 + 양방향 갭(미구현 요구 ↔ 고아 코드 ↔ 미검증) | `model.coverage`(computeCoverage 파생) |
| ⑦ 의존성 | 선행 요구 | `Requirement.dependsOn[]` |
| ⑧ 산출물 연계 | SI 문서(기능명세서 등) 항목 링크 | `Function.deliverableRefs[]`(docId+anchor) |
| ⑨ 변경관리 | CR번호·사유·승인자·영향공수(영향도 엔진 연계) | `Requirement.changeReq` |

**규칙도 supersede**: `Function.rules` 는 현행(ACTIVE) 요구사항의 AC 만 집계 → 폐기 요구의 규칙은 빠지되
이력은 보존(§1 불변규칙이 기능뿐 아니라 규칙 단위에도 적용).

**연산 위치(단일 소스, 순수·테스트됨):** `buildRtm`(AS-IS) → `applyRequirements`(상태/이력/rules/nfrTags
재계산) → `computeCoverage`(롤업) → `computeDiagnostics`(무결성). 인테이크가 `rtm-requirements.json` 에
v2 구조를 쓰면 understand-rtm 이 적용해 `rtm.json` 에 bake. 시험결과/검수는 인테이크가 채우지 않는다(실측·고객 몫).

### 1b.1 무결성 진단 (critic 리뷰 반영 — 강제 대신 가시화)
LLM 인테이크는 잘못된 입력을 쓸 수 있고 zod 는 shape 만 검증한다. `computeDiagnostics` 가 교차참조를
검사해 `model.diagnostics[]`(error/warn)로 표면화한다(조용한 손실 금지 — understand-rtm 콘솔에도 출력):
- **error**: 드롭(파싱 실패 요구사항), 댕글링 changeset/AC `fnId`, 중복 기능/요구 id, supersede/dependsOn **순환**.
- **warn**: `AC.fnIds ⊄ changeset`, 동일 fnId 다중 버킷, 댕글링 `nfrScope`/`dependsOn`/`supersedes`, supersede 비대칭.
- **자연순 id 정렬**(`natCmp`): `REQ-2 < REQ-10` — 현행 head 선택이 순서에 의존하므로 사전순 역전 버그 제거.
- **NFR 커버리지**: 비기능 요구는 대상 기능 없음을 미구현으로 오인하지 않고 `nfrScope` 로 판정.
- **검증 축 화해**: 기능 검증 = 기능 `test` 셀 OR 그 기능을 매핑한 AC 의 PASS 테스트(뷰①↔뷰② 일치).
- **요구사항 진척 롤업**: `coverage.byRequirement[reqId] = {targetsTotal, targetsBuilt, acsTotal, acsPassed}`(뷰② x/y).

### 1b.2 검증 스파인 입력 경로 (closed — 모델+서버)
`applyOverlay`(rtm/apply-overlay.ts)가 `rtm-overrides.json` 의 사람 입력을 모델에 반영한다:
- 기능 행 셀 교정(R3, 최상위 fnId 키) + **요구사항 lifecycle 전이 · 고객검수(signoff) · AC 시험결과**
  (`_requirements.<reqId>.{lifecycle,signoff,tests:"<acId>::<caseId>"→{result,defectId}}`).
- 적용 후 coverage/diagnostics 재계산 → `verified`/`signedOff` 가 실데이터를 반영. understand-rtm 가
  intake 적용 후 overlay 적용해 bake. **서버 입력**: `POST /rtm-override`(기능) · `POST /rtm-req-override`
  (요구사항: lifecycle/signoff/tests, 토큰·reqId 실존·열거 검증·audit append-only).
- e2e 실측: 시험 PASS 기록 → 재생성 → 검증 0/1 → 1/1.

### 1b.3 남은 빈틈(인지·후속)
- **UI 노출**: 위 입력 경로의 **대시보드 UI**(시험결과 토글·검수 버튼·lifecycle 셀렉터)는 디자인 보류 중 → 후속.
- **라이브 재bake**: overlay POST 후 coverage 즉시 반영하려면 understand-rtm 재실행 트리거(또는 클라이언트
  재계산) 필요 — 현재는 재생성 시 반영.
- **릴리스 baseline/버전 스냅샷**: `source.targetRelease` 만 있고 "R1 합의분 vs 현행" 동결 스냅샷 미구현.
- **AC 단위 구현상태**·**요구사항 lifecycle 자동 도출**: 현재 수동/미도출.

## 2. UI — 탭 1개 · 뷰 2개 · 상세 패널

상단 토글로 두 뷰 전환. **같은 데이터의 전치(transpose)** 이며 클릭으로 상호 점프.

```
[ 기능 기준 ▸ ]  [ 요구사항 기준 ]      🔎검색  필터▾  [+요청]  [재생성]
```

### 2.1 뷰 ① 기능 기준 (도메인 그룹) — "지금 코드가 어떤 상태인가"

- 도메인별 그룹 헤더(요약: `AS-IS n · 변경 n · 신규 n · 검증 x/y`).
- 행 = 기능. 열: **기능 · 현행요구(이력) · 진입점 · 구현 · 데이터(CRUD) · 테스트 · 상태**.
- 셀 표기: `[확정]`(file:line 근거) / `(제안)…[추정]` / `🚫고아` / `✦신규`.
- **행 클릭 → 상세 패널**(아래에서 슬라이드업, 코드뷰어/NodeDetailModal 동형):
  - **현행 상태**(현행 head 기준): 요구·구현·데이터·테스트, 각 셀 `[편집]`/`[확정하기]`.
  - **📜 요청별 이력 타임라인** — **이 기능을 건드린 요청만** 표시(전체 차수 나열 ✗).
    각 항목: `요청 · 변천동사(+신규/~변경/−삭제/=부활) · 영향(구현이 어떻게 됐나) · ✓확정(이름)·날짜`.
    **구현 코드 diff(추가/삭제 메서드)는 기본 접힘**, 펼치기 토글로 노출.
  - 근거(file:line) 펼치기 · `[요구사항 뷰에서 보기 →]` 점프.

### 2.2 뷰 ② 요구사항 기준 (요청 그룹) — "이 요청이 무엇을 바꾸는가"

- 행 = 요구사항. 열: **요구사항 · 상태(현행/폐기) · 영향(−/~/+/=) · 도메인 · 진척 · 확정**.
- **행 펼침 → 변경 묶음(changeset)**: 이 요청이 건드린 기능들을 `−/~/+/=` 분류로 나열.
  - 확정: `[전체 확정]`(REQ 통째 승인) **및** 행별 `[확정하기]` 둘 다 제공.
  - 폐기된 요청도 펼치면 **과거 changeset 보존**(감사용).
- 요청 이력 셀렉터: `[REQ-1] [REQ-2] [REQ-3 ●현행]` — 차수별 묶음 열람.

### 2.3 상호 연결

- ① 현행요구 셀 클릭 → ② 해당 REQ 묶음 (역추적).
- ② 묶음의 기능 클릭 → ① 해당 도메인 행 (순추적).
- ② `[전체 확정]` → ① 관련 기능 상태가 동시에 `✓확정` 으로 동기화.

## 3. 인테이크 — 자연어 요청 → 제안 행

`[+요청]` 버튼 → 자연어 입력 모달 → `claude -p`(분해/매칭) → 제안 행이 `[추정]`으로 표에 삽입.
**영향도 분석 버튼(커밋 829f94d) 흐름을 그대로 재사용**한다.

1. 입력: 자연어 + **현재 도메인/기능 인벤토리**(컨텍스트로 주입 → 기존 입도와 일관되게 분해).
2. `claude -p` 가 판정:
   - **신규 도메인?**(EX1 알림) → 새 domainId + 하위 기능 N개 생성, 전부 `[추정]·미구현`.
   - **기존 도메인 수정?**(EX2 결제) → 도메인 인벤토리에서 매칭 → 그 도메인 **안에** 행 추가 +
     `/understand-impact` 엔진으로 영향 범위(`removed/modified/added`)를 `[확정]` 근거와 함께 산출.
   - **요구사항 변경?**(REQ2가 REQ1 모순) → 이전 요구 `SUPERSEDED` 마킹 + changeset 제안.
3. 결과를 `rtm.json`(생성물) 위 오버레이 후보로 제시 → 사람이 확정.
4. **오매칭 정정** — 제안된 도메인 귀속이 틀리면 사용자가 상세 패널에서 도메인 재지정.

## 4. 데이터 / 생성기

### 4.1 생성기 (기존 문서 파이프라인 재사용)

`ktds-legacy-plugin` 의 `DocInput → builder → GeneratedDoc` 인프라를 그대로 쓰되, **구조화 산출물**
(`rtm.json`)을 추가로 낸다(그리드가 구조 데이터를 요구).

- 입력(`DocInput` 기존 8필드 재사용): `nodes/edges`(도메인·기능), `routes`(진입점),
  `methodCallGraph`(구현), `mybatisModel`(테이블 CRUD), `fileEdges`, `project`, `buildDeps`.
- 신규 빌더 `buildRtm(input): { rows, requirements }` — 도메인 기능을 행으로, 근거 있는 셀은
  `CONFIRMED`(file:line), 없는 셀(테스트 등)은 `INFERRED`/`UNVERIFIED`.
- 출력: `.understand-anything/rtm.json`(생성물, **불변**) + 사람 편집은 오버레이(§5).
- 결정론 유지(정렬 tie-break, `Date.now()` 미사용 — 타임스탬프는 호출자 주입).
- `DOC_SET` 패턴과 동형이되 RTM은 `.md`가 아니라 구조 JSON이 1차 산출물. 필요 시 `09_impact-analysis`
  /`si-기능명세서` 빌더 로직 일부 차용.

### 4.2 근거 모델 (기존 `CONFIDENCE_VALUES` 재사용)

`CONFIRMED`(file:line) / `CONFIRMED_AI` / `INFERRED`(`[추정]`) / `UNVERIFIED`(`[확인필요]`).
`claim()` fail-closed 규칙(근거 없는 CONFIRMED 금지) 그대로 적용.

## 5. 추정 → 확정 오버레이 (행 단위 · node-overrides 패턴)

생성물 불변 + 오버레이가 이김 = 기존 `node-overrides.json`/`doc-overrides.json` 패턴을
**RTM 행/요구사항**에 적용.

- 파일: `.understand-anything/rtm-overrides.json`(domain-graph.json 형제, 재생성 생존).
- 레코드(행): `{ fnId, editedCells: {...}, domainOverride?, approver, at,
  audit: [{event:"CONFIRMED", by, at}] }` — append-only 감사 로그.
- 레코드(요구사항): `{ reqId, changesetConfirmed: bool|partial, supersedeConfirmed, approver, at, audit }`.
- 읽기 시 병합: `override?.editedCells?.[key] ?? generated`. 확정 시 즉시 배지 전환.
- `[전체 확정]` = 해당 REQ의 changeset 행들을 일괄 오버레이 기록.
- approver 해석: `config.json#approver` → `localStorage("ktds.approver")` → `window.prompt`
  (기존 `resolveApprover` 재사용).

### 5.1 사용자 정의 필드(열) — 후속, 모델은 1차부터 수용

- **필드 정의(스키마)** 는 행 값과 분리해 보관: `rtm-overrides.json` 의 `_fields` 섹션
  (또는 형제 `rtm-fields.json`). 항목: `{ id, label, scope:"function", createdBy, at }`.
  생성기 산출 셀과 충돌 없도록 사용자 필드 id 는 네임스페이스(`custom:*`)로 격리.
- **행 값** 은 행 오버레이 `editedCells["custom:<id>"]` 에 저장(키가 임의 문자열이라 이미 수용).
  사용자 입력값 = 코드 근거 없음 → confidence 미적용, 채우면 사실상 `✓확정(입력자)` 취급.
- **추가/삭제 UI** 는 뷰① 그리드 열 헤더의 `+ 필드` / 열 메뉴 삭제. 삭제는 정의만 제거하고
  행 값은 보존(파괴적 삭제 금지 원칙과 동일) 또는 명시적 purge 옵션.
- 엔드포인트는 §6 `POST /rtm-override` 를 `kind:"field-def"` 로 확장(별도 경로 불필요).

## 6. 엔드포인트 (vite dev server, 토큰 게이팅)

기존 `/doc*`·`/node-overrides` 핸들러를 본떠 추가(전부 `ACCESS_TOKEN` 보호):

| 메서드/경로 | 용도 |
|---|---|
| `GET /rtm.json` | 생성물 + 오버레이 병합된 RTM 전체(행·요구사항·이력) |
| `POST /rtm-override` | 행/요구사항 확정·편집 저장(docId/fnId 실존 검증, audit append) |
| `POST /rtm-intake` | 자연어 요청 → `claude -p` 분해/매칭 job 시작(영향도 버튼 job 러너 동형) |
| `GET /rtm-intake-status` | 인테이크 job 폴링(running/done/failed) → done 시 `rtm.json` 재로드 |

- 단일 job 가드(409), 인메모리 job(서버 재시작 시 소실 허용), spawn args 배열(셸 미경유).
- query 토큰 검증 `url.searchParams.get("token") !== ACCESS_TOKEN → 403`.

## 7. 탭 UI 배선

- `ViewMode` 에 `"rtm"` 추가(store.ts). 헤더 탭 그룹에 "요구사항" 버튼(`DocsView` 탭과 동형).
- `RtmView.tsx`(신규, lazy) — 풀페이지. 내부 상단에 `[기능 기준 | 요구사항 기준]` 뷰 토글.
- 하위: `RtmFunctionView`(도메인 그룹 그리드 + 상세 패널 `RtmFunctionDetail` = 현행상태 + 이력
  타임라인) · `RtmRequirementView`(요청 그룹 + changeset 펼침) · `RtmIntakeModal`(자연어 입력) ·
  `RtmIntakeIndicator`(job 스피너/토스트).
- 배지 = 기존 `TrustBadge`(confirmedBy 우선 → verdict). 마크다운 셀은 기존 GFM 렌더 재사용.
- docs 페이지처럼 RTM 페이지에서 그래프 전용 컨트롤(Persona/Filter/Export/Search) 숨김.

## 8. i18n / 안전 / 스코프

- locales `ko.ts`/`en.ts` 에 `rtmView.*`(뷰 토글, 열 라벨, 변천동사, 상태, 인테이크 문구) 추가.
- 권한: 로컬 dev 도구 한정 — 인테이크 `claude -p` 는 `--permission-mode bypassPermissions`(영향도
  버튼과 동일). 프로덕션 배포 대상 아님.
- 게이트: legacy-core 골든 스냅샷·코어 불변식 ∅·dashboard build/test. jpetstore-6 실측 검증.

## 9. 결정사항 & 기본값

확정됨:
- 확정 단위 = **행(기능) 단위**. 요구사항 출처 = **자동 도출 + 수동 추가**.
- 뷰 2개(기능/요구) 토글, 상호 점프. 요구사항 변경 = supersede + changeset.
- 뷰① 행 클릭 = 현행상태 + **요청별 이력 타임라인**.
- 이력은 **이 기능을 건드린 요청만**. 구현 **diff 기본 접힘**.

확정됨(추가):
- **기본 뷰** = 기능 기준(①).
- 고아 코드 = 같은 행에서 `🚫제거대상` 표시(별도 행 분리 ✗ — 단순성 우선).
- **사용자 정의 필드(열) 추가/삭제** — 우선순위/담당자/설계산출물 등을 **고정 스키마로 하드코딩하지
  않고**, 사용자가 뷰① 그리드에서 열을 직접 추가/삭제(§5.1). 1차 구현 범위 밖(후속 단계)이나
  **데이터 모델은 처음부터 이를 수용**하도록 설계한다.

기본값(이견 시 조정):
- 뷰② 진척에 `구현 x/y` + `검증 x/y` 둘 다 노출.

## 10. 단계 (제안)

- **R1** 데이터 모델 + `buildRtm` 빌더 + `rtm.json` 생성(AS-IS만, 전부 근거 기반). 게이트 통과.
- **R2** RTM 탭 + 뷰① 기능 그리드 + 상세 패널(현행상태). 읽기 전용.
- **R3** 행 단위 추정→확정 오버레이(`rtm-overrides.json` + 엔드포인트 + TrustBadge).
- **R4** 뷰② 요구사항 + changeset + 이력 타임라인(상호 점프).
- **R5** 인테이크(`[+요청]` → `claude -p` 분해/매칭 → 제안 행) + supersede/고아 판정.
- **R6** 헤드리스 QA(시나리오: EX1 알림 신규 / EX2 결제 무통장 추가 / REQ 체인 변경).
- **R7**(후속) 사용자 정의 필드 추가/삭제(§5.1) — 데이터 모델은 R1/R3에서 미리 수용.

## 재사용 맵 (그래서 비용이 낮음)

| RTM 신규 개념 | 기존 자산 |
|---|---|
| 자연어 → claude -p → JSON → 대시보드 | 영향도 분석 버튼(829f94d) + job 러너 |
| REQ → 기능 N개 changeset / 고아 판정 | `/understand-impact` 엔진 |
| 행 단위 추정→확정 + audit | `node-overrides` 오버레이 패턴([[node-detail-edit-design]]) |
| 근거(file:line) 행 생성 | `DocInput`→builder→`CONFIDENCE_VALUES`([[doc-generation-design]]) |
| 탭/풀페이지/배지/GFM | `viewMode`·`DocsView`·`TrustBadge` |
