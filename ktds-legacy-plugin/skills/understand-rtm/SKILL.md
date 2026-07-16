---
name: understand-rtm
description: 요구사항 추적표(RTM) — 코드에서 AS-IS 추적표(rtm.json)를 생성하고, 고객 자연어 요청을 6단계(식별→영향분석→목록표→정의서→명세서→RTM)로 분해·문서화한다. 단계마다 멈춰 사용자 컨펌을 받고, 신규는 전부 [추정]·확정은 사람 몫.
argument-hint: ["[자연어 요청]", "[--intake --session <sid> --step <k>]", "[--change --target-req <REQ> --kind withdraw]", "[projectRoot]"]
---

# /understand-rtm

> 🌐 **언어:** 사용자에게 보여주는 모든 설명은 **한국어**로 한다.

요구사항 추적표(RTM)의 단일 명령. **세 모드**가 인자로 갈린다:

- **생성 모드** (`--intake`/`--change` 없음) — 코드에서 AS-IS 추적표를 만든다(§A).
- **인테이크 단계 모드** (`--intake --step <k>`) — 자연어 요청을 6단계 중 **한 단계**만 수행한다(§B, 절차 A).
- **변경관리 모드** (`--change`) — 기존 요청을 철회/변경한다(§C, 절차 B).

핵심 원칙: **너는 제안만(`[추정]`) 한다. 확정은 사람이 대시보드에서 한다.** 코드를 수정하지 않는다.

## ID 체계 (2단계 — 절대 준수)
- **요청ID `REQ-{3자리}`** = 고객이 던진 요청 1건 (예: REQ-002 "네이버 로그인 추가").
- **요구사항ID `{구분코드}-{3자리}`** = 그 요청을 분해한 개별 요구사항 (예: SFR-020).
  - 구분코드: `SFR`(기능)/`PER`(성능)/`SIR`(인터페이스)/`DAR`(데이터)/`SER`(보안)/`QUR`(품질)/`COR`(제약).
- **한 요청은 보통 여러 요구사항으로 분해된다.** 예: "카카오 로그인" → SFR(기능)+SIR(API연계)+DAR(데이터)+SER(보안).
- 일련번호는 **기존 목록표/rtm.json 에서 이어** 부여(중복 금지). 신규면 010·020 단위.
- 같은 ID·요청ID는 3개 문서(목록표·정의서·명세서)에서 **철자까지 동일**하게 유지한다.

---

