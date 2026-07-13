# 도메인 계층(상단도메인 → 서브도메인) 설계 — DOMAIN_HIERARCHY

> 2026-07-13 설계(사용자 결정: 설계문서만 먼저, 구현 착수는 별도 결정).
> 같은 날 사용자 피드백 반영: **상단도메인 = 랜딩의 1급 개체**, **LLM 그룹 분류 = 정식 단계**.
> 관련: WORK_MAP_DESIGN.md(업무 지도 IA), DOMAIN_MAP_DETAIL_DESIGN.md(도메인 카드),
> 분류기 하드닝(132→87, 0.3.8), eGov 메가도메인→11모듈 사례.

## §1 문제 정의

1. **평면 도메인 폭발(mmobile 실측)** — `domain-plan.confirmed.json`에 도메인 **87개**가
   최상위에 병렬(decidedBy=운영자, `aliasKeys`/`excludedKeys` 전부 빈 배열 = 큐레이션 0으로
   통째 확정). 공통 계열이 각각 최상위 도메인으로 승격돼 있다:
   - `com` 공통 콘텐츠·세션·파일 유틸리티 / `comm` 공통 오류 처리 / `commcode` 공통코드·상품후기
   - 비업무 디렉터리도 도메인화: `temp` `sample` `example` `dev` `etc` `asis`
2. **경로 신호의 한계(SI 특성)** — 결정론 분류(경로 기반)는 "비슷한 기능이 같은 디렉터리에
   모여 있다"는 전제 위에서만 정확하다. SI 현장은 도메인 경로 규약 없이 개발되는 경우가 많아,
   경로가 낳은 서브도메인들은 신뢰할 수 있어도 **그 위의 업무 대분류는 경로에서 도출 불가** —
   의미 판단이 필요하다.
3. **merge의 파괴성** — 현행 유일한 정리 수단인 `{op:"merge"}`는 from 도메인을 흡수·제거한다
   (aliasKeys 감사 기록만 잔존). 공통 계열을 merge하면 서브 정체성(카드·fill·흐름도 구분)이
   소실되고, eGov에서 겪은 반대 문제(메가도메인)를 mmobile에서 재현하게 된다.
4. **양방향 스케일 문제** — eGov는 거대 단일 도메인을 11모듈로 쪼개야 했고, mmobile은 87개를
   묶어야 한다. 평면 구조로는 어느 방향도 깔끔히 못 푼다.

## §2 확정 결정 (2026-07-13 사용자)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 계층 구조 | **상단도메인(그룹) → 서브도메인(결정론 도메인) → 업무흐름도** 3층. 그룹은 비파괴 오버레이 — 서브도메인 key·파일 귀속·fill 불변 |
| D2 | 랜딩 | 시스템 구성도의 카드가 **상단도메인**으로 바뀐다(87개 아님). 구성 형식은 현행 동일(아이콘·GroundedBar·기능 칩 — 집계값) |
| D3 | 워크스페이스 | 상단도메인 카드 클릭 → **좌측 내비 = 그 그룹의 서브도메인 목록**, 서브도메인 선택 → 현행 업무흐름도 목록/뷰 |
| D4 | 분류 주체 | **상단도메인 묶음은 LLM이 판단**(의미 분류 — 경로 규약이 어긋난 개발을 흡수). 서브도메인·파일 귀속은 결정론 유지 |
| D5 | 재현성 | LLM 판단은 **확정 전 1회**. 확정 플랜(groups 포함)이 닻 — 재실행은 플랜 재사용, 재분류는 명시적 재실행 시에만 |

## §3 목표 / 비목표

| 구분 | 내용 |
|---|---|
| 목표 | 기존 fill 산출물(`fill/<key>.json`)·도메인 카드·업무흐름도 **전부 재사용**(서브도메인 key 불변) |
| 목표 | 재현성 불변 — 그룹은 plan 레벨 순수 연산으로 영속, byte-identical 정렬 규약·드리프트 게이트 무영향 |
| 목표 | 그룹 없는 프로젝트(jpetstore 등 소규모)는 기존 평면 렌더 폴백 — 하위호환 파손 0 |
| 비목표 | **파일 단위 LLM 재귀속** — 파일→서브도메인 귀속은 결정론 유지(신뢰성). 개별 파일이 잘못 놓인 경우는 기존 `{op:"move"}`로 수동 교정 |
| 비목표 | 소스 경로 재구조화, 대시보드 관계선·분산 배치 재도입(2026-07 사용자 확정 금지사항 유지) |

## §4 데이터 모델 (plan 스키마)

`ConfirmedPlanSchema`에 **additive optional** 필드 추가(schemaVersion 1 유지 — 그룹 없는
기존 plan 파일은 그대로 유효):

