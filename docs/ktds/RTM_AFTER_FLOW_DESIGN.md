# 에프터 업무흐름도 초안 (after-flow.json)

> 2026-07-17. 사용자 결정: "에프터에 표식만 할 거면 비포·에프터일 이유가 없다 — 에프터는
> 신규·변경·삭제로 **도식 구성이 바뀌는 것**을 보여줘야 한다." 세 안(결정론 초안 / 엔진 확장 /
> 단일 도식 축소) 중 **엔진 확장(LLM 미래 도식)** 채택.

## 1. 문제

비포·에프터 모달(RTM ② · 변경·영향)의 에프터가 "현행 도식 + 영향 표식"이라 비포와 구조가
동일했다. 분할 뷰의 존재 이유는 구조 diff 인데 표식 오버레이는 단일 도식으로 충분하다.

미래 토폴로지를 **대시보드가** 그리면 창작이지만, 근거의 절반은 이미 있다:
- `changeset.added` — 이름 있는 to-be 기능 목록(무엇이 생기는지는 근거, **위치·순서만 미지**)
- `changeset.removed`/`revived` — 기존 기능 id → 활동 flowRef 와 **결정론 조인**(확정적)
- `changeset.modified` — 변경 기점(기존 표식)

미지인 "삽입 위치·순서"는 LLM 판단([추정])으로 채우되 **산출물로 내려 사람이 검토**한다 —
인테이크의 다른 모든 산출과 같은 계약.

## 2. 계약

**생산**: ② 영향분석이 엔진 보고 후 `<세션>/after-flow.json` 을 쓴다
(SKILL.md §B --step 2 의 4번 + vite.config.ts `rtmImpactDirective` — 두 곳 동일 계약).

- 기반: `domain-graph.json` `domainMeta.businessFlows` 중 영향 흐름(flowRef)이 등장하는
  프로세스. **노드·엣지를 id 그대로 복사**하고 changeset 근거로만 바꾼다.
- added → 신규 활동 삽입(`change:"added"`, flowRef=to-be id, 연결 엣지도 `change:"added"`)
- removed → 활동에 `change:"removed"` 마킹(**제거 금지** — diff 가 보여야 한다)
- modified → `change:"modified"`
- **changeset 에 없는 구조 변경 금지**(재배치·개명·무근거 분기). 삽입 위치 근거는 `note`.

**형식**:
```json
{ "schemaVersion": 1,
  "flows": [{ "domainId": "domain:order", "baseTitle": "주문 생성",
    "nodes": [{ "id", "kind", "label", "flowRef"?, "change"? }],
    "edges": [{ "from", "to", "label"?, "change"? }],
    "note": "삽입 위치 근거 한 줄(선택)" }] }
```
`baseTitle` = 원 프로세스 제목 그대로 — 대시보드가 비포와 짝짓는 조인 키.

**소비**: `utils/businessFlow.ts parseAfterFlows`(방어 파싱 — 어긋난 장만 제외, 엣지 끝점
미실존이면 그 장 통째 기각) → `useIntake.loadAfterFlows`(ps=2, 404=정상) → ctx →
`FlowCompareModal` 이 `domainId+baseTitle` 로 짝지어 에프터 패널에 렌더. 짝 없음/기각/구산출
= **표식 오버레이 폴백**(종전 동작). 서빙: vite `RTM_SESSION_JSON_FILES` 화이트리스트.

**렌더 어휘**(`BusinessFlowView` MARK_META): `+ 신규`=ok 점선(엣지도 점선 ok) ·
`− 삭제`=error 점선+취소선+옅게 · `~ 변경 기점`=warn — 범례 자동 병기. 각주가 "[추정] 초안 —
연결 순서·분기는 검토 대상"을 상시 명시.

## 3. 한계·경계

- 원장 렌즈(/change)는 세션 산출이 아니라 after-flow 가 없다 — 표식 오버레이 유지(승격 금지).
- 도식 정합의 기계 검증(rtm-intake.mjs validate 급)은 미구현 — 대시보드 방어 파싱이 1차 게이트.
  기각이 반복되면 CLI 검증 추가를 검토.
- ①개정(답변 반영)은 ①만 재실행하므로 changeset 이 바뀌면 ② 산출(after-flow 포함)은 낡는다 —
  기존 stale 규약이 그대로 적용된다(② 재실행 시 재생성).
