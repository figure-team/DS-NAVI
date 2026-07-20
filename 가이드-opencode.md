# DS-NAVI × opencode — 설치부터 실사용까지

opencode CLI만으로 DS-NAVI 전 기능(분석 스킬 + 대시보드 자동 실행)을 쓰는 과정.
**claude CLI는 필요 없다.** 메뉴별 대시보드 사용법(공통)은 [가이드.md](가이드.md),
Claude Code 사용자는 [가이드-claude.md](가이드-claude.md), 어댑터 내부 구조는
[opencode-plugin/README.md](opencode-plugin/README.md) 참조.

---

## 1. 전제

- **opencode 1.17+** 설치 (`opencode --version`)
- **Node.js 18+ / pnpm** (엔진 빌드·대시보드 기동용)
- ★ **쓸만한 모델 인증** — `opencode auth login`으로 프로바이더 연결(Claude Pro/Max 구독
  OAuth, API 키 등). opencode 기본 무료 모델로는 무거운 단계(인테이크 식별, 채움)가
  **완주하지 못하는 것을 실측으로 확인**했다. ChatGPT 계정(무구독) OAuth는 경량 모델만
  허용되고 무료 쿼터 제한이 있다.

## 2. 설치 — 어댑터를 분석 대상 프로젝트에

opencode는 Claude 플러그인을 직접 읽지 못하므로, 이 저장소의 어댑터 설치기가
분석 대상 프로젝트의 `.opencode/`에 커맨드 16종 + 환경 플러그인 + 엔진 번들을 깐다.

```bash
# ① 이 저장소 클론 + 엔진 빌드(1회)
git clone https://github.com/figure-team/DS-NAVI && cd DS-NAVI
pnpm install
pnpm --filter @understand-anything/core build
pnpm --filter @ktds/legacy-core build

# ② 분석 대상 프로젝트에 어댑터 설치
./opencode-plugin/install.sh dev --project <분석할 프로젝트 절대경로>
#   dev    = 레포를 심링크로 참조(레포 상주 필요, 빠른 반복)
#   vendor = 자급 복사(레포 불필요, 배포용 — 선행: ktds-legacy-plugin/scripts/vendor-deps.sh)
```

- 스킬(SKILL.md)이 갱신되면 **install.sh 재실행만으로** 커맨드가 다시 생성된다(단일 소스).

## 3. 분석 대상 프로젝트 설정 — `opencode.json` (필수)