## A) 생성 모드 — 자연어 요청이 없을 때
코드에서 AS-IS 추적표를 결정론으로 생성한다:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-rtm.mjs <projectRoot>
```
도메인 그래프 + 스캔 산출물(routes/MyBatis/method-calls)에서 기능별 4축(진입점/구현/데이터/테스트)을
file:line 근거와 함께 `.understand-anything/rtm.json` 으로 쓴다. 완료 후 도메인·기능 수, 근거율을 보고하고 끝낸다.

---

## B) 인테이크 단계 모드 — `--intake --session <sid> --step <k>`

고객 자연어 요청(예: "네이버 로그인 추가해줘")을 **6단계 중 한 단계만** 수행하고 멈춘다. 단계 사이
사용자 컨펌이 게이트다. `--step 1` 에만 `--request "<원문>"` 을 받고, 이후 단계는 누적 산출에서 읽는다.

`--step 1 --revise` 는 **①의 재실행**이다(새 단계 아님) — 사용자가 `[확인필요]` 에 답한 뒤 그 답을
반영해 ①을 다시 판단한다. 아래 `--step 1 --revise` 절 참조.

| # | 단계 | 하는 일 | 산출 |
|---|---|---|---|
| ① | 식별 | 요청 → 요구사항 분해 + 6축 근거 + `validate`(실재 대조) | `identified.json` |
| ② | 영향분석 | `code-impact` — 바뀔 기존 기능이 코드 어디를 건드리나 | `impact-run.json` · `after-flow.json`(에프터 도식 초안) |
| ③ | 목록표 | 템플릿 `01_*` | `요구사항목록표.md` |
| ④ | 정의서 | 템플릿 `02_*` | `요구사항정의서.md` |
| ⑤ | 명세서 | 템플릿 `03_*` — 요구사항 1건당 1파일 | `요구사항명세서_{ID}.md` ×N |
| ⑥ | RTM | `project` + `understand-rtm` 재bake | `rtm-requirements.json`·`rtm.json` |

> **①과 ②는 왜 갈렸나(2026-07-16)**: 단계 게이트의 존재 이유가 "깊은 작업 전에 얕은 범위를 사용자가
> 먼저 확정"인데 종전 ①이 분해와 **impact 엔진 실행(가장 깊은 작업)** 을 함께 품고 있었다. 외부 SI
> 가이드의 ①은 **고객 인터뷰로 모호함 제거**(담당 PM/PL)이고 가이드 전체에 "영향" 언급이 0건이다 —
> 코드영향은 애초에 가이드 밖 신규 개념이라 ① 안에 있을 이유가 없었다.

### 0) 전제 · 세션
- `.understand-anything/rtm.json` 이 있어야 한다(없으면 §A 를 먼저 안내하고 멈춤). 이게 현재 **도메인/기능
  인벤토리 + 기존 요구사항**의 단일 소스다.
  ※ **①식별은 rtm.json 을 직접 읽지 않는다** — `intake-input` 근거 번들(§`--step 1`.1)이 rtm.json 을 포함한
  6축을 요청에 맞게 필터해 준다. 최소집합(도메인·데이터·추적표) 부재는 그 CLI 가 exit 2 로 차단한다.
- 세션 디렉터리: **`.understand-anything/rtm-intake/<sid>/`** (없으면 만든다). 단계 산출물을 여기에 쌓는다.
- 누적 중간산출: **`identified.json`** (2계층: `request` + `requirements[]` + `questions[]`). 단계마다 보강한다.
- 답변 원장: **`qa-history.json`** — 사용자가 `[확인필요]` 에 답한 이력(append-only, 대시보드가 쓴다).
  **답의 진실원본**이고 `identified.json` 의 `questions[].answer` 는 개정이 반영한 현재 상태다.
  개정(`--step 1 --revise`)만 읽는다.
- 템플릿 로드: 프로젝트 override `.understand-anything/templates/requirements/0X_*.md` → 없으면 플러그인
  동봉 `${CLAUDE_PLUGIN_ROOT}/templates/requirements/0X_*.md`. **빈 템플릿 구조만 보고 채운다(examples 미참조).**

`identified.json` 구조(요지 — 전체 스키마는 legacy-core `intake-types.ts`):
```jsonc
{
  "request": { "id": "REQ-002", "name": "네이버 로그인 추가", "raw": "<원문>", "source": "고객 요청", "requestedAt": null },
  "requirements": [
    { "id": "SFR-020", "category": "SFR", "name": "네이버 소셜 로그인",
      "type": "functional", "nfrCategory": null, "priority": "MEDIUM", "status": "ACTIVE",
      "derivedFrom": null,                      // 파생이면 선행 요구사항ID
      "definition": "", "scope": "", "origin": "",         // ④ 정의서에서 보강
      "spec": { "details": [], "inputs": "", "outputs": "", "flow": "",
                "preceding": [], "exceptions": [], "acceptance": [], "verify": "" }, // ⑤ 명세서에서 보강
      "acceptanceCriteria": [ { "id": "AC-1", "text": "...", "kind": "rule",
                                "fnIds": ["to-be:auth/naver-callback"], "confidence": "INFERRED", "tests": [],
                                // ↓ ① 근거 축 — 번들 pre-cite 를 verbatim 복사(생산 금지)
                                "evidence": [ { "file": "src/…/AccountActionBean.java", "line": 149, "snippet": "@DefaultHandler" } ],
                                "screenRefs": [ { "screenId": "screen:actions/Account.action__signonForm", "annotationNo": 2, "note": "" } ],
                                "policyRefs": [ { "doc": "policy-domain-account.md", "section": "8", "ruleId": null, "note": "" } ] } ],
      "changeset": { "added": [], "modified": [], "removed": [], "revived": [],
                     "evidence": [] },         // 이 묶음 도출의 근거(pre-cite 복사)
      "screenRefs": [], "policyRefs": [] }     // 요구사항 단위 화면·정책 귀속(AC 단위와 둘 다 가능)
  ],
  // ① [확인필요] — 사용자가 **답할 수 있는** 질문(A1). 답변은 대시보드에서 받아 개정(--revise)이 반영한다.
  "questions": [
    { "id": "Q-1",                              // 안정 키 — 개정 넘어 답을 붙잡는다. 절대 재발번 금지.
      "text": "SIGNON.PASSWORD 가 NOT NULL 평문인데 소셜 사용자는 비밀번호가 없다 — 별도 컬럼인가 null 허용인가?",
      "targetReqId": "SFR-020",                 // 걸린 요구사항(요청 전체면 null)
      "axis": "data",                           // screen|policy|domain|data|code|rtm|general (모르면 null)
      "answer": null, "answeredAt": null }      // 사용자 답변 — ①은 null 로 두고 개정이 채운다
  ]
}
```
규약: priority 는 `HIGH|MEDIUM|LOW`(렌더 시 상/중/하). 신규(TO-BE)는 전부 `[추정]`(INFERRED) — `[확정]` 불가.
`AC.fnIds` 는 그 요구사항 `changeset` 에 등장한 기능과 일치(유령 매핑 금지). 시험결과·고객검수는 인테이크가 안 적는다.
**근거↔신뢰도 불변식**: `evidence: []`(명시적 빈 배열) + `CONFIRMED` 는 `uncited-confirmed` **error** 다.
근거가 있으면 싣고, 없으면 `INFERRED` 로 둔다 — 둘 중 하나이지 "근거 없는 확정"은 없다.

### --step 1 식별 (요청 → 요구사항 분해)
0. **요청ID 부여**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs next-req <projectRoot>` 로 충돌 없는 다음
   `REQ-00N` 을 받아 `request.id` 로 쓴다. (요청ID는 요구사항 id 가 아니라 `source.section` 에만 존재할 수 있으므로
   요구사항 id 만 보고 번호를 매기면 충돌한다 — 반드시 이 명령으로 받는다.)
