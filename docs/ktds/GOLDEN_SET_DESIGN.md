# W10 LLM 보강부 정확도 골든셋/회귀 설계 (P10)

> 로드맵: `SI_EXPANSION_ROADMAP.md` W10/P10. LLM 보강 산출물(도메인 요약·RTM 분해)의
> 오류율을 측정하는 결정론 채점 체계 + jpetstore 골든셋(사람 확정본) 기준선.

## 1. 목표 · 수용 기준

- **AC-1 (지표 3종)**: 결정론 채점기가 다음을 산출한다 —
  ① **구조 일치율**: 골든의 구조 단위(도메인 노드·RTM 행/기능/시나리오)가 후보에
    존재하고 필수 필드가 채워진 비율.
  ② **근거 유효율**: 후보의 모든 인용(file:line, 스니펫 포함)이 대상 레포에 실존하는
    비율 — 골든 불요, 순수 기계 검증(날조 인용 검출).
  ③ **핵심 항목 재현율**: 골든의 핵심 항목(업무규칙·엔티티·요구사항/기능 id)이
    후보에 재현된 비율(누락 검출).
- **AC-2 (기준선·회귀)**: jpetstore 골든셋 대비 기준선을 `baseline.json` 에 기록하고,
  이후 실행에서 지표가 기준선보다 하락하면 스크립트가 FAIL(exit 1) — 파이프라인 변경이
  LLM 산출 품질을 조용히 깎는 것을 회귀로 잡는다. 갱신은 `--update-baseline` 명시.
- **AC-3 (정직성)**: 채점 불가 항목(산출물 부재·스키마 이상)은 0점 처리가 아니라
  명시 스킵으로 표기. 기준선의 "자기 자신 대비 100%" 자명성도 문서에 명시.

## 2. 채점 대상 (jpetstore 벤더링본의 LLM 보강 산출물)

| 산출물 | LLM 보강 내용 | 인용 형태 |
|---|---|---|
| `.understand-anything/domain-graph.json` | 도메인 노드 summary·domainMeta(businessRules·entities)·ktdsClaims(text) | `ktdsClaims[].citations[]{filePath, line, snippet, status}` |
| `.understand-anything/rtm.json` | 요구사항 분해(requirements)·기능 목록(functions name)·테스트 시나리오 | evidence `{file, line}` (실측 246개) |

정책서(.md)는 벤더링본에 없어 이번 골든셋 범위 밖(백로그 — 생성 시 동일 채점기의
인용 수집기가 그대로 적용 가능).

## 3. 설계

### 3.1 골든셋 — `legacy-core/fixtures/golden/jpetstore/`

- `domain-graph.json` · `rtm.json`: 사람 확정/검수를 거친 벤더링본(S5 화면·도메인 근거
  작업에서 사용자 확정 이력)의 **동결 복사**. 벤더링본은 demo sync 로 재생성되지만
  골든은 고정 기준 — 이 분리가 회귀 비교의 전제.
- `baseline.json`: 지표 3종 기준선(산출물별) + 채점기 버전.
- 갱신 절차: 골든을 바꿀 때는 사람 검수 후 `--update-golden`(복사) + `--update-baseline`.

### 3.2 채점기 — `legacy-core/src/golden/index.ts` (결정론, 타임스탬프 없음)

```ts
// ① 인용 수집(범용 재귀): {file|filePath: string, line?: number, snippet?: string}
collectCitations(value: unknown): Citation[]
// ② 근거 유효율: 파일 실존 + 1 ≤ line ≤ 라인수 + (snippet 있으면 ±2라인 윈도 포함)
scoreCitations(citations, projectRoot): { total, valid, rate, invalidSamples[] }
// ③ 구조 단위 추출(산출물별): key + 필수 필드 충족 여부
extractDomainGraphUnits(g): Unit[]   // 도메인 노드: summary·businessRules≥1·entities
extractRtmUnits(r): Unit[]           // requirements(id·text)·functions(id·name·entryPoint)·testScenarios(id)
scoreStructure(goldenUnits, candidateUnits): { matched, total, rate, missing[] }
// ④ 재현율: 골든 핵심 항목(정규화 텍스트/id)이 후보 직렬화에 존재하는가
extractKeyItems(...): KeyItem[]      // businessRules 문장·entities 이름·req/fn id
scoreRecall(goldenItems, candidate): { found, total, rate, missing[] }
// ⑤ 종합
scoreGoldenArtifact(kind, golden, candidate, projectRoot): ArtifactScore
```

