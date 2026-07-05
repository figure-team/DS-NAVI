---
docId: si-실적요약보고서
title: SI 실적요약보고서
methodology: si-standard
status: DRAFT
sourceCommit: 382ee31ae008b21bc32097fd195caa9802aeda36
evidenceRate: 0.4883720930232558
---

# SI 실적요약보고서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 실적 하이라이트

기간(git 범위) 실적을 수집 수치 그대로 고정 문형에 끼운 요약입니다 — 모든 서술은
work-summary.json 의 수집 사실만 인용하며(날조 0), LLM 산문은 개입하지 않습니다.
보강 서술이 필요하면 본 문서를 편집·확정하는 방식으로 남기세요(재생성과 구분 유지).

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 기간 | 최근 2주 (2026-06-21T10:53:30.000Z ~ 2026-07-05T10:53:30.000Z] — 앵커 = HEAD 커밋 시각(벽시계 아님) | [추정] |  |
| 실적 | 커밋 12건(작성자 1명, 머지 0건), 파일 154개 변경(+12334/−1) · 생성물/산출물 별도 58개(+43929/−551) — 실적 아님 | [추정] |  |
| 변경 상위 모듈 | src(±3060), order(±1714), (root)(±1630) | [추정] |  |
| 직전 기간 대비 | 커밋 0→12(+12) · 실적 라인 0→12335(+12335) — 직전 (2026-06-07T10:53:30.000Z ~ 2026-06-21T10:53:30.000Z] | [추정] |  |
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
| 1 | d7074bc0 | 2026-07-05T03:53:41+09:00 | jun_kyung.lee | fix(w5): 적대적 리뷰 반영 — 안정 시나리오 id·확정 스냅샷 박제·R7 복원 계약·QA 정밀화 |  | 4 | 169 | 168 | [확정] | `.understand-anything/doc-output/rtm.xlsx`, `.understand-anything/doc-output/si-단위테스트시나리오.md`, `.understand-anything/doc-output/si-단위테스트시나리오.xlsx` |
| 2 | 678cdff9 | 2026-07-05T03:33:07+09:00 | jun_kyung.lee | feat(w5): 대시보드 시험 탭·R7 사용자 필드·R6 시각QA(P6-d~e) |  | 1 | 2 | 0 | [확정] | `.gitignore` |
| 3 | 6e7301ca | 2026-07-05T03:32:50+09:00 | jun_kyung.lee | feat(w5): RTM 테스트 시나리오 엔진+산출물(P6-b~c) — testScenarios[]·si-단위테스트시나리오·rtm.xlsx 5시트 |  | 4 | 1838 | 53 | [확정] | `.understand-anything/doc-output/rtm.xlsx`, `.understand-anything/doc-output/si-단위테스트시나리오.md`, `.understand-anything/doc-output/si-단위테스트시나리오.xlsx` |
| 4 | 34df3f75 | 2026-07-05T02:47:49+09:00 | jun_kyung.lee | fix(w4): 적대적 리뷰 반영 — 상대밴드 등급·무분산 제외·미도달 비점수화·행 신뢰도·shallow 감지 |  | 2 | 46 | 37 | [확정] | `.understand-anything/doc-output/si-위험모듈리포트.md`, `.understand-anything/doc-output/si-위험모듈리포트.xlsx` |
| 5 | c64558ef | 2026-07-05T01:17:21+09:00 | jun_kyung.lee | feat(w4): 위험 모듈 리포트(P5-b~d) — risk-report.json·si-위험모듈리포트·xlsx 병기 |  | 2 | 73 | 0 | [확정] | `.understand-anything/doc-output/si-위험모듈리포트.md`, `.understand-anything/doc-output/si-위험모듈리포트.xlsx` |
| 6 | 7eb428df | 2026-07-05T01:16:16+09:00 | jun_kyung.lee | fix(w3): 매퍼 XML 오분류 — 부분 문자열 → 루트 요소 판별(isMapperXmlDocument) |  | 4 | 4 | 8 | [확정] | `.understand-anything/doc-output/07_crud-matrix.md`, `.understand-anything/doc-output/07_crud-matrix.xlsx`, `.understand-anything/doc-output/si-프로그램목록.md` |
| 7 | e31bb89b | 2026-07-05T00:33:26+09:00 | jun_kyung.lee | fix(w7): 적대적 리뷰 반영 — 문서정보 표지·검증 스파인·stale 경고·서식·라이터 견고화 |  | 10 | 0 | 0 | [확정] | `.understand-anything/doc-output/06_program-list.xlsx`, `.understand-anything/doc-output/07_crud-matrix.xlsx`, `.understand-anything/doc-output/08_batch-list.xlsx` |
| 8 | c012eae7 | 2026-07-05T00:19:56+09:00 | jun_kyung.lee | feat(w7): xlsx 내보내기(P4-a~c) — zero-dep 결정론 라이터·문서/RTM 병기·대시보드 다운로드 |  | 10 | 0 | 0 | [확정] | `.understand-anything/doc-output/06_program-list.xlsx`, `.understand-anything/doc-output/07_crud-matrix.xlsx`, `.understand-anything/doc-output/08_batch-list.xlsx` |
| 9 | a49d9fd0 | 2026-07-04T22:44:39+09:00 | jun_kyung.lee | feat(w3): 테스트 유형 분리 + demo 데이터 재생성(W1~W3 반영) |  | 11 | 332 | 68 | [확정] | `.understand-anything/doc-output/01_tech-stack.md`, `.understand-anything/doc-output/02_architecture.md`, `.understand-anything/doc-output/06_program-list.md` |
| 10 | c13ae0cf | 2026-07-03T20:21:25+09:00 | jun_kyung.lee | feat(screens): S5 데모 데이터 — examples/jpetstore-6 화면설계서 22화면 벤더링 + sync |  | 25 | 13294 | 1 | [확정] | `.understand-anything/screen-overrides.json`, `.understand-anything/screens.json`, `.understand-anything/screens/actions_Account.action__editAccountForm.png` |
| 11 | a5958109 | 2026-06-30T15:22:23+09:00 | jun_kyung.lee | chore(demo): jpetstore RTM 인테이크 데이터 갱신(이전 세션 미커밋 잔여) |  | 2 | 969 | 217 | [확정] | `.understand-anything/rtm-requirements.json`, `.understand-anything/rtm.json` |
| 12 | dd798816 | 2026-06-24T14:46:25+09:00 | jun_kyung.lee | feat(demo): jpetstore-6 프로젝트를 examples/ 에 vendoring — 데모 단일소스화 + RTM 탭 데모 동작 |  | 172 | 39536 | 0 | [확정] | `.gitattributes`, `.gitignore`, `.mvn/extensions.xml` |

