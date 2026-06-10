---
name: understand-init
description: ktds 프로젝트 초기화 — understanding.config.json 생성, .spec/ 디렉터리·템플릿 scaffold (비민감 샘플 전용)
argument-hint: ["[projectRoot]"]
---

# /understand-init

> ⚠️ MVP는 **비민감 샘플 전용**. 실제 고객 코드 금지 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`). 영어로 답하지 말 것.

프로젝트를 분석 가능 상태로 만든다: `understanding.config.json`(networkType 3 / outputLanguage ko / [추정] 임계값 0.3·0.6 / supportedSchemaVersions ["1.0.0"]) + `.spec/00_MASTER.md`·`.spec/templates/` scaffold.

## 실행
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/understand-init.mjs <projectRoot>
```
- **최초 1회 자동 빌드**: dist가 없으면 엔진(`@ktds/legacy-core`)을 자동 빌드한다(pnpm/npm, 수 초~수십 초). 이후 실행은 즉시. 수동 빌드 불필요.
- idempotent 재실행: 기존 config 보존(신규만 생성). VCS 감지·`--merge`/`--force`는 후속.

선행: U-A 플러그인으로 `/understand` 를 먼저 실행해 `.understand-anything/knowledge-graph.json` 을 만들어 둔다.
