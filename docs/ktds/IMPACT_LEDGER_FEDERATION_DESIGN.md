# 영향 이력 연합(단일 기록자 + 읽기 병합) 설계 — IMPACT_LEDGER_FEDERATION

상태: **승인·구현 완료(v1.1)** · 2026-07-22 — 승인 후 구현 중 §2.3 을 source 파라미터 3종에서
**jobId 단일 키 리졸버**로 개정(v1.1): 프런트 fetch 계약·useIntake 2단 로드가 무변경이 되어
§2.4 불변식이 자명해지고 표면이 줄었다.
선행 문서: `INCIDENT_ANALYSIS_DESIGN.md` §2.6(이중 기록) · `RTM_INTAKE_WORKSPACE_DESIGN.md` §2.3(포인터+원장 스냅샷) · 재점검(2026-07-22, 5관점 리뷰) 발견 ②원장/③뮤텍스

---

## 0. 결정 한 줄

**impact-history 원장(`.understand-anything/impact-history/`)에는 변경·영향 메뉴(서버 잡)만 쓴다.**
작업 요청·장애 분석은 각자 원장/디렉터리에만 기록하고, `/change` 의 "분석 기록" 목록은
**읽기 시점에 세 출처를 병합**해 보여준다(장애 메뉴의 "원장+미수령 드롭 병합" 선례와 동형).

## 1. 왜 바꾸나 (근거 = 재점검 실측)

이중 기록의 원논거는 "한 번 돌리고 두 곳에서 본다"(열람 편의)였다. 현재 비용이 편익을 넘었다:

| 재점검 발견 | 원인 | 본 설계 후 |
|---|---|---|
| P2 ledger.json 무잠금 3프로세스 RMW → lost-update | 서버·incident.mjs·rtm-intake.mjs 가 같은 파일에 append | 기록자 1(서버) — **구조적 소멸** |
| P2 seedOriginBadge 오라벨(kind 로 완화) | 출처를 필드로 후행 판별 | 출처=원장 자체 — **원천 차단** |
| P3 finalize 후 impact-history 낡음(수명 불일치) | 장애 상태가 두 원장에 이중 존재 | /change 도 incident-history 에서 파생 — resolved 반영 |
| P3 장애 이력이 50상한에서 남보다 빨리 밀림 | 3주체가 한 상한을 나눠 씀 | 원장별 자기 수명 정책 |
| 이중 append 사이 크래시 창 | 두 원장 순차 append | append 1회 |
| 경계 리뷰: 메뉴=산출물 1:1 소유 흐림 | 남의 산출물에 기록 | 소유 명확 |

각 메뉴가 이미 자기 화면에서 자기 impact 를 렌더하므로(작업 요청 ② 인라인, 장애 건별 카드)
"두 번째 기록"의 열람 가치는 병합 읽기로 완전 대체된다.

## 2. 계약 변경

### 2.1 기록(단일 기록자)

| 주체 | 스냅샷 정본 | 원장 | 변경 내용 |
|---|---|---|---|
| 변경·영향(서버 잡) | `impact-history/<jobId>/` | impact-history ledger | **무변경**(WAL/pending·reconcile 그대로) |
| 작업 요청 code-impact | `rtm-intake/<sid>/impact/`{impact,impact-verify-report}.json (**이동** — 종전 impact-history/<jobId>/) | 세션 원장(session.json)+`impact-run.json` 포인터(기존) | rtm-intake.mjs 의 impact-history append·스냅샷 복사 **제거** |
| 장애 analyze | `incidents/<runId>/`(기존 정본 그대로) | incident-history ledger(기존) | incident.mjs 의 impact-history append·복사 **제거** |

- `impact-run.json` 의 `jobId` 필드는 **유지**(병합 dedup·표시 키). 의미가 "원장 스냅샷 키"에서
  "실행 식별자"로 좁아질 뿐 형식 불변.
- CLI 직접 실행분 미기록 원칙(정직한 범위) 유지.

### 2.2 읽기 병합 — `/impact-history` 응답 확장

```
{ entries: MergedRow[] }
MergedRow = ImpactHistoryEntry & {
  source: "change" | "intake" | "incident";   // 병합 시 서버가 부여(원장 유래)
  ref?: { sid?: string; runId?: string };      // 열기 키(소스별)
}
```

