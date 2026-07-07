# 대규모 `/understand` — Phase 2 Workflow 팬아웃 설계

> 상태: **v2.1 — 기능 완결(구현+jpetstore 실증+SKILL.md 게이트, 2026-07-07)**, 잔여 = egov 대규모 실증(보류) · 브랜치 `worktree-understand-scale`(demo/jpetstore-6 기반, 2368401)
> 관련 메모리: `understand-scale-context-fix`, `egov-full-understand-run`, `call-edge-resolver`, `branch-workflow-demo-main`
> v1→v2: critic 리뷰(REVISE 판정)의 C1·M1~M5 반영. 변경 요지는 §9 리비전 로그.

## 0. 한 줄 요약

대규모 `/understand --full`(수백 배치) 실행 시 **메인 대화 context가 폭증**하는 문제를, Phase 2 배치 디스패치를 **Workflow 툴 팬아웃**으로 옮겨 해결한다. 종합 로직(merge)·리졸버·스키마는 **무변경**. 소규모와 incremental은 기존 인라인 경로를 유지한다(게이트).

---

## 1. 문제 정의

### 1.1 증상
`examples/egovframe-common-components` 전체 분석 = 6101파일 → **389배치**(`egov-full-understand-run`). 이때 **메인 오케스트레이터의 대화 context가 폭증**한다.

### 1.2 원인 (코드 근거)
Phase 2는 오케스트레이터(메인 루프)가 배치를 롤링으로 Agent 디스패치한다. 배치당:

- **디스패치 프롬프트에 배치 페이로드를 인라인**으로 붙여넣음 — `skills/understand/SKILL.md:328~341`이 `batchImportData`(import 해소 결과) + `neighborMap`(교차배치 이웃) + 파일목록을 프롬프트 본문에 삽입.
- **서브에이전트 완료 ack 텍스트**가 메인 루프에 남음(서브에이전트 내부 토큰은 격리되지만 **반환 텍스트는 메인에 누적**).

→ (프롬프트 + ack) × 389 ≈ **~778 왕복이 전부 메인 context에 축적**. + SKILL.md 원문 고정 + merge stderr 덤프 유입.

### 1.3 핵심 관찰 — "종합"은 반환값이 아니라 디스크로 일어난다
각 file-analyzer는 결과를 **디스크에 씀**(`intermediate/batch-<i>.json`, `SKILL.md:326`). 종합은 별도 스크립트 `merge-batch-graphs.py`가 **디스크의 `batch-*.json`을 전부 읽어** 수행(`SKILL.md:349~363`). 즉 **서브에이전트가 메인으로 반환하는 텍스트는 종합에 쓰이지 않는 ack일 뿐**이다.

> 결론: 서브에이전트가 필요한 이유는 **토큰 격리**(6101파일을 한 context에 못 담음)이지 "결과 종합" 때문이 아니다. 따라서 Agent→Workflow 전환은 종합 로직에 영향을 주지 않는다. (critic 검증 통과)

### 1.4 왜 "인라인 유지 + 슬라이스 참조 + 초간결 ack"만으로는 부족한가 (Skeptic 대안 반박)
페이로드를 슬라이스로 빼고 ack를 줄이면 context는 상당 부분 잡힌다. 그러나:
1. **389회 tool-use/tool-result 왕복 오버헤드**는 ack를 아무리 줄여도 메인 루프에 남는다(왕복 자체가 구조적 누적).
2. **메인 세션이 수 시간 포그라운드로 묶이는 문제**는 인라인 경로로는 해결 불가 — Workflow는 백그라운드 실행이 기본.
3. 디스크 감사·재투입(egov에서 수동 3회)을 **하네스 안 Audit 단계로 자동화**할 수 있는 건 Workflow뿐.
단, 이 대안의 핵심 아이디어(슬라이스 참조·간결 ack)는 본 설계의 Workflow 경로에 그대로 흡수한다.

---

## 2. 결정 사항 (확정)

