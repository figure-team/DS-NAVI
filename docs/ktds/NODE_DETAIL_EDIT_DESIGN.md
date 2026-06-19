# 노드 상세 — 템플릿 채움 + 사용자 편집/확정 설계서

> 화면2 기능 스파인의 **노드(step) 상세**를 풍부하게 채우고(템플릿 기반), 분석 이후
> 사용자가 **웹에서 LLM 의미 주장을 편집·확정**할 수 있게 한다. 편집/확정은 **서버**에
> 저장되고, 저장 즉시 신뢰 태그가 **확정(사용자명)** 으로 바뀐다.

## 1. 배경 / 문제
- 현재 노드 상세 패널은 `summary + 근거칩 + 태그`만 노출(얇음). fill 스키마가 step 에는
  `{stepId, name, summary}` 만 있어서다(도메인은 entities/businessRules/crossDomain 까지 부유).
- 분석 산출물은 **읽기 전용**이라 LLM 의미 주장이 틀려도 사람이 고치고 확정할 길이 없다.
- 필요: ① 노드 상세를 **템플릿 기반**으로 풍부하게(역할/메서드/호출관계), ② 사람이 **웹에서
  의미 주장만 편집**, ③ 저장 시 **서버 영속 + 신뢰 태그 = 확정(사용자명)**.

## 2. 확정 결정 (대화 합의)
1. **콘텐츠**: 노드 상세에 **역할(role) · 메서드 · 호출관계**.
   - **메서드 · 호출관계 = 결정론**(이미 `calls` 엣지·`methodsByNode` 로 보유 → LLM 불필요).
   - **역할(role) = LLM 의미 주장**(근거 의무) — 유일한 신규 LLM 필드.
2. **편집 대상 = LLM 의미 주장만**(summary, role, …). 결정론 사실(메서드/호출/파일:라인/계층)은
   코드 추출 → **편집 제외**(재스캔 시 재생성).
3. **흐름**: 분석 중 사용자에게 묻지 않음. **분석 이후** 대시보드에서 편집 → **서버 저장**
   (브라우저 저장 금지).
4. **확정 단위 = 노드 통째**. **저장 = 즉시 확정**(제출→검토 워크플로 없음).
5. **신뢰 모델 (검증 결과, §3)**: 기계 confidence(축1) + 사람 확정(축2)은 **분리**. 사람 확정은
   confidence 값이 아니라 별도 레이어(approver + audit)다.
6. **상세는 템플릿 기반**. 템플릿이 상세 섹션을 정의 → LLM 이 그대로 채움. 추후 사용자 커스텀.
7. **오버레이 병합은 대시보드 read-time**(emit 아님) — `domain-graph.json` 결정론(byte-diff=0)
   보존, 사용자 레이어는 별도 파일로 병합(§6).

## 3. 신뢰 모델 (코드 검증 완료)
**축1 — confidence (기계 근거 등급, `legacy-core/src/types.ts` CONFIDENCE_VALUES):**
| 값 | 라벨 |
|---|---|
| `CONFIRMED` | `[확정]` (코드 증거 file:line) |
| `CONFIRMED_AI` | `[확정(AI)]` (AI + 근거 앵커) |
| `INFERRED` | `[추정]` (구조/관례) |
| `UNVERIFIED` | `[확인 필요]` (근거 미확보) |

**축2 — 사람 확정 (doc-state §0 원칙):** "사람 확정은 confidence 가 아니라 별도 상태(APPROVED
+ approver)로 기록." 기존 `doc-state`(DRAFT→UNDER_REVIEW→APPROVED→RETURNED, approver, audit)가
이 패턴의 단일 소스.

**본 기능의 채택**: doc-state **모듈은 그대로 쓰지 않는다**(① GeneratedDoc 결합 + enforceEvidence
게이트, ② 제출→검토 워크플로 불필요(저장=즉시확정), ③ 상태만 저장하고 편집 내용은 미저장,
④ docId 단위). 대신 **doc-state 패턴을 노드 단위로 더 단순하게 재구현**한다. 공유: `Confidence`
enum, `Actor`/audit-event 패턴, §0 철학.

**신뢰 표시 로직(단일 규칙)**: 노드에 오버레이(사용자 편집/확정)가 **있으면 → `확정(approver)`**,
없으면 → 노드 주장의 **기계 confidence** 표시.

