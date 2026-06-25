# RTM 단계화(Step Flow) 설계서

> 추적표(RTM) 인테이크를 **가이드 5단계**로 세분화하고, 단계 컨펌 게이트 + "N까지 한번에" 실행을 도입한다.
> 신규(절차 A)뿐 아니라 **변경관리(절차 B: 철회/변경)** 도 포함한다.
>
> **근거 소스 (study/, 2026-06-25 업데이트 반영):**
> - `templates/AI_요구사항문서_생성_프롬프트.md` — **본 스킬의 행위 명세서**(역할·ID체계·절차 A/B·산출규칙)
> - `templates/요구사항_작성순서_가이드.md` — 5단계 흐름
> - `templates/01~03_*.md` — 빈 템플릿(구조)
> - `examples/*.md` — 작성 정답지(채움 수준 기준)
> - 선행 설계: `RTM_TAB_DESIGN.md`(추적표), `DOC_GENERATION_DESIGN.md`(템플릿 문서생성)

---

## 0. 배경 · 현재 동작

대시보드 "＋ 새 요청" → `POST /rtm-intake` → 서버가 `claude -p "/understand-rtm <요청> <directive>"` 1회 spawn.
directive가 "§1~§6 끝까지 완주하라"라 → 분해·매칭·`rtm-requirements.json` 기록·`rtm.json` 재생성까지 **한 방에**.
중간 산출물(목록표/정의서/명세서)이 없고, 사용자 개입 지점도 없다.

**바꾸려는 것**
- 가이드 5단계(①식별 → ②목록표 → ③정의서 → ④명세서 → ⑤RTM)로 쪼개 **단계마다 멈추고 사용자가 컨펌**.
- 사용자가 **목표 단계 N**을 고르면 1..N을 한 번에 진행하고 N에서 멈춘다.
- ②③④는 **vendoring된 템플릿만 보고** 마크다운 문서를 생성한다(examples 정답지는 참조하지 않는다).
- **변경관리(절차 B)** 도 지원: 기존 요청 철회 → CR/영향분석서 생성 + 폐기표시.
- 실행 방식: **단계당 `claude -p` 1회 호출**(확정).

---

## 1. ID 체계 (2단계) — 설계의 축

> 출처: `AI_요구사항문서_생성_프롬프트.md` "ID 체계", `01_요구사항목록표.md` "📌 ID 체계".

| 레벨 | ID 형식 | 의미 | 예 |
|---|---|---|---|
| **요청** | `REQ-{3자리}` | 고객이 던진 요청 1건 | REQ-001 "카카오 로그인 추가" |
| **요구사항** | `{구분코드}-{3자리}` | 요청을 분해한 개별 요구사항 | SFR-010, SIR-002, DAR-003, SER-004 |

구분코드: `SFR`(기능)/`PER`(성능)/`SIR`(인터페이스)/`DAR`(데이터)/`SER`(보안)/`QUR`(품질)/`COR`(제약).

**1 요청(REQ) → N 요구사항.** 일련번호는 기존 목록표에서 이어 부여(중복 금지). 신규 사업이면 010·020 단위.

```
요청 REQ-001 "카카오 로그인 추가"
  ├─ SFR-010  카카오 소셜 로그인        (기능)
  ├─ SIR-002  카카오 OAuth 2.0 API 연계  (인터페이스, SFR-010 파생)
  ├─ DAR-003  소셜 계정 연동정보 저장     (데이터, 파생)
  └─ SER-004  OAuth 토큰 암호화 저장      (보안, 파생)
```

새 계층 구조: **요청(REQ) → 요구사항(SFR…) → 기능(fn) → 4축 추적**.
(현재 rtm.json은 요청→기능 직결. 요구사항 계층이 새로 삽입됨 — §9 통합 참조.)

---

## 2. 단계 모델

| # | 단계 | 산출물 | 형식 | 템플릿 | 비고 |
|---|---|---|---|---|---|
| ① | 수집·식별 | `identified.json` + `[확인필요]` 질문 | 구조화(내부) | — | 요청→요구사항 분해, ID 부여, 모호점 질문 |
| ② | 목록표 | `요구사항목록표.md` | 마크다운 | `01_*` | 요청목록 표 + 요구사항목록 표(그룹핑) |
| ③ | 정의서 | `요구사항정의서.md` | 마크다운 | `02_*` | 요청섹션 > 요구사항(정의/범위/출처) |
| ④ | 명세서 | `요구사항명세서_{요구사항ID}.md` ×N | 마크다운 | `03_*` | **요구사항 1건당 1파일** |
| ⑤ | RTM | `rtm-requirements.json` 병합 + `rtm.json` 재생성 | 구조화(정식) | — | 추적표 반영(§9) |

