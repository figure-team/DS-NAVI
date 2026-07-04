---
docId: si-위험모듈리포트
title: SI 위험모듈리포트
methodology: si-standard
status: DRAFT
sourceCommit: null
evidenceRate: 0.45714285714285713
---

# SI 위험모듈리포트

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 산정 기준

risk-report.json(W4 결정론 스캔)의 지표 정의·가중치·정규화 규칙입니다.
**위험 점수는 프로젝트 내 상대 순위(백분위 합산)이며 절대 품질 판정이 아닙니다** —
프로젝트 간 점수 비교는 무의미하고, 가중치는 휴리스틱이므로 점수는 순위로만 읽으세요.
등급(상/중/하)도 상대 밴드(점수 상위 10%/30%)의 편의 구분입니다.
미도달은 점수에 넣지 않고 플래그로만 표기합니다 — 도달성 분석이 뷰 forward(JSP 등)를
추적하지 못해 오탐이 섞일 수 있어, 데드코드 판정은 사람 확인이 필요합니다.
전 파일 동일값(무분산) 지표는 랭킹 변별 기여가 없어 합산에서 제외하고 §지표 커버리지에
표기합니다. git 변경빈도는 분석 시점 커밋(gitCommit 앵커) 기준 전체 이력 — 동일 저장소
상태(동일 커밋·전체 이력·clean 작업트리)에서 재실행하면 byte 동일(결정론)입니다.

| 항목 | 산정 방법 | 가중치 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 복잡도 | 순환복잡도 근사(java AST): 메서드 수 + 결정포인트(if/for/while/do/catch/삼항/case/&&/\|\|). 비 java 는 미측정 [미확인] — 백분위는 측정(java) 집합 내 순위 | 0.25 | [추정] |  |
| 변경빈도 | git 전체 이력에서 파일별 변경 커밋 수(git log --numstat, rename 미추적·shallow clone 은 미측정 처리). 변경 라인은 참고치 | 0.25 | [추정] |  |
| LOC | 파일 라인 수(wc -l 관례, 프로그램목록 승계) | 0.15 | [추정] |  |
| 팬인 | 이 파일에 의존하는 서로 다른 파일 수(강신호 엣지: 주입/필드/상속/구현/매퍼 — import 제외) | 0.15 | [추정] |  |
| 팬아웃 | 이 파일이 의존하는 서로 다른 파일 수(동일 강신호 엣지) | 0.1 | [추정] |  |
| 미도달 | 진입점(라우트·배치)에서 도달 불가 여부(slices 도달성 — 이진). 점수 비반영 플래그: 뷰 forward(JSP 등) 미추적 한계로 오탐 가능 — 데드코드 판정은 사람 확인 | 플래그(비점수) | [추정] |  |
| 정규화·합산 | 지표별 프로젝트 내 백분위(0~1, 동점 평균) → 가중 합산(가중치는 휴리스틱 — 점수는 순위로만 해석). 미측정 지표는 가중치 재정규화(미측정 파일 과소평가 방지), 무분산 지표(전 파일 동일값)는 변별 기여가 없어 제외. 점수는 프로젝트 내 상대 순위이며 절대 품질 판정이 아님 |  | [추정] |  |
| 등급 | 프로젝트 내 상대 밴드 — 상 = 점수 상위 10%(최소 1본, 동점 상향) · 중 = 상위 30% · 하 = 나머지. 절대 품질 판정 아님 |  | [추정] |  |

## 위험 Top N

위험 점수 상위 프로그램(test 유형 제외). 전 지표 측정 행은 [확정], 미측정 지표가 섞인
행은 [추정](서로 다른 지표 집합으로 매긴 점수라 측정 행과 눈금이 정확히 같지 않음),
미측정 셀은 [미확인](복잡도는 java 전용 근사, 변경빈도는 git 이력 필요).
**PM 주간보고용 우선순위 후보이며, 리팩터링/테스트 보강 대상 선정은 사람 판단**
(업무 중요도·변경 예정 여부는 코드가 알 수 없음). 행 단위 재분류는 본 문서를
편집·확정하는 방식으로 남기세요(재생성 시 자동 산출과 구분 유지).

