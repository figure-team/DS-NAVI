---
name: understand-incident
description: 장애 분석 — DS-APM 이 드롭한 장애 RCA 리포트(.md)를 수령·시드 판정·영향 분석(understand-impact 재사용)하고 근거 기반 해결방안서를 작성한다. 시드 확정은 사용자 확인 게이트, 인용은 finalize 실재 대조(fail-closed).
argument-hint: ["[projectRoot]"]
---

# /understand-incident

> ⚠️ 비민감 샘플 전용 (보안 게이트는 Phase 2).
> 🌐 **언어:** 사용자에게 보여주는 모든 설명·질문·요약·진행 안내는 **한국어**로 한다(config `outputLanguage`, 기본값 `ko`).
> 🖋 **문체:** 해결방안서 등 네가 쓰는 한국어 산문은 **문체 규약**을 로드해 따른다 — 프로젝트 override `.understand-anything/templates/style/ko-prose.md` → 없으면 `${CLAUDE_PLUGIN_ROOT}/templates/style/ko-prose.md`.

DS-APM(장애탐지)이 `<projectRoot>/ds-hub/장애/` 에 드롭한 **장애 RCA 리포트**(.md+frontmatter, 계약: `docs/ktds/INCIDENT_DROP_CONTRACT.md`)를 분석해 **해결방안서**(`resolution.md`)를 만든다. 설계: `docs/ktds/INCIDENT_ANALYSIS_DESIGN.md`.

원칙 3개:
- **스키마를 발명하지 않는다** — DS-APM 실물 형식이 계약. 파싱 불가 파일도 원문 보존 + unparseable 원장 기록.
- **시드는 결정론** — 리포트 본문의 file:line 을 census 와 대조해서만 시드가 나온다(LLM 추측 시드 금지). 확정은 ✋사용자 게이트.
- **영향 단언은 엔진 결과만** — 해결방안서의 영향 서술은 ③ 분석 산출물 인용으로 한정, 무근거는 `[추정]`.

## 0) 전제
`/understand-map scan` 이 `.spec/map/`(census 등)을 만들어 뒀어야 한다 — 없으면 CLI 가 fail-closed 로 멈춘다.

## 1) 수령 (결정론)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/incident.mjs ingest <projectRoot>
```
드롭 폴더의 .md 를 파싱해 `.understand-anything/incidents/<runId>/`(report.md 원문 + report.json)로 수령하고 장애 원장(`incident-history/ledger.json`)에 기록한다. runId 멱등 — 재실행해도 중복 수령 없음. unparseable 건은 사유를 사용자에게 보고만 한다(분석 진행 불가).

## 2) 시드 판정 + ✋확인 게이트 (생략 불가)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/incident.mjs seed <projectRoot> --run <runId>
```
판정 결과를 사용자에게 한국어로 제시한다:
- **matched** 시드 목록 → *"이 파일들을 장애 시드로 보고 영향을 분석할까요?"* 확인을 받는다. **절대 임의로 진행하지 말 것.**
- **ambiguous**(동명 다수) → 후보를 나열하고 사용자 지정으로 해소한다.
- **★ 전량 not-in-project** → "다른 프로젝트의 리포트일 수 있음 — DS-APM 서비스→레포 매핑 확인"을 보고하고 **멈춘다**(시드 0 = 분석 불가, fail-closed).
- `⚠ 커밋 불일치`(리포트 baseline ≠ 스캔 census)가 찍히면 그대로 전달한다 — 재스캔 여부는 사용자 몫.

## 3) 영향 분석 (결정론 — 사용자 확인 후에만)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/incident.mjs analyze <projectRoot> --run <runId>
```
understand-impact 엔진으로 상류/하류·API·업무 흐름·도메인·DB 영향을 산출한다. 스냅샷은 건 디렉터리(`incidents/<runId>/`)에만 격리 보관된다(연합 — impact-history 원장 직접 기록 없음, IMPACT_LEDGER_FEDERATION_DESIGN §2.1). 변경·영향 메뉴 열람은 대시보드 서버가 incident-history 원장을 읽기 시점에 병합해 `[장애] <제목>` 행으로 제공한다. **루트 슬롯·문서 09·구조 오버레이는 건드리지 않는다.**

## 4) 해결방안서 작성 (LLM — 유일한 산문 단계)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/incident.mjs resolve-input <projectRoot> --run <runId>
```
`resolution-input.json` 이 판단 입력의 **전부**다 — 전 소스를 읽지 않는다. 이 번들만 근거로 `.understand-anything/incidents/<runId>/resolution.md` 를 작성한다:

- 구성: **원인 요약 / 즉시 조치 / 근본 해결(수정 지점 file:line) / 영향 업무·데이터 / 재발 방지 후보 / 한계**.
- 머리에 `confidence` 를 표기한다.
- RCA 의 `수정 제안`을 쓰면 **"DS-APM RCA 제안"** 인용 표기로 승계한다("자동 적용되지 않음" 고지 유지).
- 리포트의 `## 한계` 는 말미에 **그대로 승계**한다(삼키면 과신 유발).
- 영향 서술은 번들의 impact 결과만 인용, 그 밖의 추론은 `[추정]` 태그.
- 인용하는 file:line 은 번들에 있는 것만 — 없는 경로를 지어내면 5) 가 차단한다.

## 5) 확정 (결정론 게이트)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/incident.mjs finalize <projectRoot> --run <runId>
```
resolution.md 의 **모든 file:line 인용을 실재 대조**한다 — 실존하지 않는 인용이 하나라도 있으면 발행 차단(exit 2). 통과 시 원장 status 가 `resolved` 로 확정된다. 차단되면 해당 인용을 고쳐 재실행한다.

## 상태·산출물
- 장애 원장: `.understand-anything/incident-history/ledger.json` — status: `ingested → seeded → analyzed → resolved` (또는 `unparseable`), 상한 50.
- 건별: `.understand-anything/incidents/<runId>/` — report.md·report.json·seed.json·impact.json(+verify)·resolution-input.json·resolution.md.

## 정지 규약
각 단계 결과를 보고하고 다음 단계 전 **멈춘다** — 특히 2) 시드 게이트와 4)→5) 사이(문서 검토). 사용자 컨펌 없이 단계를 건너뛰지 않는다.
