# 기능 파이프라인 순서 — PIPELINE_ORDER

> 스킬(기능)별 실행 순서·데이터 의존·일관성 장치의 단일 참조 문서.
> 2026-07-14 실측 정리(각 SKILL.md 의 선행/산출 절 + 엔진 코드 기준).
> 산출물 일관성 작업의 기준 문서 — 순서가 바뀌면 이 문서를 갱신한다.

## 1. 전체 순서

> 2026-07-14 개정: **[0] /understand 은퇴**(STRUCTURE_FROM_MAP) — 구조 메뉴는 map 산출
> (도메인 4뎁스 드릴다운)로 렌더되고, 잔여 소비처용 최소 knowledge-graph.json 은 [3] map 이
> 자동 emit 한다. 새 프로젝트는 /understand-map 하나로 전 기능이 동작한다.

```
[1] /understand-map scan                                  ★ 모든 것의 뿌리
     └→ .spec/map/{census, routes, edges, slices, candidates, method-calls}.json

[2] /understand-map plan → group-input → group-classify(LLM) → confirm   ★ 사람 게이트
     └→ .spec/map/domain-plan.confirmed.json (+groups)    ← 재실행 결정론의 "닻"
        group-input: .spec/map/group-input.json (LLM 판단 입력)
        group-classify 초안: .spec/map/group-ops.suggested.json (사람 검토 후 confirm --ops)

[3] /understand-map map
     └→ domain-map.json(planDrift 드리프트 게이트 + crossDomain — 구조 메뉴 도메인 간 엣지 재원)
        + skeleton.json + domain-graph.json(구조 골격) + system-map.json + config.json
        + knowledge-graph.json(최소 결정론 KG — 코드뷰어 allowlist·검색·screens JSP 대조·
          임팩트 table 카탈로그용. 기존 /understand LLM KG 는 마커 없으면 보존+경고,
          --overwrite-kg 로만 교체. emit-kg 로 단독 재실행 가능)

[4] /understand-map bundle → fill(인라인 or fill-prep→팬아웃→fill-audit→fill-merge) → emit
     └→ .spec/map/fill/<key>.json → .understand-anything/domain-graph.json 완성
        (근거·검증 임베드 + ktdsMap.groups 투영, verify-report.json)
────────────────────────── 여기까지가 도메인 트랙(척추) ──────────────────────────

[5] /understand-screens  capture(Stage A) → fill(Stage B, 규모 게이트: 화면≤10∧주석≤60 인라인, 초과 팬아웃) → validate
     └→ .understand-anything/screens.json + screens/*.png
        선행: understanding.config.json(screens 섹션) 필수,
              routes.json 권장(핸들러 [확정] 선기입), knowledge-graph.json 권장(unmatchedJsps
              전수 대조 — [3] map 이 자동 생성하므로 순서만 지키면 항상 충족)

[6] /understand-policy  1단계(결정론 앵커) → 2단계 LLM 보강(행≤60 인라인, 초과 팬아웃)
     └→ .understand-anything/doc-output/policy-{glossary,data,validation,authz}.md
        + .spec/map/{db-schema, policy-signals}.json
        db-schema 는 map 산출 있으면 재사용. domain 모드(policy-domain-*.md)는 confirm+domain-graph 이후.

[7] /understand-rtm
     생성 모드 └→ .understand-anything/rtm.json (AS-IS 추적표)
                  선행: domain-graph + routes/MyBatis/method-calls
     --intake/--change 모드 └→ rtm-requirements.json + rtm-intake/<sid>/
                  선행: rtm.json 필수(없으면 생성 모드 먼저)

[8] /understand-impact
     └→ .spec/map/{impact, impact-verify-report}.json + impact-overlay.json + 변경영향 문서
        선행: scan 필수(fail-closed), confirm 필수(F3 생성예측·흐름 귀속)

[9] /understand-docs   └→ doc-output/ SI 문서            선행: confirm
[10] /understand-report └→ 집계 보고(coverage/risk/program-inventory 소비)
[11] /understand-dashboard └→ 전 산출물 열람·편집(사람 편집은 *-overrides.json 오버레이로 분리)
```

- `/understand-onboard` = [1]~[4]를 자동으로 이어 도는 래퍼(fill 없으면 결정론 라벨 폴백 emit).
- `/understand-init` = 초기 안내(config·scaffold). `/understand`(U-A KG)는 파이프라인에서
  은퇴 — 명령 자체는 U-A 플러그인에 존치하나 ktds 워크플로에서는 실행하지 않는다.

## 2. 낡음(스테일) 전파 방향

상류가 바뀌면 하류가 전부 낡는다:

| 상류 변경 | 낡아지는 하류 |
|---|---|
| 코드(커밋) 변경 | [1]부터 전부 — 산출물의 `gitCommit`/`generatedFromCommit`/`sourceCommit` 스탬프가 어긋남 |
| confirm 재확정(경계·그룹 변경) | skeleton·domain-graph·bundle/fill·**rtm.json**·impact 흐름 귀속·docs·정책 domain 모드·**screens 도메인 배정**(`understand-screens assign-domains` 재실행 — 배정은 확정 플랜 조인 기반, 2026-07-18 결정론 승격) |
| screens 재캡처(Stage A) | Stage B 채움 전체(mechanicalHash 변경) |
| policy 1단계 재생성(모드 생략 실행) | `<!-- policy-fill -->` 규범 진술 섹션 초기화(의도된 동작 — 조각 있으면 fill-merge 로 복원) |

