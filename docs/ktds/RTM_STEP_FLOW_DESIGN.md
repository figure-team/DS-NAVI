# RTM 단계화(Step Flow) 설계서

> 추적표(RTM) 인테이크를 **6단계**(가이드 5단계 + ②영향분석)로 세분화하고, 단계 컨펌 게이트 +
> "N까지 한번에" 실행을 도입한다.
> 신규(절차 A)뿐 아니라 **변경관리(절차 B: 철회/변경)** 도 포함한다.
>
> **근거 소스 (study/, 2026-06-25 업데이트 반영):**
> - `templates/AI_요구사항문서_생성_프롬프트.md` — **본 스킬의 행위 명세서**(역할·ID체계·절차 A/B·산출규칙)
> - `templates/요구사항_작성순서_가이드.md` — 5단계 흐름(①은 **고객 인터뷰**이고 "영향" 언급 0건 — §2 ② 신설 근거)
> - `templates/01~03_*.md` — 빈 템플릿(구조)
> - `examples/*.md` — 작성 정답지(채움 수준 기준)
> - 선행 설계: `RTM_TAB_DESIGN.md`(추적표), `DOC_GENERATION_DESIGN.md`(템플릿 문서생성)

---

## 0. 배경 · 현재 동작

대시보드 "＋ 새 요청" → `POST /rtm-intake` → 서버가 `claude -p "/understand-rtm <요청> <directive>"` 1회 spawn.
directive가 "§1~§6 끝까지 완주하라"라 → 분해·매칭·`rtm-requirements.json` 기록·`rtm.json` 재생성까지 **한 방에**.
중간 산출물(목록표/정의서/명세서)이 없고, 사용자 개입 지점도 없다.

**바꾸려는 것**
- 6단계(①식별 → ②영향분석 → ③목록표 → ④정의서 → ⑤명세서 → ⑥RTM)로 쪼개 **단계마다 멈추고 사용자가 컨펌**.
  (2026-07-16 승격 — 종전 ① 안의 코드영향 검증을 독립 단계 ②로. §2 · `RTM_IMPACT_GATE_DESIGN.md` §6.5)
- 사용자가 **목표 단계 N**을 고르면 1..N을 한 번에 진행하고 N에서 멈춘다.
- ③④⑤는 **vendoring된 템플릿만 보고** 마크다운 문서를 생성한다(examples 정답지는 참조하지 않는다).
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

## 2. 단계 모델 — **6단계**(2026-07-16 승격)

| # | 단계 | 산출물 | 형식 | 템플릿 | 비고 |
|---|---|---|---|---|---|
| ① | 수집·식별 | `identified.json` + `[확인필요]` 질문 | 구조화(내부) | — | 요청→요구사항 분해, ID 부여, 6축 근거, `validate`(실재 대조) + **답변 루프**(↓) |
| ② | **영향분석** | `impact-run.json` (+ impact 원장 기록) | 구조화(내부) | — | `code-impact` — `changeset.modified` → 시드 결정론 조인 → 도달성 |
| ③ | 목록표 | `요구사항목록표.md` | 마크다운 | `01_*` | 요청목록 표 + 요구사항목록 표(그룹핑) |
| ④ | 정의서 | `요구사항정의서.md` | 마크다운 | `02_*` | 요청섹션 > 요구사항(정의/범위/출처) |
| ⑤ | 명세서 | `요구사항명세서_{요구사항ID}.md` ×N | 마크다운 | `03_*` | **요구사항 1건당 1파일** |
| ⑥ | RTM | `rtm-requirements.json` 병합 + `rtm.json` 재생성 | 구조화(정식) | — | 추적표 반영(§9) |

> **②는 왜 신설됐나(2026-07-16 사용자 결정)** — 종전 ①이 분해와 **코드영향 엔진 실행**을 함께 품고
> 있었다. 근거 셋:
> 1. **게이트 원칙 위반** — 아래 문단이 규정하는 "깊은 작업 전에 얕은 범위 먼저 확정"인데 ①이
>    파이프라인에서 **가장 깊은 작업**(impact BFS)을 품고 있었다.
> 2. **외부 가이드 밖** — `요구사항_작성순서_가이드.md` 의 ①은 *"고객 인터뷰로 모호함 제거"*
>    (담당 PM/PL)이고 **가이드 전체에 "영향"·"impact" 언급 0건**이다. 코드영향은 가이드에 없는
>    신규 개념이라 ① 안에 있을 근거가 없었다.
> 3. **계약 분리** — ①은 근거 번들, ②는 코드영향. 각 단계가 자기 입력만 받는다.
>
> `validate`(실재 대조)는 **①에 남는다** — ①이 생산한 것의 **자기 검증**이지 새 지식이 아니고,
> 동시에 ②의 입구 전제다(`modified` fnId 실존 → 시드 조인 성립).
> 상세·경위: `RTM_IMPACT_GATE_DESIGN.md` §6.5(초판 반려의 철회 기록).

