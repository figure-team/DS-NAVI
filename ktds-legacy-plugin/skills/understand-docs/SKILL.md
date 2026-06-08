---
name: understand-docs
description: 근거 기반 5종 문서 생성(기술스택/아키텍처/기능명세/API명세/DB명세) + 검토(review)/승인(approve)/감사(audit)
argument-hint: ["[review --list|--doc <f>] [approve --doc <f> --by <name>] [audit --list|--date <d>|--export <dir>]"]
---

# /understand-docs

> ⚠️ STUB — 구현 예정 (plan 단계2~3). 비민감 샘플 전용.

`.understand-anything/knowledge-graph.json`(U-A `/understand` 산출, 버전 필드 `version`)을 kg-reader로 읽어 근거 붙은 5종 문서를 생성하고 DRAFT→UNDER_REVIEW→APPROVED 흐름을 관리한다.

- `[확정(AI)]` 문장은 evidence 필수(없으면 RETURNED). `[추정]` 비율 block 0.6 초과 시 RUN_ABORTED.
- review/approve/audit 서브커맨드. 승인자는 핸들/이니셜만 기록(실명/사번 미저장).

엔진: `@ktds/legacy-core`(kg-reader, evidence, doc-generator, doc-state, approval, audit).
