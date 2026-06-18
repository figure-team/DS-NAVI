# Code Atlas 재구현 진행 상황 (P0~P6)

> 계획서: `.omc/plans/code-atlas-reimpl-P0-P6.md` · 스펙: `.omc/specs/deep-interview-code-atlas-cli-plugin.md`
> 브랜치: `ktds-code-atlas` (main = UA upstream 추적) · fork 시점 태그: `ua-base`
> 이 문서는 새 세션에서 작업을 이어가기 위한 **영속 재개 지점**이다(.omc/progress.txt 는 휘발 가능).

## 핵심 불변식 (매 phase 준수)
- UA core(`understand-anything-plugin/packages/core`) **무수정**: `git diff ua-base..HEAD -- understand-anything-plugin/packages/core` = ∅ (working-tree도 0). 게이트는 `upstream/main` 아닌 **`ua-base`(fork 시점)** 기준.
- additive 오버레이만(ktds 작업은 `ktds-legacy-plugin/`, dashboard는 fork-owned).
- 모든 주장 file:line grounding (AC-9).
- 매 phase 회귀 게이트: 빌드 + 테스트 그린.
- 코드 포팅 금지(블루프린트 `/home/jk/projects/ktds/apm-project/code-atlas`는 관측 동작 참고만, R3b 골든 등가).
- **각 phase 완료 시 멈춰 사용자 확인** (사용자 지시). 커밋도 phase별 사용자 승인 후.

## 완료 (커밋됨)
| Phase | 커밋 | 내용 |
|---|---|---|
| P0 | `463ef54` | UA fork 루트 승격 + ktds-legacy-plugin 스캐폴드 + 5-manifest 2-스킴 version-sync |
| P1 | `66a843b` | 분석 코어: /understand-init + /understand-map scan(census/routes 6종/edges/slices/동적 layer) + dual-load. 메서드는 P1엔 파일단위 |
| P2 | `96fd3c1` | 도메인 지도: classify(reachability>directory>prefix) + confirm 게이트 + skeleton(S6) + 보완 E(이름제안/우선순위/cross-domain) + /understand-map plan|confirm|map |
| P3 | `590a452` | 흐름뷰: 메서드 호출그래프 엔진(8 receiver, 173테스트) + skeleton 메서드정밀화 + 대시보드 fork(FlowSpineView/FlowListView/DomainMapView/KtdsNodeDetail) + 보완 F |
| P4 | `1ff36a4` | 산출물: doc-generator(5 builders+golden) + doc-state(승인/감사/evidence enforcement) + 방법론 모듈(as-built/si-standard 3종) + 위키/HTML + STALE + Profile-W 스키마 + /understand-docs |

테스트 현황(P4 시점): legacy-core **373** + root(UA+dashboard) **226** + UA core **739** 전부 그린.

## 남은 작업
### P5 — 영향도 / Component 4 + 보완 A (의존: P1·P2·P4.6 동결 스키마 — 모두 완료)
- P5.0 jpetstore(또는 동급 MyBatis 레거시) 데모 fixture + 오라클 (impact-recall.mjs 미러)
- P5.1 impact 엔진: seed→역/정 reachability + API/DB/flow 영향 + 과도전파 게이트 + **citation 검증 재구현**(domain-map/verify의 4종 체크[path-escape/file-exist/line-range/text-match]를 impact citation shape로 재구현, `CITATION_STATUS` union만 공유)
- P5.2 A-A1 선례검색(precedents) + P5.3 A-A2 skill 3-bucket + F3 precondition(confirmed domain-map, fail-closed)
- P5.4 A-A3 선례없음 강등 + net-new CONFIRMED 차단 + 앵커 실존 검증 (L1 하드 = AC-19)
- P5.5 A-A4 `change-impact-analysis.md` "신규 생성 권장"(read-only) + P4.6 동결 Profile-W 스키마 준수
- 게이트: L1~L3 하드/L4 soft, impact-recall fixture, jpetstore 데모
- AC: AC-6·AC-6b·AC-13·AC-13b·AC-13c·AC-14·AC-19·AC-20·AC-21·AC-22·AC-25

### P6 — 횡단 / 보완 B(JPA) + 보완 D (의존: P1~P5)
- P6.0 JPA fixture(spring-petclinic 트림 + fixtures/jpa/ 오라클 + jpa-recall.mjs)
- P6.1 B: JPA 추출기(Tier A/B/C) + MyBatis 혼재 + step-layer·impact db-grounding·db-spec JPA 경로 (P4 db-spec의 reads_from/writes_to + 컬럼 enrich 여기서)
- P6.2 D-a 1-명령 온보딩 + P6.3 D-b 증분 재스캔 + D-c 커버리지 리포트
- 게이트: jpa-recall(AC-18) + 커버리지 + **전체 회귀 + AC-10(5 명령 독립 동작) 최종 합격**
- AC: AC-15·AC-15b·AC-16·AC-16b·AC-18·AC-28·AC-29·AC-30·AC-35·AC-10(최종)

## 새 세션 재개 방법
1. 작업 디렉터리: `/home/jk/projects/ktds/apm-project/code-2`, 브랜치 `ktds-code-atlas`.
2. 회귀 확인: `pnpm --filter @ktds/legacy-core test` (373) · `pnpm --filter @understand-anything/dashboard build` · `node scripts/version-sync-check.mjs` · core diff 게이트.
3. 이 문서의 "남은 작업"에서 **P5부터** 시작. 엔진 작업은 `ktds-legacy-plugin/packages/legacy-core/src/` 에 additive.
4. 패턴: 블루프린트는 관측 동작/오라클 값만 참고(코드 복사 금지), 결정론(정렬·stable JSON·타임스탬프 금지), 모든 claim에 file:line + 신뢰도(CONFIDENCE_VALUES 단일 소스).
5. phase 완료 시: architect 검증 → deslop → 회귀 그린 → 사용자 확인 후 커밋.

## 알려진 이월(P5/P6에서 해소)
- db-spec `reads_from`/`writes_to` 엣지 + JPA/MyBatis 컬럼 메타 → P6 enrich (현재 calls 엣지 기반 [추정]).
- 대시보드 픽셀(AC-4/AC-5 실제 렌더)은 헤드리스 환경 미검증 → 수동 시각 QA 필요(`pnpm --filter @understand-anything/dashboard dev`).
- 신뢰도 단일 소스: `CONFIRMED/CONFIRMED_AI/INFERRED/UNVERIFIED` (블루프린트의 CONFIRMED_HUMAN/NEEDS_REVIEW 대신; 사람확정은 doc-state로).