**핵심 데이터 흐름** — `identified.json`(2계층 누적 중간산출)이 단계마다 풍부해지는 단일 진실원본:

```
NL 요청 ─①식별→ identified.json {request, requirements[](구분/우선순위/AC골격/changeset/6축근거), questions[]}
              │        └ validate: changeset fnId ⊂ rtm.json · 테이블 ⊂ db-schema (fail-closed)
              │        ↑
              │        └─ ①답변 루프 ─ 사람이 [확인필요]에 답 → qa-history.json(원장) →
              │             --step 1 --revise 가 답을 반영해 재분해 (컨펌 전까지 반복, 종료는 사람)
              │
              ├─②영향분석→ impact-run.json  (changeset.modified → 시드 → 도달성. 원장에도 기록)
              │
              ├─③목록표→  요구사항목록표.md   (요청목록 + 요구사항목록, 얕게)
              ├─④정의서→  요구사항정의서.md   (요청섹션>요구사항: 정의/범위/출처)  ← identified.json 보강
              ├─⑤명세서→  요구사항명세서_{ID}.md ×N (상세기능/입출력/처리흐름/예외/인수기준)  ← 보강
              └─⑥RTM→    rtm-requirements.json 투영 → understand-rtm.mjs 재생성 → rtm.json
```

가이드의 "얕게(③)→분류(④)→깊게(⑤)"가 단계마다 LLM이 detail을 더하는 것과 일치. 깊은 작업(⑤ N파일) 전에
얕은 범위(③④)를 사용자가 먼저 확정하므로 단계 게이트의 가치가 분명하다.
**②가 ③ 앞에 놓이는 것도 같은 원칙**이다 — 문서 3종을 쓰기 전에 "이 요청이 코드 어디를 건드리나"를
사용자가 확정한다.

> **TO-BE grounding**: 신규 요구는 코드가 없어 전부 `[추정]`(INFERRED), `[확정]` 불가(기존 SKILL §5 규약).
>
> **①답변 루프(2026-07-16 구현 — `RTM_INTAKE_ANSWER_DESIGN.md`)**: 종전엔 이 자리에
> *"`[확인필요]`는 사용자가 컨펌 게이트에서 답하게 한다"* 고 적혀 있었으나 **답할 자리가 없었다**
> (표시만 하는 읽기 전용 렌더). 이제 실제로 답는다:
> - 사람이 화면에서 답 → `qa-history.json`(append-only 원장, **답의 진실원본**) →
>   `--step 1 --revise` 가 답을 반영해 **재분해**(답변은 기록이 아니라 재실행 트리거).
> - **①이 최전선·미컨펌일 때만** 답변 가능(`checkAnswerGate`). 컨펌하면 잠긴다.
> - **미답변이 컨펌을 막지 않는다** — 남은 질문·의존 결론은 `[추정]`으로 남고 **종료는 사람**이
>   판단한다(축소 모드·커밋 불일치가 택한 "차단 아닌 경고"와 같은 결). ①이 무거워지지 않는 이유다.
> - 화면은 **질문을 분해보다 위**에 둔다 — 분해가 위에 있으면 이미 정해진 것처럼 읽힌다.
>   분해는 "근거로 본 초안"이고 답 전까지 `[추정]`이다(D3).

---

## 3. 스킬 = AI 프롬프트의 자동화 (`/understand-rtm`)

`AI_요구사항문서_생성_프롬프트.md`는 **사람이 복붙으로 실행하는 워크플로**다. 이를 대시보드 단계 실행으로
자동화한다. 그 프롬프트의 역할/참조자료/ID체계/절차/산출규칙을 SKILL.md로 옮긴다.

### 3.1 vendoring (P1)

