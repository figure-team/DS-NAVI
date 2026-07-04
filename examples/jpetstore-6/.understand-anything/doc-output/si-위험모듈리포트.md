---
docId: si-위험모듈리포트
title: SI 위험모듈리포트
methodology: si-standard
status: DRAFT
sourceCommit: null
evidenceRate: 0.6060606060606061
---

# SI 위험모듈리포트

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 산정 기준

risk-report.json(W4 결정론 스캔)의 지표 6종 정의·가중치·정규화 규칙입니다.
**위험 점수는 프로젝트 내 상대 순위(백분위 합산)이며 절대 품질 판정이 아닙니다** —
프로젝트 간 점수 비교는 무의미하고, 등급(상/중/하)은 고정 임계의 편의 구분입니다.
git 변경빈도는 분석 시점 커밋(gitCommit 앵커) 기준 전체 이력 — 동일 커밋에서 재실행하면
byte 동일(결정론)입니다.

| 항목 | 산정 방법 | 가중치 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 복잡도 | 순환복잡도 근사(java AST): 메서드 수 + 결정포인트(if/for/while/do/catch/삼항/case/&&/\|\|). 비 java 는 미측정 [미확인] | 0.25 | [추정] |  |
| 변경빈도 | git 전체 이력에서 파일별 변경 커밋 수(git log --numstat, rename 미추적). 변경 라인은 참고치 | 0.25 | [추정] |  |
| LOC | 파일 라인 수(wc -l 관례, 프로그램목록 승계) | 0.15 | [추정] |  |
| 팬인 | 이 파일에 의존하는 서로 다른 파일 수(강신호 엣지: 주입/필드/상속/구현/매퍼 — import 제외) | 0.15 | [추정] |  |
| 팬아웃 | 이 파일이 의존하는 서로 다른 파일 수(동일 강신호 엣지) | 0.1 | [추정] |  |
| 미도달 | 진입점(라우트·배치)에서 도달 불가 여부(slices 도달성 — 이진) | 0.1 | [추정] |  |
| 정규화·합산 | 지표별 프로젝트 내 백분위(0~1, 동점 평균) → 가중 합산. 미측정 지표는 가중치 재정규화(미측정 파일 과소평가 방지). 점수는 프로젝트 내 상대 순위이며 절대 품질 판정이 아님 |  | [추정] |  |
| 등급 | 상 ≥ 0.66 · 중 ≥ 0.33 · 하 < 0.33 (고정 임계) |  | [추정] |  |

## 위험 Top N

위험 점수 상위 프로그램(test 유형 제외). 지표 원시값은 코드/이력 근거 → [확정],
미측정 지표 셀은 [미확인](복잡도는 java 전용 근사, 변경빈도는 git 이력 필요).
**PM 주간보고용 우선순위 후보이며, 리팩터링/테스트 보강 대상 선정은 사람 판단**
(업무 중요도·변경 예정 여부는 코드가 알 수 없음).