분석 프로젝트 루트에 만든다:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "<provider/model — 인증한 프로바이더의 모델>",
  "permission": { "question": "deny" }
}
```

- `permission.question: "deny"`는 **선택이 아니라 필수** — 헤드리스 실행 중 모델이
  question 툴(사용자에게 되묻기)을 부르면 opencode가 **무한 대기**하는 알려진 버그가 있다.
  deny면 툴 호출이 거부되고 진행된다(스킬 디렉티브가 이미 "묻지 말라"를 지시).

## 4. 분석 실행

### 4-1. 대화형 (opencode TUI)

분석 프로젝트에서 `opencode`를 열고 슬래시 커맨드 실행 — Claude와 이름이 같다:

```
/understand-init
/understand-map <프로젝트 절대경로> scan
…
```

순서·산출물 표는 [가이드.md §1-1](가이드.md#1-1-분석-실행-분석-대상-프로젝트에서) 참조.

### 4-2. 헤드리스 (CI·스크립트)

```bash
cd <분석 프로젝트>
opencode run --command understand-map --dangerously-skip-permissions -- "<프로젝트 절대경로> scan"
```

- **`--command <이름>` + `--` 구분자 형식이 규약이다.** `opencode run "/understand-map …"`
  슬래시 문법은 동작하지 않고, 인자가 `-`로 시작하므로 `--` 없이는 yargs가 usage만 찍고 끝난다.
- 다른 모델로 돌리려면 `-m provider/model` 추가.

## 5. 대시보드 — 자동 실행을 opencode로

```bash
# DS-NAVI 레포에서 — UA_HEADLESS_CLI=opencode 하나로 전환된다
UA_HEADLESS_CLI=opencode \
UNDERSTAND_ACCESS_TOKEN=<토큰> GRAPH_DIR=<분석 프로젝트 절대경로> \
pnpm dev:dashboard
```

- 자동 실행 3계열(추적표 새 요청/답변 개정, 변경·영향 분석, 변경 관리)이 `claude` 대신
  `opencode run`을 스폰한다. **전제: §2 설치 + §3 설정이 그 분석 프로젝트에 되어 있을 것**
  (스폰이 분석 프로젝트 cwd로 뜨므로 커맨드 발견이 거기서 일어난다).
- 대시보드 UI에서 모델(opus/sonnet/haiku)을 고르는 기능의 티어명은 opencode 모델로 매핑이
  필요하다 — dev 서버 기동 시 env로 지정, 미지정이면 티어 선택은 무시되고 opencode 기본 모델 사용:

```bash
UA_OPENCODE_MODEL_OPUS=anthropic/claude-opus-4-5 \
UA_OPENCODE_MODEL_SONNET=anthropic/claude-sonnet-4-5 \
UA_OPENCODE_MODEL_HAIKU=anthropic/claude-haiku-4-5 …
```

- **인테이크 답변 개정** — Claude의 대화 이어받기(`--resume`) 등가물이 opencode에 없어
  생략되고, 개정 지시문이 답·기존 산출·근거 번들을 **디스크에서 다시 읽어** 같은 결과를
  낸다(라이브 검증 완료). 차이는 개정 1회당 번들 재독 토큰뿐. job tail의 `[headless-cli]`
  노트로 생략 사실이 관측된다.

## 6. Claude 대비 차이 요약

| 항목 | Claude Code | opencode |
|---|---|---|
| 커맨드 이름 | `/understand-*` | 동일 (설치 시 SKILL.md에서 생성) |
| 헤드리스 실행 | `claude -p "/cmd …"` | `opencode run --command cmd -- "…"` |
| 권한 우회 | `--permission-mode bypassPermissions` | `--dangerously-skip-permissions` + `permission.question: "deny"` |
| 대규모 팬아웃 | Workflow 도구(백그라운드 병렬) | `/understand`=번들 CLI 드라이버, map fill=청크 인라인 폴백. **screens·policy 채움은 폴백 미비**(소규모 인라인만) |
| 인테이크 개정 | ① 대화 `--resume` 이어받기 | 디스크 재독(결과 동일, 토큰 추가) |
| 모델 지정 | 티어명(opus/sonnet/haiku) | `provider/model` — 티어는 `UA_OPENCODE_MODEL_<TIER>` env 매핑 |
| 자동 갱신 훅(hooks.json) | 동작 | 미포팅(수동 재분석) |

## 7. 문제 해결 (opencode 특유 — 전부 실측)

| 증상 | 원인/조치 |
|---|---|
| `Unexpected server error`(UnknownError) | 사실상 **커맨드 미발견** — 그 프로젝트에 §2 설치가 됐는지, 스크립트 스폰이라면 `PWD` env가 실제 cwd와 일치하는지 확인 |
| 헤드리스가 출력 없이 무한 대기 | ① stdin이 열린 파이프(스크립트에서 스폰 시 stdin을 닫거나 `</dev/null`) ② question 툴 호출(§3의 deny 설정) |
| `Bad Request: model is not supported …` | 인증 계정 등급이 그 모델을 불허 — `opencode models`에 나와도 계정이 못 쓸 수 있다. 다른 모델/프로바이더로 |
| 무거운 단계가 수십 분째 안 끝남 | 무료 기본 모델 한계 — §1의 모델 인증 후 §3에 지정 |
| 스킬을 고쳤는데 반영 안 됨 | 커맨드는 설치 시점 생성본 — `install.sh` 재실행 |
| 공통 증상(403, 산출물 없음 등) | [가이드.md §4](가이드.md#4-문제-해결) |