**핵심 데이터 흐름** — `identified.json`(2계층 누적 중간산출)이 단계마다 풍부해지는 단일 진실원본:

```
NL 요청 ─①식별→ identified.json {request, requirements[](구분/우선순위/AC골격/changeset), questions[]}
              │
              ├─②목록표→  요구사항목록표.md   (요청목록 + 요구사항목록, 얕게)
              ├─③정의서→  요구사항정의서.md   (요청섹션>요구사항: 정의/범위/출처)  ← identified.json 보강
              ├─④명세서→  요구사항명세서_{ID}.md ×N (상세기능/입출력/처리흐름/예외/인수기준)  ← 보강
              └─⑤RTM→    rtm-requirements.json 투영 → understand-rtm.mjs 재생성 → rtm.json
```

가이드의 "얕게(②)→분류(③)→깊게(④)"가 단계마다 LLM이 detail을 더하는 것과 일치. 깊은 작업(④ N파일) 전에
얕은 범위(②③)를 사용자가 먼저 확정하므로 단계 게이트의 가치가 분명하다.

> **TO-BE grounding**: 신규 요구는 코드가 없어 전부 `[추정]`(INFERRED), `[확정]` 불가(기존 SKILL §5 규약).
> ①의 `[확인필요]`는 모호점을 막고 사용자가 컨펌 게이트에서 답하게 한다(절차 A.1).

---

## 3. 스킬 = AI 프롬프트의 자동화 (`/understand-rtm`)

`AI_요구사항문서_생성_프롬프트.md`는 **사람이 복붙으로 실행하는 워크플로**다. 이를 대시보드 단계 실행으로
자동화한다. 그 프롬프트의 역할/참조자료/ID체계/절차/산출규칙을 SKILL.md로 옮긴다.

### 3.1 vendoring (P1)

②③④가 보고 채울 **빈 템플릿 3종만** 플러그인에 동봉한다. **examples(정답지)는 vendoring하지 않는다** —
②③④는 템플릿 구조만 보고 생성한다(예시 문체 과적합 회피, 범위 경량화).

```
ktds-legacy-plugin/templates/requirements/
  01_요구사항목록표.md  02_요구사항정의서.md  03_요구사항명세서.md   # 빈 템플릿(구조)만
```

로드 우선순위: 프로젝트 override(`.understand-anything/templates/requirements/`) → 플러그인 동봉.
(`요구사항_작성순서_가이드.md`·`AI_요구사항문서_생성_프롬프트.md`는 SKILL.md를 **저작할 때** 참고하는 소스이지,
런타임에 로드하는 파일이 아니다 — 그 내용은 SKILL.md 본문으로 흡수된다.)

### 3.2 호출 형태

```
# 부트스트랩(불변): 코드에서 AS-IS 추적표
node understand-rtm.mjs <projectRoot>

# 신규 인테이크 단계(절차 A): 서버가 단계마다 1회 spawn
claude -p "/understand-rtm --intake --session <sid> --step <k> [--request \"<NL>\"] <directive>"

# 변경관리(절차 B): 기존 요청 철회/변경
claude -p "/understand-rtm --change --target-req <REQ> --kind withdraw --reason \"<사유>\" <directive>"
```

### 3.3 단계별 동작 (절차 A — SKILL.md 재작성)

- **`--step 1` 식별** — `rtm.json` 인벤토리 + 기존 목록표(있으면) 읽기 → NL을 요청(REQ)으로 등록하고
  **요구사항(SFR/SIR/DAR/SER…)으로 분해**(구분/우선순위 판정, 파생관계, AC 골격, changeset 매칭, supersede 감지).
  모호점은 `[확인필요]` 질문 목록으로. 결과 → `identified.json`. **rtm-requirements.json·rtm.json 미변경.**
- **`--step 2` 목록표** — `identified.json` + 템플릿01 → **요청목록(§2)** + **요구사항목록(§4, 요청ID 그룹핑)** 채워
  `요구사항목록표.md`. 기존 파일 있으면 행 **추가**(보존).
- **`--step 3` 정의서** — `identified.json`에 정의/범위/출처 보강 → 템플릿02 → **요청섹션 > 요구사항** 구조로
  `요구사항정의서.md`.
- **`--step 4` 명세서** — 요구사항별 상세기능/입출력/처리흐름/예외/인수기준/검증방법 보강 →
  **요구사항 1건당** 템플릿03으로 `요구사항명세서_{요구사항ID}.md` (소속 요청ID 포함). N개 생성.
