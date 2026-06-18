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
| P5 | `c46978b` | 영향도/Component 4 + 보완 A: impact 엔진(reach/api/persistence/flow/engine + citation 4체크 재구현, CITATION_STATUS 중립화) + 선례검색(precedents, F3 fail-closed) + 생성예측(3버킷·선례강도강등·net-new CONFIRMED 차단·L1 게이트) + change-impact-analysis.md(read-only)+L3 골든 + Profile-W 생산(AC-25) + /understand-impact 스킬·CLI + petstore impact-recall fixture |
| P6 | (이 커밋) | 횡단/보완 B(JPA)+D: JPA 추출기(`jpa/` Tier A/B/C·BF1 암묵명명·tree-sitter 재파싱, java-facts 무수정) + step-layer JPA 신호(repo→dao/@Entity→db, AC-35) + impact jpaTables db-grounding(AC-16, schema `.default([])`로 MyBatis 골든 안전) + db-spec JPA 섹션 + MyBatis 혼재(AC-16b) + 커버리지 리포트(`coverage-report/`, AC-30) + 증분 재스캔(`incremental/` fingerprint+STALE 브리지, AC-29) + 1-명령 온보딩(/understand-onboard, AC-28) + petclinic jpa-recall fixture(62/62) |

테스트 현황(P6 시점, **전 phase 완료**): legacy-core **483**(+JPA/coverage/incremental) + root(UA+dashboard) **226** + UA core **739** 전부 그린. 게이트: core diff=∅ · version-sync OK · jpa-recall 62/62 · impact-recall 100% · chain-recall 100% · dashboard build ✓ · **AC-10(5 명령 독립 동작) 합격**(understand-init·map·docs·impact·onboard).

## 남은 작업
**없음 — P0~P6 전부 구현·커밋 완료.** 후속(로드맵, v1 비포함): AIDD(Profile W 구현)·요구사항정의서·docx/한컴 변환·비-Java 결정론 엔진·대시보드 픽셀 시각 QA(헤드리스 미검증).

## 새 세션 재개 방법(유지보수)
1. 작업 디렉터리: `/home/jk/projects/ktds/apm-project/code-2`, 브랜치 `ktds-code-atlas`.
2. 회귀 확인: `pnpm --filter @ktds/legacy-core test` (483) · `pnpm test`(226) · `pnpm --filter @understand-anything/core test`(739) · `pnpm --filter @understand-anything/dashboard build` · `node scripts/version-sync-check.mjs` · core diff 게이트(`git diff ua-base..HEAD -- understand-anything-plugin/packages/core`=∅). recall: `packages/legacy-core/scripts/{jpa,impact,chain}-recall.mjs`.
3. 패턴: 블루프린트는 관측 동작/오라클 값만 참고(코드 복사 금지), 결정론(정렬·stable JSON·타임스탬프 금지), 모든 claim에 file:line + 신뢰도(CONFIDENCE_VALUES 단일 소스).
4. **gitignore 주의:** `.spec/`·`.understand-anything/`·`coverage/` 가 전역 ignore. fixture 의 사전생성 산출물은 force-add(또는 소스에서 재생성), 신규 소스 디렉터리는 `coverage/` 같은 ignore 이름 회피(→ `coverage-report/`).
5. phase 작업 시: architect/reviewer 검증 → deslop → 회귀 그린 → 사용자 확인 후 커밋.

## 알려진 이월(P5/P6에서 해소)
- db-spec `reads_from`/`writes_to` 엣지 + JPA/MyBatis 컬럼 메타 → P6 enrich (현재 calls 엣지 기반 [추정]).
- 대시보드 픽셀(AC-4/AC-5 실제 렌더)은 헤드리스 환경 미검증 → 수동 시각 QA 필요(`pnpm --filter @understand-anything/dashboard dev`).
- 신뢰도 단일 소스: `CONFIRMED/CONFIRMED_AI/INFERRED/UNVERIFIED` (블루프린트의 CONFIRMED_HUMAN/NEEDS_REVIEW 대신; 사람확정은 doc-state로).
