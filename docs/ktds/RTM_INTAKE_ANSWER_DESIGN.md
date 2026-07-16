# RTM 인테이크 — `[확인필요]` 질문 답변 경로 (설계, 승인 전)

**상태**: 제안 · 착수 전 사용자 결정 반영본
**관련 설계**: [RTM_STEP_FLOW_DESIGN.md](RTM_STEP_FLOW_DESIGN.md)(6단계) · [RTM_IMPACT_GATE_DESIGN.md](RTM_IMPACT_GATE_DESIGN.md)(근거 게이트) · [RTM_INTAKE_WORKSPACE_DESIGN.md](RTM_INTAKE_WORKSPACE_DESIGN.md)(세션 원장)
**메모리**: `rtm-intake-questions-gap`(이 과제의 실측 근거)

---

## 0. 배경 — ①의 산출이 반쪽이다

①식별은 요청의 **모호함을 제거**하는 단계다. 외부 SI 가이드(`요구사항_작성순서_가이드.md` ① 절)가
①을 "고객의 한 마디를 받아 먼저 모호함을 제거한다 — **AI가 대체하기 어려운 PM/PL 영역**"으로 규정하고,
그 예시 질문("기존 자체 로그인과 병행인가 대체인가 / 수집 동의 항목은 / 계정 연동은")을 든다.

지금 ①은 그 질문을 **만들지만 받지 못한다.** 근거 번들(P3~P5) 덕에 질문 품질은 좋아졌다 — 실제 산출:

> "SIGNON.PASSWORD는 NOT NULL varchar(25) 평문인데 구글 로그인 사용자는 비밀번호가 없다"
> "구글 계정 식별자(sub)를 저장할 자리가 현재 스키마에 없다 — ACCOUNT(PK userid)와 SIGNON…"

스키마를 실제로 보고 묻는, 정확히 가이드가 말한 종류의 질문이다. 그런데:

- **스키마**: `intake-types.ts:221` `questions: z.array(z.string())` — 평문 문자열. 답변 필드 없음, 귀속 없음.
- **서버**: 답변 수신 엔드포인트 **0건**(`vite.config.ts` grep).
- **UI**: `IntakePanel.tsx:406-411` `IdentifiedView` — "[확인필요] — 다음 단계 전에 검토하세요" **읽기 전용 렌더**.

코드가 의도만 남기고 안 지은 흔적도 있다 — `intake-types.ts:220` 주석: *"모호점 질문 목록(**사용자가
컨펌 게이트에서 답한다**)"*. 그 "답한다"가 없다.

---

## 1. 착수 전 결정 (2026-07-16 사용자)

| # | 결정 | 반영 |
|---|---|---|
| **D1** | **실행 모델 = 하이브리드.** `claude -p` 는 그대로(대화창 안 띄움). 답변 재검토는 `--resume`로 이어가되, Q&A는 `<sid>/qa-history.json`에도 기록해 근거 계보를 프로젝트 안에 남긴다 | §3·§4 |
| **D2** | **종료는 사람.** 사용자가 ①을 컨펌하면 끝. 미답변 질문이 남아도 **차단하지 않는다** — 그 질문·그에 의존하는 결론은 `[추정]`으로 남고, 컨펌은 사람의 판단 | §5 |
| **D3** | **분석 시점은 그대로(한 패스), 질문을 전면에.** ①은 지금처럼 근거 번들을 보고 분해+질문을 **한 번에** 낸다(엔진·시점 불변). 다만 화면이 `[확인필요]`를 **위로** 올리고, 분해는 "근거로 본 초안 — 위 질문에 답하면 확정"으로 프레이밍한다. 분해는 답 전까지 `[추정]`, 답하면 굳는다 | §2.2·§6 |

D2의 파생: **답변은 재실행 트리거다**(단순 기록이 아니다). "병행이다"라고 답하면 changeset·AC가
실제로 달라져야 한다 — LLM이 답을 반영해 ①을 개정한다. 그리고 답변 게이트는 컨펌의 **전제가 아니다**
(강제하면 ①이 다시 무거워진다 — 메모리 우려). 경고만 하고 통과시킨다.