| # | 결정 | 근거 |
|---|---|---|
| D1 | **A안 — `skills/understand/SKILL.md` 직접 수정** | `/understand` 핵심 스킬은 U-A 플러그인에만 존재(ktds-legacy엔 없음). 이미 `51a0649`(Phase 3.5 call-edge 리졸버)로 같은 성격의 스케일 대응을 SKILL.md에 넣은 선례. `packages/core` 불변식(`ua-base`)과 무관. |
| D2 | **게이트 O** — full 분석에서 `totalBatches > THRESHOLD`일 때만 Workflow, 그 외(소규모·**incremental 전부**)는 기존 인라인 | 소규모는 context 부담이 애초에 없고 Workflow 고정 오버헤드가 손해. incremental은 batchIndex가 희소해 팬아웃 전제와 충돌(§3.5). |
| D3 | **재개 = 수동** | egov 사례가 "3회 수동 복구로 무손실 완주". 내용 검증 스킵 가드(§4.1)로 재개 비용 ≈ 0. 무인 자동재개는 방치·토큰소모 위험. |
| D4 | **종합/merge/리졸버/스키마 무변경** | 데이터 파이프라인은 디스크 기반이라 오케스트레이션 교체와 독립. ※ v2에서 `compute-batches.mjs`는 무변경 목록에서 **제외**(C1 시드 1줄, §4.2). |
| D5 | 업스트림 sync는 아주 가끔 → A안 SKILL.md 드리프트 충돌 비용을 그때 감수 | 사용자 결정. |

### 2.1 정정 — 동시성 이득 없음
개발 머신은 **논리 8코어**(i5-10210U, 물리 4×2). Workflow 동시성 캡 = `min(16, nproc-2)` = **6**. 현재 Phase 2가 5 동시 → **5→6, 사실상 차이 없음**. 따라서 **"Workflow로 빨라진다"는 근거는 폐기**한다. Workflow의 가치는 아래 3가지뿐:

1. **메인 context 무오염** (1순위 목적)
2. **백그라운드 비블로킹**
3. **내용 검증 스킵 가드로 한도 초과 시 무손실 재개** (§4.1 — v2에서 "존재 여부 스킵"을 폐기하고 재정의)

> 벽시계 단축은 이 설계 범위 밖(물리 코어 4개 상한). 필요 시 별도 축 — 더 강한 머신/원격 실행, 또는 배치 크기↑로 배치수↓.

---

## 3. 목표 아키텍처

### 3.1 데이터 흐름

```
[Phase 1.5]  compute-batches.mjs (+고정 시드, §4.2) → intermediate/batches.json
             slice-batch-inputs.mjs (§4.3)
               ← batches.json + scan-result.json + CLI 인자(projectRoot, skillDir, agentDefPath, languageDirective)
               → intermediate/inputs/batch-input-<i>.json   (배치별 "진짜" 자기완결 슬라이스;
                 inputs/ 서브디렉토리 격리 — merge의 batch-*.json 글롭과 충돌 방지, 실증에서 발견·수정)

[오케스트레이터(메인 루프)]
   full 분석 && totalBatches > THRESHOLD ?
     ├─ 아니오 → 기존 인라인 Agent 경로 (변경 없음; incremental은 항상 이쪽)
     └─ 예     → Workflow({ script: phase2-fanout.workflow.js,
                            args:{ projectRoot, intermediateDir, totalBatches } })
                  ↑ args 초소형. 배치 페이로드·프로토콜·경로 상세는 전부 슬라이스에 베이크(§4.3)

[Workflow 하네스 (백그라운드, 캡 6 동시)]
   analyze(i) = agent(
      "절대경로 <intermediateDir>/inputs/batch-input-<i>.json 을 읽어라.
       그 안의 agentDefPath(절대경로)의 file-analyzer 프로토콜을 그대로 수행하라.
       스킵 가드(§4.1): 유효한 기존 산출이 슬라이스 files[]를 커버하면 재분석 없이 즉시 ack.
       산출 후 batch-<i>.done 센티널 기록.
       응답은 {batchIndex, analyzedFiles:[...], nodes:N, edges:M, skipped:bool} ack만.")
   pipeline([1..totalBatches], analyze)        // full 경로는 batchIndex 1..N 연속 보장(§3.5)
   → 389 디스패치 + ack 전부 하네스 내부에서 소멸
   → Audit 단계(§4.4): 산출 파일셋 ↔ 슬라이스 기대 파일셋 대조, 미완/불일치 재투입(배치당 최대 2회)
   → 반환 { analyzed, skippedByGuard, failed:[{batchIndex, reason}] }   (1건, 초소형)

[오케스트레이터]  ← 반환 1건. failed[]는 $PHASE_WARNINGS에 편입(무음 드롭 금지, SKILL.md:830)
                 → merge-batch-graphs.py (무변경)
                 → resolve-call-edges.mjs  Phase 3.5 (무변경)
                 → Phase 4~7 (무변경)
```