1. **근거 번들 생성 · 로드 (필수 — 이게 판단 입력의 전부다)**
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs intake-input <projectRoot> --request "<원문>" --session <sid>
   ```
   → `<세션>/intake-input.json` 이 생긴다. **이 파일을 읽어** 인벤토리·번호를 파악한다. 분석 산출물 6축
   (도메인·스키마·CRUD·추적표·화면·정책)을 요청 원문으로 사전 필터한 **유계 요약**이다.
   - **전 소스를 직접 읽지 마라** — `domain-graph.json`·`screens.json`·정책서 원문은 수백 KB다. 번들이
     이미 요약·인용해 뒀다(`understand-map/SKILL.md:82` 와 동일 계약).
   - 최소집합(도메인·데이터·추적표) 부재면 이 명령이 **exit 2 로 차단**한다 → §A 를 안내하고 멈춘다.

   **번들 읽는 법:**
   - `axes.{domain, data.schema, data.crud, rtm, screens, policy}` — 축별 선정 항목.
   - `axes.*.evidence{rate,cited,total}` · `items[].rowCount` — **0건은 "없음"이 아니라 "못 봄"이다.**
     예: `policy-authz.md` 행 0건은 "권한 통제가 없다"가 **아니라** 스캐너가 못 본 것이다.
     빈 산출물을 근거로 "통제 없음"류 결론을 내지 마라.
   - `warnings[]` · `omitted[]` · `filter.fallbacks[]` — 정직한 생략 보고. 읽고 판단에 반영한다.
2. **★ 인용은 생산하지 않는다 — 번들의 pre-cite 를 verbatim 복사한다.**
   번들의 인용(`axes.domain.items[].claims[].citations[]`, `axes.screens.items[].annotations[].handler.evidence[]`,
   `axes.data.crud.items[].evidence[]`, `axes.rtm.items[]` 의 축별 `evidence[]`)은 **이미 `{file,line,snippet}`
   모양이라 `evidence` 에 그대로 복사된다.** file 경로·line 번호·snippet 을 **한 글자도 바꾸지 마라.**
   **번들에 없는 인용을 지어내지 마라** — 기억이나 추측으로 `file:line` 을 쓰는 순간 그게 §1.2 의 결함이다.
   ※ **예외 하나** — 정책 축(`axes.policy.items[].sections[].rows[].evidence[]`)은 `snippet: null` 로 실린다.
   `evidence` 스키마의 `snippet` 은 `string | 없음` 이라 **null 은 검증에서 튕긴다** → 이때만 `snippet` **키를
   통째로 빼고** `{file, line}` 만 복사한다(값 변조 아님 — 없는 걸 없다고 적는 것).
3. 요청을 **요구사항(SFR/SIR/DAR/SER…)으로 분해**한다. 기능 본체(SFR) + 파생(API연계 SIR / 데이터 DAR / 보안 SER 등).
   각 요구사항에 구분·우선순위·`derivedFrom`(파생이면)·AC 골격·`changeset`(기존 기능 `modified` / 신규 `added`)을 부여.
   기존 기능 입도에 맞춰 분해(과도 분할 금지). 애매하면 신규 대신 가장 가까운 기존 기능에 `modified`.
   **근거를 반드시 기록한다:**
   - `acceptanceCriteria[].evidence` · `changeset.evidence` 에 위 pre-cite 를 복사해 채운다.
   - **근거가 없으면 `CONFIRMED` 를 쓰지 마라.** `evidence: []`(빈 배열) + `CONFIRMED` 는 검증기가
     `uncited-confirmed` **error** 로 막는다. 근거 없는 판단은 `INFERRED`(`[추정]`)다.
     신규(TO-BE)는 어차피 전부 `[추정]` — `[확정]` 불가.
   - **화면 축**이 번들에 있으면 `screenRefs: [{screenId, annotationNo, note}]` 로 귀속한다.
     (예: AC "로그인 폼에 카카오 버튼 노출" → `screenId: "screen:actions/Account.action__signonForm"` +
     해당 `annotations[].no`). 참조만 담고 `selector`·`bbox` 는 **복제하지 마라**(재생성마다 낡는다).
   - **정책 축**이 번들에 있으면 `policyRefs: [{doc, section, ruleId, note}]` 로 귀속한다
     (예: 평문 password 쟁점 → `policy-domain-account.md` §8).
4. **★ 축 생략·낡은 커밋 → 그 축에 의존하는 결론은 `[추정]` 강등**
   - `reducedMode.active === true` 면 `reducedMode.omittedAxes` 의 축은 **못 본 것**이다. 그 축에 의존하는
     결론(예: 화면 축 생략인데 "어느 화면에 버튼을 단다")은 **`INFERRED` 로 강등**하고, 생략 사실을
     `questions[]` 에 `[확인필요]` 로 올린다.
   - `commits.consistent === false` 면 커밋이 어긋난 것이다(`commits.note` 참조). **차단하지 않되**,
     낡은 축에 의존하는 결론은 **`INFERRED` 로 강등**한다.
     낡은 축은 **`commits.staleAxes` 에 이름으로 실려 있다** — `commits.head`(현재 소스 HEAD)와
     커밋이 다른 축들이다. `staleAxes` 가 비어 있는데 `consistent:false` 면 HEAD 를 못 잰 것이고
     (`commits.head === null`, git 저장소가 아님) 축끼리만 어긋난 상태다 — `note` 를 읽고 판단한다.
5. 모호점은 `questions[]` 에 `[확인필요]` 질문으로 남긴다(임의 가정 금지).
   **사용자가 답할 질문이다** — 표시용 메모가 아니라 대시보드에서 답을 받아 개정(`--revise`)이 반영한다.
   그러니 **답할 수 있게** 쓴다: `id`(`Q-1`…)를 부여하고, 걸린 요구사항은 `targetReqId` 로, 어느 축의
   모호함인지는 `axis` 로 귀속한다(못 고르면 null — 억지 귀속 금지). `answer`/`answeredAt` 은 null 로 둔다.
   - **번들을 보고 물어라.** 좋은 질문은 근거에서 나온다 — "SIGNON.PASSWORD 가 NOT NULL 평문인데
     소셜 사용자는 비밀번호가 없다, 별도 컬럼인가 null 허용인가?"처럼 **본 것을 근거로** 갈래를 제시한다.
     번들 없이 누구나 할 수 있는 일반론("병행인가 대체인가")만 남기면 ①의 값이 없다.
   - **한 질문에 한 갈래.** 여러 결정을 한 문장에 묶으면 답이 갈라져 반영이 안 된다.
6. 기존 요구사항과 **모순**되면 supersede 후보를 `questions` 에 적어 사람이 판단하게 한다.
7. `identified.json` 을 세션 디렉터리에 쓴다(④⑤ 보강 필드는 비워 둔다 — default 로 통과).
8. **검증**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs validate <세션>/identified.json` 실행.
   스키마 위반(비0 종료)이면 고쳐 다시 쓴다. 일관성 경고는 검토 후 반영.
   **실재 대조 게이트(exit 2)** — `changeset` 의 기능 id 는 `rtm.json functions[].id` 에, 데이터 귀속
   표기(`ACCOUNT(CR)` 형태)의 테이블명은 `db-schema.json tables[].name` 에 **실재해야** 한다.
   신규 기능은 `added` 에 `to-be:` 접두로만 넣는다(면제). **없는 테이블·기능을 지어내면 차단된다** —
   신규 테이블이 정말 필요하면 `questions[]` 에 `[확인필요]` 로 올려 사람이 판단하게 한다.
   ※ `validate` 는 **①의 자기 검증**이다(네가 쓴 산출물이 스키마·실재에 맞나) — 여기 남는다.
   코드영향은 새 사실을 **생산**하는 일이라 성격이 달라 ②로 갈렸다.