---

## 2. 두 가지 정정·근거

### 2.1 "헤드리스라 대화형 질의 불가"는 과한 결론이었다

메모리(`rtm-intake-questions-gap`)가 *"실행이 `claude -p` 헤드리스라 대화형 질의가 구조적으로 불가"*
라 적었다. **틀렸다.** 불가한 건 *동기적 프롬프트 대기*(사람이 답할 때까지 spawn이 블록)지, 멀티턴이
아니다. CLI 실측:

```
--session-id <uuid>   Use a specific session ID for the conversation
-r, --resume [value]  Resume a conversation by session ID
```

즉 대화창을 띄우지 않고도 **비동기 멀티턴**이 된다: ① spawn 이 `--session-id <uuid>`로 세션을 열고
종료 → 사람이 화면에서 답 입력 → 서버가 `claude -p --resume <uuid> "<개정 지시>"`를 **새로 spawn**하면
LLM이 이전 맥락(번들을 읽은 대화 포함)을 그대로 가진 채 개정한다. 화면 입장에선 여전히 비동기 job이다.

**→ 메모리 `rtm-intake-questions-gap`의 "구조적으로 불가" 문장은 이 착수와 함께 정정한다.**

### 2.2 왜 "분석 먼저, 질문 전면"인가 (D3 근거)

가이드는 ①을 "**모호함을 먼저 제거**한다"로 규정한다 — 순서상 묻는 게 먼저다. 그런데 **이 도구의
질문이 날카로운 건 코드를 먼저 분석했기 때문**이다:

> "SIGNON.PASSWORD가 평문 varchar(25)인데 구글 사용자는 비밀번호가 없다 — 어떻게?"

이 질문은 스키마를 보고 요청을 코드에 얹어봐야 나온다. 분석을 건너뛰고 먼저 물으면 아무 PM이나 할
일반 질문("병행이냐 대체냐")밖에 못 낸다 — 도구를 쓸 이유가 사라진다. 반대로 **어떤 모호점은 분해를
해봐야 드러난다**(changeset을 쓰다 갈래길을 발견). 그래서 "묻고→분석"(선질문 분리)은 질문을 무디게
하고 분해 중 발견을 놓친다.

**해소**: 엔진은 지금처럼 한 패스로 분해+질문을 내되(시점 불변), **화면이 순서를 바로잡는다**.
질문을 위로 올리고 분해를 "근거로 본 초안"으로 프레이밍하면, 논리적 순서(모호함 해소가 확정을
가둔다)는 **분해가 답 전까지 `[추정]`이고 답하면 굳는** 것으로 지켜진다. 분석은 *질문을 답할 수 있게
하는 맥락*이지 완성품이 아니다 — 이 프레이밍이 사용자가 지적한 "이미 다 정한 것처럼 보인다"를 푼다.

---

## 3. 데이터 모델

### 3.1 `questions` 스키마 확장 (additive, 하위호환)

문자열 → 객체. **union으로 둘 다 받아** 기존 산출(P5 e2e가 만든 `questions: ["...", ...]`)을 깨지 않는다.
`CitationField`의 3상태 선례(§`intake-types.ts:105`)와 같은 정신 — 부재/구형을 위반으로 만들지 않는다.

```ts
export const IntakeQuestionSchema = z.object({
  id: z.string(),                                  // "Q-1" — 재실행 넘어 안정 키
  text: z.string(),
  targetReqId: z.string().nullable().default(null),// 걸린 요구사항(없으면 요청 전체)
  axis: z.enum(['screen','policy','domain','data','code','rtm','general'])
          .nullable().default(null),               // 어느 축의 모호함인지(선택)
  answer: z.string().nullable().default(null),     // null=미답 / 값=답함
  answeredAt: z.string().nullable().default(null),
})
// 문자열도 받는다(구형). 파싱 시 { id: `Q-${i+1}`, text, ... } 로 정규화.
export const QuestionsField = z.array(z.union([z.string(), IntakeQuestionSchema]))
```

