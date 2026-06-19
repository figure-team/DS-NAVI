# 도메인 지도 — 상세 패널(근거·검증) 재설계 설계서

> 상태: **설계 확정, 구현 대기.** 작성: 도메인 분류·LLM 채움(S8)·인용검증(S9) 구현 직후.
> 목적: 채움/검증으로 **생산한** 근거(file:line 인용)·검증 상태를 도메인 지도 화면에 **노출**한다.

## 1. 배경 / 문제
- 파이프라인은 도메인별 `ktdsClaims`(요약/엔티티/업무규칙/교차도메인 + 인용 `{filePath,line,snippet}`)와
  `verify-report`(citation `status`, claim `verdict`=GROUNDED/NEEDS_REVIEW, `groundedPct`)를 생산한다.
- 그러나 대시보드는 **인용·검증을 단 한 곳도 읽지 않는다**. NodeInfo가 엔티티/업무규칙 *텍스트*만 표시.
- 결과: "근거 기반(file:line grounded)"이라는 핵심 가치가 화면에서 **비가시**.

## 2. 확정 결정 (5)
1. **초점**: 도메인 상세 패널 재설계 — 요약·엔티티·업무규칙·교차도메인을 각 항목의 **인용 칩 + ✓/⚠ 배지 + 근거율**과 함께.
2. **인용 UX**: 인용 칩 → 클릭 시 **코드뷰어가 file:line으로 점프**(기존 하단 슬라이드 코드뷰어 재사용).
3. **패널 위치**: **카드 인라인 확장**. 도메인 카드 클릭 → 그 자리에서 펼쳐져 상세 표시 → `기능 보기` 버튼으로 FlowListView(화면 2) 이동. 재클릭 시 접힘. 그리드 맥락 유지.
4. **카드는 순수 도메인 개요**: 요약/엔티티/업무규칙/교차도메인 + 근거율만. **기능(흐름)은 개수만** 표시("기능 N개"), 기능 이름·기능별 인용은 카드에 두지 않는다(화면 2/3 소관). 레벨 분리는 §4.0 참조.
5. **용어: "흐름" → "기능"** (사용자 표시 라벨만). 각 흐름 = 진입점 1개가 구현하는 사용자 기능이며 per-기능 상세(화면2/3 + 근거)는 인터랙티브 기능 명세에 해당 → P4 `03_feature-spec`과 용어 통일.
   - **표시 라벨**(locales `흐름`, "흐름 N개", 화면 제목 등): "기능"으로 변경.
   - **내부 모델/코드**(`flow:` id, 노드 type `"flow"`, `contains_flow` 엣지, `FlowListView`/`FlowSpineView`/`flowModel`): **"flow" 유지**(스키마·엔진·블루프린트 동기화 전반을 건드리는 대규모 리팩터 회피). "표시는 기능, 내부는 flow".

## 3. 데이터 보강 (백엔드 — 작음)
근거(ktdsClaims)와 검증(verify-report)이 두 파일로 분리되어 있다. **emit이 노드에 합쳐 임베드**해 대시보드가
`domain-graph.json` 하나만 소비하게 한다(verify-report 별도 fetch는 와이어 증가 → 비채택).

- `emitFilledDomainGraph`/`fill-pipeline`에서 verify 결과를 노드에 주입:
  - 각 `ktdsClaims[].citations[]`에 `status`(ok/path-escape/no-file/line-out-of-range/text-mismatch/trivial-snippet)
  - 각 `ktdsClaims[]`에 `verdict`(GROUNDED/NEEDS_REVIEW)
  - 도메인 `domainMeta.groundedPct`(number), `domainMeta.groundedCount`/`reviewCount`
- 결정론 유지(정렬·stable JSON). `[확인 필요]` 텍스트 마커는 현행 유지(중복 표기 OK — UI는 verdict로 ⚠ 처리).
- 미채움 도메인: ktdsClaims 없음 → 패널은 "채움 전(결정론 라벨)" 안내.

### 4.0 레벨 분리 (핵심 원칙)
데이터는 도메인/기능(flow)/단계(step) 3레벨이고, **카드는 도메인 레벨만** 보여준다.

| 레벨 | 채움 필드 | 개수 특성 | 표시 위치 |
|---|---|---|---|
| 도메인 | summary, entities[], businessRules[], crossDomain[] | 도메인당 1묶음(기능 수와 무관, 채움이 큐레이션) | **카드** |
| 기능(flow) | flow.name, flow.summary + 인용 | 많음(상품추가/삭제/즐겨찾기…) | 화면 2 (후속) |
| 단계(step) | step.name, step.summary + 인용 | 더 많음 | 화면 3 (후속) |

→ **기능이 N개여도 카드는 기능을 나열하지 않는다**(개수만). 기능별 상세·기능별 코드 인용은 화면 2/3.

