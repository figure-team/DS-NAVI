---
docId: policy-validation
title: 업무 규칙(Validation) 정책
methodology: policy
---

<!--
  업무 규칙(Validation) 정책 기본 템플릿. 사람 편집 가능(플러그인 기본).
  프로젝트 override: <proj>/.understand-anything/doc/policy/validation.md
  형식·신뢰도 규약: ../_README.md 참조. 신뢰도·근거 열은 렌더러가 자동 부가.
-->

## 입력 검증 규칙 {#validation-rules}

필드 bean-validation 어노테이션(@NotNull/@Size/@Pattern 등)에서 추출한 검증 규칙. 어노테이션
존재는 [확정], 금액/한도 분기 같은 코드 내 규칙은 [추정](P3 LLM 보강 대상).

| 대상 필드 | 검증 어노테이션 |