### 3.2 왜 Workflow 스크립트의 "디스크 접근 불가"가 문제되지 않나
Workflow 스크립트 본문은 파일시스템 접근이 없다. 그러나 **스크립트가 소환하는 서브에이전트는 Bash/Read/Write 풀 툴 보유**. 배치 페이로드는 스크립트도 메인도 거치지 않고, **각 에이전트가 자기 슬라이스를 디스크에서 직접 읽는다**. args로는 경로·개수 같은 초소형 메타만 전달.

### 3.3 왜 `agentType:'file-analyzer'`를 안 쓰나 + 경로 규칙
file-analyzer는 `plugin.json`에 `agents` 필드 없이 **디렉토리 관례로만 존재** → Workflow `agentType`으로 이름 해소되는지 **불확실**. 우회책: 일반 에이전트에게 **"슬라이스의 `agentDefPath`(절대경로)를 읽고 그 역할을 수행하라"**고 지시.

**절대경로 원칙(M5)**: 워크플로 서브에이전트의 cwd는 보장되지 않는다(통상 분석 대상 PROJECT_ROOT이지 플러그인 루트가 아님). 상대경로 `agents/file-analyzer.md`는 해소 실패. 오케스트레이터가 이미 해소해 둔 `$PLUGIN_ROOT`(SKILL.md:77~119)에서 `agentDefPath = $PLUGIN_ROOT/agents/file-analyzer.md`를 유도해 **슬라이스에 베이크**한다. 설치 환경에선 이 경로가 플러그인 캐시(`~/.claude/plugins/cache/.../agents/file-analyzer.md`)를 가리키며, 존재가 확인됨. 슬라이스 내 모든 경로(projectRoot, skillDir, agentDefPath)는 절대경로.

### 3.4 재개 메커니즘 3종의 우선순위
겹치는 재개 수단이 3개 있으므로 권위 순서를 고정한다:
1. **디스크 스킵 가드(§4.1)가 유일한 권위** — 어떤 경로로 재기동되든 최종 판단은 디스크 내용 검증.
2. `resumeFromRunId`는 **같은 세션 내** 편의 캐시일 뿐(하네스 프로세스 상태에 의존, 세션 넘어가면 무효 가정). 캐시가 재실행을 결정해도 에이전트의 스킵 가드가 이중으로 막는다.
3. Audit 재투입은 가드 위에서 동작하는 보정 루프.
→ 세션이 죽으면 **새 세션에서 `/understand` 재실행**(D3 수동)이 표준 재개 경로이고, 그때 하네스 캐시는 전제하지 않는다.