## 4. 데이터 모델
### 4.1 fill 스키마 확장 (`domain-map/fill.ts` DomainFillSchema.steps)
```
steps: z.array(z.object({
  stepId: z.string().regex(/^step:/),
  name: z.string().min(1).max(120),
  summary: ClaimSchema,
  // NEW: 템플릿 섹션별 의미 주장(key = 섹션 id). 역할(role) 등. 각 ClaimSchema = text + citations≥1.
  detail: z.record(z.string(), ClaimSchema).optional(),
}))
```
- v1 기본 템플릿 섹션 = `role`(역할) 1개. 메서드/호출관계는 **fill 에 넣지 않는다**(결정론, 렌더 시 엣지에서 계산).
- emit 은 `detail` 의 각 섹션을 step 노드 `domainMeta.ktdsClaims` 에 `kind:'detail:<sectionId>'` 로 임베드(인용검증 동일 적용).

### 4.2 노드 상세 템플릿 (신규 `domain-map/node-template.ts`)
```
// 플러그인 탑재 + 사람 편집 가능(방법론 템플릿과 동형). 추후 사용자 커스텀.
interface NodeDetailTemplate {
  version: 1
  sections: Array<{
    id: string          // 'role' | 'behavior' | ...
    label: string       // 표시명 (i18n 키 또는 직접 문자열)
    promptHint: string  // LLM 채움 지시(번들 slice 근거로 작성)
    layers?: FlowLayer[] // 선택: 특정 계층만(예: dataTouched는 dao/db)
  }>
}
```
- v1 default: `[{ id:'role', label:'역할', promptHint:'이 흐름에서 이 클래스/파일의 역할' }]`.
- bundle 이 템플릿 섹션을 LLM 에게 전달, emit/verify 가 섹션별 주장을 검증.

### 4.3 사용자 오버레이 (신규 `.understand-anything/node-overrides.json`, 서버 저장)
> **구현 정정(P3):** 당초 `.spec/map/` 로 적었으나, `.spec/map/` 은 `map` 재실행마다
> 재생성되는 **중간 산출** 디렉터리라 사용자 확정분이 날아갈 위험이 있다. domain-graph.json
> 과 같은 **영속 출력 디렉터리 `.understand-anything/`** 에 저장한다 — 재스캔 생존(§6 요구
> 충족) + dev 서버 경로 로직(graphFileCandidates) 그대로 재사용.
```
{
  "<nodeId>": {
    editedClaims: { [field: string]: string },  // 편집된 의미 주장만 (summary, detail.role, …)
    approver: "jun_kyung.lee",                    // 저장 시 사용자명
    at: "2026-06-20T..Z",
    audit: [{ event: "CONFIRMED", by, at }]       // append-only
  }
}
```
- 레코드 **존재 = 그 노드 확정(approver)**. 별도 상태기계 불필요(저장=즉시 확정).
- `editedClaims` 키는 **편집 허용 필드 화이트리스트**(의미 주장)로 제한 — 결정론 사실 키는 거부.

## 5. 대시보드 UX
- **노드 클릭 → 사이드바(L0)**: 계층 배지 · 이름 · 파일:라인 · **역할 요약** · **사용 메서드**(결정론) ·
  **호출관계 in/out**(결정론) · 신뢰 배지. (현재 패널 + 결정론 신호 노출)
- **사이드바 "상세보기" 버튼 → 상세 모달**(v1 모달; 추후 전용 라우트 가능):
  - 템플릿 섹션별 상세(역할 전문 등) + 메서드 목록 + 호출관계.
  - **의미 주장 인라인 편집**(textarea) + 섹션별 인용칩(편집 시 인용 재작성은 v2; v1 은 text 만 편집,
    인용은 보존/표시).
  - **신뢰 배지**: 오버레이 있으면 `확정(approver)`, 없으면 기계 confidence.
  - **저장 버튼** → 쓰기 엔드포인트 POST → 저장 즉시 `확정(approver)` 갱신.
- 재사용: `CitationChip` · `VerdictBadge` · store. 신규: `NodeDetailModal`, `TrustBadge`(확정(user) 포함).

## 6. 병합 규칙 + 결정론 계약
- `domain-graph.json` = **순수 결정론 산출**(엔진 + LLM fill + 인용검증), byte-diff=0 유지. **오버레이 미포함.**
- `node-overrides.json` = **사용자 레이어**(비결정론, 사람 책임). 별도 파일.
- **병합 = 대시보드 read-time**: store 가 두 파일을 fetch → 노드별로 `editedClaims` 가 있으면 해당
  필드 텍스트를 덮고 신뢰 배지를 `확정(approver)` 로. (emit 은 오버레이를 건드리지 않음 → 결정론 불변.)
- 재스캔/재채움(LLM) 시: `domain-graph.json` 갱신돼도 `node-overrides.json` 보존 → **사용자 확정분
  생존**. (노드 id 가 사라진 오버레이는 stale 로 표시 — 조용한 삭제 금지.)

