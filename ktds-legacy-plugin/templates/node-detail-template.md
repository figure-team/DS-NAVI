# 노드 상세 패널 기본 템플릿 (Component 2 도메인 지도 / Component 3 흐름뷰)

> 목적: 노드 클릭 시 표시되는 **설명 패널이 동일한 구조**를 따르도록 하는 기본 템플릿(AC-37).
> 적용: 대시보드 노드 상세 카드(`FlowSpineView`/`DomainMapView` 사이드바, `NodeInfo`) — 도메인 지도·흐름뷰 노드 클릭 공통.
> 이 파일은 플러그인에 동봉되어 사람이 편집 가능하며, 대시보드 노드 상세 컴포넌트의 계약(contract)이다.
> 신뢰도 등급은 `@ktds/legacy-core` 의 단일 소스 `CONFIDENCE_VALUES` 와 일치한다.

---

## 1. 필드 구조 (canonical)

| 순서 | 필드 | 출처(노드 데이터) | 필수 | grounding |
|---|---|---|---|---|
| 1 | **계층 배지** | `node.layer` + `layerLabel` + `LAYER_COLOR` | 필수 | engine ground-truth(step-layer) |
| 2 | **심볼/이름** | `node.name` (예: `OrderController.placeOrder()`), `stepSource.className` | 필수 | — |
| 3 | **파일:라인** | `node.filePath` + `node.lineRange[0]` | 필수 | **앵커(CONFIRMED) · 클릭→소스(CodeViewer)** |
| 4 | **요약** | `node.summary` (LLM) | 선택 | `[추정]` 가능 |
| 5 | **어노테이션** | `node.annotation` (예: `@Transactional`, `@PostMapping`) | 선택(있으면) | 코드에서 추출 시 앵커 |
| 6 | **호출 대상** | outgoing `calls` 엣지 / 메서드 칩 | 선택 | engine |
| 7 | **곁가지** | `branches`(partitionSpine: helper·audit·async·seq) | 선택 | engine |
| 8 | **신뢰도** | `claim.confidence` (4단계 태그) | 필수 | grounding 등급 |
| 9 | **태그** | `node.tags[]` | 선택 | — |

**규칙:**
- 필수 4개(계층·심볼·file:line·신뢰도)는 **항상 표시**. 나머지는 데이터 있을 때만(없는 섹션은 렌더 생략 — 빈 라벨 금지).
- `file:line`은 **클릭 가능**(→ CodeViewer 소스 점프). grounding 1순위 약속의 UX.
- 근거 없는 추론 필드(요약 등)는 신뢰도 태그로 명시(`[추정]`/`[확인필요]`).
- 노드 미선택 시 패널 전체 숨김.

---

## 2. 렌더 골격 (마크업 구조)

```
┌─ 노드 상세 카드 ──────────────────────────┐
│ ● {계층 배지: API/SERVICE/DAO/DB/UNKNOWN}  │  ← LAYER_COLOR 배경
│                                            │
│ {심볼/이름}                                 │  ← node.name (mono, break-words)
│ {파일경로}:{라인}  🔗                        │  ← 클릭→소스 (filePath:lineRange[0])
│                                            │
│ ── 요약 ──                                  │  (node.summary 있을 때)
│ {요약 텍스트}                               │
│                                            │
│ ── 어노테이션 ──                            │  (annotation 있을 때)
│ {@Transactional 등}                         │
│                                            │
│ ── 호출 대상 ──                             │  (calls 있을 때)
│ → {대상 심볼}                               │
│ → {대상 심볼}                               │
│                                            │
│ ── 곁가지 ──                                │  (branches 있을 때)
│ {sym} ({type})                              │
│                                            │
│ {신뢰도 태그}  {태그 칩들}                   │  ← confidence + tags
└────────────────────────────────────────────┘
```

---

## 3. 데이터 계약 (TypeScript 형태 — 구현 가이드)

```ts
// 노드 상세 패널이 소비하는 정규화 형태 (도메인 지도·흐름뷰 공통)
// confidence 는 @ktds/legacy-core 의 CONFIDENCE_VALUES 단일 소스와 일치.
interface NodeDetail {
  layer: "api" | "service" | "dao" | "db" | "unknown"; // 동적 N계층
  layerLabel: string;        // laneLabels[layer]
  name: string;              // 심볼 (필수)
  filePath: string;          // 필수 (앵커)
  line: number | null;       // lineRange[0]
  confidence: "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
  summary?: string;
  annotation?: string;       // @Transactional 등 (있으면)
  calls?: { sym: string; targetId: string }[];
  branches?: { sym: string; type: "helper" | "audit" | "async" | "seq" }[];
  tags?: string[];
}
```

## 4. 적용 규칙 (일관성)
1. 도메인 지도 노드 클릭과 흐름뷰 노드 클릭은 **동일한 `NodeDetail` 구조**를 렌더한다(컴포넌트 공유).
2. 필드 순서·헤딩은 §1 표 순서를 고정.
3. `file:line`은 항상 클릭→소스 가능해야 한다(grounding UX 약속).
4. 데이터 없는 선택 필드는 **섹션째 생략**(빈 라벨·placeholder 금지 — 정직성).
5. 신뢰도 태그는 항상 표시해 추론/확정을 구분.