- change: 기존 ledger 행 그대로(source:"change").
- intake: `rtm-intake/*/impact-run.json` 순회 → 행 파생(query=요청 원문은 session.json 에서,
  finishedAt=포인터 기록 시각, rootSlot:false 상당 의미는 source 로 표현).
- incident: incident-history ledger 의 analyzed 이상 항목에서 파생 — **status 는 incident-history
  가 정본**이라 finalize 후 resolved 가 /change 에도 그대로 보인다(§1 수명 불일치 해소).
- 정렬 finishedAt 내림차순, 병합 상한은 표시 정책(50)으로 서버가 자름.

**레거시 dedup**: 기존 ledger 에 남은 rootSlot:false 구 항목(구 intake/incident 기록)은
파생 행과 jobId 가 같으므로(장애 jobId=hash(`incident:<runId>`) 결정론, intake 는 포인터에 저장)
**jobId 일치 시 파생 행이 이긴다**. 짝 없는 구 항목은 그대로 노출(kind/query 접두 폴백 배지 —
기구현). **일회성 마이그레이션 스크립트는 만들지 않는다**(additive·무수술, 상한이 자연 소거).

### 2.3 스냅샷 서빙 — jobId 단일 키 리졸버 (v1.1 개정)

계약 불변: `/impact-history-item?id=<16hex jobId>&name=…`. 서버가 jobId 하나로 세 위치를
**순차 해석**한다(`server/impact-federation.ts` `resolveImpactSnapshot`):

```
① impact-history/<jobId>/<name>            (change + 연합 이전 레거시 스냅샷)
② rtm-intake/<sid>/impact/<name>           (포인터 impact-run.json 의 jobId 일치 세션만)
③ incidents/<runId>/<name>                 (incident-history 원장에 jobId 가 박힌 건만)
```

- 검증 무변경: id=`^[0-9a-f]{16}$`, name=`IMPACT_SNAPSHOT_FILES` 화이트리스트 — 리졸버는
  검증된 값만 받고, 해석은 포인터/원장에 **기록된 jobId 매칭**으로만 한다(임의 경로 불가).
- v1.0 의 source 파라미터 3종은 폐기 — 프런트 fetch·딥링크(?run=jobId)·useIntake 가 전부
  무변경이 되어 마이그레이션 표면이 사라진다.

### 2.4 두 표면 불변식 계승 (★)

