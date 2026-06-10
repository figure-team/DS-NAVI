---
name: understand-docs
description: 근거 기반 5종 문서 생성(기술스택/아키텍처/기능명세/API명세/DB명세) + 검토/승인/감사
argument-hint: ["[projectRoot]", "[review --list | review --doc <f> | confirm --doc <f> --list | confirm --doc <f> --item <n> --by <handle> | approve --doc <f> --by <handle> | return --doc <f> | audit --list]"]
---

# /understand-docs

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·요약·진행 안내는 **한국어**로 한다(프로젝트 config `outputLanguage`, 기본값 `ko`). CLI 출력도 한국어다. — 영어로 답하지 말 것.

`.understand-anything/knowledge-graph.json`(U-A `/understand` 산출)을 읽어 **근거 붙은 5종 문서**를 DRAFT로 생성한다. 흐름: lock → graph 로드(version+fingerprint 가드) → 5종 생성(staging) → 근거 검증(CONFIRMED_AI에 evidence 없으면 RETURNED) → `[추정]` 비율 게이트(block 0.6 초과 시 RUN_ABORTED) → atomic publish → DRAFT 등록 + 감사.

## 생성 (결정론 skeleton)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-docs.mjs <projectRoot> <runId>
```
이 스크립트는 **결정론 skeleton(근거·태그·구조)** 만 만든다. (최초 실행 시 엔진 자동 빌드 1회)

## LLM 산문 (이 단계는 host CLI = 너의 역할)
생성된 `docs/**/*.md` 의 각 섹션에 대해, **그 섹션의 claim 목록만 근거로** 자연스러운 설명 산문을 작성해 채운다. 규칙:
- claim에 없는 사실을 지어내지 말 것. 근거(`파일:라인`) 밖의 단정 금지.
- `[추정]`/`[확인 필요]` 항목은 추정임을 명시.
- 출력 언어는 config `outputLanguage`(ko).

## 검토 / 승인 / 감사 (엔진: doc-state·approval·audit)
- `review --list` → DRAFT 목록 + [추정]/[확정(AI)]/[확인 필요] 수
- `review --doc <f> [--by <handle>]` → 검토만 시작(DRAFT→UNDER_REVIEW); TTY면 이어서 확정 세션 진입. (confirm이 자동 검토 시작하므로 필수는 아님)
- **인터랙티브 확정 세션** (`confirm --doc <f>` — **터미널에서 직접 node 실행할 때만**, 즉 stdin이 TTY): 확정 대상 목록을 보여주고 **항목 번호로 콕 집어** [확정(담당자)] 승격. DRAFT면 자동 검토 시작(UNDER_REVIEW)하므로 `review --doc` 불필요. 담당자 핸들은 세션 시작 시 1회 입력→재사용(메모리만, 디스크 미저장), 세션 중 `by <핸들>`로 변경 가능. `a`=남은 전체, `q`/Ctrl+D=종료.
- `confirm --doc <f> --list` → 확정 대상 목록만. `confirm --doc <f> --item <n> --by <handle>` → 비대화 단건 확정. `confirm --doc <f> --all --by <handle>` → 명시적 전체 확정. `--item`/`--all`도 DRAFT면 자동 검토 시작. (RETURNED/APPROVED 문서는 거부)

> ⚠️ **플러그인(슬래시)으로 confirm할 때 = 네가(host) 실행하는 것이며 stdin은 비-TTY다 → 인터랙티브 세션이 동작하지 않는다.** 절대 임의로 전부 확정하지 말 것. **사용자에게 하는 목록 안내·질문·확정 결과 보고는 모두 한국어로 한다.** 반드시 이 절차를 따른다:
> 1. `confirm --doc <f> --list` 를 실행해 확정 대상 목록을 사용자에게 보여준다.
> 2. 사용자에게 **어느 항목(들)을 확정할지**와 **담당자 핸들/이니셜**을 묻는다.
> 3. 사용자가 고른 항목만 `confirm --doc <f> --item <n> --by <handle>` 로 하나씩 확정한다.
> 4. 사용자가 **"전부/모두/전체"라는 말로 명시적으로 전체 확정**을 요청한 경우에만 `confirm --doc <f> --all --by <handle>` 를 쓴다.
>
> **요청이 모호하면**(예: "확정해줘", "이 문서 확정") `--all`을 쓰지 말고, 먼저 `--list`로 항목을 보여준 뒤 "전체입니까, 특정 항목입니까?"를 되묻는다. 절대 모호한 요청을 전체 확정으로 단정하지 않는다.
>
> (`confirm --doc <f>` 를 인자 없이 비-TTY로 실행하면 목록과 위 안내만 출력되고 아무것도 확정되지 않는다.)
  - **확정 대상 = [확정(담당자)]가 아닌 모든 claim**: [추정](근거 없음) · [확정(AI)](AI 근거 있음 → 담당자가 검증·책임 인수) · [확인 필요](사람 판단 필요 → 담당자가 검토·확정). [확정(AI)]→[확정(담당자)] 승격 시 근거(`파일:라인`) cite는 그대로 보존된다.
- `approve --doc <f> --by <handle>` → UNDER_REVIEW→APPROVED, approvals.json + DOC_APPROVED (승인자는 핸들/이니셜만, 실명 미저장)
- `audit --list | --date <d>` → `.spec/audit/*.jsonl`

엔진: `@ktds/legacy-core`(orchestrator·kg-reader·evidence·doc-generator·doc-state·approval·audit·lock).
