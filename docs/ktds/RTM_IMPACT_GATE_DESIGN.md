# RTM 인테이크 근거 게이트 설계서 — 분석 산출물 기반 요구사항 설계

> 인테이크 ①식별이 **근거 없이 지어내는 설계**를, 이미 분석 완료된 산출물(화면·정책·도메인·데이터·
> 코드영향·추적표)을 근거로 바꾼다. `RTM_TAB_DESIGN.md:145/148-149` 의 미구현 설계를 되살리되,
> 범위를 impact 엔진 하나에서 **6축 근거 번들**로 넓힌다.
>
> **선행 설계:** `RTM_TAB_DESIGN.md`(§3 인테이크), `RTM_STEP_FLOW_DESIGN.md`(5단계 게이트),
> `PIPELINE_ORDER.md`(순서·스테일 전파·스탬프), `STRUCTURE_FROM_MAP_DESIGN.md`
>
> **상태:** 제안 — 승인 전. 착수 전 §9 범위·비용 합의 필요.
>
> **개정 이력**
> - 1차(2026-07-16): impact 엔진 배선만 다룸.
> - **2차(2026-07-16, 본문)**: 사용자 지적으로 전면 개정. *"카카오 로그인을 추가한다는 건 화면도
>   있어야 하고, 회원가입 정책(규칙)도 고려해야 하고, 어떤 도메인 파일이 영향가는지도 알아야 하며,
>   DB는 어디를 추가·변경해야 하는지도 분석해야 한다. 즉 이미 분석 완료된 데이터를 활용해야 정밀한
>   설계가 가능하다."* → 1차 설계가 impact 엔진의 세계관(파일·엣지)을 그대로 물려받아 **화면·정책을
>   구조적으로 배제**하고 있었음을 인정하고 재설계.

---

## 0. 배경

2026-07-16 사용자 질문에서 출발했다: *"변경·영향의 자연어 분석이랑 추적표의 새 요청이 뭐가 다른가?
둘 다 '카카오 로그인 기능 추가'를 넣으면?"* → 실측 결과 **인테이크는 분석 산출물을 전혀 안 보고
설계를 지어내고 있었다.**

1차 설계는 이를 "impact 엔진을 배선하면 된다"로 좁혀 잡았다. **그건 틀렸다** — impact 엔진의
세계관은 파일·엣지·라우트·매퍼뿐이고 **화면도 정책도 모른다**(`impact/` 전체 `REQ|SFR|요구사항`
grep 0건). 요구사항 설계는 그보다 넓은 근거를 요구한다.

---

## 1. 확인된 사실 (2026-07-16 실측)

### 1.1 인테이크는 무엇을 보는가 — `rtm.json` 하나뿐

| | 변경·영향 "자연어 영향 분석" | 추적표 "＋ 새 요청" ①식별 |
|---|---|---|
| 엔진이 자연어를 받나 | **아니다** — `--path` 파일집합만 (`understand-impact/SKILL.md:25`), fail-closed(`understand-impact.mjs:135-140`) | 받는다(원문 그대로) |
| 대상 결정 주체 | LLM(카탈로그) + **사람 승인 게이트 필수**(`SKILL.md:32-33`) | LLM 단독, 승인 없음 |
| 무엇을 읽나 | census/edges/routes/slices 전량 | **`rtm.json` 하나**(`understand-rtm/SKILL.md:77`) |
| 주입 컨텍스트 | 시드 카탈로그 | **0바이트**(`vite.config.ts:1482`) |
| 근거 | GROUNDED(인용 기계검증) | **없음** — citation 필드 부재 |
| 요구사항 개념 | **모른다** | 본업 |

### 1.2 실증 — 인테이크가 지어낸 것들

`examples/jpetstore-6` 에 `source.raw="카카오 로그인 기능 추가"` 실행 흔적이 남아 있다.
TO-BE 스텁 6건의 **모든 셀이 `evidence: 0`, `confidence: INFERRED`**:

