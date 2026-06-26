---
name: understand-rtm
description: 요구사항 추적표(RTM) — ①코드에서 AS-IS 추적표(rtm.json)를 생성하고, ②고객 자연어 요청을 가이드 5단계(식별→목록표→정의서→명세서→RTM)로 분해·문서화한다. 단계마다 멈춰 사용자 컨펌을 받고, 신규는 전부 [추정]·확정은 사람 몫.
argument-hint: ["[자연어 요청]", "[--intake --session <sid> --step <k>]", "[--change --target-req <REQ> --kind withdraw]", "[projectRoot]"]
---

# /understand-rtm

> 🌐 **언어:** 사용자에게 보여주는 모든 설명은 **한국어**로 한다.

요구사항 추적표(RTM)의 단일 명령. **세 모드**가 인자로 갈린다:

- **생성 모드** (`--intake`/`--change` 없음) — 코드에서 AS-IS 추적표를 만든다(§A).
- **인테이크 단계 모드** (`--intake --step <k>`) — 자연어 요청을 가이드 5단계 중 **한 단계**만 수행한다(§B, 절차 A).
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

고객 자연어 요청(예: "네이버 로그인 추가해줘")을 **가이드 5단계 중 한 단계만** 수행하고 멈춘다. 단계 사이
사용자 컨펌이 게이트다. `--step 1` 에만 `--request "<원문>"` 을 받고, 이후 단계는 누적 산출에서 읽는다.

### 0) 전제 · 세션
- `.understand-anything/rtm.json` 이 있어야 한다(없으면 §A 를 먼저 안내하고 멈춤). 이게 현재 **도메인/기능
  인벤토리 + 기존 요구사항**의 단일 소스다.
- 세션 디렉터리: **`.understand-anything/rtm-intake/<sid>/`** (없으면 만든다). 단계 산출물을 여기에 쌓는다.
- 누적 중간산출: **`identified.json`** (2계층: `request` + `requirements[]` + `questions[]`). 단계마다 보강한다.
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
      "definition": "", "scope": "", "origin": "",         // ③ 정의서에서 보강
      "spec": { "details": [], "inputs": "", "outputs": "", "flow": "",
                "preceding": [], "exceptions": [], "acceptance": [], "verify": "" }, // ④ 명세서에서 보강
      "acceptanceCriteria": [ { "id": "AC-1", "text": "...", "kind": "rule",
                                "fnIds": ["to-be:auth/naver-callback"], "confidence": "INFERRED", "tests": [] } ],
      "changeset": { "added": [], "modified": [], "removed": [], "revived": [] } }
  ],
  "questions": []                               // ① [확인필요]
}
```
규약: priority 는 `HIGH|MEDIUM|LOW`(렌더 시 상/중/하). 신규(TO-BE)는 전부 `[추정]`(INFERRED) — `[확정]` 불가.
`AC.fnIds` 는 그 요구사항 `changeset` 에 등장한 기능과 일치(유령 매핑 금지). 시험결과·고객검수는 인테이크가 안 적는다.

### --step 1 식별 (요청 → 요구사항 분해)
0. **요청ID 부여**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs next-req <projectRoot>` 로 충돌 없는 다음
   `REQ-00N` 을 받아 `request.id` 로 쓴다. (요청ID는 요구사항 id 가 아니라 `source.section` 에만 존재할 수 있으므로
   요구사항 id 만 보고 번호를 매기면 충돌한다 — 반드시 이 명령으로 받는다.)
1. `rtm.json` 의 `domains[]`/`functions[]`/`requirements[]` 와 기존 목록표(있으면)를 읽어 인벤토리·번호를 파악.
2. 요청을 **요구사항(SFR/SIR/DAR/SER…)으로 분해**한다. 기능 본체(SFR) + 파생(API연계 SIR / 데이터 DAR / 보안 SER 등).
   각 요구사항에 구분·우선순위·`derivedFrom`(파생이면)·AC 골격·`changeset`(기존 기능 `modified` / 신규 `added`)을 부여.
   기존 기능 입도에 맞춰 분해(과도 분할 금지). 애매하면 신규 대신 가장 가까운 기존 기능에 `modified`.
3. 모호점은 `questions[]` 에 `[확인필요]` 질문으로 남긴다(임의 가정 금지).
4. 기존 요구사항과 **모순**되면 supersede 후보를 `questions` 에 적어 사람이 판단하게 한다.
5. `identified.json` 을 세션 디렉터리에 쓴다(②③④ 필드는 비워 둔다 — default 로 통과).
6. **검증**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/rtm-intake.mjs validate <세션>/identified.json` 실행.
   스키마 위반(비0 종료)이면 고쳐 다시 쓴다. 일관성 경고는 검토 후 반영.
7. 보고: 요청ID → 요구사항ID 매핑표 + `[확인필요]` 질문. **여기서 멈춘다.**

### --step 2 목록표
1. `identified.json` 로드. 템플릿 `01_요구사항목록표.md` 로드.
2. 채운다 — **§2 요청 목록**(이 REQ 행) + **§4 요구사항 목록**(요청ID로 그룹핑, 요구사항마다 1행: 요청ID/요구사항ID/구분/요구사항명/우선순위/상태).
   기존 `요구사항목록표.md` 가 세션에 있으면 행을 **추가**(보존). `{ }` placeholder 전부 치환, 빈 칸 금지.
3. `<세션>/요구사항목록표.md` 로 쓴다. 보고 후 멈춘다.

### --step 3 정의서
1. `identified.json` 의 각 요구사항에 **정의·범위·출처(`definition`/`scope`/`origin`)** 를 보강해 다시 쓴다(검증 재실행).
2. 템플릿 `02_요구사항정의서.md` 로드. **§4 요청별 요구사항 정의** 를 `### {REQ} {요청명}` 섹션 > `#### [{요구사항ID}] …` 구조로 채운다.
3. `<세션>/요구사항정의서.md` 로 쓴다. 보고 후 멈춘다.

### --step 4 명세서
1. `identified.json` 의 각 요구사항에 **`spec`**(상세기능·입출력·처리흐름·선행·예외·인수기준·검증방법)을 보강해 다시 쓴다(검증 재실행).
   **인수기준은 정량 지표**(처리시간·정확도·성공률 등). **출처/추적 칸은 절대 비우지 않는다.**
2. 템플릿 `03_요구사항명세서.md` 로 **요구사항 1건당 파일 1개** — `<세션>/요구사항명세서_{요구사항ID}.md` (소속 요청ID 포함). 기능·비기능 **모두** 1파일씩.
3. 생성한 파일 목록을 보고하고 멈춘다.

### --step 5 RTM (추적표 반영)
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

기존 요청(REQ)을 철회한다(절차 B). 신규 5단계(§B)와 **별개 트리거**다. 핵심 불변:
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