```ts
// types.ts — 추가
export const ConfirmedGroupSchema = z.object({
  key: z.string(),          // 그룹 키 — `g:` 접두 네임스페이스로 도메인 key와 충돌 원천 차단
  name: z.string(),         // 표시명(한국어) — 예: "공통", "고객", "관리자"
  memberKeys: z.array(z.string()),  // 정렬 유지
})
// ConfirmedPlanSchema에: groups: z.array(ConfirmedGroupSchema).optional()
```

**불변 규칙**(confirm 순수 함수가 강제, 테스트 고정):

1. `memberKeys ⊆ domains[].key` — 존재하지 않는 도메인 참조 금지(merge/exclude 후 정합 재검증).
2. 한 도메인은 **최대 1개 그룹** 소속. 미소속 도메인 허용(대시보드가 "미분류" 카드로 렌더).
3. 그룹 key는 `g:` 접두 필수 — 도메인 key 공간과 분리, aliasKeys와도 충돌 없음.
4. 모든 배열 정렬(groups는 key순, memberKeys는 사전순) — byte-identical 보장 유지.
5. 빈 그룹(memberKeys=[]) 금지 — 마지막 멤버 제거 시 그룹 자동 삭제.

**PlanOp 확장** (기존 merge/move/exclude/rename에 추가):

```
{op:"group",   key:"g:common", name:"공통", members:["com","comm","commcode"]}  // 생성·확장(멱등)
{op:"ungroup", key:"g:common"}                                                  // 해체(도메인은 잔존)
```

- `group`은 upsert 의미: 같은 key 재호출 시 members 합집합·name 갱신 — 재실행 멱등.
- `merge`·`exclude`가 그룹 멤버를 제거하면 memberKeys에서 자동 이탈(규칙 1 유지).
- ops 배열은 순서대로 적용(기존 applyOps 위임 구조 그대로).

## §5 LLM 그룹 분류 — 정식 파이프라인 단계

경로(결정론)가 서브도메인까지, 의미(LLM)가 상단도메인을 맡는 역할 분담. plan→confirm 사이에
**group-classify 단계**를 신설한다:

```
scan → plan → group-classify(LLM) → confirm(사람 게이트) → map → bundle → fill → emit
```

1. **입력** — 서브도메인별 자립 요약: key·현재 name·roots·파일 수·대표 파일 경로 N개·
   (있으면) 기존 fill의 도메인 요약 1줄. 전 소스를 읽지 않는다 — plan 산출물 수준이면
   87개 전량이 단일 컨텍스트에 들어간다(팬아웃 불요; 수백 개 규모면 fill-fanout 패턴 재사용).
2. **판단** — LLM이 업무 의미 기준으로 상단도메인을 구성한다(예: 공통/고객/관리자/주문·결제/
   제휴·외부연동/알림·발송). 경로 토큰이 아니라 name·대표 파일이 근거이므로 **경로 규약이
   어긋난 서브도메인도 올바른 상단도메인에 배정**될 수 있다. 목표 규모 가이드: 상단 6~15개,
   그룹당 서브 2개 이상(1개짜리 그룹 남발 금지), 확신 없으면 미분류로 남긴다(지어내기 금지).
3. **출력** — group ops 초안 `.spec/map/group-ops.suggested.json` + 배정 근거 1줄씩(사람 검토용).
4. **확정** — 기존 confirm 게이트 재사용: `confirm --auto-approve --by <담당자> --ops <초안>`.
   판단은 LLM, 승인은 사람(D5 재현성 규약 — 확정 후 재실행은 플랜 재사용, LLM 재호출 없음).
5. **모델 규약** — 팬아웃 공통 문안 재사용(1순위 세션 모델/2순위 sonnet/3순위 haiku,
   비대화형=세션 모델). effort는 개방형 판단이므로 기본(low 아님).

## §6 skeleton / emit → domain-graph.json

- **노드·엣지 스키마 무변경.** 그룹은 `ktdsMap.groups`(additive 메타)로만 내보낸다:

```json
"ktdsMap": { "groups": [{ "key":"g:common", "name":"공통", "memberKeys":["com","comm","commcode"] }] }
```

- UA-core 호환: 노드 타입 추가가 아니라 ktdsMap 확장이므로 `ua-base` 태그 기준 불변 검사에
  안전(코어 스키마 무접촉). 그룹 없는 그래프를 읽는 기존 대시보드도 파손 0.
- skeleton/fill/verify 파이프라인은 서브도메인 단위 그대로 — 그룹은 emit에서 plan을 투영만 한다.

## §7 대시보드 (업무 지도) — D2·D3 반영

WORK_MAP_DESIGN의 뷰포트 맞춤·URL 진실 원칙 유지. 계층 있는 프로젝트의 IA:

```
/domains                       ← 랜딩 = 시스템 구성도, 카드 = 상단도메인
│ ┌─ <시스템명> 시스템 ────────────────────────────┐  ┌ 타 시스템 연동 ┐
│ │ ┌ 🧩 공통 ────────────┐ ┌ 👤 고객 ──────────┐ │  │ (현행 동일)    │
│ │ │ GroundedBar(집계)    │ │ …               │ │  └───────────────┘
│ │ │ 서브도메인 3 · 기능 N │ │                 │ │
│ │ └─────────────────────┘ └─────────────────┘ │
│ │ ┌ 🗂 미분류 (…) ┐      ← groups 미소속 서브도메인 묶음
│ └───────────────────────────────────────────────┘
│
/domains/g:common              ← 상단도메인 워크스페이스
│ ┌ 좌측 내비 ──────┐ ┌ 본문 ──────────────────────────────┐
│ │ 서브도메인 목록   │ │ 선택된 서브도메인의 업무흐름도        │
│ │ · com 콘텐츠·세션 │ │ (businessFlows[] 목록·뷰 — 현행     │
│ │ · comm 오류 처리  │ │  화면 B 를 그대로 재사용)            │
│ │ · commcode 공통코드│ │  ?view=business / ?view=code&flow= │
│ └─────────────────┘ └────────────────────────────────────┘
```

- **랜딩 카드 = 상단도메인만**(D2). 카드 정보는 서브도메인 집계(근거율 GroundedBar 평균,
  서브도메인 수, 대표 기능 칩 상위 N + "+N more"). 형식·토큰은 현행 구성도와 동일.
- **워크스페이스 좌측 내비 = 서브도메인 목록**(D3). 서브도메인 선택 시 본문은 현행
  업무흐름도/기능(코드 흐름) 탭 그대로 — 화면 B를 그룹 층으로 한 단계 감싸는 구조.
- **딥링크 하위호환**: 기존 `/domains/:domainId`(서브도메인)는 소속 그룹 워크스페이스로
  리다이렉트하고 해당 서브도메인을 선택 상태로 연다(`?flow=`·`?view=` 의미 보존).
- **그룹 없는 프로젝트**(jpetstore 5도메인 등): `ktdsMap.groups` 부재 → 현행 평면 렌더
  폴백(랜딩 카드 = 도메인). 분기점 하나로 회귀 0.

## §8 마이그레이션 / mmobile 적용 시나리오

1. 그룹 없는 기존 plan·graph 전부 그대로 유효(optional 필드) — 재확정 강제 없음.
2. mmobile 절차: ① `temp/sample/example/dev` 등 exclude ops ② `group-classify`(LLM)로
   초안 생성 ③ 사용자 검토 후 `confirm --ops` 재확정 ④ fill 재개 — **기존 fill 산출물
   재사용**(key 불변), 신규 서브도메인만 채움.
3. eGov 역방향 검증: 11모듈을 유지한 채 상위 그룹으로 층위만 부여 가능(선택).

## §9 검증 계획

1. **단위** — confirm 순수 함수: group/ungroup 멱등·정렬·불변 규칙 1~5, merge/exclude 연동
   이탈, byte-identical 스냅샷(confirm.test.ts 계열).
2. **group-classify** — 초안 스키마 게이트(zod: ops 형식·member 실존·1개짜리 그룹 금지),
   미분류 허용 검증. LLM 출력이라 내용은 사람 게이트가 최종 방어선.
3. **emit 하위호환** — groups 유/무 각각 domain-graph 스냅샷, UA 스키마 zod 통과.
4. **대시보드** — 시각 QA(playwright 헤드리스 요령): jpetstore(그룹 없음, 회귀 0)·mmobile
   (상단도메인 랜딩·좌측 내비 서브도메인·딥링크 리다이렉트).
5. **실측 게이트** — mmobile 재확정 후 랜딩 카드 87 → 상단도메인 6~15+미분류로 감소 확인.

## §10 구현 단계 (착수 시)

| 단계 | 내용 | 산출 |
|---|---|---|
| P1 | 스키마+confirm 순수 함수+테스트 | types.ts, confirm.ts |
| P2 | CLI(plan 표·ops 파서) + group-classify 단계 + SKILL 절차 | understand-map.mjs, SKILL.md |
| P3 | emit ktdsMap.groups + 스냅샷 | emit.ts |
| P4 | 대시보드: 상단도메인 랜딩 + 그룹 워크스페이스(좌측 내비) + 딥링크 리다이렉트 + 시각 QA | DomainMapView 계열 |
| P5 | mmobile 재확정 e2e(exclude→group-classify→확정→fill 재개) | 실측 검증 |

**미결 질문**: ① 그룹 아이콘/색 배정 규칙(도메인 카드 관례 승계 여부) ② 미분류 카드의
워크스페이스 동작(그룹과 동일 취급인지) ③ eGov에 소급 적용할지.