## 3. 일관성 장치 현황

**있는 것**
1. map `planDrift` 게이트 — 현재 후보 ↔ 확정 플랜 어긋남 경고(낡은 플랜 재사용 금지).
2. emit `staleSkeleton` 표면화 — skeleton 생성 커밋 ≠ 현재 HEAD.
3. screens `validate` — mechanicalHash 불변 + unmatchedJsps 재계산 대조 + CONFIRMED⇒evidence≥1.
4. policy `fill-merge` — [확정] 인용 실파일 대조(불일치 제거·근거 0 이면 [추정] 강등).
5. CLI 알 수 없는 모드 거부(policy·screens, 2026-07-13) — 오호출로 인한 조용한 재생성 차단.

**없는 것(일관성 작업의 공백 지점)**
- **rtm.json·docs·impact 에 상류 스탬프 대조 게이트 없음** — confirm 재확정 후에도 옛 도메인
  기준 산출물이 경고 없이 그대로 소비된다(예: mmobile 2026-07-13 재확정 후 rtm.json 은 옛 87
  도메인 기준). 산출물별 "상류 스탬프 대조 → 낡음 보고" 일관성 감사기가 후보 해법.
  **정정(2026-07-16, P0/P0b/P0c)**: 이 공백은 여전히 유효하나 원인이 갱신됐다 — 애초 rtm.json·
  SI 문서·crud-matrix 는 `graph.gitCommit`(없는 키)을 읽어 스탬프 필드 자체가 항상 `null`이었다
  (§4 색인 참조). **그 버그는 수리돼 스탬프 필드는 이제 채워진다.** 그러나 "채워진 스탬프를 상류와
  대조해 낡음을 보고하는 게이트"는 **여전히 없다** — 스탬프가 채워지는 것과 대조 게이트가 있는 것은
  별개다. 이 구분을 흐리지 말 것(P7 미완).

## 4. 산출물 ↔ 스탬프 색인

| 산출물 | 위치 | 상류 스탬프 |
|---|---|---|
| candidates/plan/skeleton/domain-map | `.spec/map/` | `gitCommit` |
| domain-graph.json | `.understand-anything/` | `project.gitCommitHash`, `ktdsMap.generatedFromCommit` |
| system-map.json | `.understand-anything/` | `generatedFromCommit` |
| screens.json | `.understand-anything/` | `gitCommit`, `mechanicalHash` |
| policy-*.md(카테고리) | `.understand-anything/doc-output/` | `sourceCommit`(메타 — `signals.gitCommit`), 앵커 file:line |
| policy-domain-*.md | `.understand-anything/doc-output/` | `sourceCommit` — **2026-07-16 코드만 배선**(P0b, `understand-policy.mjs:203`). `gitCommitHash(projectRoot)` = 생성 시점 HEAD(도메인 모드는 `branch-scanner` 로 소스를 직접 읽으므로 HEAD 가 실제 유래). **⚠ 데모 데이터는 아직 `null`** — 위 rtm.json/SI문서 행의 "복구"와 달리 **데이터 미반영**이다. 1단계 재생성이 `<!-- policy-fill -->` 이 아니라 **앵커 표 본문에 직접 구워진** LLM 보강(커밋 `7345d330`)을 초기화해 `policy-domain-account.md` 의 "SIGNON.PASSWORD varchar(25) 평문" 미결이 소실되기 때문. 반영하려면 `fill-prep --mode domain` → 팬아웃 → `fill-merge` 전체 필요(별건 결함, 티켓 없음) |
| rtm.json | `.understand-anything/` | `gitCommit` — **2026-07-16 복구**. 이전엔 필드는 있으나 `understand-rtm.mjs:106` 이 domain-graph 의 없는 키(`graph.gitCommit`)를 읽어 항상 `null` 이었다 |
| rtm-requirements.json | `.understand-anything/` | (스탬프 없음 — 공백) |
| SI/as-built 문서 | `.understand-anything/doc-output/` | `sourceCommit` — **2026-07-16 복구**(`understand-docs.mjs:259` 동일 버그) |
| crud-matrix.json | `.spec/map/` | `gitCommit` — **2026-07-16 복구**(P0c, `export-crud-matrix.mjs:84`) 동일 버그 계보. graph 의 nodes/edges 로부터 파생되므로(먼저 확인함 — mybatisModel 은 파일을 직접 재스캔하지만 crud 행의 실체는 domain-graph.json 산출) HEAD 대신 상류 graph 의 생성 시점 커밋을 승계: `graph.ktdsMap?.generatedFromCommit \|\| graph.project?.gitCommitHash \|\| null` |
| impact.json | `.spec/map/` | 스캔 산출 기준(별도 대조 게이트 없음). **프로젝트당 1슬롯 — 요청별 보관 불가** |
