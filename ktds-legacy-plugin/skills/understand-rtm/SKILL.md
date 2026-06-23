---
name: understand-rtm
description: 요구사항 추적표(RTM) — 코드에서 AS-IS 추적표(rtm.json)를 생성하고, 고객 자연어 요청을 기존 도메인/기능 인벤토리와 대조해 하위 기능으로 분해·매칭(인테이크)해 변경 묶음(changeset)을 rtm-requirements.json 에 기록한 뒤 재생성한다. 신규는 [추정], 확정은 사람 몫.
argument-hint: ["[자연어 요청]", "[projectRoot]"]
---

# /understand-rtm

> 🌐 **언어:** 사용자에게 보여주는 모든 설명은 **한국어**로 한다.

요구사항 추적표(RTM)의 단일 명령. **두 모드**가 있다(인자로 구분):

- **생성 모드** (자연어 요청 없음) — 코드에서 AS-IS 추적표를 만든다(§A).
- **인테이크 모드** (자연어 요청 있음) — 고객 요청을 분해·매칭해 요구사항/변경 묶음을 기록한다(§B~).

핵심 원칙: **너는 제안만(`[추정]`) 한다. 확정은 사람이 대시보드에서 한다.** 코드를 수정하지 않는다 —
요구사항·변경 묶음만 기록한다.