```
FN-025 카카오-계정연동-자동가입
  entryPoint     (제안) AccountActionBean#kakaoCallback 내부 분기      evidence 0
  implementation (제안) +AccountService#linkOrCreateByKakao …          evidence 0
  data           (제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR)    evidence 0
```

각 항목이 **왜 틀렸는지 분석 산출물이 이미 답을 갖고 있다**:

| 지어낸 것 | 산출물이 아는 사실 | 근거 |
|---|---|---|
| `OAUTH_ACCOUNT(C)` — 없는 테이블 발명 | `db-schema.json` 에 실존 테이블 **13개**, OAUTH_ACCOUNT 없음 | `.spec/map/db-schema.json` |
| `SIGNON(CR)` — Create 주장 | `crud-matrix.json`: "로그인 처리"는 SIGNON 을 **R(읽기)만**, `CONFIRMED` | `crud-matrix.json` rows, evidence `AccountMapper.xml:26,52` |
| `+KakaoOAuthService` — 클래스명 발명 | impact 엔진엔 **L1 하드게이트**(선례 없으면 파일명 생성 금지, `supplement-a.ts:203`)가 있으나 **인테이크엔 없음** | — |
| (누락) password 처리 미설계 | `policy-domain-account.md` §8: **"SIGNON.PASSWORD 는 varchar(25) 평문, 해시/솔트 로직 없음"** — OAuth 자동가입 설계의 핵심 쟁점 | `schema.sql:30-34`, `AccountMapper.xml:52-77` |
| (누락) 화면 미지정 | AC-1 *"로그인 폼에 '카카오로 로그인' 버튼/링크를 노출한다"* 가 **어느 화면인지 안 가리킴**. `screens.json` 엔 `SignonForm.jsp` annotation 16건 + `selector`·`bbox`·`handler.evidence` 존재 | `screens.json` |

### 1.3 구조적 배제 — 볼 자리가 없다

`rtm.json` 기능 행의 축은 **`entryPoint` / `implementation` / `data` / `test` 4개뿐**이다.
`rtm.json` 전문 grep: **`screen` 0건, `policy` 0건, `jsp` 0건**. `deliverableRefs` 는 스키마에
슬롯이 있으나 **28개 기능 전부 빈 배열**.

→ 인테이크가 화면·정책을 "고려하지 않은" 게 아니라 **고려한 결과를 적을 자리가 없다.**
AC-1 의 화면 요구사항은 `rules[]` 에 **평문 텍스트로만** 붙어 있다(`confidence: INFERRED`).

### 1.4 배선 현황

인테이크(§B ①~⑤)가 `impact.json`·`screens.json`·`policy-*`·`db-schema.json`·`crud-matrix.json` 을
읽는 곳은 **0곳**(grep 확인). `PIPELINE_ORDER.md` [7]↔[8] 사이에도 데이터 의존이 없다 —
**[7]→[8] 번호는 워크플로 순서가 아니라 빌드 순서다.**

---

## 2. 문제 정의

```
①식별 ──(근거 0. 화면·정책은 볼 자리조차 없음)──▶ ②③④ 문서 ──▶ ⑤ rtm.json 행 + TO-BE 스텁
        └ rtm.json 기능명 문자열만 보고 LLM 이 설계를 지어냄
```

①의 추측 위에 문서 4종과 정식 추적표 행이 선다. ⑤ 이전은 되돌릴 수 있지만
(`RTM_STEP_FLOW_DESIGN.md:231`), **틀렸다는 걸 알아챌 장치가 없다.**

---

## 3. 설계 드리프트 — 원래 설계는 이걸 규정했다