정규화(문자열→객체)는 `parseIdentifiedIntake` 안에서 한다 — 다음 write가 객체형으로 굳힌다
(schemaVersion 마이그레이션과 동형). `id`는 LLM이 부여하고, 구형 문자열은 인덱스로 합성한다.

### 3.2 `qa-history.json` — 답변 감사 원장 (신규 파일)

세션 디렉터리 `<sid>/qa-history.json`. **append-only.** D1의 "우리 파일에 기록"이 이것 —
`--resume` 대화가 `~/.claude`에 살아 프로젝트 밖으로 새는 것을 보완해 계보를 프로젝트 안에 남긴다.

```jsonc
{ "revisions": [
  { "rev": 1, "answeredAt": "2026-07-…",
    "qas": [ { "qid": "Q-1", "question": "…평문 password…", "answer": "병행 로그인, 소셜 사용자는 password null 허용" } ] }
] }
```

한 번의 답변 제출(여러 질문 일괄) = revision 1건. 인터뷰가 여러 턴이면 revisions가 쌓인다.
**이게 영속 진실원본**이고, identified.json의 `questions[].answer`는 LLM이 유지하는 현재 상태다.

### 3.3 `session.json` 확장 (additive)

```ts
identifyClaudeSession?: string  // 가장 최근 ① 대화의 claude --session-id UUID. 없으면 fresh 폴백.
```

**① spawn 마다 새로 발급**한다(`issueIdentifyClaudeSession`, spawn 직전에 세션에 굳힘). 세션 생성 시
1회 발급은 **안 된다** — 재사용을 claude 가 거절하므로(`Session ID … is already in use.`, §8 실측)
① 이 한 번 실패한 세션은 재시도마다 같은 uuid 로 돌아 영구히 막힌다. 매번 새로 내는 게 의미상으로도
맞다: ①을 다시 돌리면 이전 대화는 낡았고 개정이 이어야 할 맥락은 **가장 최근 ①** 이다.
없는 구세션은 `--resume` 대신 fresh `-p`로 폴백(§4.3).

---

## 4. 실행 흐름

### 4.1 엔드포인트 — `POST /rtm-intake-answer`

```
body: { sid, answers: [ { qid, question, answer } ] }
```

서버(결정론) 책임 — **의미 반영은 안 한다**(그건 LLM):

1. 게이트 검사(§5). 실패면 4xx.
2. `qa-history.json`에 revision append(신규 파일이면 생성).
3. ① 개정 재실행 spawn(§4.2) → 202 + job + session. 폴링이 개정된 identified.json을 집어온다.

**서버가 identified.json을 직접 패치하지 않는 이유**: 대시보드 서버(dashboard 패키지)는 legacy-core의
`intake-types`를 import하지 않는다 — 스키마 지식을 이쪽에 복제하면 두 곳이 갈라진다. 자유텍스트 답을
changeset·AC에 **의미 반영**하는 건 애초에 결정론이 아니다(평문 답 → 구조 변경은 판단이다). 그래서
**서버=IO+spawn, LLM=의미 개정**의 기존 경계를 지킨다(§`RTM_IMPACT_GATE_DESIGN` C8 "게이트는 코드로"의
짝 — *반영*은 코드가 아니라 사람/LLM 몫임을 인정). 답변의 **불변 원본**은 qa-history.json이 보장한다.

### 4.2 ① 개정 재실행 — `--step 1 --revise`

`runRtmSteps`와 같은 단일 spawn이되 개정 전용 계약:

```
claude -p --resume <identifyClaudeSession> \
  "/understand-rtm --intake --session <sid> --step 1 --revise <개정 디렉티브>"
```

개정 디렉티브(요지):
> `<sid>/qa-history.json` 최신 revision의 답을 반영해 `identified.json`을 개정하라. 답이 해소한
> 모호함을 requirements·changeset·AC·근거축에 반영하고, 각 `questions[].answer`에 답을 기록
> (`answeredAt` 포함). **답이 채워진 질문(answer≠null)은 절대 지우지 마라**(재실행이 답을 날리는 결함
> 방지 — 메모리 우려). 답이 새 모호함을 낳으면 새 `[확인필요]` 질문을 추가하라. `intake-input` 번들은
> 그대로 근거다(재생성 불필요, 있으면 읽어라). `validate` 재실행. 신규는 여전히 전부 `[추정]`.

