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

program-inventory.json(W3 결정론 스캔) 1건 = 표 1행 — 소스 프로그램(java·jsp·SQL매퍼) 전수.
프로그램명(파일)·유형·계층·LOC 는 코드 근거 → [확정].
**업무명은 정적 분석이 알 수 없어 [미확인]** — 감리 제출 전에 사람이 채웁니다.
유형: 화면(라우트/JSP) · API · 배치(W2 연동) · 서비스/DAO/DB(계층 신호) · SQL매퍼 · 공통/기타.
PGM_ID 는 내용 파생 안정 id(재스캔에도 동일 파일 = 동일 id).

| PGM_ID | 프로그램명 | 업무명 | 유형 | 계층 | LOC |

## 규모산정(FP) 기초 {#fp-basis}

**전 행 [추정] — 견적 초안용 잠정치이며 FP 전문가의 재분류·보정 전 값입니다.**
트랜잭션 후보: 라우트 1건 = 1후보, GET/HEAD → EQ · 그 외 → EI 로 잠정 분류.
**EO(파생 출력)는 정적 판별 불가** — 리포트성 화면은 사람이 EQ/EI 에서 EO 로 재분류하세요.
데이터 후보: 자체 테이블(DDL) → ILF, DB링크 참조(W1) → EIF.
집계의 잠정 FP 는 간이법 평균복잡도 **미조정(unadjusted)** 합계
(가중치: ILF 7.5 · EIF 5.4 · EI 4.0 · EO 5.2 · EQ 3.9).

| 구분 | 대상 | 상세 |