9. 보고: 요청ID → 요구사항ID 매핑표 + `[확인필요]` 질문 + **근거 요약**(AC/changeset 중 근거가 붙은 비율,
   생략된 축, 커밋 불일치로 강등한 결론). **여기서 멈춘다.**
   **코드영향 범위는 ①이 말하지 않는다** — 아직 안 봤다. ②의 몫이니 넘겨짚어 쓰지 마라.

### --step 1 --revise 개정 (답변 반영 → ① 재판단)

사용자가 ①의 `[확인필요]` 질문에 **답한 뒤** 대시보드가 자동 실행한다. ①의 재실행이지 새 단계가
아니다 — `producedStep` 은 1 그대로고, 사용자는 만족하면 ①을 컨펌한다(**종료는 사람**).

> **왜 개정인가**: 답변은 기록이 아니라 **재실행 트리거**다. "병행이다"라는 답이 `changeset`·AC 를
> 실제로 바꿔야 ①이 답을 반영한 것이다. 답만 받아 적고 분해가 그대로면 개정이 아니다.

1. **답을 읽는다**: `<세션>/qa-history.json` 의 **최신 revision**(`revisions` 의 마지막 = `rev` 최대).
   ```jsonc
   { "revisions": [ { "rev": 1, "answeredAt": "…",
       "qas": [ { "qid": "Q-1", "question": "…평문 password…", "answer": "병행 — 소셜은 password null 허용" } ] } ] }
   ```
   이 파일이 **답의 진실원본**이다. 대화 맥락을 이어받았더라도(`--resume`) 반드시 읽어라 —
   맥락 없이 실행될 수도 있고(fresh 폴백), 그때도 같은 결과가 나와야 한다.
