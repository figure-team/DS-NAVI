---
name: understand-policy
description: 정책서(.md) 생성 — 코드/DB 신호에서 정책 앵커 추출 후 LLM 보강. PoC 4종(용어/데이터/검증/권한), 모든 행 file:line 근거
argument-hint: ["[projectRoot]"]
---

# /understand-policy

> ⚠️ 비민감 샘플 전용.
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·요약·진행 안내는 **한국어**로 한다.

레거시 코드와 DB(.sql)에서 **정책서**를 생성한다. 기존 9종 산출물(코드 100% 추출)과 달리
정책서는 **규범 문서**라 코드만으로 도출되지 않는다. 2단계로 만든다:

1. **결정론 추출(스크립트)** — 정책의 **앵커(file:line)** 만 표로 싣는다. 합성 금지.
2. **LLM 보강(이 스킬)** — 앵커 소스를 읽어 규범 진술·값을 채우고 `[추정]` 표기한다.

PoC 카테고리 4종: **용어/도메인 사전 · 데이터 정책 · 업무규칙(Validation) · 권한 정책**.

## 1단계 — 결정론 추출(스크립트 실행)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-policy.mjs <projectRoot>
```

- domain-graph 없이 **raw 소스**에서 동작: census → db-schema(.sql 3-Tier) → policy-signals → 정책서.
- 산출:
  - `.understand-anything/doc-output/policy-{glossary,data,validation,authz}.md` — 앵커 표(신뢰도/근거 열 포함).
  - `.spec/map/db-schema.json`, `.spec/map/policy-signals.json` — 중간 신호(재사용).
- DB 자산 게이팅: `tier=ddl+data`(상태/요율 행까지) / `ddl`(구조만) / `code-only`(.sql 없음 → 코드역추론 폴백).

## 2단계 — LLM 보강

스크립트가 만든 각 `policy-*.md` 와 `.spec/map/policy-signals.json` 을 읽고, **각 행의 앵커
(`file:line`)를 직접 열어** 결정론이 담지 못한 규범 내용을 채운다. 각 정책서 섹션 아래에
"정책 진술" 산문을 덧붙이거나 설명 셀을 채운다.

카테고리별 보강 지침:

- **권한(authz)**: 앵커의 어노테이션 **인자**(예 `@PreAuthorize("hasRole('ADMIN')")`)를 읽어
  "ADMIN 권한 필요"처럼 명문화. 표현식 원문은 근거 보유 → `[확정]`, 업무적 의미 해석은 `[추정]`.
  권한 어노테이션이 **없는** 엔트리포인트는 `.spec/map/routes.json` 과 대조해 "통제 누락 후보"로
  `[확인 필요]` 표기(있을 때).
- **검증(validation)**: 어노테이션 인자(`@Size(min=8)` 등)를 읽어 "비밀번호 최소 8자" 같은 규칙으로.
  값은 근거 보유 → `[확정]`, 금액/한도 같은 코드 내 분기 규칙은 소스를 읽어 `[추정]`.
- **데이터(data)**: CHECK 식·FK 의미를 명문화. DDL 밖 정책(보존기간 등)은 `[추정]`.
- **용어(glossary)**: 컬럼 주석을 정의로 그대로(`[확정]`). 주석이 없으면 사용처를 보고 의미를 `[추정]`.

### 보강 규약 (필수)

- **근거 강제**: `[확정]`은 반드시 `file:line` 근거를 동반한다. 근거 없이 단정하지 않는다.
- **합성 금지**: 소스에 없는 정책을 지어내지 않는다. 불명은 `[추정]`/`[확인 필요]`로 남긴다.
- **앵커 보존**: 스크립트가 만든 표의 행·근거를 지우지 않는다(보강은 덧붙이기).
- 재실행 시 1단계는 앵커를 갱신(보강분 덮어씀)하므로, 보강은 1단계 후 다시 적용한다.

## 기존 정책서 대조 (있을 때)

`.understand-anything/policy-input/<category>.md`(예: `glossary.md`, `authz.md`)에 기존 정책서가
있으면 1단계 스크립트가 자동으로 ingest·대조해 `.spec/map/policy-reconcile.json` 을 만든다:

- **준수**: 문서 항목 ↔ 코드/DB 신호 모두 존재(category+subject 매칭).
- **미정의**: 코드/DB 엔 있으나 문서에 없음(문서 누락).
- **문서에만**: 문서엔 있으나 코드/DB 신호 없음(미구현 후보).
- **위반**(값 모순): 결정론으로는 부여하지 않는다 — 신호에 인자값이 없기 때문. **이 스킬의 보강
  단계에서** `문서에만`/`준수` 항목의 앵커 소스를 열어 문서가 명시한 값과 코드 값을 비교해
  `위반`을 판정한다(예: 문서 "최소 6자" vs 코드 `@Size(min=8)`). 근거 동반 필수.

대조 결과를 정책서에 "대조" 섹션으로 덧붙이거나 항목별 상태 배지로 표기한다.

## 산출물 / 출력 해석

- `.understand-anything/doc-output/policy-*.md` — 편집·확정 가능(기존 doc-output 흐름 재사용).
- DB tier·정책 신호 건수·정책서 종류·근거율을 **한국어**로 보고한다.