## 모듈별 변경

변경 파일의 모듈 귀속 집계(변경라인 내림차순). 프로그램목록(W3) 도메인 조인이
우선이며, 미포함 파일은 최상위 디렉터리 버킷 [추정]입니다.

| 모듈 | 귀속 근거 | 커밋 | 파일 | 변경라인 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| src | 최상위 디렉터리 [추정] | 1 | 63 | 3060 | [추정] | `src/site/es/xdoc/index.xml`, `src/site/xdoc/index.xml`, `src/site/ko/xdoc/index.xml` |
| order | 프로그램목록 도메인 조인 | 1 | 15 | 1714 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java`, `src/test/java/org/mybatis/jpetstore/mapper/OrderMapperTest.java`, `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java` |
| (root) | 최상위 디렉터리 [추정] | 3 | 14 | 1630 | [추정] | `pom.xml`, `mvnw`, `mvnw.cmd` |
| web-inf | 프로그램목록 도메인 조인 | 1 | 21 | 1536 | [확정] | `src/main/webapp/WEB-INF/jsp/order/ViewOrder.jsp`, `src/main/webapp/WEB-INF/jsp/common/IncludeTop.jsp`, `src/main/webapp/WEB-INF/jsp/order/ConfirmOrder.jsp` |
| account | 프로그램목록 도메인 조인 | 1 | 8 | 1119 | [확정] | `src/test/java/org/mybatis/jpetstore/mapper/AccountMapperTest.java`, `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java`, `src/main/java/org/mybatis/jpetstore/domain/Account.java` |
| (도메인 미지정) | 프로그램목록 도메인 조인 | 1 | 7 | 1002 | [확정] | `src/test/java/org/mybatis/jpetstore/ScreenTransitionIT.java`, `src/test/java/org/mybatis/jpetstore/mapper/ItemMapperTest.java`, `src/test/java/org/mybatis/jpetstore/mapper/ProductMapperTest.java` |
| cart | 프로그램목록 도메인 조인 | 1 | 4 | 605 | [확정] | `src/test/java/org/mybatis/jpetstore/domain/CartTest.java`, `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java`, `src/test/java/org/mybatis/jpetstore/web/actions/CartActionBeanTest.java` |
| catalog | 프로그램목록 도메인 조인 | 1 | 3 | 567 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java`, `src/test/java/org/mybatis/jpetstore/service/CatalogServiceTest.java`, `src/test/java/org/mybatis/jpetstore/web/actions/CatalogActionBeanTest.java` |
| account+cart+catalog+order | 프로그램목록 도메인 조인 | 1 | 5 | 387 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java`, `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml`, `src/main/java/org/mybatis/jpetstore/domain/Product.java` |
| account+cart+catalog | 프로그램목록 도메인 조인 | 1 | 6 | 319 | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java`, `src/main/java/org/mybatis/jpetstore/domain/Category.java`, `src/main/resources/org/mybatis/jpetstore/mapper/ProductMapper.xml` |
| .mvn | 최상위 디렉터리 [추정] | 1 | 6 | 179 | [추정] | `.mvn/wrapper/MavenWrapperDownloader.java`, `.mvn/settings.xml`, `.mvn/extensions.xml` |
| docs | 최상위 디렉터리 [추정] | 1 | 1 | 141 | [추정] | `docs/09_release/change-impact-analysis.md` |
| cart+order | 프로그램목록 도메인 조인 | 1 | 1 | 76 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java` |

## RTM·문서 진척

확정 원장(audit 타임스탬프) 기준 기간 내 추정→확정 전환입니다. 원장이 없으면
[미확인]으로 표기합니다(전환 0 과 구분). 원장은 작업트리의 현재 상태이며 과거
시점 스냅샷 복원은 하지 않습니다.

| 항목 | 값 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| RTM 진척 | [미확인] | 원장 없음 또는 기간 미해석 — 0 과 구분 | [추정] |  |
| 문서 진척 | [미확인] | 문서 상태 원장 없음 — 0 과 구분 | [추정] |  |