### 3.5 Workflow 경로는 full 분석 전용 (M2)
- **full 경로**: `compute-batches.mjs`가 batchIndex를 1-base 연속으로 재부여(`compute-batches.mjs:328,491`) → `pipeline([1..N])` 전제 성립.
- **incremental 경로**(`--changed-files`): 변경 배치만 필터하되 **batchIndex 재부여 없음**(희소, `compute-batches.mjs:572~577` "No renumbering") + `batch-existing.json`이라는 비-배치 파일이 merge 대상에 합류(SKILL.md:396). `1..N` 순회·존재 감사 전제가 모두 깨짐.
- → **incremental은 배치 수와 무관하게 항상 기존 인라인 경로**. 변경 배치가 THRESHOLD를 넘는 대규모 incremental은 드물고, 그 경우 사용자에게 full 재분석을 권고하는 안내만 추가한다.
- `batch-existing.json`·`*.done`은 스킵 가드/Audit의 배치 슬롯 집계에서 제외하고, 슬라이스(`inputs/batch-input-*.json`)는 서브디렉토리 격리로 merge 글롭 자체에 안 걸린다.

---

## 4. 신규/변경 산출물

| 산출물 | 유형 | 내용 |
|---|---|---|
| `skills/understand/compute-batches.mjs` | **수정(1줄급)** | Louvain 호출에 고정 시드 PRNG 주입(§4.2). 그 외 무변경. |
| `skills/understand/slice-batch-inputs.mjs` | **신규 스크립트** | 자기완결 슬라이스 생성(§4.3). Phase 1.5 말미에 실행. |
| `skills/understand/phase2-fanout.workflow.js` | **신규 워크플로 스크립트** | `pipeline([1..N], analyze)` + 스킵 가드 프롬프트 + Audit(상한 2회) + 반환 스키마(§3.1). |
| `skills/understand/SKILL.md` Phase 2 | **수정** | 게이트 분기: full && `totalBatches > THRESHOLD`일 때만 Workflow 경로 지시(스킬 지시 = Workflow opt-in 충족). 소규모·incremental 텍스트는 기존 그대로. failed[] → $PHASE_WARNINGS 편입 지시. |
| `docs/ktds/UNDERSTAND_SCALE_WORKFLOW_DESIGN.md` | 본 문서 | — |

**무변경 확인**: `merge-batch-graphs.py`, `resolve-call-edges.mjs`, `extract-structure.mjs`, `packages/core/src/schema.ts`. (v1에 있던 `compute-batches.mjs`는 목록에서 제외 — C1)

### 4.1 스킵 가드 — 존재 검사가 아니라 **내용 검증** (C1·M3)
v1의 "`batch-<i>.json` 있으면 스킵"은 두 방식으로 깨진다: ① batchIndex↔파일 매핑이 실행 간 흔들리면 **다른 파일 구성의 배치를 무음 스킵**(분석 누락), ② 세션한도로 **쓰다 만 JSON/누락 파트**가 스킵을 오염. v2 가드:

```
skip(i)  ⇔  batch-<i>.done 센티널 존재
          ∧ batch-<i>.json(또는 -part-* 전부)이 유효 JSON으로 파싱
          ∧ 산출물의 파일 경로 합집합 ⊇ inputs/batch-input-<i>.json의 files[] 경로 집합
불일치/파싱실패/센티널부재 → 기존 산출·센티널 삭제 후 재분석(덮어쓰기)
```

- **무손실 보장이 가드에서 나온다**: 파티션이 어떤 이유로든(코드 변경·비결정성 잔재) 흘러도, 파일셋 불일치 = 재분석이므로 **어떤 드리프트에서도 조용한 누락이 불가능**. batchIndex는 효율 키일 뿐 정합성 키가 아니게 됨. egov에서 실증된 "경로 기반 감사"의 원리를 그대로 승계.
- **센티널**: 에이전트는 모든 파트 기록·자가검증 후 마지막에 빈 파일 `batch-<i>.done`을 쓴다. 멀티파트 중단(part-1만 존재) 시 센티널이 없으므로 재분석. 센티널(`.done`)은 merge의 `*.json` 글롭에 안 걸림. **슬라이스는 `intermediate/inputs/`에 격리** — v2의 "슬라이스는 merge에 안 걸림" 주장은 실증에서 틀린 것으로 판명(intermediate/ 평면 배치 시 `batch-*` 글롭에 걸려 "dropped 16 files" 경고 발생, 드롭 자체는 안전하나 노이즈)되어 서브디렉토리로 구조적 해결.
- `--force` 재분석은 기존처럼 intermediate 초기화로 처리(가드와 충돌 없음).

