---
docId: policy-domain-web
title: web 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0
---

# web 정책 정의서

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | web 정책 정의서 | [추정] |  |
| 문서 버전 | v0.1 (자동 초안) | [추정] |  |
| 작성일 | 《YYYY-MM-DD》 | [추정] |  |
| 작성자 / 검토자 / 승인자 | 《 》 | [추정] |  |
| 관련 산출물 | src/main/webapp/WEB-INF/web.xml | [확정] | `src/main/webapp/WEB-INF/web.xml` |

## 개정 이력

| 버전 | 일자 | 변경 내용 | 작성자 | 승인자 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 《YYYY-MM-DD》 | 최초 자동 초안(코드 추출) | 자동 | 《 》 | [추정] |  |

## 1. 개요

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 목적 | 이 'web' 도메인은 실제 업무 도메인이 아니라, JPetStore 웹 애플리케이션의 서블릿 배포 서술자(web.xml) 1개 파일만으로 구성된 인프라/설정 그룹이다. `program-inventory.json`에서 `domain: "web"`으로 분류된 프로그램은 `web.xml` 단 1건(`domainVia: "reachability"`)뿐이며, 특정 업무 도메인에 귀속시키지 못한 파일이 reachability 기준으로 묶인 결과로 보인다. 조건부 업무 정책은 없다 | [확정] | `.spec/map/program-inventory.json`(domain="web" 항목), `src/main/webapp/WEB-INF/web.xml` |
| 적용 범위 | `web.xml`의 Stripes 프레임워크 배선: `ContextLoaderListener` 리스너 등록, `StripesFilter`(ActionResolver.Packages=`org.mybatis.jpetstore.web`) 필터 매핑, `DispatcherServlet`을 `*.action` URL 패턴에 매핑. 조건 분기 없이 선언적 설정만 존재 | [확정] | `src/main/webapp/WEB-INF/web.xml:24-64` |
| 적용 제외 | 실제 업무 로직·조건부 정책 전체(계정/장바구니/카탈로그/주문 등)는 각 도메인 정책서(`policy-domain-account.md` 등)에서 별도로 다룸 | [확정] | `.spec/map/program-inventory.json`(domain별 분포: account 12건·cart 7건·catalog 8건·order 20건 등) |
| 정책 소유 부서 | 《 》 | [추정] |  |

## 2. 용어 정의

| 용어 | 정의 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |

## 3. 상태값 정의

정책 분기 조건으로 쓰이는 상태·구분값. 코드 테이블/enum 에서 추출(없으면 명문화 필요).

| 코드 그룹 | 코드값 | 명칭 | 설명 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |

## 4. 정책 규칙 — 의사결정 테이블

★핵심★ "조건(IF) → 처리(THEN)"를 빠짐없이 명세. 적용 조건·처리·근거는 코드에서 `[확정]`,
정책명·우선순위·예외/비고는 보강 `[추정]`. 충돌 시 우선순위 숫자가 낮은 정책을 적용한다.

| 정책 ID | 정책명 | 적용 조건 (IF) | 처리 내용 (THEN) | 우선순위 | 예외/비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |

조건부 처리 없음 — 이 도메인은 분기 로직이 없는 정적 리소스로 구성됨. `web` 도메인에 속한 프로그램은 `web.xml` 1건뿐이며, 내용은 `<listener>`/`<filter>`/`<filter-mapping>`/`<servlet>`/`<servlet-mapping>` 선언형 설정 요소로만 이루어져 있고 `if`/분기/조건식이 전혀 없다. [확정] 근거: `.spec/map/program-inventory.json`(domain="web", 1건), `src/main/webapp/WEB-INF/web.xml:24-64`

## 5. 예외 및 엣지 케이스

| No | 상황 | 처리 방침 | 담당 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 《 》 | 《 》 | 《 》 | [추정] |  |

## 6. 처리 흐름 (의사코드)

<!-- claims:FENCE:OPEN -->
- [추정] 흐름 내 결정 지점이 없습니다(단순 흐름)..
<!-- claims:FENCE:CLOSE -->

## 7. 검증 시나리오

| TC ID | 입력 조건 | 기대 결과 | 적용 정책 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| TC-01 | 《 》 | 《 》 | 《 》 | [추정] |  |

## 8. 미결 사항

| No | 이슈 | 상태 | 결정 필요일 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | 상태값 코드 그룹/enum 미정의(분기 조건의 상태값) | 미정 | 《 》 | [추정] |  |
| 2 | `web` 도메인은 `web.xml` 1건뿐인 인프라/설정 그룹으로 확인되었으나, 이것이 별도 정책서로 유지할 가치가 있는 도메인인지, 아니면 도메인 분류 체계에서 제외(또는 다른 인프라성 카테고리로 재배치)해야 하는지는 재검토 필요 | 미정 | 《 》 | [확인 필요] | `.spec/map/program-inventory.json`(domain="web", 1건) |