## A) 생성 모드 — 자연어 요청이 없을 때
코드에서 AS-IS 추적표를 결정론으로 생성한다:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-rtm.mjs <projectRoot>
```
도메인 그래프 + 스캔 산출물(routes/MyBatis/method-calls)에서 기능별 4축(진입점/구현/데이터/테스트)을
file:line 근거와 함께 `.understand-anything/rtm.json` 으로 쓴다. `rtm-requirements.json` 이 있으면 적용해
상태/이력을 재계산한다. 완료 후 도메인·기능 수, 근거율을 한국어로 보고하고 끝낸다.

## B) 인테이크 모드 — 자연어 요청이 있을 때
고객사의 자연어 요청(예: "알림 기능 만들어줘", "결제에 무통장입금 추가해줘")을 받아 RTM 에 반영한다.

### 0) 전제
`.understand-anything/rtm.json` 이 있어야 한다(없으면 §A 생성 모드를 먼저 안내하고 멈춤). 이 파일이
현재 **도메인/기능 인벤토리 + 기존 요구사항**의 단일 소스다.

## 1) 인벤토리 파악
`.understand-anything/rtm.json` 을 읽어라:
- `domains[]` — 기존 도메인(id, name).
- `functions[]` — 기존 기능(id, featureId, name, domainId, 4축 셀). **이게 매칭 대상이다.**
- `requirements[]` — 기존 요구사항(있으면 id 최대값 + supersede 체인 파악).

`.understand-anything/rtm-requirements.json` 이 이미 있으면 읽어 **보존**한다(append, 덮어쓰기 금지).

## 2) 분해 — 요청을 하위 기능들로
요청 하나가 기능 1개일 수도, 여러 개일 수도 있다. 기존 기능들의 **입도(granularity)에 맞춰** 분해하라.
예) "알림 기능" → 알림 추가 / 알림 삭제 / 재알림 / 재고 알림. 과하게 쪼개지 말고 기존 기능 수준으로.

## 3) 매칭 — 기존 수정 vs 신규
각 하위 기능을 인벤토리와 대조해 분류한다(changeset 동사):
- **기존 기능 수정** → 그 `functions[].id` 를 `modified` 에. (예: "결제에 무통장입금 추가" → 기존 결제 처리 기능 `modified`)
- **기존 기능 제거(요구 폐기)** → `removed`. **삭제하지 말고 표시만**(파괴적 삭제 금지).
- **이전에 폐기됐다 되살림** → `revived`.
- **신규 기능** → `added` + `functions[]` 에 **신규 스텁** 추가(아래 §5). 기존 도메인에 속하면 그 `domainId`,
  새 도메인이면 새 `domainId`(예: `to-be:notification`) + `domainName`.

판단이 애매하면 **신규로 만들지 말고** 가장 가까운 기존 기능에 `modified` 로 붙이거나, 그래도 모호하면
`source.note` 에 불확실성을 적어 사람이 대시보드에서 재지정하게 한다.

## 4) 요구사항 변경(supersede) 감지
새 요청이 **기존 요구사항과 모순**되면(예: 이전 "카드만" → 이번 "무통장만"), 이전 요구사항을
`status: "SUPERSEDED"` + `supersededBy: "<새 id>"` 로 바꾸고, 새 요구사항에 `supersedes: "<이전 id>"` 를 단다.
모순이 아니면 단순 추가.

## 5) 기록 — rtm-requirements.json
`.understand-anything/rtm-requirements.json` 에 **기존 내용을 보존하며** 병합 기록한다. 형식:

```json
{
  "requirements": [
    {
      "id": "REQ-00N",                      // 기존 최대 + 1 (zero-pad 3자리)
      "text": "결제는 무통장입금만 가능",      // 요구사항 한 줄 요약
      "status": "ACTIVE",                    // ACTIVE | SUPERSEDED
      "supersedes": "REQ-005",               // 대체하는 이전 요구사항(없으면 null)
      "supersededBy": null,
      "source": { "kind": "customer", "raw": "<고객 원문 그대로>" },
      "changeset": {
        "added":    ["to-be:payment/무통장입금-등록"],
        "modified": ["flow:POST /order/confirm"],
        "removed":  [],
        "revived":  []
      }
    }
  ],
  "functions": [                             // 신규(TO-BE) 기능 스텁만(기존 기능은 넣지 않음)
    {
      "id": "to-be:payment/무통장입금-등록",   // 안정적 신규 id(domain/이름 기반)
      "featureId": "FN-0NN",                 // 기존 최대 + 1
      "name": "무통장입금 등록",
      "domainId": "domain:payment",          // 기존 도메인 id 또는 새 to-be: id
      "domainName": "결제",
      "entryPoint":     { "value": "(제안) POST /order/bank", "confidence": "INFERRED", "evidence": [] },
      "implementation": { "value": "(제안) +BankPaymentService", "confidence": "INFERRED", "evidence": [] },
      "data":           { "value": "(제안) PAYMENT(C)", "confidence": "INFERRED", "evidence": [] },
      "test":           { "value": "", "confidence": "UNVERIFIED", "evidence": [] },
      "origin": "TO_BE", "state": "PLANNED", "requirementHistory": []
    }
  ]
}
```

**grounding 규약(생략 불가):**
- 신규(TO-BE) 셀은 **절대 `[확정]`(CONFIRMED)을 받지 못한다** — 존재하지 않는 코드는 기계검증 대상이 아니다.
  진입점/구현/데이터 제안은 `INFERRED`(`(제안)` 접두), 테스트는 `UNVERIFIED`. 근거(evidence)는 `[]`.
- 기존 기능의 셀 값은 **건드리지 않는다**(rtm.json 이 소유). changeset 의 fnId 로만 참조한다.
- `changeset` 의 모든 fnId 는 rtm.json `functions[].id` 또는 이 파일 `functions[]` 의 신규 id 중 하나여야 한다.

## 6) 재생성
기록 후 RTM 을 재생성해 상태/이력을 반영한다:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-rtm.mjs <projectRoot>
```
이것이 `rtm-requirements.json` 을 읽어 `applyRequirements` 로 기능 상태(현행 head 재계산)와
`requirementHistory` 를 다시 계산해 `rtm.json` 에 bake 한다.

## 7) 사용자 보고(한국어)
무엇을 추가했는지 요약: 새 요구사항 id·text, 분해된 기능 수, `−삭제/~변경/+신규/=부활` 집계, 새 도메인 여부.
**"전부 `[추정]` 상태이며, 대시보드 추적표에서 검토 후 확정하세요"**로 마무리한다.

## 헤드리스(대시보드 자동 실행) 주의
대시보드에서 자동 실행된 경우 사용자에게 확인을 묻지 말고(분해/매칭 판단 권한은 부여됨) §1~§6 을
끝까지 실행하라. 확정은 어차피 사람이 대시보드에서 하므로, 여기서는 **제안 기록까지 완주**한다.
