---
description: ktds 프로젝트 초기화 — understanding.config.json 생성, .spec/ 디렉터리·마스터 인덱스 scaffold (비민감 샘플 전용)
---

# /understand-init

> 🧩 **opencode 런타임:** 번들 스크립트는 `$ATLAS_PLUGIN_ROOT/scripts/*.mjs` 로 호출한다(atlas 플러그인이 셸에 ATLAS_PLUGIN_ROOT 를 주입). `<projectRoot>` 는 인자의 마지막/해당 토큰, 없으면 현재 작업 디렉터리.

> ⚠️ MVP는 **비민감 샘플 전용**. 실제 고객 코드 금지 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`). 영어로 답하지 말 것.

프로젝트를 분석 가능 상태로 만든다: `understanding.config.json`(networkType 3 / outputLanguage ko / 추론 임계값 0.3·0.6 / supportedSchemaVersions ["1.0.0"]) + `.spec/00_MASTER.md` scaffold.

## 실행

```
node $ATLAS_PLUGIN_ROOT/scripts/understand-init.mjs <projectRoot>
```

- **멱등(idempotent)**: 기존 `understanding.config.json`·`.spec/00_MASTER.md` 는 보존하고 없는 것만 생성한다.
- dist가 없으면 빌드를 안내한다(`pnpm --filter @ktds/legacy-core build`).

## 선행/후속

- 선행: U-A 플러그인으로 `/understand` 를 먼저 실행해 `.understand-anything/knowledge-graph.json` 을 만들어 두면 이후 분석이 풍부해진다(없어도 동작).
- 후속: `/understand-map scan` 으로 결정론 도메인 맵을 스캔한다.

## 출력 해석

- `생성:` 새로 만든 파일/디렉터리
- `보존:` 이미 있어 건드리지 않은 항목

생성된 `understanding.config.json` 은 사용자가 직접 편집할 수 있다(언어·임계값 조정).