| 순위 | PGM_ID | 프로그램명 | 유형 | 소속도메인 | 위험점수 | 등급 | 복잡도 | LOC | 변경(커밋) | 팬인 | 팬아웃 | 미도달 | 주요요인 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PGM-COM-6474e19b | Item | 공통/기타 | account+cart+catalog+order | 0.68 | 상 | 25 | 145 | 1 | 3 | 1 |  | 팬인, 복잡도 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Item.java:1` |
| 2 | PGM-COM-b9d226d6 | Order | 공통/기타 | order | 0.65 | 중 | 58 | 335 | 1 | 1 | 0 |  | 복잡도, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Order.java:1` |
| 3 | PGM-SCR-1de6f314 | CatalogActionBean | 화면 | catalog | 0.64 | 중 | 30 | 219 | 1 | 0 | 5 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:1` |
| 4 | PGM-COM-68a9e48b | Account | 공통/기타 | account | 0.63 | 중 | 36 | 196 | 1 | 1 | 0 |  | 복잡도, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Account.java:1` |
| 5 | PGM-SCR-6c5edc23 | CartActionBean | 화면 | cart | 0.63 | 중 | 18 | 150 | 1 | 1 | 3 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:1` |
| 6 | PGM-SVC-2d117c4e | CatalogService | 서비스 | account+cart+catalog | 0.61 | 중 | 10 | 90 | 1 | 4 | 3 |  | 팬인, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/service/CatalogService.java:1` |
| 7 | PGM-SCR-fc9c602d | OrderActionBean | 화면 | order | 0.60 | 중 | 22 | 197 | 1 | 0 | 3 |  | LOC, 팬아웃 | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:1` |
| 8 | PGM-SCR-03dd742b | AccountActionBean | 화면 | account | 0.60 | 중 | 21 | 208 | 1 | 0 | 4 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:1` |
| 9 | PGM-SCR-dbbf9812 | ViewOrder | 화면 | web-inf | 0.57 | 중 | [미확인] | 173 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/order/ViewOrder.jsp:1` |
| 10 | PGM-SVC-d564b236 | OrderService | 서비스 | order | 0.56 | 중 | 6 | 132 | 1 | 2 | 4 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/service/OrderService.java:1` |
| 11 | PGM-SCR-9a011004 | IncludeTop | 화면 | web-inf | 0.55 | 중 | [미확인] | 131 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/common/IncludeTop.jsp:1` |
| 12 | PGM-SCR-ed0c6c14 | ConfirmOrder | 화면 | web-inf | 0.55 | 중 | [미확인] | 122 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/order/ConfirmOrder.jsp:1` |
| 13 | PGM-COM-b6277a61 | LineItem | 공통/기타 | order | 0.54 | 중 | 16 | 118 | 1 | 0 | 2 |  | 팬아웃, LOC | [확정] | `src/main/java/org/mybatis/jpetstore/domain/LineItem.java:1` |
| 14 | PGM-SCR-3c93f7f6 | Cart | 화면 | web-inf | 0.53 | 중 | [미확인] | 105 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/cart/Cart.jsp:1` |
| 15 | PGM-COM-51c62df1 | Cart | 공통/기타 | cart | 0.53 | 중 | 12 | 125 | 1 | 1 | 0 |  | LOC, 복잡도 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/Cart.java:1` |
| 16 | PGM-SCR-b1ada8ee | Main | 화면 | web-inf | 0.53 | 중 | [미확인] | 92 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Main.jsp:1` |
| 17 | PGM-SCR-26b9e12b | NewOrderForm | 화면 | web-inf | 0.53 | 중 | [미확인] | 91 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/order/NewOrderForm.jsp:1` |
| 18 | PGM-SCR-17377901 | IncludeAccountFields | 화면 | web-inf | 0.52 | 중 | [미확인] | 87 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/account/IncludeAccountFields.jsp:1` |
| 19 | PGM-COM-9f4f6427 | CartItem | 공통/기타 | cart+order | 0.52 | 중 | 9 | 76 | 1 | 1 | 1 |  | 팬아웃, 팬인 | [확정] | `src/main/java/org/mybatis/jpetstore/domain/CartItem.java:1` |
| 20 | PGM-SCR-807f6244 | Product | 화면 | web-inf | 0.51 | 중 | [미확인] | 77 | 1 | 0 | 0 | 미도달 | 미도달, LOC | [확정] | `src/main/webapp/WEB-INF/jsp/catalog/Product.jsp:1` |

## 지표 커버리지

측정/미측정·제외 카운트 — 표의 수치가 "전수 측정"으로 오독되는 것을 막습니다.

| 항목 | 값 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 랭킹 대상 | 52 | 프로그램목록 승계(test 유형 제외) | [추정] |  |
| 제외(테스트) | 18 | 위험 랭킹 오염 방지 — 분리 계상 | [추정] |  |
| 복잡도 측정 | 24/52 | 미측정 = 비 java(jsp·SQL매퍼 등) — [미확인] | [추정] |  |
| 변경빈도 측정 | 52/52 | git 이력 기준(앵커 e31bb89b17bf339d0c8f6512d5f4ed0c6c0cebd4) | [추정] |  |
| 미도달 | 20 | 진입점에서 도달 불가(데드코드 후보) | [추정] |  |