`producedStep`은 1로 유지(재산출), `confirmedStep`은 여전히 0. 폴링이 done을 잡으면 개정본 표시.

### 4.3 하이브리드의 fresh 폴백 (D1 함정 대비)

`--resume`는 `~/.claude` 세션이 사라지면 실패한다. **개정 디렉티브를 자기완결형으로 설계**해
(qa-history + 기존 identified.json + intake-input 번들을 디스크에서 읽음) 폴백이 무료가 되게 한다:

| 상황 | spawn | 개정 근거 |
|---|---|---|
| `identifyClaudeSession` 있음 | `--resume <uuid>` | 대화 맥락(토큰 쌈) + 디스크 파일 |
| 없음(구세션·유실) | fresh `-p` | 디스크 파일만 — 같은 결과, 토큰만 더 씀 |

즉 **디렉티브는 한 벌**이고 spawn args만 갈린다. 라이브 e2e에서 resume가 불안정하면 fresh로만 가도
디렉티브 변경 0(§8 미해결에 재검).

---

## 5. 게이트 — 언제 답변을 허용/차단하는가 (D2)

답변은 **① 컨펌 루프 안**에서만. 컨펌 게이트(`producedStep>confirmedStep`이면 진행 불가)가 이미
"②로 가려면 ①을 컨펌하라"를 강제하므로:

- **허용 조건**: `producedStep === 1 && confirmedStep === 0 && !running`. (①이 최전선이고 미컨펌)
- **컨펌 후**(`confirmedStep >= 1`): 답변 잠금 — 이미 다음 단계로 넘어갔다. 되돌리려면 별도 롤백
  (본 설계 범위 밖, §7).
- **미답변이 컨펌을 막지 않는다**: 질문이 남아도 사용자는 컨펌 가능. 남은 질문·그에 의존하는 결론은
  화면에서 `[추정]`으로 표시(SKILL이 이미 omittedAxes를 questions로 올리는 것과 같은 취급). 종료는 사람.

이는 축소 모드(§10-1)·커밋 불일치(§10-2)가 이미 택한 "**차단 아닌 경고**"와 일관된다.

---

## 6. UI (`IntakePanel.tsx` `IdentifiedView`) — 질문 전면 (D3)

**순서를 뒤집는다.** 현재는 [분해 요약]→[ReqCard 목록]→[하단 `[확인필요]`]다. D3대로 질문을 위로:

```
① 식별 — REQ-00N "구글 로그인 추가"
┌─ 먼저 정해 주세요 (인터뷰) ────────────────────────┐   ← 최상단, 전면
│ Q-1  SIGNON.PASSWORD 평문인데 소셜 사용자는…        │
│      [ 답변 입력 textarea ]           귀속: SFR-020 │
│ Q-2  기존 자체 로그인과 병행인가 대체인가?          │
│      [ 답변 입력 textarea ]                         │
│                        [ 답변 반영해 ① 재검토 ]     │
└────────────────────────────────────────────────────┘
근거로 본 초안 — 위 질문에 답하면 확정됩니다        ← 프레이밍 문구
┌─ 요구사항 3건 (전부 [추정]) ───────────────────────┐   ← 분해는 아래, 초안
│ [ReqCard] [ReqCard] [ReqCard]                       │
└────────────────────────────────────────────────────┘
```

- **인터뷰 블록(상단)**: 각 질문 `text` + (미답이면) textarea + 귀속 배지(`targetReqId`/`axis` 있으면).
  답한 질문은 답 + `answeredAt`, muted(다시 고칠 순 있음 — 새 답이 덮어씀, 잠금 아님).
- **단일 버튼 "답변 반영해 ① 재검토"** — 채워진 답 **일괄** POST(재실행 1회로 여러 답 반영, spawn·토큰
  절약). 제출 후 optimistic "재검토 중"(status→running, 폴링이 개정본 수신).