- **`--step 5` RTM** — `identified.json`(완전본)을 정식 `rtm-requirements.json`으로 투영 → append 병합 →
  `node understand-rtm.mjs` 재생성 → `rtm.json`(§9 통합 정책에 따라).

각 단계 끝에 `session.json` step을 `produced` + summary 갱신. 빈 칸 금지·출처 비우지 않기·ID 철자 동일(산출규칙).

> **②③④를 엔진 아닌 LLM이 채우는 이유**: 신규 요구(TO-BE)는 코드 근거가 없어(`[]`) 결정론 빌더의 이점(file:line)이
> 없다. **템플릿(구조)만** 주면 LLM이 일관 형식으로 채운다(examples 미참조). (엔진 빌더 추가는 후속.)

---

## 4. 산출물 · 세션 모델

```
.understand-anything/
  rtm-intake/
    session.json                  # 활성 세션 1개(단일 job과 1:1)
    <sid>/
      identified.json             # ① 2계층 누적 중간산출
      요구사항목록표.md            # ②
      요구사항정의서.md            # ③
      요구사항명세서_SFR-010.md … # ④ (요구사항 건수만큼)
  rtm-changes/<CR>/               # 절차 B 산출(§8)
    과업내용변경요청서_CR-001.md
    변경영향분석서_CR-001.md
  rtm-requirements.json           # ⑤/B에서 append 병합(기존)
  rtm.json                        # ⑤/B에서 재생성(기존)
```

### 4.1 `identified.json` (2계층)

```jsonc
{
  "request": { "id": "REQ-003", "name": "네이버 로그인 추가", "raw": "<NL 원문>",
               "source": "고객 메일", "requestedAt": null },
  "requirements": [
    { "id": "SFR-020", "category": "SFR", "name": "네이버 소셜 로그인", "priority": "중",
      "status": "유효", "derivedFrom": null,
      "definition": "...", "scope": "...", "origin": "...",           // ③에서 보강
      "spec": { "details": [], "inputs": "", "outputs": "", "flow": "",
                "preconds": [], "exceptions": [], "acceptance": [], "verify": "" }, // ④에서 보강
      "acceptanceCriteria": [ /* AC: fnIds, kind, tests */ ],          // ① 골격
      "changeset": { "added": [], "modified": [], "removed": [], "revived": [] } },
    { "id": "SIR-005", "category": "SIR", "derivedFrom": "SFR-020", ... }
  ],
  "questions": [ "신규/기존 회원 계정 연동 정책은?" ]                    // ① [확인필요]
}
```

### 4.2 `session.json` (진행상태)

```jsonc
{
  "sid": "a1b2c3d4", "mode": "intake", "request": "네이버 로그인 추가",
  "producedStep": 3, "confirmedStep": 2, "targetStep": 3,
  "steps": {
    "1": { "status": "confirmed", "summary": "REQ-003 → SFR-020/SIR-005 분해", "questions": 1 },
    "2": { "status": "confirmed", "summary": "목록표 2행 추가" },
    "3": { "status": "produced",  "summary": "정의서 REQ-003 섹션" },
    "4": { "status": "pending" }, "5": { "status": "pending" }
  }
}
```

**불변식**: `confirmedStep ≤ producedStep`. status: `pending→running→produced→confirmed`.
단계 k 재생성 시 k 이상 `produced/confirmed` 무효화(§6 롤백). 세션은 한 번에 하나(409).

---

## 5. 서버 Job 모델 (`vite.config.ts`)

기존 단일 job(`rtmJob`)을 단계 인식형으로 확장. 외형(202 즉시, 폴링, 409, tail) 동일.

| 메서드·경로 | 역할 |
|---|---|
| `POST /rtm-intake` | `{ request?, sid?, targetStep }` — 새 세션/진행. start..target 순차 spawn |
| `GET /rtm-intake-status` | job + `session.json` 반환(폴링) |
| `POST /rtm-intake-confirm` | `{ sid, step }` — 컨펌(`confirmedStep` 갱신), 다음 게이트 해제 |
| `POST /rtm-intake-discard` | `{ sid }` — 활성 세션 폐기(중간산출 보존) |
| `GET /rtm-intake-doc` | `{ sid, name }` — 세션 .md 미리보기(토큰·traversal 게이트) |
| `POST /rtm-intake-doc` | `{ sid, name, content }` — ②③④ 인라인 편집 저장(`/doc` 동형) |
| `POST /rtm-change` | `{ targetReq, kind, reason }` — 절차 B(§8) |

