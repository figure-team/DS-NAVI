---
name: understand-export
description: 생성된 문서를 독립 실행 HTML로 내보내기 (CDN 없음, 인라인 번들, 폐쇄망 배포 가능)
argument-hint: ["[--out <dir>]"]
---

# /understand-export

> ⚠️ STUB — 구현 예정 (plan 단계4.1).

`docs/**/*.md`를 단일 HTML로 묶어 내보낸다: JS/CSS 인라인(CDN 0), 카테고리별 사이드바 TOC.

- PPT/Word 추가 포맷은 MVP+.

엔진: `@ktds/legacy-core`(export).
