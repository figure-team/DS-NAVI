# DS-APM → DS-NAVI 장애 RCA 리포트 드롭 계약 (v1)

> 상태: **초안 — DS-APM 측(박진혁) 협의 전** (2026-07-22)
> 근거: DS-APM 실물 예시 `2026-06-23_rca_checkout.md` 실측 + `ds-apm/pkg/ruler/coderca/rcaresult.go`.
> 원칙: **DS-NAVI 는 스키마를 발명하지 않는다** — DS-APM 이 현재 만드는 형식을 그대로 수용하고,
> 이 문서는 그 형식을 고정(계약화)한다. 상위 설계 = `INCIDENT_ANALYSIS_DESIGN.md`.

## 1. 전달 방식·경로

- **방식**: 파일 드롭. DS-APM 이 분석 프로젝트 파일시스템에 직접 기록한다
  (**동일 호스트/공유 볼륨 전제** — 원격 분리 배치는 이 계약 범위 밖, 협의 항목 C1).
- **경로**: `<분석프로젝트 루트>/ds-hub/issues/` (**가칭 — 협의 항목 C2**).
  DS-NAVI 서버는 이 경로를 상수 1곳(`INCIDENT_DROP_DIR`)으로만 참조하므로 확정 시 1줄 변경.
- **파일명**: `<YYYY-MM-DD>_rca_<service>.md` (실물 관찰 패턴). 단 DS-NAVI 는 파일명을
  **표시용으로만** 쓰고, 날짜·service 의 정본은 frontmatter 다(파일명 규칙 변경에 내성).
- **서비스→프로젝트 매핑 책임 = DS-APM**. DS-APM 쪽 매핑이 누락되면 드롭 자체가 오지
  않으며(DS-APM fail-closed), 잘못 매핑되면 본문 file:line 이 이 프로젝트에 없다 —
  DS-NAVI 는 후자를 "전량 not-in-project 경고"로 감지한다(설계서 §2.3-②).

## 2. 파일 형식

마크다운 + YAML frontmatter. 인코딩 UTF-8.

### 2.1 frontmatter (실물 5필드)

| 필드 | 필수 | 형식 | 비고 |
|---|---|---|---|
| `runId` | **필수** | hex 문자열 | **건 식별자(멱등 키)** — 같은 runId 재드롭은 중복 수령하지 않음 |
| `service` | **필수** | 문자열 | DS-APM 서비스명 |
| `createdAt` | 권장 | RFC3339 | 누락 시 파일 mtime 폴백 |
| `confidence` | 권장 | high\|medium\|low | 그 외/누락 → **low 클램프**(ds-apm `rcaresult.go:89-98` 과 동일 규칙) |
| `baselineCommit` | 권장 | git hash | RCA 가 분석한 커밋. DS-NAVI 스캔 커밋과 다르면 "커밋 불일치" 배지 |

**여분 필드는 무시**(전방 호환) — DS-APM 이 severity·알람 핑거프린트·딥링크 등을 추가해도
파싱이 깨지지 않는다(추가 시 협의 항목 C3 으로 정식 편입).

### 2.2 본문 섹션 (한국어 h2)

| 섹션 | 필수 | DS-NAVI 처리 |
|---|---|---|
| `## 근본 원인` | **필수** | file:line 추출 대상(시드 매핑 입력) + 리포트 카드 표시 |
| `## 수정 제안` | 선택 | file:line 추출 대상 + 해결방안서에 "DS-APM RCA 제안" 인용 승계. "자동 적용되지 않음"(HITL) 고지 유지 |
| `## 한계` | 선택 | 해결방안서 말미·UI 카드에 **그대로 승계 표기**(과신 방지) |

- **file:line 근거는 산문 인라인**을 허용한다(실물: "위치: pkg/…/sop_document.go:340
  (함수명), 같은 파일 311 (…)"). DS-NAVI 가 결정론 파서로 `경로.확장자:줄번호` 패턴을
  추출하므로 별도 구조화 필드는 요구하지 않는다. 단 **경로는 해당 레포 루트 기준
  상대경로**여야 한다(실물 관찰과 동일).
- 에러 로그가 없는 "코드 변경 추정" RCA 도 유효 입력이다(실물 한계 섹션 명시 사례).

### 2.3 수용 게이트 (DS-NAVI 측 판정)

파싱 가능 조건: frontmatter `runId`+`service` 존재 **AND** `## 근본 원인` 섹션 존재.
불합격 파일도 버리지 않는다 — 원문 보존 + 원장에 `unparseable` 기록(DS-APM 의
"unparseable raw 미영속 → 디버깅 불가" 교훈의 역적용).

## 3. 픽스처 (P1 산출물, 데모 프로젝트)

`examples/jpetstore-6/ds-hub/issues/` (경로 확정 전 가칭 위치):

| 파일 | 용도 |
|---|---|
| `2026-07-22_rca_jpetstore.md` | **정상 건** — file:line 이 jpetstore 실존 코드(Cart.java:105·110, CartActionBean.java:125, 실측 검증) → 시드 matched 경로 검증 |
| `2026-06-23_rca_checkout.md` | **not-in-project 건** — DS-APM 실물 예시 원본 그대로(타 프로젝트 경로) → 전량 not-in-project 경고 경로 검증 |

## 4. 협의 항목 (DS-APM 측과 확정 필요)

| # | 항목 | 현 가정 |
|---|---|---|
| C1 | 배치 전제(동일 호스트/공유 볼륨) 확인 | 동일 호스트 |
| C2 | 드롭 폴더 경로·이름(한글 폴더명 여부 포함) | `ds-hub/issues/` |
| C3 | frontmatter 확장: severity·알람 핑거프린트·에러 로그 원문·DS-APM 딥링크 URL | 없음(여분 필드 무시로 수용 준비됨) |
| C4 | 같은 장애의 재분석(runId 신규 발급 vs 동일 runId 갱신) | runId 신규 발급(파일 누적) |
| C5 | 파일 완결성(쓰기 중 파일 읽힘 방지 — tmp 후 rename 등) | rename 원자성 권장 |