2. **기존 산출·근거를 읽는다**: `<세션>/identified.json`(네가 쓴 것) + `<세션>/intake-input.json`(번들).
   **번들은 재생성하지 마라** — 요청이 안 바뀌었으니 번들도 그대로다. 인용은 여전히 번들 pre-cite 를
   verbatim 복사한다(`--step 1` 의 2번 규칙 그대로).
   - **★ 구형 산출 주의 — `questions` 가 객체가 아니라 문자열 배열일 수 있다**(답변 필드가 없던 시절
     산출물). 그때 `qid` 는 화면이 **배열 순서로 합성**한 것이다: 첫 문자열=`Q-1`, 둘째=`Q-2`, … 그래서
     **`qas[].question` 텍스트로 대조해 어느 질문의 답인지 확정하라** — `qid` 숫자만 믿고 매기지 마라.
     개정하며 객체로 올릴 때 **그 순서 그대로** `Q-1`… 를 부여해야 답이 제 질문에 붙는다.
3. **답을 실제로 반영한다** — 답이 해소한 모호함을 `requirements`·`changeset`·`acceptanceCriteria`·
   근거축(`evidence`/`screenRefs`/`policyRefs`)에 반영한다. 예: "병행"이면 기존 로그인 flow 를
   `modified` 에 유지하고 대체 전제로 썼던 AC 를 고친다. 답이 요구사항을 새로 낳으면 추가하고,
   무의미해진 요구사항은 지우지 말고 `status: "WITHDRAWN"` 으로 둔다(이력 보존).
4. **★ 답을 지우지 마라** — `answer` 가 null 이 아닌 질문은 **`id`·`text`·`answer`·`answeredAt` 를 그대로
   보존**한다. 답한 질문을 목록에서 빼거나 id 를 새로 매기면 **사용자의 답이 날아간다**(질문이 해소됐어도
   답은 남는다 — 그게 결정의 근거다). 이번 revision 의 답은 해당 `qid` 의 `answer`/`answeredAt` 에 채운다.
5. **새 모호함은 새 질문으로**: 답이 새 갈래를 낳으면 `questions[]` 에 **새 id 로 추가**한다
   (기존 답을 덮어쓰지 말고). `--step 1` 의 5번 규칙(근거 기반·한 질문 한 갈래)을 그대로 따른다.
