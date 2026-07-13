---
docId: policy-validation
title: 업무 규칙(Validation) 정책
methodology: policy
status: DRAFT
sourceCommit: ffe1992c2966d46fd3991f875f42bd0d4237e88f
evidenceRate: 0
---

# 업무 규칙(Validation) 정책

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 입력 검증 규칙

필드 bean-validation 어노테이션(@NotNull/@Size/@Pattern 등)에서 추출한 검증 규칙. 어노테이션
존재는 [확정], 금액/한도 분기 같은 코드 내 규칙은 [추정](P3 LLM 보강 대상).

| 대상 필드 | 검증 어노테이션 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
