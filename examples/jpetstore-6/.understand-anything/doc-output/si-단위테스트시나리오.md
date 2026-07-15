---
docId: si-단위테스트시나리오
title: SI 단위테스트시나리오
methodology: si-standard
status: DRAFT
sourceCommit: dfbb9822f7c17f41a39e96704f4ea4f455580278
evidenceRate: 0
---

# SI 단위테스트시나리오

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 작성 기준

rtm.json 의 기능 행(진입점·데이터·인수조건)에서 **결정론 템플릿으로 생성한 초안**입니다 —
전부 [추정]이며, 시험 절차·기대값의 업무 타당성 검토는 사람 몫입니다.
대시보드 추적표 > 시험 탭에서 Given/When/Then 을 편집·확정하면 [확정]으로 승격되고,
재생성해도 확정 내용은 오버레이(rtm-overrides.json)로 유지됩니다.

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 현황 | 확정 0/84 · 축소 생성 39/84 · 시험 수행결과 미연결 — 본 문서는 초안 스켈레톤(검토·보강 전제) | [추정] |  |
| 정상 | 기능 행의 진입점(라우트)·데이터(테이블×CRUD) 시드로 정상 흐름 1건 생성 | [추정] |  |
| 예외 | 요구사항 인수조건(AC) 중 exception 유형당 1건(AC 문장 인용, 요구/AC 추적선 보존). 없으면 일반형 1건 + [미확인] | [추정] |  |
| 경계 | 데이터 시드(0건·최대치) 기준 1건. 데이터 근거 없으면 일반형 + [미확인] | [추정] |  |
| 지위 | 전부 결정론 템플릿 생성 초안([추정]) — 대시보드 시험 탭에서 편집·확정하면 [확정] 승격(재생성에도 오버레이 유지) | [추정] |  |
| 수행 기록 | 시나리오는 설계 초안 — 시험 수행 결과는 요구사항 AC 의 시험결과(TestRef)에 기록(확정 후 caseId 연결은 사람 몫) | [추정] |  |

## 시나리오 원장

기능당 정상/예외/경계 최소 3종(예외는 인수조건 수만큼). 시드가 부족한 행은 축소형으로
생성하고 사유를 남깁니다(0건 기능 없음 — 침묵 누락 금지). 시험 **수행 결과**는 이 문서가
아니라 요구사항 인수조건의 시험결과(TestRef)에 기록하세요(시나리오=설계, TestRef=수행).