6. `identified.json` 을 다시 쓰고 **`validate` 를 재실행**한다(`--step 1` 의 8번과 동일 — 실재 대조 게이트
   포함). 개정이 스키마·실재를 깨뜨리지 않았는지 확인한다.
7. 보고: **답이 무엇을 바꿨나**(요구사항·changeset·AC 변경점) + 남은 `[확인필요]` + 새로 생긴 질문.
   **여기서 멈춘다.** 신규는 여전히 전부 [추정]이고 확정은 사람이 대시보드에서 한다.

### --step 2 영향분석 (코드영향 검증)

①이 분해한 `changeset.modified` 가 **실제로 코드 어디를 건드리는지** 엔진으로 확인한다.
①의 컨펌과 별개 게이트인 이유: ①은 "무엇을 바꾸나"(분해·근거)이고 ②는 "그게 무엇을 건드리나"
(도달성)다. **분해가 틀렸으면 영향분석은 틀린 입력 위에 선다** — 그래서 ① 컨펌이 ②의 전제다.

1. **선행 확인**: `<세션>/identified.json` 이 있어야 한다(없으면 ①을 먼저 안내하고 멈춤).
   ①의 `validate`(실재 대조)를 통과했어야 `modified` 의 기능 id 실존이 보장되고 조인이 성립한다.
2. **실행**
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs code-impact <projectRoot> --session <sid>
   ```
   `changeset.modified`(flow id) → `rtm.json` 의 진입점 근거로 **결정론 조인**해 시드 파일을 뽑고
   영향도 엔진을 돌린다. **네가 시드를 고르지 마라** — 조인은 코드가 한다(추측 금지).
   - modified 가 없거나 전부 `to-be:`(신규)면 **시드 없음으로 정상 종료**한다 — 바꿀 기존 코드가
     없다는 뜻이라 정당하다(신규 생성예측은 범위 밖). 실패가 아니니 그대로 보고한다.
   - 이 실행은 루트 슬롯(`.spec/map/impact.json`)·문서 09·구조 오버레이를 **건드리지 않는다**.
     결과는 `<세션>/impact-run.json` 포인터로 보관되고 impact 원장에 요청 원문으로 기록돼
     `/change` 메뉴에서도 열람된다.
3. 보고: 출력의 **영향 도메인·흐름·API·매퍼**. 이게 "이 요청이 어디를 건드리나"의 **유일한 근거**다 —
   산문으로 지어내지 마라.
   - `⚠ 진입점 근거 0건` 경고가 뜨면 그 기능은 시드에서 빠진 것이다. **영향 범위가 그만큼 덜
     보인다는 사실을 보고에 명시**한다(조용히 넘어가면 §4.1 "없음 vs 못 봄" 오독의 재판이다).
4. **에프터 업무흐름도 초안** — `<세션>/after-flow.json` (RTM_AFTER_FLOW_DESIGN.md, 2026-07-17).
   대시보드 비포·에프터 모달의 "에프터"가 표식이 아니라 **구조 차이**(신규 삽입·삭제·변경)를
   보여주기 위한 산출이다. 전부 [추정] — 사람이 검토 전 확정 아님.
   - **기반**: `.understand-anything/domain-graph.json` 의 `domainMeta.businessFlows` 에서 영향
     흐름(활동의 `flowRef`)이 등장하는 업무 프로세스를 찾아 **노드·엣지를 id 그대로 복사**한다.
   - **바꿀 수 있는 것은 changeset 근거뿐**: `added` → 신규 활동 노드 삽입(`change:"added"`,
     `flowRef` 는 to-be id, 잇는 엣지도 `change:"added"`) · `removed` → 해당 활동에
     `change:"removed"` 마킹(노드 **제거 금지** — 무엇이 없어지는지 보여야 diff 다) ·
     `modified` → `change:"modified"`. 그 밖의 구조 변경(재배치·이름 변경·무근거 분기)은 **금지**.
   - **형식**: `{"schemaVersion":1,"flows":[{"domainId","baseTitle"(원 프로세스 제목 그대로 —
     대시보드 조인 키),"nodes":[…],"edges":[…],"note"(선택 — 삽입 위치의 근거 한 줄)}]}`.
     모든 엣지 끝점은 실존 노드여야 한다 — 어긋나면 대시보드가 그 장을 통째로 기각하고
     표식 오버레이로 폴백한다(부분 렌더 금지 규약).
   **여기서 멈춘다.** ③~⑤ 문서는 이 영향 범위를 사람이 컨펌한 뒤에 쓰인다.

### --step 3 목록표
1. `identified.json` 로드. 템플릿 `01_요구사항목록표.md` 로드.
2. 채운다 — **§2 요청 목록**(이 REQ 행) + **§4 요구사항 목록**(요청ID로 그룹핑, 요구사항마다 1행: 요청ID/요구사항ID/구분/요구사항명/우선순위/상태).
   기존 `요구사항목록표.md` 가 세션에 있으면 행을 **추가**(보존). `{ }` placeholder 전부 치환, 빈 칸 금지.
3. `<세션>/요구사항목록표.md` 로 쓴다. 보고 후 멈춘다.

### --step 4 정의서
1. `identified.json` 의 각 요구사항에 **정의·범위·출처(`definition`/`scope`/`origin`)** 를 보강해 다시 쓴다(검증 재실행).
2. 템플릿 `02_요구사항정의서.md` 로드. **§4 요청별 요구사항 정의** 를 `### {REQ} {요청명}` 섹션 > `#### [{요구사항ID}] …` 구조로 채운다.
3. `<세션>/요구사항정의서.md` 로 쓴다. 보고 후 멈춘다.

