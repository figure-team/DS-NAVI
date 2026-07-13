---
docId: policy-authz
title: 권한 정책
methodology: policy
status: DRAFT
sourceCommit: ffe1992c2966d46fd3991f875f42bd0d4237e88f
evidenceRate: 0
---

# 권한 정책

> 상태: DRAFT · ktds doc-generator · 근거 기반 자동 생성

## 권한 통제 지점

클래스·메서드의 권한 어노테이션(@PreAuthorize/@Secured/@RolesAllowed 등) 통제 지점. 어노테이션
존재·위치는 [확정], role 표현식의 의미는 [추정](P3 LLM 보강 대상). 권한 어노테이션이 없는
엔트리포인트(통제 누락 후보)는 후속 단계에서 routes 대조로 식별한다.

| 대상 | 권한 어노테이션 | 범위 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