**진행 로직(`POST /rtm-intake`)**: `start = producedStep+1`, `target = clamp(targetStep, start, 5)`;
`for k in start..target: spawn(claude --step k); producedStep = k`. 한 POST가 start..target 연속 spawn 후 멈춤.
- 기본(1단계씩): 프론트가 `targetStep = produced+1`.
- N까지 한번에: `targetStep = N`.
- **게이트**: 미컨펌 산출(`produced > confirmed`)을 건너뛰고 더 진행 요청 시 거부 → 컨펌해야 다음 실행.
  (단 같은 호출의 자동진행 구간은 1회 검토 약속이므로 면제.)
- **현행 호환**: 프론트 기본 `targetStep=5` = 오늘의 원샷과 동등(단 이제 중간 산출물이 남고 진행이 보임).

라우트 화이트리스트(vite.config.ts:965~)에 신규 경로 추가. `/doc-content.json`·`/doc` 패턴 차용.

---

## 6. 컨펌 · 편집 · 롤백 규칙

| 액션 | 위치 | 효과 |
|---|---|---|
| **컨펌** | 산출 단계 k | `confirmedStep = k`. k+1 실행 게이트 해제. ①은 `[확인필요]` 답변 입력 후 컨펌 권장 |
| **편집** | ②③④ 문서(.md) | `/rtm-intake-doc` POST 저장. ④는 해당 요구사항ID 파일만 |
| **다시 생성** | 단계 k | k 이상 무효화 → k부터 재spawn (예: ② 수정 → ③④⑤ 폐기) |
| **폐기** | 세션 | 활성 닫음. ⑤ 전이면 rtm.json/rtm-requirements.json 무변경 |

**되돌림 안전성**: ⑤ 이전 단계는 `rtm-intake/<sid>/` 안에서만 논다 → 정식 추적표(rtm.json) 무영향.
**⑤만이 rtm-requirements.json·rtm.json을 건드린다.** ①~④ 재생성/폐기해도 추적표는 안전.

---

## 7. UI 설계 (`RtmView.tsx`)

### 7.1 새 요청 모달 — 목표 단계 선택

```
┌ 새 요구사항 요청 ─────────────────────────────┐
│ [ 자연어 요청 textarea ............... ]      │
│ 어디까지 진행:  ①식별 ②목록표 ③정의서 ④명세서 ⑤RTM │  ← 칩, 기본 ⑤
│                              [취소] [실행 ▸]   │
└───────────────────────────────────────────────┘
```

### 7.2 단계 진행 패널

헤더 아래 stepper(①~⑤, 상태색) + 현재 산출 미리보기 드로어:

```
[①식별 ✓ (확인필요 1)]─[②목록표 ✓]─[③정의서 ●검토]─[④명세서 ○]─[⑤RTM ○]

┌ ③ 요구사항정의서 (미리보기, react-markdown) ──┐
│ ## REQ-003 네이버 로그인 추가 …               │
│ [편집] [다시 생성]   [✓ 컨펌] [다음 ▸] [⑤까지 ▸]
└───────────────────────────────────────────────┘
```

- ① 패널: 요청→요구사항 분해 트리 + `[확인필요]` 질문 목록(답변 입력칸).
- ④ 패널: 요구사항ID 탭(SFR-020 / SIR-005 …) — 파일별 미리보기·편집, **컨펌은 ④ 전체 묶음**(§ 미해결 1).
- 미리보기: `GET /rtm-intake-doc` → 기존 doc 뷰어 재사용. 폴링이 `session.json` 동반 → stepper 갱신.
- ⑤ 완료 시: `loadModel()` + `setView("requirement")` + 토스트(현행 그대로).

---

## 8. 변경관리(절차 B) — 철회/변경 모드

> 출처: 프롬프트 절차 B, `과업내용변경요청서_CR-001.md`, `변경영향분석서_CR-001.md`.

신규 5단계와 **별개 트리거**. 추적표에서 기존 **요청(REQ) 선택 → "변경요청"** → :

1. **삭제 금지** — 요구사항 행·문서·명세서 파일 보존.
2. **폐기 표시** — 목록표 상태 `폐기(CR-xxx)`, 정의서·명세서에 폐기 배너 + `상태: 폐기` + 사유(취소선).
3. **변경관리 문서 생성** — `과업내용변경요청서_CR-xxx.md`, `변경영향분석서_CR-xxx.md` (템플릿/examples 기준).
4. **영향 분석** — RTM 역추적으로 연관 설계/코드/DB/시험 영향 + 후속조치(데이터 파기·회귀시험) 식별.
   (기존 `/understand-impact` 역추적 자산 재사용 가능.)