- **분해 블록(하단)**: "근거로 본 초안" 프레이밍 문구를 사이에 둔다. 분해는 답 전까지 `[추정]`이라는
  걸 문구로 못 박아 "이미 확정"으로 오독되지 않게 한다(사용자 지적의 직접 해소). ReqCard·근거축
  3상태(`없음 vs 못 봄`) 렌더는 기존 관례 재사용.
- **질문이 0건**이면 인터뷰 블록을 숨기고 분해를 바로 보여준다(명확한 요청은 루프 없이 통과, §2.2).
- `confirmedStep>=1`이면 textarea·버튼 숨기고 "컨펌됨 — 답변 잠금"(§5).

---

## 7. 비범위 (Non-goals)

- **컨펌 후 재개정 / 롤백** — `confirmedStep>=1`에서 ①을 되돌려 다시 답하는 건 별도 롤백 과제(②~⑤ 무효화
  연쇄가 걸린다). 본 설계는 ① 컨펌 **전** 루프만.
- **절차 B(변경관리/철회)** — 신규 요청(절차 A)만.
- **질문 자동 답변 / 기본값 추론** — 답은 사람이 낸다(가이드 규정: PM/PL 영역). LLM은 질문하고 반영만.
- **대화형 세션 UI** — 대화창을 띄우지 않는다(D1). 질문→답 입력→버튼의 비동기 반복이다.

---

## 8. 미해결 / 라이브 검증 대상

- ~~**`--resume` + `-p` 동작**~~ — **해소(2026-07-16 라이브 실측)**. `-p --session-id <uuid>` 로
  "42917 기억해" → **별도 spawn** `-p --resume <uuid>` 로 "무슨 숫자?" → **`42917`, 양쪽 exit 0**.
  대화창 없이 비동기 멀티턴이 성립한다 → D1 하이브리드의 전제가 증거로 확인됐다.
- ~~**`--session-id` 재사용 에러**~~ — **해소(실측 + 수정)**. 초판은 "fresh 폴백이 있어 치명 아님"
  이라 적었으나 **그 근거가 틀렸다**: fresh 폴백은 `runRtmRevise` 의 `resume ?? undefined` 에만 있고
  `runRtmSteps` 의 `--session-id` 에는 **없다**. 그리고 재사용은 실제로 거절된다 —
  실측: `claude -p --session-id <U>` 두 번 → 2회차 `Error: Session ID <U> is already in use.`
  세션당 1회 발급이었다면 ① spawn 이 한 번 실패한 세션은 재시도마다 같은 uuid 로 돌아
  **영구히 ①을 못 넘긴다**(사용자는 새 세션을 파야 함).
  → **수정**: uuid 를 세션 생성 시가 아니라 **① spawn 마다 새로 발급**(`issueIdentifyClaudeSession`).
  의미상으로도 맞다 — ①을 다시 돌리면 이전 대화는 낡았고, 개정이 이어야 할 맥락은 **가장 최근 ①** 이다.
- **개정이 답을 날리지 않는가** — §9 A6 참조(라이브 실측 완료분/미완분 구분 기재).

---

## 9. 구현 단계(Phase) · 비용

각 Phase 끝 사용자 컨펌(stop-per-phase 관례).