③④⑤가 보고 채울 **빈 템플릿 3종만** 플러그인에 동봉한다. **examples(정답지)는 vendoring하지 않는다** —
③④⑤는 템플릿 구조만 보고 생성한다(예시 문체 과적합 회피, 범위 경량화).
※ `01~03` ↔ **③④⑤** 대응(6단계 승격 전엔 ②③④였다).

```
ktds-legacy-plugin/templates/requirements/
  01_요구사항목록표.md  02_요구사항정의서.md  03_요구사항명세서.md   # 빈 템플릿(구조)만 → ③④⑤
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

- **`--step 1` 식별** — **근거 번들**(`intake-input.json`, 6축 유계 요약 + pre-cite)을 읽고 NL을 요청(REQ)으로
  등록해 **요구사항(SFR/SIR/DAR/SER…)으로 분해**(구분/우선순위 판정, 파생관계, AC 골격, changeset 매칭,
  supersede 감지, 화면·정책 귀속). 인용은 생산 금지 — 번들의 pre-cite 를 verbatim 복사.
  모호점은 `[확인필요]` 질문 목록으로. 결과 → `identified.json` → `validate`(실재 대조 fail-closed).
  **rtm-requirements.json·rtm.json 미변경.**
- **`--step 2` 영향분석** — `code-impact`: `identified.json` 의 `changeset.modified`(flow) → `rtm.json`
  진입점 근거로 **결정론 조인**해 시드 파일을 뽑고 영향도 엔진 실행. **LLM은 시드를 고르지 않는다.**
  결과 → `impact-run.json`(포인터) + impact 원장 기록(query = 요청 원문). 루트 슬롯
  (`.spec/map/impact.json`)·문서 09·구조 오버레이 **무오염**. modified 가 없거나 전부 `to-be:` 면
  **시드 없음으로 정상 종료**(실패 아님). **rtm.json 미변경.**
- **`--step 3` 목록표** — `identified.json` + 템플릿01 → **요청목록(§2)** + **요구사항목록(§4, 요청ID 그룹핑)** 채워
  `요구사항목록표.md`. 기존 파일 있으면 행 **추가**(보존).
- **`--step 4` 정의서** — `identified.json`에 정의/범위/출처 보강 → 템플릿02 → **요청섹션 > 요구사항** 구조로
  `요구사항정의서.md`.
- **`--step 5` 명세서** — 요구사항별 상세기능/입출력/처리흐름/예외/인수기준/검증방법 보강 →
  **요구사항 1건당** 템플릿03으로 `요구사항명세서_{요구사항ID}.md` (소속 요청ID 포함). N개 생성.
- **`--step 6` RTM** — `identified.json`(완전본)을 정식 `rtm-requirements.json`으로 투영 → append 병합 →
  `node understand-rtm.mjs` 재생성 → `rtm.json`(§9 통합 정책에 따라).

각 단계 끝에 `session.json` step을 `produced` + summary 갱신. 빈 칸 금지·출처 비우지 않기·ID 철자 동일(산출규칙).

> **③④⑤를 엔진 아닌 LLM이 채우는 이유**: 신규 요구(TO-BE)는 코드 근거가 없어(`[]`) 결정론 빌더의 이점(file:line)이
> 없다. **템플릿(구조)만** 주면 LLM이 일관 형식으로 채운다(examples 미참조). (엔진 빌더 추가는 후속.)

---

## 4. 산출물 · 세션 모델

> **정정(W1, 2026-07-16)**: 아래 트리는 최초 설계 당시 "활성 세션 1개"를 전제로 `session.json`을
> `rtm-intake/` 직하 단일 파일로 그렸으나, **실제 구현은 `rtm-intake/<sid>/session.json`** —
> 세션 디렉터리마다 1개다(`understand-anything-plugin/packages/dashboard/server/rtm-sessions.ts`).
> W1이 이 위에 **복수 세션 원장**(목록·reconcile·상한)을 얹었다 — "세션은 하나"의 근거로 이 트리를
> 오독하지 말 것. 자세한 원장 모델은 `RTM_INTAKE_WORKSPACE_DESIGN.md` §1.1·§5(W1) 참조.

```
.understand-anything/
  rtm-intake/
    <sid>/
      session.json                 # 세션별 진행상태(§4.2) — 세션마다 1개, base 직하 단일 파일 아님
      intake-input.json           # ① 근거 번들(6축 유계 요약 + pre-cite)
      identified.json             # ① 2계층 누적 중간산출
      impact-run.json             # ② 코드영향 포인터(jobId → impact-history 스냅샷)
      요구사항목록표.md            # ③
      요구사항정의서.md            # ④
      요구사항명세서_SFR-010.md … # ⑤ (요구사항 건수만큼)
  rtm-changes/<CR>/               # 절차 B 산출(§8)
    과업내용변경요청서_CR-001.md
    변경영향분석서_CR-001.md
  rtm-requirements.json           # ⑥/B에서 append 병합(기존)
  rtm.json                        # ⑥/B에서 재생성(기존)
