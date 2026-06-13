---
name: understand-docs
description: 근거 기반 5종 문서 생성(기술스택/아키텍처/기능명세/API명세/DB명세) + 세분화 위키(옵시디언/대시보드) + 검토/승인/감사
argument-hint: ["[projectRoot]", "[--steps | --no-wiki | wiki [--steps] | wiki status | review --list | review --doc <f> | confirm --doc <f> --item <n> --by <handle> | approve --doc <f> --by <handle> | return --doc <f> | audit --list]"]
---

# /understand-docs

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·요약·진행 안내는 **한국어**로 한다(프로젝트 config `outputLanguage`, 기본값 `ko`). CLI 출력도 한국어다. — 영어로 답하지 말 것.

`.understand-anything/knowledge-graph.json`(U-A `/understand` 산출)을 읽어 **근거 붙은 5종 문서**를 DRAFT로 생성한다. 흐름: lock → graph 로드(version+fingerprint 가드) → 5종 생성(staging) → 근거 검증(CONFIRMED_AI에 evidence 없으면 RETURNED) → `[추정]` 비율 게이트(block 0.6 초과 시 RUN_ABORTED) → atomic publish → DRAFT 등록 + 감사.

## 생성 (결정론 skeleton)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-docs.mjs <projectRoot> <runId>            # 기본 = 5종 + 위키(4계층)
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-docs.mjs <projectRoot> <runId> --steps    # + step 계층
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-docs.mjs <projectRoot> <runId> --no-wiki   # 순수 5종(위키 도입 전과 바이트 동일)
```
이 스크립트는 **결정론 skeleton(근거·태그·구조)** 만 만든다. (최초 실행 시 엔진 자동 빌드 1회)

## 세분화 위키 (ADR-004 — 기본 동작, 옵시디언/대시보드)
**기본으로 5종과 함께** domain/flow/endpoint/table 4계층의 세분화 노트를 생성한다(`docs/feature`·`docs/api`·`docs/table`/*.md), 각 노트는 frontmatter + 근거 claim(5종과 동일 태그·cite) + `[[위키링크]]` 관계. `docs/index.md`(옵시디언 진입) + 5 허브(`docs/0N.md`)에 "세분화 항목" 링크섹션을 멱등 주입 + **대시보드용 `docs/.understand-anything/knowledge-graph.json`을 결정론으로 직접 emit**(U-A 파서/LLM 미사용, 전체 본문 포함). 5종은 `docs/0N.md` 위치 불변(상태키 보존), 대시보드에선 "00_개요" layer로 묶여 맨 위 표시.
- `--steps` → step 계층 포함(폭증 구간이라 기본 제외, 명시적으로만). 비-TTY(슬래시)에서도 `--steps` 명시했을 때만 포함.
- `--no-wiki` → 순수 5종만(루트 0N.md, 링크섹션 없음). 위키 도입 전과 **바이트 동일**.
- `wiki [--steps]` 서브커맨드 → 5종은 건드리지 않고 **위키만 재생성/갱신**(멱등). `wiki status` → 노트 수·step 포함 여부·graph 경로.

### 노트 산문 주입 (host = 너의 역할, 선택)
세분화 노트도 5종과 같은 계약으로 산문을 채울 수 있다 — 각 노트의 claim 목록만 근거로, 근거(`파일:라인`) 밖 단정·환각 금지, `[추정]`/`[확인 필요]`는 추정 명시, 한국어. (산문 미주입 시 skeleton 그대로도 유효 — 근거·관계는 이미 채워짐.)

### 읽기 동선 (주 뷰어 = U-A 웹 대시보드)
1. **대시보드 기동**: U-A dev 서버를 `GRAPH_DIR=<projectRoot>/docs` 로 띄운다 → knowledge 뷰가 `docs/.understand-anything/knowledge-graph.json`을 로드.
2. **읽기**: 노드 클릭 → **Info 탭**(NodeInfo)에서 위키링크/백링크 + 본문 마크다운(전체) 렌더. **Files 탭**은 폴더 트리 탐색(feature/api/table/00_개요).
3. **옵시디언(선택)**: `docs/` 폴더를 vault로 직접 열면 같은 Karpathy 포맷이라 그래프·백링크·로컬그래프가 그대로 동작(별도 앱, 작업 0).

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
- `approve --doc <f> --by <handle> [--force]` → UNDER_REVIEW→APPROVED, approvals.json + DOC_APPROVED (승인자는 핸들/이니셜만, 실명 미저장)
  - **승인 게이트**: `[확정(담당자)]`가 아닌 항목([추정]·[확정(AI)]·[확인 필요])이 하나라도 남으면 **승인 거부**(모두 confirm 필요). `--force`로 우회하면 강제 승인하되 approvals.json·감사에 `forced` 표기.
- `audit --list | --date <d>` → `.spec/audit/*.jsonl`

엔진: `@ktds/legacy-core`(orchestrator·kg-reader·evidence·doc-generator·doc-state·approval·audit·lock).