### --step 5 명세서
1. `identified.json` 의 각 요구사항에 **`spec`**(상세기능·입출력·처리흐름·선행·예외·인수기준·검증방법)을 보강해 다시 쓴다(검증 재실행).
   **인수기준은 정량 지표**(처리시간·정확도·성공률 등). **출처/추적 칸은 절대 비우지 않는다.**
2. 템플릿 `03_요구사항명세서.md` 로 **요구사항 1건당 파일 1개** — `<세션>/요구사항명세서_{요구사항ID}.md` (소속 요청ID 포함). 기능·비기능 **모두** 1파일씩.
3. 생성한 파일 목록을 보고하고 멈춘다.

### --step 6 RTM (추적표 반영)
`identified.json`(완전 보강본)을 정식 `rtm-requirements.json` 으로 투영해 추적표에 반영한다(옵션 B 단계적 브릿지).
**두 명령을 순서대로 실행한다:**
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs project <projectRoot> <sid>
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-rtm.mjs <projectRoot>
```
- 1번(`project`): `identified.json` 의 요구사항(SFR…)을 **현 스키마 1급 requirement** 로, 각 `changeset.added` 를
  **TO-BE 기능 스텁**으로 투영해 `rtm-requirements.json` 에 **기존 보존하며 id 병합**한다. 요청(REQ)은 `source.section`,
  파생은 `dependsOn`(SIR-002 ← SFR-010)으로 연결. featureId·도메인은 rtm.json 인벤토리에서 결정론으로 이어 붙인다.
- 2번(`understand-rtm`): `rtm-requirements.json` 을 적용해 `rtm.json` 을 재생성(기능 상태·이력·커버리지 재계산).
- 보고: 투영된 요구사항 수 / 신규 기능 수 / 병합 후 집계. **"추적표(요구사항 기준)에서 결과를 확인하세요"** 로 마무리.
> 문서는 2계층(요청 REQ → 요구사항 SFR…) 그대로, rtm.json 은 현 스키마를 유지하며 투영한다(2계층 1급화는 후속).
> 상세: `docs/ktds/RTM_STEP_FLOW_DESIGN.md` §9.

---

## C) 변경관리 모드 — `--change --target-req <REQ> --kind withdraw [--cr <CR>]`

기존 요청(REQ)을 철회한다(절차 B). 신규 6단계(§B)와 **별개 트리거**다. 핵심 불변:
**삭제 금지** — 요구사항 행·문서는 지우지 않고 상태를 `폐기(CR-xxx)`로 바꿔 이력을 보존한다. **확정은 사람.**

철회는 **요청(REQ) 단위**다. REQ-001 폐기 → 그 요청에서 분해된 하위 요구사항(SFR/SIR/DAR/SER…)이
**동반 폐기**된다(source.section 으로 귀속). 모든 결정론 작업은 아래 CLI 가 수행하고, 너는 문서를 채운다.

### 0) 전제
- `.understand-anything/rtm.json` + `rtm-requirements.json` 이 있어야 한다(없으면 §A·§B 를 먼저 안내하고 멈춤).
- 대상 `<REQ>` 에 귀속된 요구사항이 있어야 한다(없으면 오타·없는 요청 — 보고하고 멈춤).

### 1) CR 번호 부여(결정론)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs next-cr <projectRoot>
```
충돌 없는 다음 `CR-00N` 을 받는다. `--cr` 가 명시되면 그대로 쓴다. (CR 번호도 changeReq 메타에만 있으므로
요구사항 id 만 보고 매기면 충돌한다 — 반드시 이 명령으로 받는다.)

