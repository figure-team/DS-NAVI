---
docId: si-프로그램목록
title: SI 프로그램목록
methodology: si-standard
---

<!--
  SI 프로그램목록(W3) 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/program-inventory.md
  형식·신뢰도 규약: _README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 프로그램 목록 {#program-list-si}

program-inventory.json(W3 결정론 스캔) 1건 = 표 1행 — 소스 프로그램(java·kotlin·jsp·SQL매퍼) 전수.
프로그램명(파일)·유형·계층·LOC 는 코드 근거 → [확정].
**업무명은 정적 분석이 알 수 없어 [미확인]** — 감리 제출 전에 사람이 채웁니다.
소속도메인은 도메인 후보 분석(candidates)의 결정론 조인 — 도달성 신호는 그대로,
디렉토리/접두어 폴백·모호는 [추정] 표기(도메인 확정은 사람 몫).
유형: 화면(라우트/JSP) · API · 배치(W2 연동) · 서비스/DAO/DB(계층 신호) · SQL매퍼 ·
공통/기타(**계층 신호 없음 — 도메인 모델·유틸 포함, 미분류라는 뜻이 아님**).
설정 XML·기타 언어 파일은 프로그램에서 제외되며 제외 수는 program-inventory.json
stats.excluded 에 기록됩니다(전수 오독 방지). PGM_ID 는 내용 파생 안정 id.

| PGM_ID | 프로그램명 | 업무명 | 소속도메인 | 유형 | 계층 | LOC |

## 규모산정(FP) 기초 {#fp-basis}

**전 행 [추정] — 견적 초안용 잠정치이며 FP 전문가의 재분류·보정 전 값입니다.**
트랜잭션 후보: 라우트 1건 = 1후보(FP 의 기본 프로세스와 1:1 이 아닐 수 있음 — 뷰+제출
분리, 다기능 ActionBean 등은 사람이 통합/분리).
GET/HEAD → EQ · POST/PUT/DELETE/PATCH → EI, **method 미상(ANY 등)은 '미분류'로 두고
합산하지 않습니다**(레거시 프레임워크는 라우트 대부분이 ANY — EI 로 뭉개면 체계적 왜곡).
**EO(파생 출력)는 정적 판별 불가** — 리포트성 화면은 사람이 EO 로 재분류하세요.
데이터 후보: 자체 테이블(DDL) → ILF, DB링크 참조(W1) → EIF.
집계의 잠정 FP 는 간이법 평균복잡도 **미조정 하한**(미분류·EO 미반영 — 재분류 시 상향)
(가중치: ILF 7.5 · EIF 5.4 · EI 4.0 · EO 5.2 · EQ 3.9).

| 구분 | 대상 | 상세 |