| 문서 | 규정 | 상태 |
|---|---|---|
| `RTM_TAB_DESIGN.md:145` | "입력: 자연어 + **현재 도메인/기능 인벤토리(컨텍스트로 주입)**" | **미구현**(0바이트) |
| `RTM_TAB_DESIGN.md:148-149` | "`/understand-impact` 엔진으로 영향 범위를 **`[확정]` 근거와 함께** 산출" | **미구현** |
| `RTM_TAB_DESIGN.md:264` | changeset 판정 담당 = "`/understand-impact` 엔진" | **미구현** |
| `RTM_STEP_FLOW_DESIGN.md:120` | 위를 "changeset 매칭"으로 축약 | 드리프트 지점 |
| `FRONT_REDESIGN_DESIGN.md:29` | 여정: "접수 → **영향도 분석** → 구조 확인 → 추적표 확정" | 미구현 |

**이 문서는 신규 제안이 아니라 드리프트 복구다.** 다만 원 설계(`:148`)조차 impact 엔진만 말했으므로,
화면·정책 축은 본 2차 개정에서 처음 제기된다.

---

## 4. 근거 6축 — 무엇을 쓸 수 있나 (실측 인벤토리)

`examples/jpetstore-6` 기준. **대부분 이미 근거가 붙어 있다 — 인테이크가 안 볼 뿐이다.**

| 축 | 산출물 | 규모 | 근거 | 카카오 설계에 주는 것 |
|---|---|---|---|---|
| **화면** | `screens.json` (+`screens/*.png`) | 574 KB / 22화면, signonForm ann 16 | ✅ ann별 `handler.evidence[file:line:snippet]` | **최상**. `SignonForm.jsp` 의 DOM·`selector`·`bbox` → 버튼 삽입 지점 확정 |
| **정책(도메인)** | `doc-output/policy-domain-account.md` | 9.9 KB, evidenceRate 0.41 | ✅ 표 행마다 `근거` 열 | **최상**. PL-001 인증실패 분기, AUTH_STATE 판정식, `@Validate` 선차단, **평문 password 미결** |
| **정책(데이터)** | `doc-output/policy-data.md` | 26 KB, evidenceRate **1.0** | ✅ 전 행 | 중. SIGNON 유일성 규범 |
| **도메인** | `domain-graph.json` | 543 KB / nodes 108, edges 173 | ✅ `ktdsClaims[].citations` 476건 **전부 GROUNDED** | **높음**. account rule 6·flow 3(인증 성공/실패 분기)·claim 55 |
| **데이터(스키마)** | `.spec/map/db-schema.json` | 70 KB / 13테이블 | ✅ 테이블·컬럼별 `line` | **높음**. `SIGNON.username/password varchar(25) NOT NULL` |
| **데이터(CRUD)** | `.spec/map/crud-matrix.json` | 11 KB / 22행×13열 | ✅ 행별 `evidence[file:line]` | **높음**. "로그인 처리"=SIGNON **R**, CONFIRMED |
| **코드영향** | `.spec/map/impact.json` | 17 KB | 부분(`mappers[].citation` 전부 null) | **현재 쓸 수 없음** — seeds 가 **Cart 고정**(§6.3) |
| **추적표** | `rtm.json` | 118 KB / req 2, fn 28(TO_BE 6) | ⚠ AC/rule 전부 INFERRED | 출발점이자 검증 대상 |

### 4.1 ⚠ 빈 산출물을 "없음"으로 오독하는 함정

`policy-authz.md`(702 B) · `policy-validation.md`(617 B) 는 **데이터 행이 0건**이다. 원인은
jpetstore 가 Stripes `@Validate` 를 쓰는데 스캐너는 `@PreAuthorize`/bean-validation 을 찾기 때문
(evidenceRate 0). **이걸 그대로 주입하면 LLM 이 "권한 통제 없음"으로 오독한다.**
→ 근거 번들은 **`evidenceRate`·`행수`를 함께 실어 "없음"과 "못 봄"을 구분해야 한다.**

---

## 5. 선행 조건 — "분석 완료" 를 판정할 수 없다

사용자 지적: *"해당 기능은 프로젝트 분석이 모두 완료되고 나서야 쓸 수 있는 기능"*. **맞다.
그런데 완료를 판정할 장치가 없다.**

### 5.1 실태

