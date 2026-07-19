---
docId: si-실적요약보고서
title: SI 실적요약보고서
methodology: si-standard
status: DRAFT
sourceCommit: df7e6586febd05eb320c391f26b36b878b24111f
evidenceRate: 0.4411764705882353
---

# SI 실적요약보고서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 실적 하이라이트

기간(git 범위) 실적을 수집 수치 그대로 고정 문형에 끼운 요약입니다 — 모든 서술은
work-summary.json 의 수집 사실만 인용하며(날조 0), LLM 산문은 개입하지 않습니다.
보강 서술이 필요하면 본 문서를 편집·확정하는 방식으로 남기세요(재생성과 구분 유지).

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 기간 | 최근 1주 (2026-07-12T07:26:24.000Z ~ 2026-07-19T07:26:24.000Z] — 앵커 = HEAD 커밋 시각(벽시계 아님) | [추정] |  |
| 실적 | 커밋 15건(작성자 1명, 머지 0건), 파일 1개 변경(+3/−0) · 생성물/산출물 별도 143개(+106564/−58844) — 실적 아님 | [추정] |  |
| 변경 상위 모듈 | (root)(±3) | [추정] |  |
| 직전 기간 대비 | 커밋 9→15(+6) · 실적 라인 4→3(-1) — 직전 (2026-07-05T07:26:24.000Z ~ 2026-07-12T07:26:24.000Z] | [추정] |  |
| RTM 진척 | [미확인] 확정 원장(rtm-overrides.json) 없음 또는 기간 미해석 | [추정] |  |
| 문서 진척 | [미확인] 문서 상태 원장(.spec/docs) 없음 또는 기간 미해석 | [추정] |  |

## 산정 기준

