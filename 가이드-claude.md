# DS-NAVI × Claude Code — 설치부터 실사용까지

Claude Code에서 DS-NAVI를 쓰는 전 과정. 메뉴별 대시보드 사용법(공통)은 [가이드.md](가이드.md),
opencode 사용자는 [가이드-opencode.md](가이드-opencode.md) 참조.

---

## 1. 전제

- **Claude Code** 설치·로그인 완료 (`claude --version` 확인)
- **Node.js 18+ / pnpm** (대시보드 기동용)
- 분석 대상 프로젝트가 로컬에 클론되어 있을 것

## 2. 플러그인 설치

### 2-1. 마켓플레이스 경유 (배포판 — 권장)

```bash
# 마켓플레이스 등록(1회)
claude plugin marketplace add figure-team/DS-NAVI

# 분석 대상 프로젝트 루트에서 설치 — 스코프가 중요하다(§5-1 함정 참조)
cd <분석할 프로젝트>
claude plugin install understand-anything@ds-navi --scope local
claude plugin install ktds-legacy@ds-navi --scope local
```

- `ds-navi` 마켓플레이스 = 이 저장소 **main 브랜치**. demo 브랜치 변경분은 main 반영 전까지 마켓에 안 나간다.
- 마켓 클론은 자동 갱신되지 않는다 — 구버전 화면이 뜨면 `~/.claude/plugins/marketplaces/ds-navi`에서 `git fetch && git merge --ff-only origin/main` 후 재설치.

### 2-2. 레포 직접 개발 설치 (이 저장소를 수정하며 쓸 때)

```bash
git clone https://github.com/figure-team/DS-NAVI && cd DS-NAVI
pnpm install
pnpm --filter @understand-anything/core build
pnpm --filter @ktds/legacy-core build
# 로컬 마켓플레이스로 등록 후 위와 동일하게 install
claude plugin marketplace add ./
```

## 3. 분석 실행

분석 대상 프로젝트 루트에서 Claude Code를 열고 스킬을 순서대로 실행한다.
순서·산출물 표는 [가이드.md §1-1](가이드.md#1-1-분석-실행-분석-대상-프로젝트에서) 참조. 요약:

```
/understand-init          # 0. 초기화
/understand-map           # 1. 업무지도(scan→plan→confirm→map→bundle→fill→emit)
/understand-screens …     # 2~7. 필요한 것만
```

Claude Code 특유의 동작:

- **단계별 확인 정지** — 스킬이 단계마다 멈춰 사용자 컨펌을 받는다(설계 원칙). 오래 걸리는 게 아니라 기다리는 것이니 프롬프트를 확인할 것.
- **대규모 팬아웃 자동** — map fill·screens·policy 채움과 `/understand` 배치 분석은 규모 게이트를 넘으면 Workflow 도구로 병렬 팬아웃된다(백그라운드, 디스크 감사·재디스패치 내장).
- **모델 질문 1회** — 팬아웃 4기능(understand·map fill·screens·policy)은 시작 시 모델(세션/sonnet/haiku)을 한 번 묻는다. 비대화형이면 기본값.

## 4. 대시보드

```bash
# DS-NAVI 레포에서
UNDERSTAND_ACCESS_TOKEN=<토큰> GRAPH_DIR=<분석한 프로젝트 절대경로> pnpm dev:dashboard
```

- 기동 로그의 `Dashboard URL: http://127.0.0.1:<포트>/?token=…`으로 진입(토큰 없으면 403).
- **자동 실행 3계열**(추적표 새 요청/답변 개정, 변경·영향 분석, 변경 관리)은 dev 서버가
  분석 프로젝트 cwd에서 `claude -p`를 헤드리스로 스폰한다 — 기본값이라 별도 설정 불필요.
- **인테이크 답변 개정의 대화 연속성(D1)** — ①식별을 연 claude 대화를 `--resume`으로 이어받아
  근거 번들을 다시 읽지 않는다(토큰 절약). 대화가 유실돼도 디스크 재독으로 같은 결과가 나온다.

## 5. 문제 해결 (Claude 특유)

### 5-1. ★ 인테이크가 "성공"인데 목록이 빈다 — 플러그인 스코프 함정

대시보드의 새 요청은 **분석 프로젝트 cwd로** claude를 스폰한다. 플러그인이 그 프로젝트에
설치돼 있지 않으면 job은 exit 0인데 tail에 `Unknown command: /understand-rtm`만 남고
아무것도 안 쓴다. → **반드시 분석 대상 프로젝트에서** `--scope local`(또는 project)로 설치.
`--scope local` 설정은 gitignore라 새 워크트리/클론엔 안 따라간다 — 재설치 필요.

### 5-2. 그 외

| 증상 | 조치 |
|---|---|
| 인테이크/영향분석 버튼이 무반응(404) | 정적 `preview:demo`는 읽기 전용 — 라이브 `pnpm dev:dashboard`로 실행 |
| 구버전 대시보드 화면 | 낡은 마켓 캐시 — §2-1의 마켓 클론 갱신 후 재설치 |
| 공통 증상(403, 산출물 없음 등) | [가이드.md §4](가이드.md#4-문제-해결) |
