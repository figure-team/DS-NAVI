# Step 7 — U-A domain-analyzer로 기능명세 채우기 (풀 파이프라인 완성)

> 날짜: 2026-06-09 · 브랜치 `ktds/mvp-stage1`
> step6에서 비어 있던 03_feature-spec을 U-A 도메인 분석으로 채우고 5종 전부 발행

---

## 0. 한 줄

U-A의 `domain-analyzer`를 jpetstore 그래프에 구동해 **업무 도메인·흐름·단계**를 뽑고, doc-generator가 단계의 실제 코드 근거를 살리도록 보강해 **5종 문서 전부 게이트 통과·발행**.

## 1. U-A domain-analyzer 실행

U-A `agents/domain-analyzer.md`(Option B: 기존 그래프에서 도메인 도출) 서브에이전트 → `domain-graph.json`:
- **4 도메인**(계정/인증, 카탈로그 탐색, 장바구니, 주문/결제) · **8 흐름** · **21 단계**
- 21개 단계에 **실제 filePath+lineRange** 부여(그래프의 코드 노드에서 도출)
→ 그래프 병합: 243 → **276 노드 / 312 엣지**

도메인 분석 품질(U-A가 한국어로 작성): "주문/결제 — 장바구니로부터 주문 초기화·배송정보·주문확정·재고차감…OrderService가 Order/LineItem/Item/Sequence 매퍼를 트랜잭션 조율", 흐름 "주문 생성(장바구니→배송정보→주문확정)" 등.

## 2. doc-generator 보강 (실제 결함 수정)

처음엔 feature-spec이 **100% [추정]** → RUN_ABORTED. 원인: doc-generator가 flow 노드/엣지만 렌더하고 **근거를 가진 21개 step 노드를 버림**.
- 수정: `buildFeatureSpec`이 **step 노드를 직접 렌더**(claimForNode) → 코드 진입점 근거 표면화. 중복·무근거였던 "흐름 단계/구성"(엣지 나열) 섹션 제거.
- → feature-spec [추정] 66% → **36%** (< 60% block) → 정상 발행. 회귀 테스트 갱신/추가.

## 3. 최종 결과 — 5종 전부 발행 (full gated pipeline)

| 문서 | claim | [확정(AI)] | [추정] |
|---|---|---|---|
| 01_tech-stack | 8 | 8 | 0% |
| 02_architecture | 54 | 46 | 15% |
| **03_feature-spec** | 33 | **21** | 36% |
| 04_api-spec | 6 | 6 | 0% |
| 05_db-spec | 23 | 23 | 0% |

`runDocsPipeline` → **5종 DRAFT 발행**, 감사 `LLM_REQUEST·DOC_GENERATED`. 115 테스트 통과.

## 4. 기능명세의 실제 근거 (단계)

- 처리 단계 "소계 계산" → `domain/Cart.java:119` (Cart.getSubTotal) ✓
- "장바구니로부터 주문 구성" → `domain/Order.java:286` (Order.initOrder) ✓
- "계정/프로필 갱신" → `service/AccountService.java:66` (updateAccount) ✓

U-A가 도출한 업무 단계가 실제 코드 메서드를 정확히 가리킨다.

## 5. 완성된 풀 파이프라인 (step6+7)

```
jpetstore-6 소스
 → U-A: scan → batch → file-analyzer×8 → merge → architecture-analyzer → domain-analyzer
 → knowledge-graph.json (276 노드 / 312 엣지 / 8 레이어 / 4 도메인·8 흐름·21 단계)
 → ktds: kg-reader → evidence → doc-generator → [추정]게이트 → 검토/승인/감사 → export
 → 근거율 높은 5종 문서 (DRAFT) + HTML
```
`fixtures/jpetstore/knowledge-graph-ua-real.json` (도메인 포함 최종) · `sample-output-jpetstore-UA.html`.

## 6. 아직 안 된 것

- **플러그인 실설치(`/plugin install`)** 통합 검증(스킬 수동 구동) · 성능 측정(50K/200K) · 매뉴얼 · review/approve **CLI 서브커맨드** 스크립트.
- U-A Phase 3/5/6(assemble-review/tour/graph-review) 미실행(ktds에 불필요).

## 7. 결론

**U-A 풀 파이프라인(구조+아키텍처+도메인) → ktds → 근거 기반 5종 문서**의 완전한 사슬이 실제 OSS(jpetstore-6)에서 동작·검증됨. 기능명세까지 U-A 도메인 분석으로 채워졌고, 업무 단계가 실제 코드를 가리킨다.

## 다음(예정)

review/approve/audit CLI 표면 + 플러그인 실설치 검증 + 성능/매뉴얼 → step8.md.