- **단일 매니페스트 없음.** `meta.json` 은 **은퇴한 `/understand`** 의 산출물이고 ktds 파이프라인이
  읽지도 쓰지도 않는다(`grep meta.json` → scripts/legacy-core 0건).
- **`understanding.config.json` 은 순수 설정** — stage/phase/completed 키 전무.
- **인테이크의 선행 확인 0줄.** `rtm-intake.mjs` 전체 grep(`gitCommit|stale|drift|…`) → **0건**.
  `rtm.json` 이 없거나 손상돼도 **조용히 빈 인벤토리로 진행**한다(`rtm-intake.mjs:167-180`) —
  도메인 귀속이 전부 새 `to-be:` 로 떨어진다. `SKILL.md:45` 의 "없으면 멈춤"은 **LLM 에게 주는
  자연어 지시일 뿐 코드에 없다.**
- **대조 게이트는 전부 경고**: `planDrift`(커밋 아닌 루트집합 대조, `confirm.ts:253` — `console.log`),
  `staleSkeleton`(`fill-pipeline.ts:84` — "차단 대신 표면화"), 대시보드 신선도 배지(UI만).
  impact 의 fail-closed 는 **존재 검사일 뿐 신선도는 안 본다**(`understand-impact.mjs:50-56`).
- **실측: 한 프로젝트에 커밋 5종 공존** — HEAD `bddc686` / census·impact `50ab1fc` /
  routes `a741cce` / domain-graph `dfbb982` / policy `ffe1992`. **어떤 장치도 보고하지 않는다.**

### 5.2 ★ 확인된 버그 — 스탬프가 조용히 `null` 로 샌다

```js
// scripts/understand-rtm.mjs:106
let model = buildRtm(input, graph.gitCommit ?? null)
// scripts/understand-docs.mjs:259
const sourceCommit = graph.gitCommit ?? null
```

`graph` 는 `domain-graph.json` 인데 **최상위에 `gitCommit` 키가 없다**
(실제 키: `edges, ktdsMap, layers, nodes, project, tour, version`).
→ `undefined ?? null` → **항상 `null`**. 실측: `rtm.json.gitCommit = null`,
SI 문서 16종 전부 `sourceCommit: null`.

**올바른 키는 존재하고 값도 차 있다**: `project.gitCommitHash` = `ktdsMap.generatedFromCommit`
= `dfbb9822…`.

> **이게 최우선이다.** 스탬프가 null 이면 "분석이 완료·정합한가"를 판정할 **데이터 자체가 없어서**
> 어떤 게이트도 못 붙인다. 수정은 한 줄씩 2곳.
> (`PIPELINE_ORDER.md:98` 의 "rtm.json — 스탬프 없음"도 부정확 — 필드는 있고 값이 새는 것이다.)

### 5.3 미배선 재고 — `stale/` 모듈

`legacy-core/src/stale/stale.ts` 에 `detectStaleClaims`/`incrementalReapproval` 이 **완성돼 있고
테스트도 있으나 프로덕션 호출자 0건**. `PIPELINE_ORDER.md §3` 이 "후보 해법"이라 적은 일관성
감사기의 엔진 절반이 이미 존재한다.

---

## 6. 제안

### 6.1 전체 그림

```
[선행 게이트]  분석 완료·정합 판정  ← 스탬프 복구(§5.2)가 전제
     │  불충족 시 무엇이 없는지/낡았는지 알리고 중단(fail-closed)
     ▼
① 식별
   1. next-req → REQ-00N                                       (기존, 결정론)
   2. ★ 근거 번들 생성 — intake-input.json (§6.2)              (신규, 결정론)
        6축 유계 요약 + pre-cite + evidenceRate/행수 동봉
   3. LLM: 요청 → 요구사항 분해 + changeset + 화면·정책·데이터 귀속
        ※ 인용은 생산 금지 — 번들의 pre-cite 를 verbatim 인용    (pre-cite 패턴)
   4. ★ 실재 대조: changeset fnId ⊂ rtm.json / 테이블 ⊂ db-schema / 화면 ⊂ screens.json
        (신규, 결정론, fail-closed) ← OAUTH_ACCOUNT 발명 차단
   5. ★ 코드영향 검증: changeset.modified → 시드 파일 → impact analyze (§6.3)
   6. identified.json 에 6축 근거 기록                          (신규 스키마)
   7. 보고 후 멈춤 — ① 컨펌 게이트가 그대로 역할
        ↓ 컨펌
② 목록표 ▶ ③ 정의서 ▶ ④ 명세서   — 근거 위에 쓰인다
        ↓
⑤ RTM 반영 — AC/changeset 이 GROUNDED 로 승격 가능
```