## 7. 쓰기 엔드포인트 (dev 서버 `dashboard/vite.config.ts`)
- 현재: GET 전용(`/domain-graph.json`, `/file-content.json` 등) + 토큰 + path allowlist.
- 신규: `POST /node-overrides`(토큰 게이트). 바디 `{ nodeId, editedClaims, approver }`.
  - 검증: 토큰 일치 · `nodeId` 가 그래프에 실존 · `editedClaims` 키 화이트리스트(의미 주장만) ·
    `approver` 비어있지 않음.
  - 동작: `GRAPH_DIR/.understand-anything/node-overrides.json` 읽기→해당 nodeId 병합(audit append)→JSON 기록.
  - 응답: 갱신된 레코드(대시보드가 즉시 배지 갱신).
- `GET /node-overrides.json` 추가(읽기 병합용).
- **approver 출처**: v1 은 `understanding.config.json` 의 핸들 또는 대시보드 1회 입력(미정 — §11).

## 8. 백엔드 채움 경로
- **bundle**: step 번들에 템플릿 섹션(promptHint) 동봉(이미 slice/className/kgHint 보유).
- **host fill**: Claude 가 섹션별 주장을 근거(slice) 기반으로 `fill/<key>.json` 의 `steps[].detail` 에 작성.
- **verify/emit**: 섹션 주장도 인용 기계검증(GROUNDED/NEEDS_REVIEW) → `ktdsClaims` 임베드. 미채움 섹션은
  결정론 폴백 없음(역할은 LLM 전용 — 미채움이면 섹션 생략 + 안내).

## 9. 구현 단계 + 검증 게이트
1. **P1 — L0 결정론 노출(공짜)**: 사이드바에 사용 메서드 + 호출관계 in/out 추가. (대시보드 전용)
   게이트: dashboard build · 테스트 · 헤드리스(노드 클릭 시 메서드/호출 노출).
2. **P2 — 상세 모달 + 템플릿**: NodeDetailTemplate(v1 role) + bundle/fill/verify/emit 확장 +
   NodeDetailModal(읽기). 게이트: legacy-core 테스트(스키마/emit) · 코어불변식 0 · 헤드리스(상세보기→모달).
3. **P3 — 편집/확정 + 서버 저장**: node-overrides 스키마 + POST/GET 엔드포인트 + store 병합 +
   인라인 편집·저장·`확정(approver)` 배지. 게이트: 엔드포인트 단위테스트 · 헤드리스(편집→저장→배지 변화→
   새로고침 후 영속) · 결정론(domain-graph.json byte-diff=0 불변 확인).
4. **P4 — 템플릿 커스텀(후속)**: 사용자 템플릿 편집 UI/파일.

각 단계는 독립 빌드·커밋. 검증 게이트(매번): dashboard build · dashboard 테스트 · legacy-core 테스트 ·
코어불변식 `git diff ua-base -- understand-anything-plugin/packages/core`=0 · 헤드리스(playwright).

## 10. 변경 파일 (예상)
- legacy-core: `domain-map/fill.ts`(step.detail 스키마+applyFills) · `domain-map/bundle.ts`(템플릿 섹션) ·
  `domain-map/emit.ts`(detail 주장 임베드) · `domain-map/node-template.ts`(신규) · verify(섹션 인용).
- dashboard: `components/FlowSpineView.tsx`(L0 사이드바) · `components/NodeDetailModal.tsx`(신규) ·
  `components/TrustBadge.tsx`(신규, 확정(user)) · `store.ts`(오버레이 fetch/병합/POST) · `vite.config.ts`
  (GET/POST node-overrides) · locales(섹션 라벨·확정·편집·저장).

## 11. 리스크 / 오픈 이슈
- **approver 출처**: ~~미정~~ → **P3 확정: config 핸들 + 대시보드 1회 입력 폴백**.
  `understanding.config.json` 의 `approver`(있으면) → `writeDashboardConfig` 가 `.understand-anything/config.json`
  으로 복사 → 대시보드가 저장 시 기본값으로 사용. 없으면 1회 입력(localStorage `ktds.approver` 기억).
  진짜 인증은 Phase 2.
- **편집 시 인용**: v1 은 text 만 편집(인용 보존). 사용자가 text 를 바꾸면 기존 인용과 불일치 가능 →
  오버레이는 "사람 책임(확정)"이라 기계검증 면제(doc-state APPROVED 와 동일 철학). 표시에 "사용자 편집됨" 명시.
- **stale 오버레이**: 재스캔으로 nodeId 소멸 시 오버레이 고아 → 병합 시 stale 표시(삭제 금지).
- **쓰기 보안**: dev 서버 POST 는 토큰 게이트 + 화이트리스트. 프로덕션 배포 모델(읽기전용 export vs
  라이브 서버)은 Phase 2.
- **스케일**: role LLM 채움 = 스텝 수만큼(jpetstore 130). 토큰 비용은 도메인 채움 + 130 role 주장.
  필요 시 백본 우선 채움으로 단계화 가능.