수집·집계 규칙입니다. **문서의 기간은 생성 시점의 해석 결과를 박제**합니다 —
understand-docs 재실행은 이전 work-summary.json 의 기간을 그대로 재렌더하므로,
새 기간은 understand-report 를 다시 실행해 수집하세요.

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 날짜 축 | 커밋의 committer date — cherry-pick/rebase 후에도 "이 기간에 랜딩됐다"가 실적 기준(author date 는 원 작성 시점) | [추정] |  |
| 기간 해석 | 주간 = HEAD 커밋 시각 앵커 반개구간 (from, to] · 월간 = 달력 월 [1일, 익월 1일) **UTC 경계**(로컬 자정 아님 — 월초 인접 커밋은 오프셋만큼 이전 달로 귀속될 수 있음) · 커밋 범위 = rev-list 집합(시각 윈도 없음). 벽시계 미사용 — 같은 HEAD 면 언제 실행해도 동일 | [추정] |  |
| 실적 vs 생성물 | 분석 산출물·lock 파일 등 생성물 경로(meta.generatedPatterns)는 파일/라인 합계·모듈 귀속에서 분리 — churn 은 사실이지만 실적이 아니다. 분리분은 하이라이트에 별도 표기(침묵 제외 아님) | [추정] |  |
| 커밋 행 신뢰도 | 변경 파일 근거 보유 행 [확정](상위 3개 파일 승계) · 머지 등 파일 근거 없는 행 [추정](file:line 근거 체계의 한계, 커밋 해시로 검증 가능) | [추정] |  |
| 작성자 표기 | 커밋 표의 작성자 열은 이력 투명성 목적(git 공개 정보) — 작성자별 실적 집계·분해는 제공하지 않는다(개인 평가 오용 방지, 설계 §9) | [추정] |  |
| 모듈 귀속 | 프로그램목록(W3) 도메인 조인 우선, 미포함 파일은 최상위 디렉터리 버킷 [추정] | [추정] |  |
| 진척 원장 | RTM = rtm-overrides.json audit[](확정 이벤트 CONFIRMED/CONFIRMED_NO_EDIT, 엔티티별 최초 확정만 전환으로 집계 — 재확정 중복 방지) · 문서 = .spec/docs/*.state.json audit[]. 원장은 작업트리의 현재 상태 — 과거 시점 스냅샷 복원은 하지 않음 | [추정] |  |
| 추이 산정 | 직전 기간 = 현재 윈도와 동일 길이·인접(주간 (from−길이, from] · 월간 직전 달력 월) — 경계 커밋은 정확히 한쪽에만 귀속(이중 계상 0). 증감은 두 윈도 수집치의 파생 계산이며, RTM/문서 진척 추이도 현재 원장 상태에서 두 윈도를 각각 집계한 것(재현 경계 동일). 커밋 범위 모드는 추이 없음 | [추정] |  |
| 재현 | git 실적(커밋/파일/모듈)은 동일 커밋(HEAD)·동일 인자 재실행 시 byte 동일. **RTM/문서 진척은 원장의 현재 상태 기준** — 원장이 그새 자랐으면(확정 추가) 재실행 값이 달라진다(재현 경계, 설계 §3.4) | [추정] |  |
| 하위 디렉터리 모드 | 프로젝트가 레포 하위 경로(examples/jpetstore-6/) — git 경로 단순화로 머지 커밋이 과소 집계될 수 있음 | [추정] |  |

## 커밋 이력

기간 내 커밋(committer date 축, 최신순). 변경 파일 근거가 있는 행은 [확정],
머지 등 파일 근거가 없는 행은 [추정](커밋 해시로 git 에서 검증 가능)입니다.

| 순번 | 커밋 | 일시 | 작성자 | 제목 | 구분 | 파일 | 추가 | 삭제 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | a86bcc47 | 2026-07-19T15:55:42+09:00 | jun_kyung.lee | chore(demo): 생성물 gitignore 2건 — maven wrapper 다운로드·public census.json |  | 1 | 3 | 0 | [확정] | `.gitignore` |
| 2 | 5216166e | 2026-07-19T15:55:17+09:00 | jun_kyung.lee | chore(demo): jpetstore 변경·영향 원장·RTM 산출물 벤더링 — 자연어 탐색 e2e 실산물 |  | 7 | 3655 | 0 | [확정] | `.understand-anything/impact-candidates.json`, `.understand-anything/impact-history/32587daee428dd3c/impact-overlay.json`, `.understand-anything/impact-history/32587daee428dd3c/impact-verify-report.json` |
| 3 | 31240ffb | 2026-07-18T09:25:58+09:00 | jun_kyung.lee | chore(demo): 두 예제 screens.json 도메인 백필 — assign-domains 결정론 배정 |  | 1 | 21 | 21 | [확정] | `.understand-anything/screens.json` |
| 4 | d9373e54 | 2026-07-18T01:45:56+09:00 | jun_kyung.lee | chore(demo): jpetstore 정책서·화면설계서 산출물 — 정책 4+6종, 화면 22종(주석 369)·JSP 전수 매핑 |  | 47 | 18493 | 13 | [확정] | `.spec/map/batch-jobs.json`, `.spec/map/candidates.json`, `.spec/map/census.json` |
| 5 | 0ecf6389 | 2026-07-17T17:44:49+09:00 | jun_kyung.lee | chore(demo): jpetstore 재분석 산출물 — 완전 초기화 후 재생성(인테이크·원장 소거) |  | 139 | 65728 | 57706 | [확정] | `.spec/map/batch-jobs.json`, `.spec/map/bundle/account.json`, `.spec/map/bundle/cart.json` |
| 6 | 9aff0dff | 2026-07-17T04:19:03+09:00 | jun_kyung.lee | chore(demo): ② 라이브 재실행 산출 — 첫 after-schema.json (네이버 페이 세션) |  | 2 | 29 | 2 | [확정] | `.understand-anything/impact-history/ledger.json`, `.understand-anything/rtm-intake/b0c26823b8b39845/after-schema.json` |
| 7 | bd830835 | 2026-07-17T03:57:59+09:00 | jun_kyung.lee | chore(demo): ② 라이브 재실행 산출 — 첫 after-flow.json (네이버 페이 세션) |  | 2 | 408 | 2 | [확정] | `.understand-anything/impact-history/ledger.json`, `.understand-anything/rtm-intake/b0c26823b8b39845/after-flow.json` |
| 8 | 3c0d2133 | 2026-07-17T02:17:34+09:00 | jun_kyung.lee | chore(demo): jpetstore 라이브 인테이크 산출물 반영 — 세션 진행분 + impact 이력 2건 |  | 19 | 3434 | 137 | [확정] | `.understand-anything/impact-history/1efc46db06501569/impact-verify-report.json`, `.understand-anything/impact-history/1efc46db06501569/impact.json`, `.understand-anything/impact-history/cf32114c125c180e/impact-verify-report.json` |
| 9 | 843ff33f | 2026-07-16T20:26:43+09:00 | jun_kyung.lee | chore(demo): jpetstore 라이브 인테이크 산출물 반영 — 세션 3건 + impact 이력 2건 |  | 20 | 9702 | 1 | [확정] | `.understand-anything/impact-history/25e879d7ad79eb20/impact-verify-report.json`, `.understand-anything/impact-history/25e879d7ad79eb20/impact.json`, `.understand-anything/impact-history/4484d907d81227cf/impact-verify-report.json` |
| 10 | 10d3ac51 | 2026-07-16T03:52:43+09:00 | jun_kyung.lee | fix(crud-matrix): gitCommit 스탬프 — 없는 키 읽기 3번째 현장 (P0c) |  | 1 | 1 | 1 | [확정] | `.spec/map/crud-matrix.json` |
| 11 | db1b8134 | 2026-07-16T02:08:41+09:00 | jun_kyung.lee | chore(demo): jpetstore 산출물 재생성 — 스탬프 복구 + JSP 도메인 귀속 정정 |  | 28 | 38 | 38 | [확정] | `.understand-anything/doc-output/01_tech-stack.md`, `.understand-anything/doc-output/02_architecture.md`, `.understand-anything/doc-output/06_program-list.md` |
| 12 | 319acce2 | 2026-07-15T14:10:29+09:00 | jun_kyung.lee | fix(demo): 변경·영향 "최신 분석" 슬롯 불일치 해소 — 원장 최신 항목(Cart) 승격 |  | 2 | 76 | 216 | [확정] | `.spec/map/impact.json`, `.understand-anything/impact-overlay.json` |
| 13 | 7abde757 | 2026-07-15T14:10:29+09:00 | jun_kyung.lee | chore(demo): jpetstore impact-verify-report.json 벤더링 — 검증 배지 데이터 |  | 1 | 273 | 0 | [확정] | `.spec/map/impact-verify-report.json` |
| 14 | c9cc2c59 | 2026-07-15T14:10:29+09:00 | jun_kyung.lee | chore(demo): jpetstore census.json 벤더링 — 재스캔 판정 배지 데이터 |  | 1 | 599 | 0 | [확정] | `.spec/map/census.json` |
| 15 | 204aada5 | 2026-07-13T16:20:07+09:00 | jun_kyung.lee | chore(demo): jpetstore 팬아웃 라이브 e2e 산출물 반영 |  | 7 | 4107 | 707 | [확정] | `.spec/map/policy-reconcile.json`, `.spec/map/policy-signals.json`, `.understand-anything/doc-output/policy-authz.md` |

## 모듈별 변경

변경 파일의 모듈 귀속 집계(변경라인 내림차순). 프로그램목록(W3) 도메인 조인이
우선이며, 미포함 파일은 최상위 디렉터리 버킷 [추정]입니다.

| 모듈 | 귀속 근거 | 커밋 | 파일 | 변경라인 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| (root) | 최상위 디렉터리 [추정] | 1 | 1 | 3 | [추정] | `.gitignore` |

## RTM·문서 진척

확정 원장(audit 타임스탬프) 기준 기간 내 추정→확정 전환입니다. 원장이 없으면
[미확인]으로 표기합니다(전환 0 과 구분). 원장은 작업트리의 현재 상태이며 과거
시점 스냅샷 복원은 하지 않습니다.

| 항목 | 값 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| RTM 진척 | [미확인] | 원장 없음 또는 기간 미해석 — 0 과 구분 | [추정] |  |
| 문서 진척 | [미확인] | 문서 상태 원장 없음 — 0 과 구분 | [추정] |  |