| 순위 | PGM_ID | 프로그램명 | 유형 | 소속도메인 | 위험점수 | 등급 | 복잡도 | LOC | 변경(커밋) | 팬인 | 팬아웃 | 미도달 | 주요요인 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PGM-COM-6474e19b | Item | 공통/기타 | account+cart+catalog+order | 0.86 | 상 | 25 | 145 | 1 | 3 | 1 |  | 팬인, 복잡도 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:1` |
| 2 | PGM-COM-b9d226d6 | Order | 공통/기타 | order | 0.81 | 상 | 58 | 335 | 1 | 1 | 0 |  | 복잡도, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:1` |
| 3 | PGM-SCR-1de6f314 | CatalogActionBean | 화면 | catalog | 0.79 | 상 | 30 | 219 | 1 | 0 | 5 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:1` |
| 4 | PGM-COM-68a9e48b | Account | 공통/기타 | account | 0.78 | 상 | 36 | 196 | 1 | 1 | 0 |  | 복잡도, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:1` |
| 5 | PGM-SCR-6c5edc23 | CartActionBean | 화면 | cart | 0.77 | 상 | 18 | 150 | 1 | 1 | 3 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:1` |
| 6 | PGM-SVC-2d117c4e | CatalogService | 서비스 | account+cart+catalog | 0.75 | 상 | 10 | 90 | 1 | 4 | 3 |  | 팬인, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:1` |
| 7 | PGM-SCR-fc9c602d | OrderActionBean | 화면 | order | 0.73 | 중 | 22 | 197 | 1 | 0 | 3 |  | LOC, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:1` |
| 8 | PGM-SCR-03dd742b | AccountActionBean | 화면 | account | 0.73 | 중 | 21 | 208 | 1 | 0 | 4 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:1` |
| 9 | PGM-SVC-d564b236 | OrderService | 서비스 | order | 0.66 | 중 | 6 | 132 | 1 | 2 | 4 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:1` |
| 10 | PGM-COM-b6277a61 | LineItem | 공통/기타 | order | 0.63 | 중 | 16 | 118 | 1 | 0 | 2 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:1` |
| 11 | PGM-MAP-19fe2f40 | AccountMapper | SQL매퍼 | account | 0.63 | 중 | [미확인] | 132 | 1 | 1 | 0 |  | LOC, 팬인 | [추정] | `src/main/resources/org/mybatis/jpetstore/mapper/AccountMapper.xml:1` |
| 12 | PGM-COM-51c62df1 | Cart | 공통/기타 | cart | 0.63 | 중 | 12 | 125 | 1 | 1 | 0 |  | LOC, 복잡도 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:1` |
| 13 | PGM-COM-9f4f6427 | CartItem | 공통/기타 | cart+order | 0.60 | 중 | 9 | 76 | 1 | 1 | 1 |  | 팬아웃, 팬인 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:1` |
| 14 | PGM-MAP-d1be15e8 | OrderMapper | SQL매퍼 | order | 0.59 | 중 | [미확인] | 109 | 1 | 1 | 0 |  | LOC, 팬인 | [추정] | `src/main/resources/org/mybatis/jpetstore/mapper/OrderMapper.xml:1` |
| 15 | PGM-DAO-51f037a7 | AccountMapper | DAO | account | 0.56 | 중 | 8 | 43 | 1 | 3 | 1 |  | 팬인, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/AccountMapper.java:1` |
| 16 | PGM-COM-f9a3f312 | Product | 공통/기타 | account+cart+catalog+order | 0.55 | 중 | 9 | 71 | 1 | 2 | 0 |  | 팬인, 복잡도 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Product.java:1` |
| 17 | PGM-MAP-81a3e7d5 | ItemMapper | SQL매퍼 | account+cart+catalog+order | 0.55 | 하 | [미확인] | 82 | 1 | 1 | 0 |  | 팬인, LOC | [추정] | `src/main/resources/org/mybatis/jpetstore/mapper/ItemMapper.xml:1` |
| 18 | PGM-SVC-5f5bf3cb | AccountService | 서비스 | account | 0.54 | 하 | 5 | 75 | 1 | 2 | 1 |  | 팬인, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/service/AccountService.java:1` |
| 19 | PGM-SCR-dbbf9812 | ViewOrder | 화면 | web-inf | 0.51 | 하 | [미확인] | 173 | 1 | 0 | 0 | 미도달 | LOC, 팬아웃 | [추정] | `src/main/webapp/WEB-INF/jsp/order/ViewOrder.jsp:1` |
| 20 | PGM-DAO-867b6414 | ItemMapper | DAO | account+cart+catalog+order | 0.48 | 하 | 4 | 38 | 1 | 5 | 1 |  | 팬인, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/mapper/ItemMapper.java:1` |

## 지표 커버리지

측정/미측정(언어별)·무분산·등급 분포·제외 카운트 — 표의 수치가 "전수 측정"으로
오독되는 것을 막습니다.

| 항목 | 값 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 랭킹 대상 | 52 | 프로그램목록 승계(test 유형 제외) | [추정] |  |
| 제외(테스트) | 18 | 위험 랭킹 오염 방지 — 분리 계상 | [추정] |  |
| 등급 분포 | 상 6 · 중 10 · 하 36 | 상대 밴드(상위 10%/30%) — 절대 판정 아님 | [추정] |  |
| 복잡도 측정 | 24/52 | 미측정(확장자별): jsp 20, xml 8 | [추정] |  |
| 변경빈도 측정 | 52/52 | git 이력 기준(앵커 c64558efee7bc7e149d24ec73ce39a1d5f7ba44e) | [추정] |  |
| 무분산 지표 | 변경빈도 | 전 파일 동일값 — 랭킹 변별 기여 없음(가중합 제외). 예: 단일 벤더링 커밋의 변경빈도 | [추정] |  |
| 미도달 | 20/52 | 점수 비반영 플래그 — 뷰 forward(JSP) 미추적 한계로 오탐 가능, 데드코드 판정은 사람 확인 | [추정] |  |
