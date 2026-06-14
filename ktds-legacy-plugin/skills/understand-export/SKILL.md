---
name: understand-export
description: 생성된 문서를 독립 실행 HTML로 내보내기 (CDN 없음, 인라인 번들, 폐쇄망 배포 가능)
argument-hint: ["[projectRoot]", "[outFile]"]
---

# /understand-export

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`). 영어로 답하지 말 것.

`.understand-anything/knowledge-graph.json` 으로부터 5종 문서를 단일 HTML로 묶어 내보낸다: CSS 인라인(외부 CDN/리소스 0), 카테고리별 사이드바 TOC, 신뢰도 태그 색상 표시. 폐쇄망 배포 가능(A9).

## 실행
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-export.mjs <projectRoot> [outFile]
```
기본 출력: `<projectRoot>/docs/index.html`. (최초 실행 시 엔진 자동 빌드 1회)

- **세분화 위키(`docs/feature`·`api`·`table` 노트)는 HTML에 포함되지 않는다** — 5종 문서만 내보낸다. 위키는 대시보드("문서" 토글)/옵시디언 전용.
- PPT/Word 추가 포맷은 MVP+.
- 엔진: `@ktds/legacy-core`(export).
