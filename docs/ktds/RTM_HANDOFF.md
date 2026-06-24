# RTM(요구사항 추적표) 핸드오프

> 마지막 갱신: 2026-06-24 · 상태: **기능 완결**(모델·생성·검증입력·UI) · 후속 항목 명시(§7).
> 설계 단일소스: `docs/ktds/RTM_TAB_DESIGN.md` · UI 레퍼런스: `docs/ktds/rtm-proto.html`.

## 1. 무엇인가
SI/ITO용 **요구사항 추적표** 대시보드 탭. 고객 자연어 요청을 받아 → 하위 기능·인수조건으로 분해/매칭 →
**AS-IS(코드 근거 `[확정]`) + TO-BE(요청 분해 `[추정]`)**를 한자리에서 추적하는 살아있는 원장.
첫 생성물은 전부 `[추정]`, 사람 컨펌으로 `[확정]`. 핵심: **LLM 은 제안만, 확정은 사람.**

## 2. 커밋 이력 (오래된 → 최신)
| 커밋 | 내용 |
|---|---|
| `b251df5` | R1 — 데이터 모델 + `buildRtm`(AS-IS) + `rtm.json` |
| `d685703` | R2 — RTM 탭 + 뷰① 기능 그리드(읽기) |
| `50e8709` | R3 — 행 단위 추정→확정 오버레이 + 편집 패널 |
| `9909ca7` | R4 — 뷰② 요구사항 + changeset + 이력 + `applyRequirements`(§1 불변규칙) |
| `41d07a7` | R5 — 인테이크(자연어 → `claude -p` 분해/매칭) |
| `b84b56a` | 스킬 `/understand-rtm` 단일 명령 통합(생성+인테이크 2모드) |
| `293698d` | v2 모델 — 9개 빈틈(AC·NFR·검증·lifecycle·메타·커버리지·의존·산출물·변경관리) |
| `41cea65` | 모델 무결성 — critic 리뷰(댕글링/드롭/순환/NFR커버리지/자연순정렬/검증축화해) |
| `c144647` | 검증 스파인 입력 경로 — 시험결과·검수·lifecycle 기록(`applyOverlay` + `POST /rtm-req-override`) |
| `dd89f56` | v2 UI — `RtmView` 를 프로토타입과 동형(3탭·AC매트릭스·NFR·커버리지·갭·검증입력) |

## 3. 아키텍처 (연산 단일소스, 전부 순수·테스트됨)
```
도메인그래프 + 스캔산출물 ──buildRtm──▶ rtm.json(AS-IS)
rtm-requirements.json(인테이크/수동) ──applyRequirements──▶ 상태·이력·rules·nfrTags 재계산
rtm-overrides.json(사람 입력) ──applyOverlay──▶ 셀교정·시험결과·검수·lifecycle 반영
                              ──computeCoverage──▶ 구현/검증/검수 + 갭 롤업
                              ──computeDiagnostics──▶ 무결성(error/warn)
```
- **핵심 파일**(legacy-core `src/rtm/`): `types.ts`(zod 모델, schemaVersion 2) · `build-rtm.ts` ·
  `apply-requirements.ts`(§1 현행 head 재계산) · `apply-overlay.ts` · `coverage.ts` · `validate.ts`(`natCmp`+진단).
- **생성 스크립트**: `ktds-legacy-plugin/scripts/understand-rtm.mjs` — 위 셋을 순서대로 적용해 `rtm.json` bake.
- **스킬**: `ktds-legacy-plugin/skills/understand-rtm/SKILL.md` — `/understand-rtm`(자연어 없으면 생성, 있으면 인테이크).
- **UI**: `understand-anything-plugin/packages/dashboard/src/components/RtmView.tsx`(탭3개+드로어2개) +
  `vite.config.ts`(엔드포인트).

### 산출물/오버레이 (`.understand-anything/`)
- `rtm.json` — 생성물(불변). `rtm-requirements.json` — 요구사항(인테이크/수동). `rtm-overrides.json` — 사람 입력
  (최상위 키=`fnId` 기능 오버레이, `_requirements`=reqId 검증/검수/lifecycle).

### 엔드포인트 (vite dev server, 토큰 게이팅)
`GET /rtm.json` · `GET /rtm-overrides.json` · `POST /rtm-override`(기능 셀 확정) ·
`POST /rtm-req-override`(요구 lifecycle/signoff/tests) · `POST /rtm-intake` · `GET /rtm-intake-status`.