- 텍스트 매칭 정규화: 공백 연쇄·개행 → 단일 공백, 앞뒤 trim — 서식 차이에 둔감,
  의미 변경에는 민감(정확 포함 매칭). 유사도 점수(편집거리)는 백로그(과잉 정밀).
- 스니펫 검증 윈도 ±2: 라인 이동 소폭 허용(fill-pipeline 검증과 동일 철학).
- 재현율의 방향: **골든 → 후보**(누락 검출). 후보의 추가 항목은 벌점 없음(정밀도는
  근거 유효율이 대신 벌한다 — 날조 항목은 인용이 없거나 무효이기 쉬움). 명시 한계로 기록.

### 3.3 스크립트 — `scripts/qa-golden-score.mjs`

```
qa-golden-score.mjs <projectRoot> [--update-baseline] [--update-golden]
```
1. 후보 로드: `<projectRoot>/.understand-anything/{domain-graph,rtm}.json`
   (부재 산출물은 "스킵" 표기 — 0점 아님).
2. 골든/기준선 로드(fixtures/golden/jpetstore/) → 산출물별 지표 3종 출력.
3. 기준선 비교: 지표가 기준선 대비 **0.1%p 초과 하락** 시 FAIL(exit 1) —
   부동소수 잡음 방지 ε. 상승은 통과(+기준선 갱신 권고 출력).
4. `--update-baseline`: 현재 점수를 기준선으로 기록(사람 결정 게이트).

## 4. 검증 계획

- 단위: 합성 골든/후보로 지표별 하락 시나리오 — 노드 삭제(구조↓), businessRule 문장
  변조(재현율↓), 인용 라인 파괴/파일 삭제/스니펫 불일치(유효율↓), 결정론(2회 동일),
  부재 산출물 스킵.
- 자기 채점: 골든 == 후보(벤더링본)면 구조·재현율 100%, 유효율은 실측(스니펫 드리프트
  있으면 그대로 노출 — 정직).
- 실측: jpetstore 기준선 기록(§6), 스크립트 재실행 시 기준선 대비 PASS.

## 5. 백로그 (명시)

- 정책서 골든(생성 시), 유사도 기반 부분 점수, 후보 초과 항목(정밀도) 지표,
  eGov 등 제2 골든셋, LLM 재생성 자동화(현재는 재생성물이 있을 때 채점하는 하네스).

## 6. 진행 현황 (ledger)

| 단계 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 설계(본 문서) | ✅ | | |
| 채점기 + 골든셋 동결 + 스크립트 | ✅ | | src/golden/ + fixtures/golden/jpetstore(도메인그래프 483KB·rtm 121KB) |
| 기준선 실측 + 테스트 | ✅ | | §7 — 기준선 6지표 기록·게이트 e2e 데모, 951+297 green |
| 적대적 리뷰 2종 + disposition | ⬜ | | |

## 7. 실측 결과 (2026-07-05, jpetstore 골든셋)

`qa-golden-score.mjs examples/jpetstore-6`:

| 산출물 | 구조 일치율 | 근거 유효율 | 핵심 재현율 |
|---|---|---|---|
| domain-graph | 100% (108/108 노드) | **100% (764/764 인용 실검증)** | 100% (41/41 — 업무규칙·엔티티) |
| rtm | 100% (114/114 — 요구 2·기능 28·시나리오 84) | **100% (246/246)** | 100% (30/30) |

- 기준선 `baseline.json` 기록 완료(6지표). 구조·재현율의 100% 는 골든==후보의 자명값
  (§3.3 명시), **근거 유효율 100% 는 실제 레포 대조의 실검증 결과**(764+246건 인용의
  파일 실존·라인 범위·스니펫 ±2줄 일치).
- 회귀 게이트 e2e 데모: 소스 없는 사본을 후보로 채점 → citations 100%→0% 하락 검출,
  exit 1. 정상 후보는 exit 0.
- 구현 중 잡은 채점기 결함 2건(자기 채점이 잡음): ① 구조 필수 필드를 전 노드에
  일률 요구 → flow 노드 오판(4.63%) — "골든이 채운 필드" 기준으로 정정. ② 재현율을
  JSON 직렬화 텍스트로 대조 → 따옴표/역슬래시 이스케이프로 정당 규칙 2건 오누락 —
  원시 문자열 값 대조로 정정.
- 테스트: legacy-core 951(golden 신규 9 — 무효 사유 3종·필드 소실·문장 변조·결정론)
  + 루트 297 green.