### 6.2 근거 번들 — `group-input` 패턴 재사용

**통째 주입은 불가능하다**(domain-graph 543 KB, screens 574 KB; eGov·mmobile 규모면 수십 배).
기존에 검증된 패턴을 그대로 쓴다:

- **유계 요약** — `/understand-map` 의 `group-input`(`understand-map.mjs:272-301`): 전량 대신
  `fileCount` 카운트 + `sampleFiles.slice(0, SAMPLE_FILES_MAX=8)` + 결정론 정렬 + **디스크 경유**.
  `understand-map/SKILL.md:82` 가 계약을 명문화: **"전 소스를 읽지 않는다 — 이 요약이 판단 입력의 전부"**.
- **pre-cite** — `domain-map/fill-fanout.ts:5-11`: **"인용 생산을 LLM 에서 제거"**. 결정론 추출한
  검증-통과-보장 인용을 동봉하고 LLM 은 verbatim 복사만. eGov 1,255흐름 근거율 100% 의 원인.
  **인테이크의 `evidence: 0` 문제에 정확히 대응한다.**
- **정직한 생략** — charCap 초과분은 `slice=null` + `sliceOmitted[]` 로 보고(조용한 누락 금지).
- **팬아웃**(규모 초과 시) — `{map,screens,policy}-fill-fanout.workflow.js` 3종이 동일 하네스.
  청크 페이로드가 메인 컨텍스트를 안 거치고, ACK 스키마가 본문 유출을 막는다.

신설: `rtm-intake.mjs intake-input <projectRoot> --request <원문>` →
`rtm-intake/<sid>/intake-input.json`. 요청 원문으로 **6축을 사전 필터**(예: "로그인" → account
도메인 · SignonForm 화면 · policy-domain-account · ACCOUNT/SIGNON/PROFILE 테이블)해 유계 요약.

> ⚠ **선례로 삼지 말 것**: `understand-impact.mjs:74-95` 의 `seeds` 카탈로그는 라우트를 **캡 없이
> 전량 stdout** 한다(eGov 규모면 수천 줄). 같은 함수 안에서 파일 인벤토리는 개수만 출력(`:94`)하는
> 걸 보면 일관되지 않은 적용 사례이지 규모 대응 선례가 아니다.

### 6.3 코드영향 — 요청별 저장소가 필요하다

`impact.json` 은 **프로젝트당 1슬롯**이다. 실측에서 그 슬롯은 `Cart.java` 시드로 고정돼 있어
카카오 설계에 **쓸 수 없다**. Account 시드로 재실행하면 Cart 분석이 사라진다.

1차 설계는 이를 "C1 부작용"으로 다뤘으나 **구조적 결함이다** — 요청별 영향분석은 요청별 저장소를
요구한다. 코어 `analyzeImpact` 에 `artifacts.reportFilename` 오버라이드가 이미 있고(경로탈출 가드
포함) CLI 만 노출을 안 한다.

**시드 도출은 결정론이다** — `changeset.modified`(flow) → `rtm.json functions[].entryPoint
.evidence[].file` / `implementation.evidence[].file`(**CONFIRMED**). LLM 불필요. 이건 `/change` 의
현재 방식(LLM 이 카탈로그 읽고 경로 추측 → 사람 승인)보다 **근거가 강하다**.

### 6.4 스키마 확장 — 화면·정책 축