## 4. §1 불변규칙 (절대 깨지면 안 됨)
1. **현행 head 재계산** — 기능 상태는 그 기능을 건드린 **가장 나중(자연순) 요구사항**의 동사로 매번 재계산.
   → REQ-2가 죽인 구현을 REQ-3가 **되살림** 가능.
2. **파괴적 삭제 금지** — 폐기 요구/고아 구현은 지우지 않고 표시만(이력 보존, 감사).
3. **고아(orphan)** — 코드엔 `[확정]` 실재하나 현행 요구 없는 구현 = 제거/대체 후보.

## 5. 데이터 모델 요지 (v2)
- **Requirement**: type(기능/비기능)·nfrCategory·nfrScope·priority·lifecycle·status(ACTIVE/SUPERSEDED)·
  supersedes/supersededBy·dependsOn·source(요청자/CR/릴리스)·changeReq·**signoff**·**acceptanceCriteria[]**·changeset.
- **AcceptanceCriterion(AC)**: id·text·kind(분기/선행/후행/예외/일반)·**fnIds[](N:M 기능 매핑)**·**tests[](PASS/FAIL/NA/UNTESTED+결함)**.
- **Function**: 4축 셀(진입점/구현/데이터/테스트, confidence+evidence)·state·origin·requirementHistory·
  **nfrTags[]**·**rules[](현행 AC 역집계)**·deliverableRefs[].
- **coverage**: requirements/functions/tests 집계 + gaps(unimplemented/orphanCode/unverified) + **byRequirement**.
- **diagnostics[]**: 무결성 error/warn.

## 6. 실행 / 검증 방법
```bash
# 빌드 + 테스트 (623 green 기준)
pnpm --filter @ktds/legacy-core build && pnpm --filter @ktds/legacy-core test
pnpm --filter @understand-anything/dashboard build

# RTM 생성 (분석 프로젝트 루트 = .understand-anything/domain-graph.json 보유)
node ktds-legacy-plugin/scripts/understand-rtm.mjs <projectRoot>

# 대시보드 dev (RTM 탭은 헤더에 "추적표"로 노출)
GRAPH_DIR=<projectRoot> UNDERSTAND_ACCESS_TOKEN=<tok> pnpm exec vite   # packages/dashboard 에서
```
**헤드리스 시각 QA**(메모리 `dashboard-headless-qa`): RTM 탭 노출엔 **유효한 domain-graph(project 메타 포함)**가
필요. impact-recall petstore fixture 는 nodes+edges 뿐이라 실패 → **dashboard `public/{domain,knowledge}-graph.json`**
을 QA 프로젝트로 복사해 사용. CJK 폰트=`/mnt/c/Windows/Fonts/NotoSansKR-VF.ttf`→`~/.fonts`(sudo 불요).
playwright-core + 캐시 chromium-1223 `executablePath` 직접 지정. `--strictPort` 충돌 시 옛 서버 먼저 kill.

## 7. 남은 작업 (우선순위)
- **라이브 인테이크 실측** — `/understand-rtm` 스킬을 ktds-legacy-plugin 설치/캐시에 동기화 후 실제 `claude -p`
  1회 실행 검증(엔드포인트·핸들러는 검증됨, 실 claude 미실행 상태).
- **ⓓ 라이브 재bake** — `POST /rtm-*-override` 후 coverage 즉시 반영 트리거(현재는 `understand-rtm` 재실행 시 반영).
- **ⓑ 릴리스 baseline 스냅샷** — `source.targetRelease` 만 존재, "Rn 합의분 vs 현행" 동결 미구현.
- **ⓒ AC 단위 구현상태 · lifecycle 자동도출** — 현재 수동.
- **R7 사용자 정의 필드** — 데이터 모델은 수용 설계됨(`rtm-overrides.json` `_fields`), UI 미구현.

## 8. 게이트 / 주의
- legacy-core 골든 스냅샷 + 코어 불변식 ∅(UA core 미변경, `ua-base` 태그 기준). RTM 변경은 전부 legacy-core/dashboard.
- 후방호환: v2 신규 필드는 zod `.default()` → 기존 산출물·인테이크 점진 채택. `safeParse` 드롭은 진단으로 가시화.
- 인테이크/오버레이 입력은 LLM·사람이라 잘못될 수 있음 → `computeDiagnostics` 가 강제 대신 **표면화**(조용한 손실 금지).
