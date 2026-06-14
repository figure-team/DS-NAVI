# ktds-legacy 아키텍처 (개발자 레퍼런스)

> 현재 코드 구조 + **공유 규약**. 리팩토링(2026-06, refactor/audit-2026-06)으로 정리된 상태를 반영.
> 원본 U-A는 무수정, 대시보드는 ktds 소유(ADR-003). 결정론 경계: golden=skeleton, LLM 산문=host 런타임.

## 패키지 레이아웃
```
ktds-legacy-plugin/
├ packages/legacy-core/        @ktds/legacy-core — 분석 엔진 (TS, 546 테스트/51 파일)
│  └ src/
│     ├ utils/                 ★ 공유 헬퍼 — 재중복 금지(아래 규약)
│     ├ test-helpers.ts        ★ 테스트 공용 팩토리(node/edge/graphOf)
│     ├ types.ts               CanonicalGraph·Confidence(단일 출처: CONFIDENCE_VALUES)
│     ├ config·kg-reader·evidence·doc-state·audit·lock·approval   (축①·③ 기반)
│     ├ doc-generator/         5종 문서(skeleton+claims) — claims.ts 별도
│     ├ orchestrator/          runDocsPipeline·loadProjectGraph(도메인 병합·신선도)
│     ├ export/                독립 HTML
│     ├ domain-map/            /understand-map — census·routes/*·edges·slices·classify·
│     │                        skeleton·confirm·bundle·fill·verify·emit·java-facts
│     ├ impact/                /understand-impact·-review — reach·api·flow·persistence·
│     │                        verify·overlay·archive·engine·review·doc
│     └ wiki/                  /understand-docs wiki — project·links·index-gen·hub-inject·
│                              graph-emit·render·orchestrate(산문 재흡수)·slug·frontmatter
├ scripts/                     host(Claude) 진입 CLI (.mjs, thin wrapper)
│  ├ cli-utils.mjs             ★ 공통 arg 파싱·핸들 검증·EPIPE·basename·round1
│  ├ ensure-built.mjs          dist 자동 빌드(첫 실행)
│  ├ understand-{init,map,docs,impact,review,export}.mjs   사용자 명령
│  └ {chain,impact}-recall.mjs 정확도 하네스
└ skills/understand-*/SKILL.md host 계약(한국어, 비민감 샘플 전용)
```

## 공유 규약 (★ — 새 코드는 재사용, 로컬 복사 금지)
리팩토링 전 9~10곳에 복붙돼 있던 것을 단일 출처로 통합했다. **같은 패턴이 필요하면 import**:
- `utils/cmp.ts` `cmp(a,b)` — 결정론 사전식 비교(정렬 안정화). ~~로컬 `function cmp`~~ 금지.
- `utils/collections.ts` `groupBy(items, keyFn)`.
- `utils/fs.ts` `writeFileAtomic(path, content)` — pid-tmp + mkdir + 실패 정리(원자 발행).
- `test-helpers.ts` `node()/edge()/graphOf()` — CanonicalGraph 픽스처. (cite 전용 변형은 claims.test 로컬 유지.)
- `scripts/cli-utils.mjs` `parseArgv(subs)`·`installEpipeGuard()`·`assertRequiredHandle`/`assertOptionalHandle`(confirm/approve=필수, impact/review=선택)·`basename`·`round1`.
- `types.ts` `CONFIDENCE_VALUES` — Confidence 타입·Zod enum(impact) 모두 여기서 파생(미러 금지).

## CLI ↔ 엔진 경계 (D1)
`.mjs`는 **순수 arg 파싱 + 엔진 호출**. 비즈니스 로직은 테스트되는 legacy-core에 둔다(예: `readKgAnalyzedAt` — 위키 멱등 스탬프, 과거 CLI `sourceStamp`에서 이관). 엔진 로드는 전부 `await import(await ensureBuilt())`(하드코딩 dist 경로 금지).

## 대시보드 fork (ADR-003, ktds 소유)
diff/영향도 오버레이 공통 로직은 훅으로:
- `hooks/useDiffLabels.ts` — overlaySource→변경/영향 라벨(6개 노드 컴포넌트 공용).
- `hooks/useDiffAggregation.ts` — `useDiffByLayer`·`useDiffByContainer`(GraphView 집계 — 머지 충돌면 축소).
- 노드별 glow 반경(16/12/10/8)·칩 마크업은 **의도적으로 컴포넌트별 상이** → 표준화 금지(시각 변경). DiffCountChips 미추출 이유.

## 작업 규율
각 변경 = **독립 code-reviewer 패스**(작성/검토 분리) → 테스트 → 커밋 → `step-explanation/stepN.md`(디스크). lint 베이스라인 유지, 결정론 골든 불변. 게시 시 버전 bump(루트 README "Versioning").