## 4. UI 설계 — 카드 인라인 확장 (순수 도메인 개요)
```
┌ 장바구니                      근거율 83% ███████░  ✓5 ⚠1 ┐   ← 헤더(접힘 시도 동일)
│ 기능 5개 · 노드 35개                                          │   ← 기능은 '개수만'(이름·인용 없음)
│ 요약   사용자 장바구니 담기/조회/수량변경      ✓ [Cart.java:32]        │
│ 엔티티(3)  · Cart 직렬화 도메인 객체           ✓ [Cart.java:18]        │
│ 업무규칙(2)· 세션 보관                         ✓ [Cart.java:18]        │
│           · 무료배송 5만원                     ⚠ 근거 없음(확인 필요)   │  ← NEEDS_REVIEW 강조
│ 교차도메인(1)· 주문 체크아웃 시 참조           ✓ [CartActionBean:45]  │
│                                              [ 기능 보기 → ]          │
└──────────────────────────────────────────────────────┘
```
- 카드 헤더: 이름 + 근거율 바 + GROUNDED/확인필요 카운트(접힘 상태에서도 신뢰도 한눈에).
- **기능/노드는 개수만**("기능 N개 · 노드 M개") — 기능 이름 칩·기능별 인용은 카드에 두지 않는다(§4.0).
- 확장부 항목군: 요약/엔티티/업무규칙/교차도메인 각각 텍스트 + 인용 칩 + ✓/⚠ 배지.
- **긴 목록(엔티티/업무규칙) 처리**: 기본 top-N(예: 5) + "N개 더보기"(확장부 내부 스크롤), **⚠ NEEDS_REVIEW 항목 상단 고정**(신뢰도 우선). 한 항목에 인용 다수면 대표 인용 1개 + `+N` 칩(펼치면 나머지).
- `NEEDS_REVIEW`: ⚠ + 좌측 보더/색 강조, 인용 없음 명시.
- `기능 보기` 버튼 → `navigateToDomain(card.id)`(화면 2 진입).
- 한 번에 하나만 확장(아코디언) — 그리드 레이아웃 점프 최소화.

## 5. 인용 → 코드뷰어 (뷰어 확장 필요)
현재 `openCodeViewer(nodeId)`는 **노드 ID** 기준 + `node.lineRange` 하이라이트. 인용은 임의 `(filePath, line)`.
- 신규 store 액션 **`openCodeViewerAt(filePath, line)`**: 그래프 유래 path-allowlist에 `filePath`가 있으면
  콘텐츠 fetch + **단일 라인** 하이라이트/스크롤. 없으면 칩 비활성(+툴팁 "소스 미포함").
- `CodeViewer.tsx`: `(filePath, line)` 직접 입력 경로 + 단일 라인 하이라이트 추가(기존 lineRange 경로와 공존).
- 인용 파일은 대개 step `filePath`라 allowlist에 포함됨(엣지 케이스만 비활성).

## 6. 변경 파일
| 영역 | 파일 | 변경 |
|---|---|---|
| 백엔드 | `emit.ts`, `fill-pipeline.ts` | verify 결과를 노드 ktdsClaims/domainMeta에 임베드 (+테스트) |
| store | `store.ts` | `openCodeViewerAt(filePath,line)` + codeViewer 상태에 (filePath,line) |
| 뷰어 | `components/CodeViewer.tsx` | filePath/line 직접 + 단일 라인 하이라이트 |
| 신규 | `components/DomainCardDetail.tsx` | 확장 상세부(항목군 렌더) |
| 신규 | `components/CitationChip.tsx` | `[file:line]` 칩 + status 배지 + 클릭 점프 |
| 신규 | `components/GroundedBar.tsx` | 근거율 바 + 카운트 |
| 데이터 | `utils/domainData.ts` | claims/verdict/groundedPct 파싱 헬퍼 + DomainCard 확장 |
| 화면 | `components/DomainMapView.tsx` | 카드 클릭=확장 토글, `기능 보기`=navigate, 기능 개수만 표시 |
| i18n | `locales/*.ts` | 근거율/확인필요/인용/소스미포함/기능보기 라벨 + **표시 라벨 "흐름"→"기능" 일괄 변경**(statFlows·flowCount·화면제목 등; 내부 flow id/타입은 불변) |

## 7. 구현 단계 + 검증 게이트
1. **백엔드 임베드**: emit이 status/verdict/groundedPct를 노드에 주입. 게이트: legacy-core 테스트 그린 + jpetstore emit 후 노드에 status 존재 확인.
2. **코드뷰어 점프**: `openCodeViewerAt` + 단일 라인. 게이트: dashboard build + 헤드리스로 칩 클릭→뷰어 라인 열림.
3. **CitationChip / GroundedBar** 컴포넌트 + 단위 테스트.
4. **DomainCardDetail + DomainMapView 통합**(아코디언). 게이트: dashboard 테스트 그린.
5. **locales + 헤드리스 시각 검증**: 채운 도메인(인용·배지) + 미채움 도메인(채움 전 안내) 둘 다.
- 전역: 코어 불변식 0, 결정론(byte-diff 0), 기존 테스트 무회귀.

## 8. 리스크 / 오픈 이슈
- **인용 파일이 소스 allowlist에 없을 때**: 칩 비활성 + 안내(조용한 실패 금지).
- **미채움 도메인**(결정론 라벨만): 패널은 "채움 전" 안내 + `bundle→emit` 유도.
- **모바일**: 인라인 확장 그리드 리플로우 — 한 번에 하나 확장으로 완화, 코드뷰어는 전체화면 모달 경로.
- **결정론**: groundedPct는 정수 1자리(verify.ts pct와 동일 규칙) 재사용.
- **용어 "흐름→기능"은 표시 라벨만**: 내부 모델(`flow:` id, 노드 type `"flow"`, `contains_flow`, `FlowListView`/`FlowSpineView`/`flowModel`)은 불변 — 스키마·엔진·블루프린트 동기화 전반을 건드리는 대규모 리팩터 회피("표시는 기능, 내부는 flow"). 내부 id까지 통일은 별도 큰 작업으로 분리.
- 화면 2(기능 목록)·화면 3(스파인) 근거·검증 노출은 본 설계 범위 밖(후속) — 우선 도메인 카드(화면 1)에 집중.