`intake-types.ts` 에 citation 필드가 없고(grep 0건), `rtm.json` 기능 행에 화면·정책 축이 없다.
근거를 실으려면 **적을 자리부터** 만들어야 한다(additive, 하위호환 default).
`deliverableRefs`(28/28 빈값)는 이미 있는 슬롯이니 재활용 후보.

### 6.5 왜 6번째 단계로 만들지 않나

①~⑤ 번호는 외부 가이드(`templates/요구사항_작성순서_가이드.md`, study/ — 미벤더링)의 5단계에
앵커돼 있고, 벤더링된 템플릿 5종 중 `01~03` 이 ②③④에 대응한다(`04_과업내용변경요청서`·
`05_변경영향분석서` 는 절차 B 변경관리용). 6단계로 늘리면 가이드와 어긋나고 `STEP_DEFS`·`CIRCLED`·
`targetStep`·세션 스키마·URL·서버 게이트·스테퍼가 연쇄로 바뀐다.
**"무엇이 영향받는지 식별"은 의미상 ①식별에 속한다.**

### 6.6 왜 "분석 먼저, 그 다음 요청"은 아닌가

impact 엔진은 **시드=실존 파일**을 요구한다(fail-closed). "카카오 로그인 추가"라는 문장만으로는
시드를 정할 수 없다 — 어떤 기존 파일이 관련 있는지 알려면 요청을 먼저 분해해야 한다. 닭-달걀이므로
**분석이 요청보다 앞설 수 없다.** 사용자 문제의식의 핵심("영향을 확인해야 요청을 넣을 수 있다")이
놓이는 자리는 **① 안, ⑤ 앞**이다. 요청(REQ 원문)은 고객이 말한 것이니 먼저 존재하지만,
**요구사항(SFR/SIR·AC·changeset)은 분석 산출물 기반이어야 한다.**

### 6.7 ⚠ "변경영향분석서" 동음이의 3종 — 구현 시 반드시 구분

| 이름 | 정체 | 산출 |
|---|---|---|
| `/understand-impact` 의 impact.json | **코드 도달성**(파일·엣지 BFS) | `.spec/map/impact.json` + 문서 **09** |
| `rtm/change-impact.ts` `computeChangeImpact` | **REQ 철회의 요구사항 역추적**. 코드 분석 아님 | 템플릿 **05_변경영향분석서**(절차 B) |
| 대시보드 "변경·영향" 메뉴 | 위 **첫 번째**의 열람 화면 | — |

본 설계가 부르려는 건 첫 번째. 두 서브시스템은 코드상 연결이 전혀 없다.

---

## 7. 제약 · 미해결

| # | 제약 | 선택지 |
|---|---|---|
| **C1** | **스탬프 null 버그**(§5.2) — 게이트의 데이터 전제 | 2곳 한 줄씩 수정. **선행 필수** |
| **C2** | **"완료" 판정 기준** — 매니페스트가 없다. 커밋 5종 공존을 어디까지 허용? | **축소 모드 확정(2026-07-16 사용자 결정, §10-1)** — 최소집합만 요구, 나머지는 있으면 포함·없으면 생략+명시. 커밋 허용범위는 미결 |
| **C3** | **요청별 impact 저장소**(§6.3) | CLI `--report-name` 노출 + 세션 저장 / impact 원장 기록 |
| **C4** | **근거 스키마 부재**(§6.4) — 화면·정책 축, citation | additive 확장 |
| **C5** | **빈 산출물 오독**(§4.1) | evidenceRate·행수 동봉 필수 |
| **C6** | **added 생성예측** — `--precedent/--entity` 필요, 선례 선택은 F2 사람 게이트, 선례 없으면 파일명 금지(L1). `CreationSuggestion` 은 impact.json 이 아니라 **md 09** 에만 발행 | 1차 범위 제외 후보 |
| **C7** | **규모** — 6축 사전 필터가 요청 원문 의존. "로그인"→account 는 쉽지만 모호한 요청은? | 필터 실패 시 상위 N + 정직한 생략 보고 |
| **C8** | **게이트는 코드로** — screens·policy 의 규모 게이트는 **산문만 있고 코드 0건**, map 게이트도 경고뿐. "문서에 적으면 지켜진다"고 가정 금지 | `confirm` 의 fail-closed(exit 2) 패턴 |
| **C9** | **승인 게이트 이중화** — impact SKILL:33 시드 승인 vs ① 컨펌. 헤드리스는 이미 `IMPACT_AUTONOMY_DIRECTIVE`(`vite.config.ts:1106`)로 전자를 강제 통과 | 시드가 결정론이면 SKILL:33 의 존재 이유 소멸 → ① 컨펌이 대체 |
| **C10** | **실행 시간** — ① 이 LLM 1회 → 번들생성+LLM+엔진(+팬아웃) | 실측 후 판단 |

