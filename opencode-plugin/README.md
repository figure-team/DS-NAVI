# opencode-plugin — ktds DS-NAVI + Understand-Anything opencode 어댑터

Claude Code 플러그인(`ktds-legacy-plugin` + `understand-anything-plugin`)을 **opencode CLI**에서
동일 기능으로 동작시키는 어댑터. **엔진/스크립트/대시보드 코드는 한 줄도 고치지 않는다** — opencode가
발견·실행하도록 얇은 래퍼(플러그인 + 커맨드)만 얹는다.

## 왜 어댑터만으로 되나

- ktds `.mjs` 스크립트는 이미 `import.meta.url` 로 자기 위치에서 엔진(legacy-core)·템플릿을 찾는다 → **host-agnostic**.
- U-A 스킬은 이미 멀티플랫폼 경로 해소 캐스케이드(최우선 `${CLAUDE_PLUGIN_ROOT}`)를 내장한다.
- Claude 의 `${CLAUDE_PLUGIN_ROOT}` 만 opencode 에 없을 뿐 → 플러그인의 `shell.env` 훅으로 주입하면 끝.

## 구성

```
opencode-plugin/
  plugins/atlas.js          # shell.env 훅: 셸에 ATLAS_PLUGIN_ROOT(ktds) + CLAUDE_PLUGIN_ROOT/UA_PLUGIN_ROOT(U-A) 주입
  scripts/gen-commands.mjs  # SKILL.md → opencode 커맨드 생성기(설치 시점 실행 — 단일 소스)
  install.sh / uninstall.sh # 프로젝트 스코프 설치/제거 (dev=심링크 / vendor=자급복사)
  README.md
```

**커맨드는 저장소에 두지 않는다 — SKILL.md 가 단일 소스.** 커맨드 `.md` 는 `install.sh` 가
`gen-commands.mjs` 로 **설치 시점에 SKILL.md 에서 생성**한다. 그래서 스킬을 고치거나 새로
추가하면 재설치만으로 Claude·opencode 양쪽에 반영된다(복사본 드리프트 없음).

설치 시 대상 `.opencode/` 에 깔리는 것:
- `command/*.md` — SKILL.md 에서 생성된 16개 슬래시 커맨드(`/understand`, `/understand-map` …)
- `plugins/atlas.js` — 환경변수 주입 플러그인
- `agents/*.md` — U-A 서브에이전트 9종 (`/understand` 파이프라인 디스패치용)
- `bundle` → `ktds-legacy-plugin`, `bundle-ua` → `understand-anything-plugin` (dev=심링크)

## 커맨드 (16)

| ktds (9) | U-A (7) |
| --- | --- |
| understand-init, understand-map, understand-onboard*, understand-impact, understand-docs, understand-policy, understand-rtm, understand-report, understand-screens | understand, understand-dashboard, understand-domain, understand-explain, understand-diff, understand-chat, understand-knowledge |

\* `understand-onboard` 는 ktds(가이드 1-명령 온보딩)가 U-A 동명 스킬을 대체한다(이름 충돌 회피).

## 기능 개발 시 — 양쪽 반영 규칙

| 무엇을 고치나 | opencode 반영 방법 |
| --- | --- |
| **엔진/로직** (`legacy-core` TS, `scripts/*.mjs`, `templates/`, 대시보드) | `pnpm build` 만 — dev 모드는 번들을 심링크하므로 Claude·opencode 가 **동일 dist 공유**. 자동. |
| **스킬 지시문**(`skills/*/SKILL.md`) 수정·**새 스킬 추가** | `install.sh` 재실행 — 커맨드는 SKILL.md 에서 **매번 생성**되므로 자동 반영. (새 ktds 스킬이면 `gen-commands.mjs` 의 `KTDS`/`UA` 배열에 이름 1줄 추가) |
| **환경변수 주입/훅** (`plugins/atlas.js`) | `install.sh` 재실행. |

요약: 엔진은 빌드만, 스킬은 재설치만. 별도 수기 동기화(복사본 갱신)는 없다.

## 설치 / 사용

```bash
# 선행: 엔진 빌드
pnpm install
pnpm --filter @understand-anything/core build
pnpm --filter @ktds/legacy-core build

# 설치 (dev — 레포를 심링크로 가리킴, 빠른 반복)
./opencode-plugin/install.sh dev
# 또는 배포용 자급 복사 (먼저 ktds-legacy-plugin/scripts/vendor-deps.sh 로 node_modules 평탄화)
./opencode-plugin/install.sh vendor

# 사용
cd <분석할 프로젝트>
opencode run --command understand-map "$(pwd) scan"
opencode run --command understand "$(pwd)"
opencode run --command understand-dashboard "$(pwd)"
```

## 검증 상태

opencode 1.15.13 (인증=OpenAI) 기준 실증:
- ✅ 플러그인 로드 + `shell.env` 가 셸에 `$ATLAS_PLUGIN_ROOT` 주입 (라이브)
- ✅ 번들 ktds 엔진이 opencode 셸에서 무수정 실행 → jpetstore `understand-map scan` 동일 산출
- ✅ 16개 커맨드 frontmatter YAML 유효 + opencode 발견 (understand-report/-screens 는 2026-07-08 추가 — 라이브 재검증 필요)
- ✅ 9개 U-A 서브에이전트 opencode 가 `(subagent)` 로 인식
- ⏳ `/understand` 전체 멀티에이전트 파이프라인 + 대시보드 렌더 라이브 — 비용(서브에이전트 다수) 때문에 사용자 트리거로 남김

## 미동작/주의 (Claude 대비 차이)

- U-A `/understand` **대규모 경로(배치>30)**: Claude 의 Workflow 팬아웃 대신 번들 드라이버
  `bundle-ua/skills/understand/phase2-fanout-cli.mjs` 가 배치당 headless `opencode run` 세션을
  팬아웃한다(동일 슬라이스·동일 `audit-batches.mjs` 감사·재디스패치 ≤2회). 커맨드 본문(SKILL.md)에
  안내가 포함돼 있어 별도 조작 불필요. **모델 불문** — opencode 에 설정된 모델을 그대로 쓰고,
  `--model provider/model` 로 배치 분석만 다른 모델을 지정할 수 있다. 자식 세션은
  `--dangerously-skip-permissions` 로 무인 실행된다(분석 대상 프로젝트 디렉터리 스코프).

- Claude `hooks.json`(SessionStart staleness / commit auto-update)은 아직 미포팅 → `atlas.js` 의
  `session.created` / `tool.execute.after` 이벤트 훅으로 재작성 예정.
- `argument-hint`(Claude 전용)는 opencode 가 무시 — 커맨드 본문이 인자 해석을 안내한다.
- dev 모드는 심링크라 레포 위치 이동 시 깨진다. 배포는 `vendor` 모드.
