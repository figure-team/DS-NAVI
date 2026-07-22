# 탐색 → 작업 요청 승격 설계 — EXPLORE_PROMOTION

상태: **구현 완료(v1)** · 2026-07-22
관련: `IMPACT_LEDGER_FEDERATION_DESIGN.md`(원장 연합·리졸버 선행) · `RTM_IMPACT_GATE_DESIGN.md`(① 근거 번들 P4)

## 0. 논쟁 요지(사용자 문제 제기 → 결론)

- "승격이 ①을 그냥 처음부터 돌린다면 버튼이 무슨 의미냐, 탐색 X 를 보고 접수했는데 ②가 Y 로
  나오면 혼란"(사용자) → 인정: **프리필만 하는 승격은 만들 가치가 없다**.
- 다만 그 혼란은 버튼이 없어도 존재한다(탐색 후 수동 접수 시 연결·설명 수단만 사라짐).
- ①은 이미 5축 근거 번들로 접지돼 있다(P4 — "① 근거 0" 은 낡은 진단). 탐색이 보탤 수 있는 건
  번들에 없는 유일한 축 = **코드 도달성 관점**뿐이다.
- 결론: **3종 세트가 한 묶음**이어야 성립한다 — ①프리필 ②유래 도달성 요약 주입 ③② 델타 뷰
  (다름의 서사화). 셋 중 하나라도 빠지면 만들지 않는 것이 낫다.

## 1. 계약 3종

### 1.1 프리필 · 버튼 분기(라벨 개정 2026-07-22 — 사용자 지시)
**탐색 기록은 작업 요청 시작 후에도 사라지지 않는다** — 원장 불소멸 원칙 + ② 델타가 유래
스냅샷을 계속 참조. 그래서 라벨은 "승격"(이동·소멸 암시)이 아니라 **"작업 요청 →"** 이고,
이미 이 탐색에서 시작된 세션이 있으면 **"작업 요청 열기 →"**(해당 세션 `?sid=` 이동)로 바뀐다
(비활성화 대신 이동). 판정 = 서버 승격 역인덱스 `mapPromotedSids`(origin.jobId→sid, 폐기 세션
제외·최신 우선)가 병합 응답의 탐색 행에 `promotedSid` 로 얹는다.

/change 헤더의 버튼(**탐색(source=change) 행에만** — 작업 요청·장애 유래 행은 자기 프로세스가
있으므로 제외) → `/requests?promote=<jobId>&pq=<질의>`. 작업 요청 메뉴가 새 요청 모달을 자동
오픈: 질의 프리필 + **유래 칩**(jobId 표기·× 로 떼면 일반 요청). 일회성 파라미터는 처리 즉시
URL 에서 걷는다(★함정: URL→상태 effect 의 스트립과 sid 미러가 같은 커밋에서 각자 스냅샷으로
setSearchParams 를 불러 나중 호출이 promote 를 되살린다 — 미러도 삭제, 라이브 실측).

### 1.2 유래 주입(① 디렉티브)
접수 시 `originJobId` 가 서버로 가고, 서버는 **원장 실재 jobId 만** `session.origin{jobId,query}` 으로
박는다(없으면 무시 — 유래 없는 일반 세션). ① spawn 디렉티브에 `rtmOriginDirective` 가 붙는다:
서버가 유래 스냅샷(연합 리졸버)을 **결정론 요약**(시드 6·상류 8·하류 8·도메인 6 상한, 유계)해
동봉하고, "번들이 정본·요약은 참고 근거·요약에만 있는 파일을 changeset 근거로 삼지 마라"를
못 박는다. 번들 축 신설이 아닌 디렉티브 경량 주입인 이유 = 한계 가치가 도달성 관점 하나라
P4 번들 기계(예산·pre-cite)를 건드릴 무게가 아니다.

### 1.3 ② 델타 뷰
승격 세션의 ② 화면에 "**유래 탐색 대비**" 카드: `computeImpactFileDelta`(rtm/types.ts) 가 상·하류
도달 파일 **합집합**의 결정론 집합 비교로 추가/제외를 가른다(시드는 관점이 달라 제외 — 탐색=
사용자 파일, ②=changeset 조인). **원인은 단정하지 않는다** — "분해·답변으로 정제된 결과일 수
있다" 안내만. 유래/② 스냅샷 부재는 각각 정직하게 표기(빈 델타로 위장 금지). "탐색 분석 열기 →"
로 /change 원장 열람.

## 2. 구현 지점

- 서버: `vite.config.ts` — handleRtmIntakePost(originJobId 수용·원장 대조), `rtmOriginDirective`,
  `server/rtm-sessions.ts` RtmSession.origin
- 프런트: `ChangeImpactView`(승격 버튼) · `RtmView`(promote 파라미터 수신·미러 스트립) ·
  `useIntake`(intakeOrigin·originImpact 로드) · `context` · `IntakePanel`(유래 칩) ·
  `ImpactStepView`(델타 카드) · `rtm/types.ts`(origin 필드·델타 헬퍼+테스트 3건)

## 3. 한계·검증 현황

- **실 ① LLM 승격 런 검증 완료(2026-07-22, 사용자 라이브 실행)** — jpetstore 카카오 탐색
  (jobId 32587…)에서 승격한 세션 f04808c6…: origin 영속·①② 산출/컨펌·세션 로컬 스냅샷
  (`impact/` — 연합 F2 쓰기 경로 겸증)·② 델타 카드 실데이터 렌더(+AccountService.java 도달 /
  −AccountServiceTest.java 제외) 전부 확인. playwright 8체크 ALL PASS(열기 분기·델타·비단정 안내).
- 델타는 파일 relPath 집합 비교뿐 — 도메인/흐름 델타는 필요가 실증되면 확장.
- incident P6(장애→요청 승격)은 이 계약의 동형 재사용 후보: resolution 요지=프리필,
  incidents/<runId>/ 스냅샷=유래(리졸버가 이미 해석 가능), 델타 카드 재사용.