| P | 범위 | 검증 | 비용 |
|---|---|---|---|
| **A1** ✅ | **스키마**(§3.1) — `IntakeQuestionSchema` + `QuestionsField` **preprocess 정규화**(union 아님 — 소비처가 항상 객체만 보게) + 대시보드 `types.ts` `normalizeQuestions`(같은 규칙 복제, 이유는 주석) | **완료** — 단위테스트 10건(구형 문자열·신형 객체·혼합·id 합성·왕복 고정점·거부 3종) | 小 |
| **A2** ✅ | **qa-history + 세션 필드**(§3.2·§3.3) — `appendQaRevision`/`readQaHistory` + `identifyClaudeSession` 발급(`newRtmSession`) | **완료** — 단위테스트 10건(신규생성·누적·rev 최대값+1·손상 원장·traversal 거부·구세션 무회귀) | 小 |
| **A3** ✅ | **엔드포인트 + 재실행**(§4) — `POST /rtm-intake-answer` + 게이트 + `runRtmRevise` + fresh 폴백. `runClaudeSkill` 에 `sessionId`/`resume` opt additive | **완료** — 게이트를 **순수 함수 `checkAnswerGate` 로 추출**(핸들러 인라인은 테스트 불가 → 산문 게이트로 퇴행. §7 C8 위반 회피). 테스트 9건(게이트 5·spawn args 4, 미지정 시 args 바이트 동일 포함) | 中 |
| **A4** ✅ | **SKILL `--step 1 --revise`**(§4.2) — 개정 절차 7단계 + 답 보존 지침 + `--session-id` 첫 spawn 배선(①만 — ②~⑥은 디스크만 읽어 대화 이을 이유 없음) | **완료** — 절차 리뷰 + 캐시 동기 후 라이브 실행(A6) | 中 |
| **A5** ✅ | **UI**(§6, D3) — IdentifiedView **순서 반전**(질문 전면 + 분해는 "근거로 본 초안" 하단) + `QuestionInterview` + 일괄 제출 + qa-history 겹쳐 "제출됨·미반영" 표시 | **완료** — tsc 0 · 빌드 0 · 대시보드 334/334 | 中 |
| **A6** ⚠️ | **라이브 검증**(§8) | **부분 완료** — ↓ 별도 기재 | 大 |
| **A7** ✅ | **문서 정합** — 메모리 `rtm-intake-questions-gap` 정정(§2.1), `RTM_STEP_FLOW_DESIGN` ① 절 답변 루프 반영(종전 "컨펌 게이트에서 답하게 한다"는 **답할 자리가 없던 산문**이었다 — 드리프트 해소) | **완료** | 小 |

### 9.1 A6 라이브 검증 — 실측된 것과 안 된 것

**★ 실측 완료:**
- **`--resume` 멀티턴**(설계 최대 위험): `-p --session-id <uuid>` "42917 기억해" → **별도 spawn**
  `-p --resume <uuid>` "무슨 숫자?" → **`42917`, 양쪽 exit 0**. D1 하이브리드의 전제가 증거로 성립.
- **결정론 전량**: legacy-core 1204/1204 · 루트 512/512 · 대시보드 334/334 · tsc 0 · 빌드 0.

**대체 검증(dev 서버 e2e 아님)**: 대시보드 dev 서버를 띄운 전 구간 e2e(화면 클릭 → POST → 개정 →
화면 갱신)는 **돌리지 않았다**. 대신 **실 claude 로 개정 단계만** 스크래치 세션(기존 "구글 로그인 추가"
산출 복제, 사용자 세션 무오염)에서 실행해 SKILL 절차 준수를 실측했다 — §9.2.

**미실측**: `--session-id` 재사용 에러(§8), 화면 시각 QA(headless).

### 9.2 개정 절차 라이브 실측 (2026-07-16) — 증거 `evidence/a6-revise-e2e-*.json`

**조건**: 사용자의 실산출("구글 로그인 추가", 질문 6건이 **구형 문자열**)을 스크래치 sid 로 복제,
`identifyClaudeSession` **제거**(= **fresh 폴백 경로**, 더 까다로운 쪽). 답 2건을 원장에 심고 실 claude
로 `--step 1 --revise` 실행. 사용자 세션은 무오염(복제본만 사용, 실행 후 삭제).