### 4.2 배치 파티션 결정론 — Louvain 시드 (C1)
`compute-batches.mjs:275`는 `louvain(g)`를 옵션 없이 호출하고, `graphology-communities-louvain`의 기본 `rng`는 `Math.random`(라이브러리 index.js:56) → **파티션이 실행마다 달라질 수 있음**. 고정 시드 PRNG(예: mulberry32(고정상수))를 `louvain(g, {rng})`로 주입해 같은 입력 → 같은 파티션을 보장한다.

- 효과: 재개 시 재계산돼도 batchIndex 매핑이 유지 → §4.1 가드의 **스킵 적중률**이 확보됨(가드가 정합성을, 시드가 효율을 담당).
- 한계(명시): scan-result.json 자체가 재스캔(LLM 에이전트) 간 미세하게 달라지면 파티션도 달라질 수 있다. 그 경우에도 §4.1 가드 덕에 손실은 없고, 달라진 배치만 재분석 비용이 든다. 결정론은 best-effort, 정합성은 가드가 절대 보장 — 이 역할 분담이 v2의 핵심.

### 4.3 슬라이스 스키마 — 진짜 자기완결 (M1)
`batches.json`에는 `projectName/languages/languageDirective/projectRoot/skillDir`가 **없다**(`compute-batches.mjs:583~590`). file-analyzer 프로토콜은 입력 JSON에 `projectRoot`(file-analyzer.md:45), 실행에 `<SKILL_DIR>/extract-structure.mjs`(:71)를 요구한다. 따라서 슬라이스 생성기는:

```
입력:  batches.json (batchIndex, files, batchImportData, neighborMap)
     + scan-result.json (projectName, projectDescription, languages)
     + CLI 인자: --project-root --skill-dir --agent-def-path --language-directive('' 허용)
출력:  inputs/batch-input-<i>.json =
  { batchIndex, totalBatches,
    projectRoot, skillDir, agentDefPath,            // 전부 절대경로 (§3.3)
    projectName, projectDescription, languages, languageDirective,
    files[], batchImportData{}, neighborMap{} }
```

오케스트레이터는 Phase 0~1에서 이미 4개 CLI 인자를 전부 메모리에 갖고 있다($PROJECT_ROOT, SKILL_DIR/$PLUGIN_ROOT, $LANGUAGE_DIRECTIVE). 슬라이스가 자기완결이므로 Workflow args와 에이전트 프롬프트에는 배치 상세가 일절 들어가지 않는다.

- 슬라이스를 두는 이유(단순 batches.json 재참조 대비): egov급이면 batches.json이 수 MB(전 배치 neighborMap 포함) — 배치당 읽기 범위를 슬라이스로 **상한**하고, jq/node -e 추출 실수 여지를 없앤다. 상수 필드 중복은 배치당 수백 바이트로 무시 가능.

### 4.4 Audit — 종료 상한 + 파일셋 대조 (M4)
- 각 라운드: `intermediate/`의 산출·센티널을 스캔해 **미완 배치**(센티널 부재∨파싱실패∨파일셋 미달)를 식별 → 해당 batchIndex만 재투입.
- **배치당 재투입 최대 2회**. 초과 시 그 배치는 `failed[{batchIndex, reason}]`로 확정하고 루프 종료(무한 재투입 차단 — 예: 파서를 항상 깨뜨리는 파일).
- 대조 기준은 ack가 아니라 **디스크 산출물 vs 슬라이스 files[]**(ack는 신뢰하지 않음 — 3/5 파일만 분석하고 유효 JSON을 쓴 부분 실패를 잡기 위함).
- `failed[]`는 반환 페이로드로 올라가 오케스트레이터가 `$PHASE_WARNINGS`에 편입(SKILL.md:826~830 "무음 드롭 금지"와 정합). merge는 존재하는 배치로 진행하되 경고가 검증 단계까지 전파된다.

