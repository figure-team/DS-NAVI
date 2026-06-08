---
name: understand-init
description: ktds 프로젝트 초기화 — VCS 감지, understanding.config.json 생성, .spec 디렉터리·템플릿 scaffold (비민감 샘플 전용)
argument-hint: ["[--network-type 3] [--merge|--force]"]
---

# /understand-init

> ⚠️ STUB — 구현 예정 (plan 단계1.3 config·scaffold / 단계4.2 VCS 감지·idempotent). 비민감 샘플 전용.

프로젝트를 분석 가능 상태로 만든다: `understanding.config.json` 생성, `.spec/00_MASTER.md`·`.spec/templates/*`·`docs/README.md` scaffold.

- networkType는 MVP 기본 3(개방형). 자동 탐지하지 않고 선언.
- idempotent 재실행: (기본) 보존·신규만 / `--merge` 백업 후 병합 / `--force` 덮어쓰기 → `INIT_RERUN` 감사.

엔진: `@ktds/legacy-core`(config).