---

## 8. 스코프 밖(명시)

- 화면 **캡처 재생성**·화면설계서 편집 — `screens.json` 을 **읽기만** 한다.
- `policy-authz/validation` 의 **스캐너 개선**(Stripes `@Validate` 지원) — 별도 과제.
  본 설계는 빈 산출물을 "못 봄"으로 **표시**할 뿐 고치지 않는다.
- 절차 B(변경관리/철회) — 본 설계는 절차 A(신규)만.

---

## 9. 구현 단계(Phase) · 비용

각 Phase 끝 사용자 컨펌 후 다음(메모리 stop-per-phase 관례).

| P | 범위 | 검증 | 비용 |
|---|---|---|---|
| **P0** ✅ | **스탬프 복구**(C1) — `understand-rtm.mjs:106`·`understand-docs.mjs:259` → `ktdsMap?.generatedFromCommit \|\| project?.gitCommitHash \|\| null`(`\|\|` 인 이유: `emit.ts:126` 이 `?? ''` 로 써서 빈 문자열 가능) | **완료 2026-07-16** — 재생성 실측: rtm.json `null`→`dfbb9822…`(diff 정확히 1줄), SI 문서 14종 채워짐 | **小** |
| **P0b** | **남은 스탬프 공백**(§9.1) — `understand-policy.mjs:200` 도메인 모드 `sourceCommit: null` **하드코딩**(6종). 키 오독이 아니라 미배선 | 어느 커밋을 쓸지 결정 후 | 小 (**결정 선행**) |
| **P1** | **실재 대조 게이트** — changeset fnId ⊂ rtm.json (+테이블 ⊂ db-schema) fail-closed. 엔진 배선과 무관하게 **독립 가치**(OAUTH_ACCOUNT 발명 차단) | 단위테스트 + REQ-001 재검증 | 小 |
| **P2** | **근거 스키마**(C4) — intake citation + 화면·정책 축 additive | 스키마 테스트(하위호환) | 小~中 |
| **P3** | **근거 번들 v1**(C5,C7) — `intake-input` 서브커맨드. 축 축소 시작(도메인·데이터·추적표 3축) + evidenceRate 동봉 | 번들 스냅샷 테스트, jpetstore "카카오" 필터 실측 | 中 |
| **P4** | **번들 v2 — 화면·정책 축 + pre-cite** | signonForm ann·policy-domain-account 가 번들에 정확히 들어오나 | 中 |
| **P5** | **① 배선** — 번들 주입 + 실재대조 + `identified.json` 근거 기록 | 인테이크 e2e(라이브 claude), REQ-001 재실행 → evidence>0 | **大** |
| **P6** | **코드영향 검증**(C3,C9) — flow→시드 결정론 조인 + 요청별 impact 저장 | `/change` 슬롯 무오염 확인 포함 | **大** |
| **P7** | **완료 게이트**(C2) — 최소집합 + `stale/` 배선 + 인테이크 선행 fail-closed | 낡은 산출물로 인테이크 시도 → 차단 | 中~大 |
| **P8** | **added 생성예측**(C6) | 카카오/네이버 e2e | 中~大 (제외 가능) |
| **P9** | **UI** — ① 컨펌 화면에 6축 근거 표시. 직전 작업의 경계 문구 갱신 | 시각 QA(headless) | 中 |
| **P10** | **문서 정합** — `RTM_TAB_DESIGN`·`RTM_STEP_FLOW_DESIGN`·`PIPELINE_ORDER` 드리프트 해소 | 문서 리뷰 | 小 |