---

## 5. 임계값(THRESHOLD)

- 게이트 조건: **full 분석 ∧ `totalBatches > 30`** (경계 포함 여부 명시: 30 이하 = 인라인, 31부터 Workflow).
- 근거: 체감상 메인 context가 눈에 띄게 쌓이는 지점. jpetstore(~25)는 아래·egov(389)는 위로 확실히 갈림.
- 확정은 §7 실증 후.

---

## 6. 리스크

| ID | 리스크 | 대응 |
|---|---|---|
| **R1** | 일반 에이전트가 `file-analyzer.md`를 읽고 프로토콜을 정확히 수행하는가 (agentType 미등록 우회책) | **jpetstore(~25배치)로 실증** 후 SKILL.md 확정. 산출 그래프를 기존 인라인 경로 결과와 대조(노드/엣지 수·검증 issues). |
| R2 | tree-sitter WASM(`extract-structure.mjs`)이 워크플로 서브에이전트 bash에서 동작 + cwd/PATH·node 해소가 메인 세션과 다를 가능성 | 절대경로 원칙(§3.3)으로 cwd 의존 제거. node 해소는 실증(§7-4)에서 확인. |
| R3 | 스플릿 출력(`batch-<i>-part-<k>.json`) 명명 규칙 위반 시 merge 정규식이 조용히 드롭 | 프로토콜을 file-analyzer.md 그대로 따름 + Audit이 디스크 파일셋 기준으로 대조(§4.4)하므로 잘못된 명명은 "미완 배치"로 검출·재투입됨. |
| R4 | Workflow 백그라운드가 세션 경계·사용량 한도를 넘김 | 내용 검증 가드 + 센티널(§4.1)로 새 세션 수동 재개(D3). 쓰다 만 산출물은 가드가 자동 폐기. |
| R5 | SKILL.md 두 경로 공존으로 유지보수 표면 증가 | 소규모·incremental 경로는 **기존 텍스트 그대로**, Workflow 경로만 추가. incremental 비적용(§3.5)으로 분기 수를 최소화. |
| R6 | scan-result 비결정성(LLM 재스캔)으로 파티션 드리프트 → 재개 시 재분석 비용 증가 | 손실은 §4.1 가드가 차단(정합성 보장). 비용 증가만 감수 — 시드(§4.2)로 대부분 완화. |

---

## 7. 실행 계획 및 실증 결과

1. **설계 문서** — ✅ v2(critic 리뷰 반영) → v2.1(실증 반영).
2. **`compute-batches.mjs` 시드 주입** — ✅ mulberry32(0x9e3779b9). jpetstore 158파일 2회 실행 → batches.json·call-graph.json **sha256 바이트 동일** 확인.
3. **`slice-batch-inputs.mjs`** — ✅ 16슬라이스, 자기완결(절대경로·directive 베이크) 검증.
4. **`phase2-fanout.workflow.js` + `audit-batches.mjs`** — ✅ 작성·문법 검증.
5. **jpetstore 실증(R1/R2)** — ✅ **통과(2026-07-07)**:
   - **1차 팬아웃**(run wf_1e469b00-27b): 16배치, ~14분, 19에이전트/1.18M 서브에이전트 토큰. **R1 검증** — 일반 에이전트가 file-analyzer.md를 읽고 프로토콜 수행, 산출 명명·스키마 전부 준수. **R2 검증** — extract-structure.mjs(tree-sitter WASM) 워크플로 하네스에서 정상. **M4 실전 검증(비계획)** — batch:9가 API 서버 오류로 사망했으나 Audit이 디스크에서 검출·재투입해 최종 `analyzed:16, failed:[]`.
   - **merge**: 347노드/557엣지(재merge 후 349/562), vendored(247/316) 대비 방향성 정상(이후 추가된 docs/xlsx 포함 158파일 전량이라 증가가 맞음). Phase 3.5 리졸버 정상.
   - **재개 가드 실증**(run wf_24543e88-176): batch-2 산출물 삭제(세션 사망 시뮬레이션) 후 재실행 → **`skippedByGuard:15, analyzed:16, failed:[]`**, ~4.7분/0.47M 토큰. 내용 검증 가드·수동 재개(D3) 동작 확정.
   - **메인 context**: 두 실행 모두 메인 대화에는 Workflow 호출+완료 알림 각 1건만 유입 — 1순위 목표 달성.
   - **실전 발견 2건 수정**: ① 슬라이스가 merge `batch-*` 글롭에 걸림 → `inputs/` 격리(§4.1) ② Workflow args가 JSON 문자열로 도착하는 호스트 대응 → 스크립트에 양쪽 허용 방어.
   - THRESHOLD=30 유지(16배치 소요 ~14분 기준, 30배치≈인라인 왕복 60회 상한으로 타당).
