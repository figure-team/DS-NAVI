# Step 8 — 검토/승인/감사(축③) CLI 실연

> 날짜: 2026-06-09 · 브랜치 `ktds/mvp-stage1`
> 엔진(doc-state/approval/audit)은 완성·테스트됨 → 빠졌던 **CLI 표면**을 붙이고 실제 jpetstore 문서로 실연

---

## 0. 한 줄

`/understand-docs`의 review/approve/return/audit 서브커맨드를 붙여, 실제 jpetstore 5종 문서에 **DRAFT→검토→승인/반려→감사** 전 과정을 CLI로 실행했다.

## 1. CLI 표면 (`scripts/understand-docs.mjs`)

| 명령 | 동작 | 엔진 |
|---|---|---|
| `<root> review --list` | DRAFT 목록 + [추정]/[확인 필요] 수 | listDrafts + 태그 카운트 |
| `<root> review --doc <f>` | DRAFT→UNDER_REVIEW | startReview |
| `<root> approve --doc <f> --by <handle>` | UNDER_REVIEW→APPROVED + approvals.json + DOC_APPROVED | approveDoc |
| `<root> return --doc <f>` | UNDER_REVIEW→RETURNED | returnDoc |
| `<root> audit --list \| --date <d>` | 감사 로그 조회 | readAudit |

## 2. 실연 (실제 jpetstore 문서)

```
1. 생성        → 5 DRAFT
2. review --list → 02_architecture [추정]8 · 03_feature-spec [추정]12 …
3. review --doc 04_api-spec.md   → UNDER_REVIEW
4. approve --doc 04 --by ipark   → APPROVED (by ipark, 2026-06-09T01:36Z)
5. (불법) DRAFT 05 바로 approve   → 거부: illegal transition DRAFT→APPROVED
6. return 03_feature-spec.md     → RETURNED
7. audit --list → DOC_GENERATED×5 + DOC_APPROVED·04·by ipark
```

산출 상태:
- `doc-status.json`: 04=APPROVED, 03=RETURNED, 나머지 DRAFT
- `approvals.json`: `{doc:04_api-spec.md, by:ipark, at:…}` — **승인자 핸들만(실명/사번 없음, O3)**
- `.spec/audit/2026-06-09.jsonl`: 생성·승인 이벤트 추적

## 3. 검증된 것 (축③ 전체)

- **상태기계**: DRAFT→UNDER_REVIEW→APPROVED, UNDER_REVIEW→RETURNED (A7)
- **불법 전이 거부**: DRAFT→APPROVED 차단 (A8) — 실연으로 확인
- **승인 기록 + 감사**: approvals.json + DOC_APPROVED (§7.2/§7.3)
- **PII 미저장**: 승인자 핸들만 (O3)

→ 제품 3번 축(신뢰성 체계)이 실제 문서에서 CLI로 동작.

## 4. 한계

- `review --doc`의 **[추정] 항목 인터랙티브 확정**([확정(담당자)]로 전환)은 미구현 — 엔진(`confirmAndLog`)은 있으나 .md↔claim 매핑/대화형 입력은 후속. 현재는 상태 전이 + 검토 대상 카운트까지.
- 플러그인 실설치(`/plugin install`) 통합 · 성능 · 매뉴얼 미수행.

## 5. 현재 전체 그림

코어 9/9 모듈 · 115 테스트 · 실제 OSS(jpetstore-6) U-A 풀 파이프라인 E2E · 축①(근거 문서)·축③(검토/승인/감사) 실연 완료. 축②(보안 게이트)는 계획대로 Phase 2.

## 다음(예정)

[추정] 인터랙티브 확정 · 플러그인 실설치 검증 · 성능 측정 · 매뉴얼 → step9.md.