| 검증 항목 | 결과 |
|---|---|
| 구형 문자열 → 객체 정규화 | ✅ 6건 → `Q-1`~`Q-6`, **인덱스 순서 보존** → 답이 제 질문에 붙음 |
| **답 보존**(§4.2 핵심 지시) | ✅ Q-2·Q-3 의 `answer`/`answeredAt` 유지 |
| **답이 분해를 실제로 바꿈** | ✅ Q-3("3사 공통 추상화") → **COR-010 신설** · Q-2("SIGNON 행 미생성") → DAR-010 AC-1/2 수정, AC-4 신설, SER-010 AC-4 신설(더미 비밀번호 금지), SIR-010·SFR-010 AC 개정 |
| 답이 낳은 **새 질문** | ✅ 3건(Q-7/8/9). 예: Q-7 은 "ACCOUNT만 생성"이 AC-3 의 PROFILE 의존과 충돌함을 잡음 — 답에서 파생된 **진짜 갈래** |
| 번들 재생성 안 함 · pre-cite verbatim | ✅ `AccountActionBean.java:161` 복사 |
| `validate` 재실행 | ✅ 통과(스키마 + 실재 대조) |
| **fresh 폴백 무손실**(§4.3) | ✅ 대화 맥락 0 인데 디스크만 읽고 완주 → 자기완결형 디렉티브 성립 |

**해석**: `[확인필요]` 가 표시용 메모에서 **설계를 실제로 움직이는 입력**이 됐다. 답 2건이 요구사항
1건 신설 + AC 6건 개정/신설을 낳았고, 그 답이 만든 새 모호점 3건을 다시 물어 온다 — §0 이 지목한
"①의 산출이 반쪽"이 닫혔다.

### 9.3 리뷰 라운드 (2026-07-16) — 잡힌 결함과 조치

리뷰어(code-reviewer, opus)가 MAJOR 5·MINOR 4 를 제기했고 **전부 반영**했다. 값이 있었던 것만 남긴다:

| # | 결함 | 조치 |
|---|---|---|
| **M1** | **손상 원장을 append 가 조용히 덮어썼다** — `readQaHistory` 주석은 "손상 파일을 덮어쓰진 않는다"고 **약속했는데 그 판단이 코드에 없었다**. 게다가 테스트가 그 오동작을 정답으로 고정 중이었다 | `readQaHistory` 가 **부재/손상을 가르고**(`corrupt`), `appendQaRevision` 이 손상 시 **거절(null)**. 쓰기는 tmp+rename 원자화. 손상 파일은 건드리지 않는다(사람이 보고 고치게). 테스트를 뒤집음 |
| **M2** | **개정 중 "② 다음 단계 생성 중…"** — `StepArea` 가 running 이면 패널을 걷어 인터뷰가 사라지고(설계 §6 의 optimistic 상태가 **죽은 코드**), 문구는 컨펌한 적 없는 ②로 넘어갔다고 **거짓말** | `jobStep` 을 폴링에서 받아 **최전선 재실행 vs 다음 단계**를 가른다. 개정 중엔 패널 유지 |
| **M3** | **질문 id 유일성이 산문(SKILL)으로만 강제** — 중복이면 화면이 남의 답을 주워 "답함"으로 렌더하고 입력칸이 사라져 **영영 답할 수 없다**. validate 는 통과(조용한 실패) | `IdentifiedIntakeSchema.superRefine` 으로 **파싱 거절**. 요구사항 id 중복(`diagnoseIntake`)의 대칭 |
| **M4** | `runRtmRevise` 에 `isCurrent` 가드 없음 — 죽은 job 이 진행 중 job 의 단계를 failed 로 덮어씀 | 형제 `runRtmSteps` 와 규약 일치 |
| **m2** | `normalizeQuestions` 가 손상을 `[]` 로 뭉갬 — `[]` 에는 "모호함 없음 → 통과"라는 **의미가 있어** 손상이 그걸로 위장 | `null` 반환 + 화면이 "질문을 읽지 못했습니다" 경고 |
| **m3** | `answer: ""` 가 `??` 를 통과해 원장 폴백을 막음 | `\|\|` + trim |
| **m1** | 게이트가 `discarded` 미검사 | `checkAnswerGate` 에 추가 |

**무혐의 판정 1건**: "대시보드 `normalizeQuestions` 복제 드리프트" 우려는 **실재하지 않았다** —
legacy-core 가 수용하는 모든 입력에서 두 정규화기가 같은 id 를 낸다(리뷰어 검증). 위험은 복제가
아니라 **두 사본이 합의한 규칙 자체에 유일성 보장이 없던 것**이었다(→ M3).