6. **SKILL.md Phase 2** 게이트 분기 반영 — ✅ Scale gate(>30 → Workflow route) + 인라인 경로 소제목 분리, incremental 항상 인라인 명시, failed[]→$PHASE_WARNINGS, Workflow 미가용 플랫폼 폴백(인라인) 명시. 배포 SKILL.md에 리포 외부 문서 참조는 넣지 않음(main lean에 docs/ktds 부재).
7. **egov 389배치 실증** — ⏸ **보류(2026-07-07 사용자 결정)** — 실제 대규모 실행 시점에 자연 검증.
8. **커밋** — demo/jpetstore-6 기반 워크트리 브랜치에 커밋. main 반영은 관례대로 기능 커밋 cherry-pick.

---

## 8. 열린 항목

- [x] THRESHOLD = 30 (§7-5 실증 근거로 확정)
- [x] 서브에이전트 cwd — 절대경로 원칙으로 실증 통과(R2 포함)
- [x] SKILL.md Phase 2 게이트 반영(§7-6)
- [ ] egov 389배치 실증 — 보류, 다음 대규모 실행에서 자연 검증(§7-7)
- [ ] `slice-batch-inputs.mjs`를 `compute-batches.mjs`에 1-pass 통합할지(분리 유지가 기본)
- [ ] 벽시계 단축은 범위 밖 — 향후 원격 실행/배치크기 튜닝은 별도 과제

---

## 9. 리비전 로그

| 버전 | 내용 |
|---|---|
| v1 | 초안: Workflow 팬아웃 + 존재 기반 멱등 스킵 + 게이트 + 수동 재개 |
| v2 | critic 리뷰(REVISE) 반영 — **C1**: 존재 스킵 폐기 → 내용 검증 가드(§4.1) + Louvain 고정 시드(§4.2), compute-batches를 무변경 목록에서 제외. **M1**: 슬라이스 스키마에 projectRoot/skillDir/agentDefPath/projectName/languages/languageDirective 베이크, scan-result.json+CLI 인자 소싱(§4.3). **M2**: Workflow 경로 full 전용 명시, incremental 항상 인라인, batch-existing.json 제외(§3.5). **M3**: 유효 파싱+`.done` 센티널(§4.1). **M4**: Audit 재투입 상한 2회+디스크 파일셋 대조, failed[]→$PHASE_WARNINGS(§4.4). **M5**: 절대경로 원칙(§3.3). Minor: THRESHOLD 경계 명시(§5), 재개 3종 우선순위(§3.4), 슬라이스 존치 사유(§4.3), Skeptic 대안 반박(§1.4). |
| v2.1 | 구현+jpetstore 실증 반영(§7-5) — 슬라이스를 `intermediate/inputs/`로 격리(merge `batch-*` 글롭 충돌, 실전 발견), 워크플로 스크립트에 args 문자열/객체 양쪽 방어, 결정론 sha256 검증 통과, R1·R2·재개 가드·M4 재투입 실전 검증 완료, THRESHOLD=30 확정. |