`useIntake.loadImpactRun` 의 2단 로드("포인터 → **`/change` 와 같은 스냅샷**을 읽는다 — 두 표면이
갈라질 수 없다")는 **코드 무변경으로 유지**된다: 같은 `?id=<jobId>` 요청이 리졸버를 거쳐
같은 파일(세션 스냅샷)로 해석되므로, /change 병합 뷰와 인테이크 ② 인라인은 정의상 같은 파일을
읽는다. 정본 위치가 원장 디렉터리→세션 디렉터리로 바뀔 뿐, 단일 파일 원칙은 그대로다.

### 2.5 최신 배지·루트 슬롯

무변경 — 최신 후보는 원래 rootSlot 항목뿐이었고, 이제 ledger 에 서버 잡만 남으므로 현행
`newestDone`/지문 대조 로직이 그대로 옳다. 파생 행(source≠change)은 후보가 아니다(구조적).

### 2.6 kind 필드(2026-07-22 도입)의 지위

신규 기록엔 불필요해진다(출처=원장). **레거시 행 판별·병합 응답의 표시 필드로 존치** —
서버가 파생 행에 kind 를 채워 내려보내면 프런트 배지 분기(kind 우선, 기구현)를 재사용할 수 있다.

## 3. 영향 지점(구현 파일)

- `ktds-legacy-plugin/scripts/rtm-intake.mjs` — 스냅샷 목적지 세션 이동, ledger append 제거
- `ktds-legacy-plugin/scripts/incident.mjs` — impact-history 복사·append 제거(§2.1)
- `understand-anything-plugin/packages/dashboard/server/impact-federation.ts` — **신설**: 파생
  (deriveIntakeRows/deriveIncidentRows)·병합(mergeImpactHistory)·리졸버(resolveImpactSnapshot)
  순수 모듈 + 단위 테스트 11건
- `understand-anything-plugin/packages/dashboard/vite.config.ts` — `/impact-history` 병합 응답,
  `/impact-history-item` 리졸버 배선(§2.3 v1.1), `RTM_SESSION_JSON_FILES` 무변경
- `src/components/rtm/useIntake.ts` — **무변경**(v1.1 리졸버 덕에 재지향 불필요, §2.4)
- `src/components/ChangeImpactView.tsx` — HistoryEntry 에 source/ref/discarded/incidentStatus
  수용, 배지 source 1순위(+기존 kind/접두 폴백), 폐기 배지·해결확정 병기
- SKILL 2종(understand-rtm §B·understand-incident) — "impact 원장 기록" 서술을 자기 원장으로 정정
- 문서: `INCIDENT_ANALYSIS_DESIGN.md` §2.6 추기 · `RTM_INTAKE_WORKSPACE_DESIGN.md` §2.3 추기

## 4. 단계

| 단계 | 내용 | 게이트 |
|---|---|---|
| F1 | 읽기 병합(서버) — writers 무변경, 파생+dedup 만 | 기존 데이터로 병합 결과 검증 |
| F2 | writers 전환(rtm-intake·incident) + useIntake 재지향 | 인테이크 ②·장애 analyze 라이브 e2e |
| F3 | ChangeImpactView 병합 행 렌더·열기 링크 | playwright QA(세 출처 행·열기·최신 배지) |
| F4 | SKILL·문서 정합 + 전 테스트 | legacy-core+dashboard green |

F1 이 선행 무해(read-only)라 단계별 확인 정지에 적합하다.

## 5. 미결·함정

- **reconcileImpactHistory**: 종전 "장애 jobId 인식해 중복 기록 방지" 분기는 F2 후 죽은 코드 —
  레거시 안전을 위해 한 릴리스 유지 후 제거 후보.
- **정적 데모(sync:demo)**: /impact-history 는 dev 전용(historyEnabled 분기)이라 병합도 dev 전용.
  demo 번들 커밋물(examples ledger.json)은 레거시 행 포함 그대로 — 폴백 배지가 처리. 재캡처 시 자연 갱신.
- **세션 폐기와 이력**: discarded 세션의 파생 행 노출 여부 — 제안: 노출하되 세션 상태 배지 승계
  (원장은 폐기를 숨기지 않는다는 기존 원칙). 확정 필요.
- **incident P6(장애→요청 승격)**: 본 설계가 선행되면 승격 시 "스냅샷 재사용" 계약(경계 리뷰 A 권고)을
  세션 포인터가 incidents/<runId>/ 를 가리키는 형태로 자연 표현 가능 — P6 설계 시 재론.

## 6. 추기 — 목록 출처별 분리 표시 (2026-07-22, 사용자 지시)

사용자 문제 제기: "변경·영향이 탐색 도구라면 목록엔 탐색 기록만 나와야 하는 것 아닌가?"
결정 = **분리 표시**(완전 필터링은 반려 — 작업 요청 ② "변경·영향에서 열기" 딥링크와 장애
열람처가 목록에서 길을 잃는다): 좌측 원장을 `source` 기준 3그룹으로 가른다 —
**탐색 기록**(change, 첫 그룹·빈 상태도 이 그룹에 표기) / **작업 요청 유래** / **장애 유래**
(유래 그룹은 0건이면 생략, 열람 전용·정본은 각자 메뉴 명시). 행 배지도 정리: 출처는 그룹
헤더가 말하므로 유래 그룹 행에서 출처 배지를 제거하고 부가 상태(폐기/시드 불일치/완료)만
남긴다(탐색 그룹은 시드 근거 등급 배지 유지). 좌하단 안내에 "이 메뉴는 탐색 도구"를 명시하고
정식 접수(작업 요청)·추적(추적표) 링크를 갱신 — 종전엔 역할 구분 문구가 자연어 탐색 모달
안(intakeHint)에만 있었다.

### §6 추기 — 접기·검색 (2026-07-22, 사용자 지시)

- **기본 접힘**: 탐색 기록만 펼침, 작업 요청 유래·장애 유래는 접힘(▸ 토글). 열람 중(?run=)
  항목이 접힌 그룹에 있으면 그 그룹은 강제로 편다(딥링크가 목록에서 길을 잃지 않게).
- **검색**: 공용 SearchInput(질의문 부분일치·대소문자 무시). 검색 중엔 접힘을 무시하고 매치가
  있는 그룹만 자동으로 펴며 카운트를 (매치/전체)로 표기 — 접힌 그룹에 숨은 매치는 조용한
  누락이므로. 전 그룹 무매치면 "검색 결과 없음"을 명시. 검색 해제 시 접힘 상태 복원.