5. **개정 이력** — 영향 문서 모두 새 버전 행.

철회는 **요청 단위**(REQ-001 폐기 → 하위 SFR-010/SIR-002/DAR-003/SER-004 동반 폐기). rtm.json에는
요구사항 `status=폐기`(supersede/withdraw)로 반영. **별도 Phase(P6)로 분리** — 신규 5단계(P1~P5) 후 착수.

---

## 9. rtm.json 통합 — **결정: 옵션 B (단계적 브릿지)** ✅

새 **요구사항(SFR…) 계층**을 정식 추적표에 어떻게 반영할지가 ⑤의 형태와 스키마 파급을 가른다.
**채택: 옵션 B.** ①~④는 2계층 문서를 완전히 생성하고, ⑤는 현재 rtm.json 스키마를 유지하며 요구사항을 투영한다
(REQ는 `requirementHistory`/그룹 태그로 느슨히 연결). 추적표 2계층 1급화는 후속(P5 이후).

**옵션 A — 완전 통합(2계층 1급 모델)**
`rtm.json`에 `requests[]`(REQ) + `requirements[]`를 요구사항(SFR…) 1급 엔티티로 확장(구분/우선순위/상태/
정의/derivedFrom + 기능 매핑). 가이드·문서와 추적표가 완전히 일치. → `build-rtm`·`apply-requirements`·
`coverage`·`types`·`RtmView` 전반 개편. 비용 큼.

**옵션 B — 단계적 브릿지(권장 시작점)**
①~④는 **2계층 문서를 완전히** 생성(가이드 충실, 핵심 가치 확보). ⑤는 **현재 rtm.json 스키마 유지** —
요구사항(SFR…)을 현 모델의 요구사항 엔티티(또는 기능 스텁+AC)로 **투영**하고, 요청(REQ)은
`requirementHistory`/그룹 태그로 느슨히 연결. 추적표 UI는 당분간 현행 표시. 2계층 1급화는 후속.

**옵션 C — 문서 우선, 추적표 분리**
①~④ 문서 생성까지만 1차 범위. ⑤(rtm.json 반영)는 다음 마일스톤. 가장 빠르게 "문서 단계화 + 템플릿"
가치를 검증하고, 추적표 통합은 별도로.

→ 셋 다 ①~④(문서 단계화 + 템플릿 + 2계층)는 동일. 차이는 **⑤에서 추적표를 얼마나 깊게 건드리나**.

---

## 10. 구현 단계(Phase)

| P | 범위 | 검증 |
|---|---|---|
| **P1** ✅ | vendoring(**빈 템플릿 3종만**, examples 제외) + 로더 | 로드 단위테스트(9) — 완료 |
| **P2** ✅ | SKILL.md 단계화(절차 A) + `identified.json` 2계층 스키마 + 검증 CLI | 스키마 테스트(8)·CLI 스모크 — 완료 (LLM ②③④ 채움 e2e 는 P3 배선 후) |
| **P3** | 서버 job 단계화 + 신규 엔드포인트 | 순차 spawn·게이트·409 테스트 |
| **P4** | RtmView stepper + 모달 + 미리보기/컨펌/편집 | 시각 QA(headless playwright) |
| **P5** | ⑤ rtm.json 통합(§9 선택안) + 회귀(targetStep=5 원샷 동등) | 기존 인테이크 결과 diff |
| **P6** | 변경관리(절차 B) 모드 + CR/영향분석서 | 철회 시나리오(REQ 단위) |

각 Phase 끝 사용자 컨펌 후 다음(메모리 stop-per-phase 관례).

---

## 11. 미해결 / 결정 필요

1. **④ 명세서 컨펌 입도**: 요구 N건이면 N파일. **결정 = 묶음 컨펌(④ 전체 한 번) + 파일별 편집만.** ✅
2. **rtm.json 통합 깊이**: **결정 = 옵션 B(단계적 브릿지).** ✅ (§9)
3. **산출 문서 영구화**: ⑤ 컨펌 후 `rtm-intake/<sid>/*.md`를 `doc-output/` 또는 `requirements/`로 승격할지. 후속.
4. **세션 정리 정책**: 완료/폐기 세션 보존기간·정리. 후속.

---

## 12. 비범위(Non-goals)

- 코드 자동수정(인테이크는 제안만, 확정은 사람) — 불변.
- 생성 모드(코드→AS-IS rtm.json) 변경 — 불변.
- 추적표 셀/검증 편집 경로(rtm-overrides) 변경 — 불변.