```

### 4.1 `identified.json` (2계층)

```jsonc
{
  "request": { "id": "REQ-003", "name": "네이버 로그인 추가", "raw": "<NL 원문>",
               "source": "고객 메일", "requestedAt": null },
  "requirements": [
    { "id": "SFR-020", "category": "SFR", "name": "네이버 소셜 로그인", "priority": "중",
      "status": "유효", "derivedFrom": null,
      "definition": "...", "scope": "...", "origin": "...",           // ④에서 보강
      "spec": { "details": [], "inputs": "", "outputs": "", "flow": "",
                "preconds": [], "exceptions": [], "acceptance": [], "verify": "" }, // ⑤에서 보강
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
  "schemaVersion": 2,                       // 2 = 6단계. 없으면 구 5단계(§4.3)
  "sid": "a1b2c3d4", "mode": "intake", "request": "네이버 로그인 추가",
  "producedStep": 4, "confirmedStep": 3, "targetStep": 4,
  "steps": {
    "1": { "status": "confirmed", "summary": "REQ-003 → SFR-020/SIR-005 분해", "questions": 1 },
    "2": { "status": "confirmed", "summary": "영향: order 도메인 4흐름·매퍼 3" },
    "3": { "status": "confirmed", "summary": "목록표 2행 추가" },
    "4": { "status": "produced",  "summary": "정의서 REQ-003 섹션" },
    "5": { "status": "pending" }, "6": { "status": "pending" }
  }
}
```

**불변식**: `confirmedStep ≤ producedStep`. status: `pending→running→produced→confirmed`.
단계 k 재생성 시 k 이상 `produced/confirmed` 무효화(§6 롤백). 세션은 한 번에 하나(409).

### 4.3 하위호환 — 구 5단계 세션 마이그레이션 (2026-07-16)

구 세션엔 `schemaVersion` 이 **없다**. 이 필드의 부재가 곧 "구 5단계"의 식별자다.

**★ `schemaVersion` 이 필요한 결정적 이유는 멱등성이다.** 구 단계 번호는 신 체계로 옮길 때
재사상(k≥2 → k+1)되는데, 버전 표식이 없으면 **읽을 때마다 또 +1 되어 `producedStep` 이 무한히
커진다.** "legacy 로 두고 표시만 한다"를 골랐어도 이 필드는 필요했다.

| 구 | 신 | 근거 |
|---|---|---|
| ①(식별+코드영향) | ①식별 | 분해·근거·`validate` 는 그대로 ① |
| ① + `impact-run.json` **존재** | **②까지 produced** | 구 ①의 9번 지시가 `code-impact` 를 돌렸다. 포인터가 디스크에 실재하므로 "②를 했다"는 **관측 사실**이지 추정이 아니다 |
| ②③④⑤ | ③④⑤⑥ | k+1 — 라벨이 그대로 따라간다(목록표→목록표, RTM→RTM) |

**왜 재사상인가 — "legacy 로 두고 UI 에서 표시"가 아니다.** 두 체계는 같은 정수에 다른 뜻을 담는다
(**구 ⑤=RTM · 신 ⑤=명세서**). legacy 로 두면 스테퍼·배지·`STEP_DOC_KIND` 가 행마다 두 체계를 갈라
렌더해야 하고 **원장의 "⑤" 배지가 세션마다 다른 뜻**이 된다 — 그게 더 조용히 오해시킨다.
재사상은 반대로 **의미 보존적**이다: 구 세션이 실제로 한 일을 신 번호로 정확히 옮길 뿐이다.

**`confirmedStep` 은 승격하지 않는다**(구 1 → 신 1). 구 ① 컨펌 때 영향분석을 같이 봤을 개연성은
있으나 신 체계에서 ②는 독립 게이트다 — **안 누른 컨펌을 눌린 것으로 만드는 건 조용한 거짓**이다.
결과 `confirmed(1) < produced(2)` 라 서버 컨펌 게이트가 **②를 컨펌하라고 정직하게 막는다**.

**`impact-run.json` 이 없는 구 ① 세션은 ①에 그대로 둔다.** 시드가 전부 `to-be:` 라 포인터를 안 쓴
것(=실질 ② 완료)일 수도 있으나 파일만으로는 미실행과 구별되지 않는다 — **거짓 완료를 만드느니
미산출로 두고 ②를 돌리게 한다**(그러면 `code-impact` 가 시드 없음으로 정상 종료하며 produced 된다).

**구현**: `server/rtm-sessions.ts` `migrateRtmSession()`, `readRtmSession()` 에서 lazy 적용.
**읽기는 디스크를 건드리지 않는다(순수 변환)** — write-back 하면 `session.json` 의 mtime 이 갱신돼
`reconcileRtmSessions`(고착 `running` 복원, C3)가 그 mtime 을 "마지막 상태 전이 시각"으로 읽으므로
**조회할 때마다 유예가 리셋돼 영영 복원되지 않는다.** 영속은 정상 쓰기 경로가 알아서 한다
(반환 객체가 이미 v2 라 다음 `writeRtmSession` 이 굳힌다).

**실측(2026-07-16)**: jpetstore 사용자 세션 2건(`9d1d3861…` 구글 로그인, `e9995fdd…` 카드 결제) —
둘 다 구 `producedStep=1` + `impact-run.json` 존재 → 신 `producedStep=2`, `confirmedStep=0`,
`steps{1..6}`. 대시보드에서 스테퍼 6칸·②에 영향분석 렌더 확인.

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

**진행 로직(`POST /rtm-intake`)**: `start = producedStep+1`, `target = clamp(targetStep, start, 6)`;
`for k in start..target: spawn(claude --step k); producedStep = k`. 한 POST가 start..target 연속 spawn 후 멈춤.
- 기본(1단계씩): 프론트가 `targetStep = produced+1`.
- N까지 한번에: `targetStep = N`.
- **게이트**: 미컨펌 산출(`produced > confirmed`)을 건너뛰고 더 진행 요청 시 거부 → 컨펌해야 다음 실행.
  (단 같은 호출의 자동진행 구간은 1회 검토 약속이므로 면제.)
- **현행 호환**: 프론트 기본 `targetStep=6` = 오늘의 원샷과 동등(단 이제 중간 산출물이 남고 진행이 보임).

라우트 화이트리스트(vite.config.ts:965~)에 신규 경로 추가. `/doc-content.json`·`/doc` 패턴 차용.

---

## 6. 컨펌 · 편집 · 롤백 규칙

| 액션 | 위치 | 효과 |
|---|---|---|
| **컨펌** | 산출 단계 k | `confirmedStep = k`. k+1 실행 게이트 해제. ①은 `[확인필요]` 답변 입력 후 컨펌 권장. ②는 엔진 출력(영향 범위) 검토 후 |
| **편집** | ③④⑤ 문서(.md) | `/rtm-intake-doc` POST 저장. ⑤는 해당 요구사항ID 파일만 |
| **다시 생성** | 단계 k | k 이상 무효화 → k부터 재spawn (예: ③ 수정 → ④⑤⑥ 폐기) |
| **폐기** | 세션 | 활성 닫음. ⑥ 전이면 rtm.json/rtm-requirements.json 무변경 |

**되돌림 안전성**: ⑥ 이전 단계는 `rtm-intake/<sid>/` 안에서만 논다 → 정식 추적표(rtm.json) 무영향.
**⑥만이 rtm-requirements.json·rtm.json을 건드린다.** ①~⑤ 재생성/폐기해도 추적표는 안전.
②도 예외가 아니다 — 루트 impact 슬롯을 안 쓰고 요청별 저장 + 원장 append 만 한다.

---

## 7. UI 설계 (`RtmView.tsx`)

> **정정(W6, 2026-07-16)**: 본 §7은 `RTM_INTAKE_WORKSPACE_DESIGN.md`가 대체했다.
> **7.1 모달 목업은 유효**(단발 실행 파라미터 입력이라 존치 — `RTM_INTAKE_WORKSPACE_DESIGN.md` §2.2)하지만,
> **7.2 "헤더 아래 stepper + 드로어" 구조는 폐기**됐다 — 추적표 "요청 세션" 탭의 좌 270px 세션 원장 +
> 우 스테퍼·산출물 레이아웃으로 재설계(W1~W4 랜딩). 자세한 배경·레이아웃은
> `RTM_INTAKE_WORKSPACE_DESIGN.md` §0·§2 참조.

### 7.1 새 요청 모달 — 목표 단계 선택

```
┌ 새 요구사항 요청 ─────────────────────────────┐
│ [ 자연어 요청 textarea ............... ]      │
│ 어디까지: ①식별 ②영향분석 ③목록표 ④정의서 ⑤명세서 ⑥RTM │ ← 칩, 기본 ⑥
│                              [취소] [실행 ▸]   │
└───────────────────────────────────────────────┘
```

### 7.2 단계 진행 패널 — **폐기(W6, 2026-07-16)**

> `RTM_INTAKE_WORKSPACE_DESIGN.md` §2.2 로 대체됨(요청 세션 탭의 좌 원장/우 콘텐츠). 아래는
> 폐기된 원안(참고용 보존).

헤더 아래 stepper(①~⑥, 상태색) + 현재 산출 미리보기 드로어:

```
[①식별 ✓]─[②영향분석 ✓]─[③목록표 ✓]─[④정의서 ●검토]─[⑤명세서 ○]─[⑥RTM ○]

┌ ④ 요구사항정의서 (미리보기, react-markdown) ──┐
│ ## REQ-003 네이버 로그인 추가 …               │
│ [편집] [다시 생성]   [✓ 컨펌] [다음 ▸] [⑥까지 ▸]
└───────────────────────────────────────────────┘
```

- ① 패널: 요청→요구사항 분해 트리 + 6축 근거 + `[확인필요]` 질문 목록(답변 입력칸).
- ② 패널: 코드영향(시드·상류 API/흐름/도메인·하류 파일/매퍼) + 정직한 생략(제외·미근거·미상).
- ⑤ 패널: 요구사항ID 탭(SFR-020 / SIR-005 …) — 파일별 미리보기·편집, **컨펌은 ⑤ 전체 묶음**(§ 미해결 1).
- 미리보기: `GET /rtm-intake-doc` → 기존 doc 뷰어 재사용. 폴링이 `session.json` 동반 → stepper 갱신.
- ⑥ 완료 시: `loadModel()` + `setView("requirement")` + 토스트(현행 그대로).

---

## 8. 변경관리(절차 B) — 철회/변경 모드

> 출처: 프롬프트 절차 B, `과업내용변경요청서_CR-001.md`, `변경영향분석서_CR-001.md`.

신규 6단계와 **별개 트리거**. 추적표에서 기존 **요청(REQ) 선택 → "변경요청"** → :

1. **삭제 금지** — 요구사항 행·문서·명세서 파일 보존.
2. **폐기 표시** — 목록표 상태 `폐기(CR-xxx)`, 정의서·명세서에 폐기 배너 + `상태: 폐기` + 사유(취소선).
3. **변경관리 문서 생성** — `과업내용변경요청서_CR-xxx.md`, `변경영향분석서_CR-xxx.md` (템플릿/examples 기준).
4. **영향 분석** — RTM 역추적으로 연관 설계/코드/DB/시험 영향 + 후속조치(데이터 파기·회귀시험) 식별.
   (기존 `/understand-impact` 역추적 자산 재사용 가능.)
5. **개정 이력** — 영향 문서 모두 새 버전 행.

철회는 **요청 단위**(REQ-001 폐기 → 하위 SFR-010/SIR-002/DAR-003/SER-004 동반 폐기). rtm.json에는
요구사항 `status=폐기`(supersede/withdraw)로 반영. **별도 Phase(P6)로 분리** — 신규 단계(P1~P5) 후 착수.

---

## 9. rtm.json 통합 — **결정: 옵션 B (단계적 브릿지)** ✅

새 **요구사항(SFR…) 계층**을 정식 추적표에 어떻게 반영할지가 ⑥의 형태와 스키마 파급을 가른다.
**채택: 옵션 B.** ①~⑤는 2계층 문서를 완전히 생성하고, ⑥은 현재 rtm.json 스키마를 유지하며 요구사항을 투영한다
(REQ는 `requirementHistory`/그룹 태그로 느슨히 연결). 추적표 2계층 1급화는 후속(P5 이후).

**옵션 A — 완전 통합(2계층 1급 모델)**
`rtm.json`에 `requests[]`(REQ) + `requirements[]`를 요구사항(SFR…) 1급 엔티티로 확장(구분/우선순위/상태/
정의/derivedFrom + 기능 매핑). 가이드·문서와 추적표가 완전히 일치. → `build-rtm`·`apply-requirements`·
`coverage`·`types`·`RtmView` 전반 개편. 비용 큼.

**옵션 B — 단계적 브릿지(권장 시작점)**
①~⑤는 **2계층 문서를 완전히** 생성(가이드 충실, 핵심 가치 확보). ⑥은 **현재 rtm.json 스키마 유지** —
요구사항(SFR…)을 현 모델의 요구사항 엔티티(또는 기능 스텁+AC)로 **투영**하고, 요청(REQ)은
`requirementHistory`/그룹 태그로 느슨히 연결. 추적표 UI는 당분간 현행 표시. 2계층 1급화는 후속.

**옵션 C — 문서 우선, 추적표 분리**
①~⑤ 문서 생성까지만 1차 범위. ⑥(rtm.json 반영)는 다음 마일스톤. 가장 빠르게 "문서 단계화 + 템플릿"
가치를 검증하고, 추적표 통합은 별도로.

→ 셋 다 ①~⑤(문서 단계화 + 템플릿 + 2계층)는 동일. 차이는 **⑥에서 추적표를 얼마나 깊게 건드리나**.

---

## 10. 구현 단계(Phase)

| P | 범위 | 검증 |
|---|---|---|
| **P1** ✅ | vendoring(**빈 템플릿 3종만**, examples 제외) + 로더 | 로드 단위테스트(9) — 완료 |
| **P2** ✅ | SKILL.md 단계화(절차 A) + `identified.json` 2계층 스키마 + 검증 CLI | 스키마 테스트(8)·CLI 스모크 — 완료 (LLM ②③④ 채움 e2e 는 P3 배선 후) |
| **P3** ✅ | 서버 job 단계화(targetStep 순차 spawn) + confirm/discard/doc 엔드포인트 + 세션 영속 | 통합테스트 12/12(게이트·doc·traversal·토큰) — 완료. 실 claude ①~④ e2e 는 P4 와 함께 |
| **P4** ✅ | RtmView stepper + 모달 목표단계선택 + 미리보기(md)/컨펌/편집/진행 | tsc -b·빌드 통과, 추가분 lint-clean — 완료. 실 claude ①~④ 시각 e2e 는 데모로 후속 |
| **P5** ✅ | ⑥ 투영(옵션 B): project-intake 코어 + `rtm-intake.mjs project` 병합 + SKILL 배선 | 코어 테스트(5)·jpetstore 실투영(요구4·기능3, 기존보존 9/9, dependsOn·source.section) — 완료 |
| **P6** | 변경관리(절차 B) 모드 + CR/영향분석서 | 철회 시나리오(REQ 단위) |

각 Phase 끝 사용자 컨펌 후 다음(메모리 stop-per-phase 관례).

---

## 11. 미해결 / 결정 필요

1. **⑤ 명세서 컨펌 입도**: 요구 N건이면 N파일. **결정 = 묶음 컨펌(⑤ 전체 한 번) + 파일별 편집만.** ✅
2. **rtm.json 통합 깊이**: **결정 = 옵션 B(단계적 브릿지).** ✅ (§9)
3. **산출 문서 영구화**: ⑥ 컨펌 후 `rtm-intake/<sid>/*.md`를 `doc-output/` 또는 `requirements/`로 승격할지. 후속.
4. **세션 정리 정책**: 완료/폐기 세션 보존기간·정리. 후속.

---

## 12. 비범위(Non-goals)

- 코드 자동수정(인테이크는 제안만, 확정은 사람) — 불변.
- 생성 모드(코드→AS-IS rtm.json) 변경 — 불변.
- 추적표 셀/검증 편집 경로(rtm-overrides) 변경 — 불변.