**P0 는 완료(2026-07-16).** **P1 도 독립적**이며 되돌릴 게 없다. **P5·P6 이 전환점**이고 위험이
거기 몰려 있다.

### 9.1 P0b 가 "결정 선행" 인 이유 — 어느 커밋이 진실인가

`understand-policy.mjs` 도메인 모드는 `assembleDomainPolicies(projectRoot)` 만 호출하고 그래프를
읽지 않는다. 스탬프를 붙이려면 커밋 소스를 골라야 하는데 **후보가 서로 다른 값이다**:

| 후보 | 실측값 | 성격 |
|---|---|---|
| `candidates.json.gitCommit` (assemble 이 이미 읽음) | `a741cce` | 정책서의 실제 입력 |
| `domain-graph` 의 `ktdsMap.generatedFromCommit` | `dfbb982` | 다른 두 스크립트가 쓰는 기준 |

**아무거나 고르면 거짓 스탬프가 된다** — 이게 §5.1 "커밋 5종 공존" 문제의 축소판이다.
P0b 는 C2(완료 판정 기준)와 함께 결정해야 한다.

### 9.2 부수 확인 — 데모 데이터가 코드보다 낡아 있었다

P0 검증차 `examples/jpetstore-6` 를 재생성하니 스탬프 외에 **JSP 행의 도메인 귀속이 바뀌었다**
(`web-inf [추정]` → `account`/`cart`/`catalog`/`order`). 이는 코드에 **이미 반영된 "web-inf 필터"**
개선이 커밋된 데모 산출물에는 없었다는 뜻이다 — 즉 **산출물이 코드보다 낡았는데 아무 장치도
알리지 않았다.** 본 설계 §5 의 주장을 우연히 실증한 사례이며, 재생성분은 더 정확하다.

---

## 10. 열린 질문

1. ~~**"분석 완료" 의 최소집합은?**~~ → **결정됨(2026-07-16, 사용자)**: **축소 모드**.
   *"모든 분석이 완료될 필요는 없고 최소집합만 있으면 돌리되, 없으면 넘어가고 있으면 포함하는 게 맞다."*
   → 최소집합 = 도메인·데이터·추적표. 화면·정책은 **있으면 근거로 포함, 없으면 생략하되 그 사실과
   해당 결론의 강등(`[추정]`)을 명시**. §4.1 의 "없음 vs 못 봄" 구분이 여기 직결된다.
   남은 설계 과제: 최소집합조차 없을 때의 동작(차단? 경고?), 축별 생략이 AC 신뢰도에 미치는 규칙.
2. **커밋 불일치 허용 범위는?**(C2, P0b) 실측이 이미 5종 공존이다. 전부 일치를 요구하면 재분석
   강제인데 대규모(eGov 6,101파일)에서 현실적인가?
3. **added(신규) 근거를 1차 범위에 넣나?**(C6) modified 검증만으로도 큰 축은 해소된다.
4. ~~**인테이크의 impact 실행을 `/change` 원장에 노출하나?**~~ → **결정됨(2026-07-16)**: **노출한다.**
   `RTM_INTAKE_WORKSPACE_DESIGN.md §2.3` 참조 — 같은 데이터가 두 목적을 섬기므로
   **한 번 돌리고 두 곳에서 본다**: 워크스페이스 ① 인라인(컨펌 판단용) + impact 원장 기록(사후 열람용).
   원장 query 는 요청 원문. 이러면 C3(요청별 저장소)도 함께 풀리고 `/change` 의 "기록 없는 분석"
   고아 표시도 안 생긴다.