### 2) 영향 분석(RTM 역추적)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs impact <projectRoot> <REQ> --out <projectRoot>/.understand-anything/change/<CR>/impact.json
```
영향분석 JSON 을 받는다(결정론): 영향 기능 분류(**회귀**=구현 존재→회귀시험 / **계획취소**=미착수 TO-BE /
**타요구유지**=다른 유효 요구가 사용), **다운스트림 의존 끊김**, **인수조건/시험**, **산출물**, **후속조치 체크리스트**.
이 JSON 이 변경영향분석서의 데이터 소스다(추측 금지 — 여기 있는 값만 쓴다).

### 3) 변경관리 문서 생성(템플릿 04·05)
템플릿 로드: 프로젝트 override `.understand-anything/templates/requirements/0X_*.md` → 없으면 플러그인 동봉
`${CLAUDE_PLUGIN_ROOT}/templates/requirements/0X_*.md`. **빈 칸 금지·추적 칸 비우지 않기.** 산출 위치는
`<projectRoot>/.understand-anything/change/<CR>/`.
1. `04_과업내용변경요청서.md` → `과업내용변경요청서_<CR>.md`. 대상 REQ·하위 요구사항·사유·**영향 요약**(impact 의 기능 수·산출물·후속조치)을 채운다.
2. `05_변경영향분석서.md` → `변경영향분석서_<CR>.md`. impact JSON 을 표로 옮긴다(영향기능·의존·AC·산출물·후속조치 그대로).

### 4) 폐기 표시(원장 반영) + 재bake
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs withdraw <projectRoot> <REQ> <CR> "<사유>"
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-rtm.mjs <projectRoot>
```
- 1번(`withdraw`): `rtm-requirements.json` 의 귀속 요구사항을 `WITHDRAWN` + `changeReq{crNo,reason}` 로 표시(삭제 없음·멱등).
- 2번(`understand-rtm`): `rtm.json` 을 재생성. 현행 head 에서 폐기 요구가 빠져 기능 상태가 **원복**된다(미착수 TO-BE 는 계획취소, 변경했던 AS-IS 기능은 직전 동사로 복귀). 이력(requirementHistory)은 감사용으로 보존.

### 5) 기존 문서 폐기 배너(있을 때만, 삭제 금지)
대상 요구사항의 기존 산출 문서가 세션/프로젝트에 있으면 **지우지 말고** 표시만 바꾼다:
- 목록표: 해당 행 상태 `폐기(<CR>)`(§2 요청 행 + §4 요구사항 행).
- 정의서·명세서: 상단 폐기 배너 + `상태: 폐기(<CR>, <일자>)` + 사유. 본문은 취소선 권장.
- 모든 변경 문서에 **개정 이력** 새 버전 행을 추가한다.

### 6) 보고(한국어)
- 폐기된 요청/요구사항 목록(REQ → 하위 요구사항ID).
- 영향 기능 분류 요약(회귀 n / 계획취소 n / 타요구유지 n) + 다운스트림 의존 끊김.
- 후속조치 체크리스트(데이터 파기·회귀시험·문서개정·의존 재검토).
- 생성한 변경관리 문서 경로. **여기서 멈춘다.** 후속조치 수행·확정은 사람 몫.

> 상세 설계: `docs/ktds/RTM_STEP_FLOW_DESIGN.md` §8. 불변 규칙(삭제 금지·이력 보존·요청 단위 동반 폐기)은 절대 깨지 않는다.

---

## 헤드리스(대시보드 자동 실행) 주의
대시보드에서 자동 실행된 경우 사용자에게 확인을 묻지 말고 **지정된 `--step` 한 단계만** 끝까지 수행한 뒤
보고하고 멈춘다(분해/매칭/문서작성 판단 권한은 부여됨). 다음 단계는 사용자가 컨펌해야 별도 호출로 진행된다.
확정은 어차피 사람이 대시보드에서 하므로, 여기서는 **그 단계 산출까지 완주**한다.
