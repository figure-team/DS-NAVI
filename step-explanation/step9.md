# Step 9 — 운영 매뉴얼 초안 (단계5)

> 날짜: 2026-06-09 · 브랜치 `ktds/mvp-stage1`
> 계획 단계5(매뉴얼/검토) 산출물: 설치/운영자/장애대응 가이드

---

## 0. 한 줄

실제 구현(명령·에러 메시지·파일 레이아웃)에 **정확히 근거한** 운영 매뉴얼 3종을 `docs/ktds/`에 작성했다.

## 1. 산출물

| 문서 | 내용 |
|---|---|
| `INSTALL.md` | 전제조건(Node22/pnpm/U-A 플러그인), 온라인/오프라인 설치, 디렉터리 구조, 업그레이드 |
| `OPERATOR.md` | 전체 흐름(understand→init→docs→review/approve→export), config 필드, 신뢰도 태그, 검토/승인/감사 명령, 산출 상태 파일, 운영 원칙 |
| `TROUBLESHOOTING.md` | 실제 에러 메시지별 원인·대응 |
| `README.md` | 문서 색인 |

## 2. 정확성 — 실제 코드 대조

장애 가이드의 모든 에러 문자열을 소스와 grep 대조해 **일치 확인**:
`exceeds block` · `CONFIRMED_AI without evidence` · `illegal transition` · `is corrupt (invalid JSON)` · `malformed (expected an object map/array)` · `analysis already running` · `malformed knowledge-graph` · `missing required fields` · `fingerprint drift: unknown node/edge types` · `key fields absent` · `version guard`.

→ 운영자가 실제로 마주칠 메시지와 1:1 매칭(추상적 매뉴얼 아님).

## 3. 매뉴얼이 다루는 실제 장애 시나리오

- **RUN_ABORTED([추정] 초과)** — tech-stack이 자주 걸리는 이유(언어/프레임워크 근거)와 `configFiles` 해법까지 명시
- **불법 상태 전이** — DRAFT 직접 approve 거부, review 경유 안내
- **손상 상태 파일** — doc-status/approvals.json corrupt 복구
- **잠금** — live/stale lock, 단일 워크스테이션 제약
- **U-A 스키마 드리프트** — fingerprint 경고 → UA_BASELINE 갱신
- **버전 가드 / malformed graph** — `/understand` 선행 안내

## 4. 한계

- 보안 관련 장애(secret/PII·중계·override)는 **Phase 2**에서 추가.
- 매뉴얼은 초안 — 운영자 관점 리뷰(계획 단계5 완료 기준)는 별도.

## 5. 현재 전체 그림

코어 9/9 모듈 · 115 테스트 · U-A 풀 파이프라인 실구동 · 실 OSS(jpetstore-6) E2E · 축①·③ 실연 · **운영 매뉴얼 3종**. 남은 것: `[추정]` 인터랙티브 확정 · 플러그인 실설치 검증 · 성능 측정.

## 다음(예정)

성능 측정(50K/200K) 또는 플러그인 실설치 검증 → step10.md.