| 시나리오ID | 기능ID | 기능명 | 요구ID | AC | 구분 | 제목 | Given | When | Then | 상태 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TS-3653f930-N | FN-001 | 계정 기본 진입(로그인 폼) |  |  | 정상 | 계정 기본 진입(로그인 폼) 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| TS-3653f930-E | FN-001 | 계정 기본 진입(로그인 폼) |  |  | 예외 | 계정 기본 진입(로그인 폼) 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| TS-3653f930-B | FN-001 | 계정 기본 진입(로그인 폼) |  |  | 경계 | 계정 기본 진입(로그인 폼) 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Account.action` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:149` |
| TS-25737d9b-N | FN-002 | 계정 수정 처리 |  |  | 정상 | 계정 수정 처리 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?editAccount` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ACCOUNT(RU) · BANNERDATA(R) · PRODUCT(R) · PROFILE(RU) · SIGNON(RU) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137` |
| TS-25737d9b-E | FN-002 | 계정 수정 처리 |  |  | 예외 | 계정 수정 처리 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?editAccount` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137` |
| TS-25737d9b-B | FN-002 | 계정 수정 처리 |  |  | 경계 | 계정 수정 처리 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ACCOUNT(RU) · BANNERDATA(R) · PRODUCT(R) · PROFILE(RU) · SIGNON(RU) | `ANY /actions/Account.action?editAccount` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:137` |
| TS-17db5e22-N | FN-003 | 계정 수정 폼 |  |  | 정상 | 계정 수정 폼 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?editAccountForm` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128` |
| TS-17db5e22-E | FN-003 | 계정 수정 폼 |  |  | 예외 | 계정 수정 폼 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?editAccountForm` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128` |
| TS-17db5e22-B | FN-003 | 계정 수정 폼 |  |  | 경계 | 계정 수정 폼 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Account.action?editAccountForm` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:128` |
| TS-eb7ff746-N | FN-004 | 신규 계정 등록 처리 |  |  | 정상 | 신규 계정 등록 처리 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?newAccount` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ACCOUNT(CR) · BANNERDATA(R) · PRODUCT(R) · PROFILE(CR) · SIGNON(CR) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115` |
| TS-eb7ff746-E | FN-004 | 신규 계정 등록 처리 |  |  | 예외 | 신규 계정 등록 처리 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?newAccount` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115` |
| TS-eb7ff746-B | FN-004 | 신규 계정 등록 처리 |  |  | 경계 | 신규 계정 등록 처리 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ACCOUNT(CR) · BANNERDATA(R) · PRODUCT(R) · PROFILE(CR) · SIGNON(CR) | `ANY /actions/Account.action?newAccount` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:115` |
| TS-4c7a6412-N | FN-005 | 신규 계정 등록 폼 |  |  | 정상 | 신규 계정 등록 폼 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?newAccountForm` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106` |
| TS-4c7a6412-E | FN-005 | 신규 계정 등록 폼 |  |  | 예외 | 신규 계정 등록 폼 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?newAccountForm` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106` |
| TS-4c7a6412-B | FN-005 | 신규 계정 등록 폼 |  |  | 경계 | 신규 계정 등록 폼 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Account.action?newAccountForm` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:106` |
| TS-04cfd5f5-N | FN-006 | 로그아웃 |  |  | 정상 | 로그아웃 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?signoff` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184` |
| TS-04cfd5f5-E | FN-006 | 로그아웃 |  |  | 예외 | 로그아웃 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?signoff` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184` |
| TS-04cfd5f5-B | FN-006 | 로그아웃 |  |  | 경계 | 로그아웃 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Account.action?signoff` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:184` |
| TS-8f388341-N | FN-007 | 로그인 처리 |  |  | 정상 | 로그인 처리 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Account.action?signon` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ACCOUNT(R) · BANNERDATA(R) · PRODUCT(R) · PROFILE(R) · SIGNON(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159` |
| TS-8f388341-E | FN-007 | 로그인 처리 |  |  | 예외 | 로그인 처리 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Account.action?signon` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159` |
| TS-8f388341-B | FN-007 | 로그인 처리 |  |  | 경계 | 로그인 처리 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ACCOUNT(R) · BANNERDATA(R) · PRODUCT(R) · PROFILE(R) · SIGNON(R) | `ANY /actions/Account.action?signon` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java:159` |
| TS-e64c2820-N | FN-028 | 네이버 계정 연동/자동가입 |  |  | 정상 | 네이버 계정 연동/자동가입 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) AccountActionBean#naverCallback 내부 분기` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: (제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR) | 초안 [추정] | [추정] |  |
| TS-e64c2820-E | FN-028 | 네이버 계정 연동/자동가입 |  |  | 예외 | 네이버 계정 연동/자동가입 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `(제안) AccountActionBean#naverCallback 내부 분기` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-e64c2820-B | FN-028 | 네이버 계정 연동/자동가입 |  |  | 경계 | 네이버 계정 연동/자동가입 경계 조건 | 경계 데이터 상태(대상 0건·최대치): (제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR) | `(제안) AccountActionBean#naverCallback 내부 분기` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-df20f8e4-N | FN-026 | 네이버 로그인 진입(인가요청 리다이렉트) |  |  | 정상 | 네이버 로그인 진입(인가요청 리다이렉트) 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) GET /actions/Account.action?naverLogin` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] |  |
| TS-df20f8e4-E | FN-026 | 네이버 로그인 진입(인가요청 리다이렉트) |  |  | 예외 | 네이버 로그인 진입(인가요청 리다이렉트) 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `(제안) GET /actions/Account.action?naverLogin` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-df20f8e4-B | FN-026 | 네이버 로그인 진입(인가요청 리다이렉트) |  |  | 경계 | 네이버 로그인 진입(인가요청 리다이렉트) 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `(제안) GET /actions/Account.action?naverLogin` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-c28dfd73-N | FN-027 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) |  |  | 정상 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) GET /actions/Account.action?naverCallback` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: (제안) — (네이버 토큰·사용자 외부 API) | 초안 [추정] | [추정] |  |
| TS-c28dfd73-E:REQ-002:AC-4 | FN-027 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) | REQ-002 | AC-4 | 예외 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) 예외 처리 1 | 예외 조건 성립: state 불일치 또는 토큰 교환 실패 시 로그인을 거부하고 에러를 처리한다 | `(제안) GET /actions/Account.action?naverCallback` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + AC 기준의 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-c28dfd73-B | FN-027 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) |  |  | 경계 | 네이버 OAuth 콜백 처리(토큰교환·프로필조회) 경계 조건 | 경계 데이터 상태(대상 0건·최대치): (제안) — (네이버 토큰·사용자 외부 API) | `(제안) GET /actions/Account.action?naverCallback` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-b853fe37-N | FN-025 | 카카오 계정 연동/자동가입 |  |  | 정상 | 카카오 계정 연동/자동가입 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) AccountActionBean#kakaoCallback 내부 분기` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: (제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR) | 초안 [추정] | [추정] |  |
| TS-b853fe37-E | FN-025 | 카카오 계정 연동/자동가입 |  |  | 예외 | 카카오 계정 연동/자동가입 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `(제안) AccountActionBean#kakaoCallback 내부 분기` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-b853fe37-B | FN-025 | 카카오 계정 연동/자동가입 |  |  | 경계 | 카카오 계정 연동/자동가입 경계 조건 | 경계 데이터 상태(대상 0건·최대치): (제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR) | `(제안) AccountActionBean#kakaoCallback 내부 분기` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-6eced6a8-N | FN-023 | 카카오 로그인 진입(인가요청 리다이렉트) |  |  | 정상 | 카카오 로그인 진입(인가요청 리다이렉트) 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) GET /actions/Account.action?kakaoLogin` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] |  |
| TS-6eced6a8-E | FN-023 | 카카오 로그인 진입(인가요청 리다이렉트) |  |  | 예외 | 카카오 로그인 진입(인가요청 리다이렉트) 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `(제안) GET /actions/Account.action?kakaoLogin` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-6eced6a8-B | FN-023 | 카카오 로그인 진입(인가요청 리다이렉트) |  |  | 경계 | 카카오 로그인 진입(인가요청 리다이렉트) 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `(제안) GET /actions/Account.action?kakaoLogin` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-f4c305f8-N | FN-024 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) |  |  | 정상 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `(제안) GET /actions/Account.action?kakaoCallback` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: (제안) — (카카오 토큰·사용자 외부 API) | 초안 [추정] | [추정] |  |
| TS-f4c305f8-E:REQ-001:AC-4 | FN-024 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) | REQ-001 | AC-4 | 예외 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) 예외 처리 1 | 예외 조건 성립: state 불일치 또는 토큰 교환 실패 시 로그인을 거부하고 에러를 처리한다 | `(제안) GET /actions/Account.action?kakaoCallback` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + AC 기준의 오류 응답 확인 | 초안 [추정] | [추정] |  |
| TS-f4c305f8-B | FN-024 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) |  |  | 경계 | 카카오 OAuth 콜백 처리(토큰교환·프로필조회) 경계 조건 | 경계 데이터 상태(대상 0건·최대치): (제안) — (카카오 토큰·사용자 외부 API) | `(제안) GET /actions/Account.action?kakaoCallback` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] |  |
| TS-04f64890-N | FN-008 | 장바구니에 품목 담기 |  |  | 정상 | 장바구니에 품목 담기 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Cart.action?addItemToCart` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: INVENTORY(R) · ITEM(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| TS-04f64890-E | FN-008 | 장바구니에 품목 담기 |  |  | 예외 | 장바구니에 품목 담기 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Cart.action?addItemToCart` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| TS-04f64890-B | FN-008 | 장바구니에 품목 담기 |  |  | 경계 | 장바구니에 품목 담기 경계 조건 | 경계 데이터 상태(대상 0건·최대치): INVENTORY(R) · ITEM(R) | `ANY /actions/Cart.action?addItemToCart` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:68` |
| TS-8b59c03c-N | FN-009 | 체크아웃 진입 |  |  | 정상 | 체크아웃 진입 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Cart.action?checkOut` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |
| TS-8b59c03c-E | FN-009 | 체크아웃 진입 |  |  | 예외 | 체크아웃 진입 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Cart.action?checkOut` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |
| TS-8b59c03c-B | FN-009 | 체크아웃 진입 |  |  | 경계 | 체크아웃 진입 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Cart.action?checkOut` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:141` |
| TS-c92c4cb9-N | FN-010 | 장바구니에서 품목 제거 |  |  | 정상 | 장바구니에서 품목 제거 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Cart.action?removeItemFromCart` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| TS-c92c4cb9-E | FN-010 | 장바구니에서 품목 제거 |  |  | 예외 | 장바구니에서 품목 제거 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Cart.action?removeItemFromCart` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| TS-c92c4cb9-B | FN-010 | 장바구니에서 품목 제거 |  |  | 경계 | 장바구니에서 품목 제거 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Cart.action?removeItemFromCart` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:94` |
| TS-51f32dbf-N | FN-011 | 장바구니 수량 갱신 |  |  | 정상 | 장바구니 수량 갱신 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Cart.action?updateCartQuantities` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| TS-51f32dbf-E | FN-011 | 장바구니 수량 갱신 |  |  | 예외 | 장바구니 수량 갱신 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Cart.action?updateCartQuantities` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| TS-51f32dbf-B | FN-011 | 장바구니 수량 갱신 |  |  | 경계 | 장바구니 수량 갱신 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Cart.action?updateCartQuantities` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:116` |
| TS-0b6a73ab-N | FN-012 | 장바구니 조회 |  |  | 정상 | 장바구니 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Cart.action?viewCart` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| TS-0b6a73ab-E | FN-012 | 장바구니 조회 |  |  | 예외 | 장바구니 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Cart.action?viewCart` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| TS-0b6a73ab-B | FN-012 | 장바구니 조회 |  |  | 경계 | 장바구니 조회 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Cart.action?viewCart` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java:137` |
| TS-d65a8766-N | FN-013 | 카탈로그 메인 화면 |  |  | 정상 | 카탈로그 메인 화면 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Catalog.action` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| TS-d65a8766-E | FN-013 | 카탈로그 메인 화면 |  |  | 예외 | 카탈로그 메인 화면 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Catalog.action` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| TS-d65a8766-B | FN-013 | 카탈로그 메인 화면 |  |  | 경계 | 카탈로그 메인 화면 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Catalog.action` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:143` |
| TS-3e8d32ff-N | FN-014 | 상품 검색 |  |  | 정상 | 상품 검색 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Catalog.action?searchProducts` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: PRODUCT(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190` |
| TS-3e8d32ff-E | FN-014 | 상품 검색 |  |  | 예외 | 상품 검색 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Catalog.action?searchProducts` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190` |
| TS-3e8d32ff-B | FN-014 | 상품 검색 |  |  | 경계 | 상품 검색 경계 조건 | 경계 데이터 상태(대상 0건·최대치): PRODUCT(R) | `ANY /actions/Catalog.action?searchProducts` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:190` |
| TS-459d7e96-N | FN-015 | 카테고리 조회 |  |  | 정상 | 카테고리 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Catalog.action?viewCategory` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: CATEGORY(R) · PRODUCT(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153` |
| TS-459d7e96-E | FN-015 | 카테고리 조회 |  |  | 예외 | 카테고리 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Catalog.action?viewCategory` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153` |
| TS-459d7e96-B | FN-015 | 카테고리 조회 |  |  | 경계 | 카테고리 조회 경계 조건 | 경계 데이터 상태(대상 0건·최대치): CATEGORY(R) · PRODUCT(R) | `ANY /actions/Catalog.action?viewCategory` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:153` |
| TS-477c47ac-N | FN-016 | 품목 상세 조회 |  |  | 정상 | 품목 상세 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Catalog.action?viewItem` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ITEM(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:179` |
| TS-477c47ac-E | FN-016 | 품목 상세 조회 |  |  | 예외 | 품목 상세 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Catalog.action?viewItem` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:179` |
| TS-477c47ac-B | FN-016 | 품목 상세 조회 |  |  | 경계 | 품목 상세 조회 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ITEM(R) | `ANY /actions/Catalog.action?viewItem` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:179` |
| TS-767ad04a-N | FN-017 | 상품 상세 조회 |  |  | 정상 | 상품 상세 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Catalog.action?viewProduct` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ITEM(R) · PRODUCT(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166` |
| TS-767ad04a-E | FN-017 | 상품 상세 조회 |  |  | 예외 | 상품 상세 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Catalog.action?viewProduct` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166` |
| TS-767ad04a-B | FN-017 | 상품 상세 조회 |  |  | 경계 | 상품 상세 조회 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ITEM(R) · PRODUCT(R) | `ANY /actions/Catalog.action?viewProduct` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/CatalogActionBean.java:166` |
| TS-613f4894-N | FN-018 | 주문 목록 조회 |  |  | 정상 | 주문 목록 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Order.action?listOrders` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: ORDERS(R) · ORDERSTATUS(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| TS-613f4894-E | FN-018 | 주문 목록 조회 |  |  | 예외 | 주문 목록 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Order.action?listOrders` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| TS-613f4894-B | FN-018 | 주문 목록 조회 |  |  | 경계 | 주문 목록 조회 경계 조건 | 경계 데이터 상태(대상 0건·최대치): ORDERS(R) · ORDERSTATUS(R) | `ANY /actions/Order.action?listOrders` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:107` |
| TS-8eddc158-N | FN-019 | 주문 생성 |  |  | 정상 | 주문 생성 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Order.action?newOrder` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: INVENTORY(U) · LINEITEM(C) · ORDERS(C) · ORDERSTATUS(C) · SEQUENCE(RU) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142` |
| TS-8eddc158-E | FN-019 | 주문 생성 |  |  | 예외 | 주문 생성 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Order.action?newOrder` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142` |
| TS-8eddc158-B | FN-019 | 주문 생성 |  |  | 경계 | 주문 생성 경계 조건 | 경계 데이터 상태(대상 0건·최대치): INVENTORY(U) · LINEITEM(C) · ORDERS(C) · ORDERSTATUS(C) · SEQUENCE(RU) | `ANY /actions/Order.action?newOrder` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:142` |
| TS-a885b63f-N | FN-020 | 주문 폼 표시 |  |  | 정상 | 주문 폼 표시 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Order.action?newOrderForm` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119` |
| TS-a885b63f-E | FN-020 | 주문 폼 표시 |  |  | 예외 | 주문 폼 표시 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Order.action?newOrderForm` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119` |
| TS-a885b63f-B | FN-020 | 주문 폼 표시 |  |  | 경계 | 주문 폼 표시 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY /actions/Order.action?newOrderForm` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:119` |
| TS-d7a0601e-N | FN-021 | 주문 상세 조회 |  |  | 정상 | 주문 상세 조회 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY /actions/Order.action?viewOrder` 호출 | 정상 완료(오류 없음) + 데이터 반영 확인: INVENTORY(R) · ITEM(R) · LINEITEM(R) · ORDERS(R) · ORDERSTATUS(R) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:171` |
| TS-d7a0601e-E | FN-021 | 주문 상세 조회 |  |  | 예외 | 주문 상세 조회 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY /actions/Order.action?viewOrder` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:171` |
| TS-d7a0601e-B | FN-021 | 주문 상세 조회 |  |  | 경계 | 주문 상세 조회 경계 조건 | 경계 데이터 상태(대상 0건·최대치): INVENTORY(R) · ITEM(R) · LINEITEM(R) · ORDERS(R) · ORDERSTATUS(R) | `ANY /actions/Order.action?viewOrder` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/java/org/mybatis/jpetstore/web/actions/OrderActionBean.java:171` |
| TS-ef87ef36-N | FN-022 | *.action 요청 라우팅 흐름 |  |  | 정상 | *.action 요청 라우팅 흐름 정상 처리 | 유효한 입력과 선행 상태가 준비됨 | `ANY *.action` 호출 | 정상 완료(오류 없음) + 응답/결과 확인 | 초안 [추정] | [추정] | `src/main/webapp/WEB-INF/web.xml:60` |
| TS-ef87ef36-E | FN-022 | *.action 요청 라우팅 흐름 |  |  | 예외 | *.action 요청 라우팅 흐름 예외 처리 | 필수 입력 누락 또는 부적합한 입력 | `ANY *.action` 호출 | 오류를 안전하게 처리(비정상 종료·데이터 오염 없음) + 명확한 오류 응답 확인 | 초안 [추정] | [추정] | `src/main/webapp/WEB-INF/web.xml:60` |
| TS-ef87ef36-B | FN-022 | *.action 요청 라우팅 흐름 |  |  | 경계 | *.action 요청 라우팅 흐름 경계 조건 | 경계 입력(빈 값·최대 길이·한계치) | `ANY *.action` 호출 | 경계에서도 일관 동작(오류 없이 처리 또는 명확한 거부) | 초안 [추정] | [추정] | `src/main/webapp/WEB-INF/web.xml:60` |

## 시나리오 커버리지

생성/확정/축소 카운트 — 표의 수치가 "검증 완료"로 오독되는 것을 막습니다.

| 항목 | 값 | 비고 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 시나리오 총계 | 84 | 기능 28본 × 정상/예외/경계(예외는 AC 수만큼) | [추정] |  |
| 종류별 | 정상 28 · 예외 28 · 경계 28 |  | [추정] |  |
| 확정 | 0/84 | 대시보드 시험 탭 확정 반영분 | [추정] |  |
| 축소 생성 | 39 | 시드 부족([미확인] 노트 보유) — 사람 보강 대상 | [추정] |  |
