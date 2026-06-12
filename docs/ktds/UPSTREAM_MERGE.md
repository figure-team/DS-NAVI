# Upstream Merge 가이드 (follow-main)

> ktds는 `Lum1104/Understand-Anything`의 fork다. ktds 코드는 격리 추가물이므로 upstream을 계속 추종한다. plan §1 D1a.

## 원칙
- **U-A 코드/스킬 파일은 수정하지 않는다** (원본 보존, A1). ktds 로직은 전부 격리 디렉터리에만:
  - `ktds-legacy-plugin/` (플러그인·스킬)
  - `ktds-legacy-plugin/packages/legacy-core/` (엔진)
  - `fixtures/`, `docs/ktds/`
- 통합은 U-A 내부 TS API import가 아니라 on-disk `knowledge-graph.json` 계약을 통한다.

## 알려진 merge 충돌점 (additive 2곳 + 무수정 예외 2건)
ktds가 손대는 upstream 매니페스트는 **2개**(둘 다 additive). 추가로 무수정 예외가 **2건**:
1. `pnpm-workspace.yaml` — `ktds-legacy-plugin/packages/*`, `ktds-legacy-plugin` glob 추가
2. `.claude-plugin/marketplace.json` — `plugins[]`에 `ktds-legacy` 항목 추가

**무수정 예외 #1** (fork 제품화상 불가피 — 한국 고객 기본 언어):
3. `understand-anything-plugin/packages/dashboard/vite.config.ts` — dev server `/config.json` 핸들러의 fallback `outputLanguage` 기본값을 `"en"` → **`"ko"`** (1줄). 대시보드는 분석 프로젝트 `.understand-anything/config.json`의 `outputLanguage`로 UI 언어를 정하는데, 그 파일이 없을 때의 기본값이다. ktds 파이프라인(`understand-init`)이 `.understand-anything/config.json`에 `outputLanguage:ko`를 써두므로 데이터로도 보장되지만, 순수 U-A 경로(`/understand`→`/understand-dashboard`만)를 위한 안전망. **U-A의 i18n·`ko.ts` 번역은 원본 그대로 활용**(코드 추가 없음).

**무수정 예외 #2** (2026-06-12, ADR-002 부록 A.3 — diff 오버레이 가독성, PL 실사용 피드백):
4. `understand-anything-plugin/packages/dashboard/src/components/` 4파일 — diff 오버레이의 변경/영향을 **명시 배지·집계 칩**으로 표시. 전 수정부에 `// ktds-fork` 주석 마커. 신규 locale 키 없음(기존 `t.diffToggle.changed/affected` 재사용), 신규 파일 없음:
   - `CustomNode.tsx` — 노드 헤더에 "변경됨"/"영향받음" 배지 칩 (ring 색만으로는 구분 불가 피드백)
   - `ContainerNode.tsx` — 변경/영향 **개수 칩** + 테두리 색 구분(변경 포함=적색, 영향만=호박색 — 기존엔 둘 다 적색 단일 플래그)
   - `LayerClusterNode.tsx` — 계층(오버뷰 첫 화면) 카드에 동일 칩+테두리 (어느 계층을 봐야 하는지 드릴인 없이 식별)
   - `GraphView.tsx` — `diffContainers` Set→개수 Map, `useOverviewGraph`에 계층별 diff 집계 배선

upstream merge 시 1·2는 additive 라인 재적용, 3은 해당 1줄(`outputLanguage: "ko"`) 재적용, 4는 `// ktds-fork` 마커 블록을 재적용한다(충돌 시 `git log -p -- <파일>`로 ktds 커밋 diff 참조).

## 절차
```bash
git fetch upstream
git merge upstream/main          # 충돌은 위 2개 매니페스트로 한정
# 충돌 해결 후:
pnpm install
pnpm -r build && pnpm -r test    # ktds + U-A 빌드/테스트
# 스키마 드리프트 점검 (A14): kg-reader fingerprint 가드가 UA_BASELINE과 비교
#   불일치 시 docs/ktds/UA_BASELINE.md 갱신 + kg-reader 매핑 조정 + ADR
```

## v2.7.3 고정의 범위
- 런타임은 fork HEAD(=추종된 main)를 따른다. **v2.7.3는 테스트 fixture/baseline 기준선으로만** 고정(`fixtures/ua-sample-graph.v2_7_3.json`, `UA_BASELINE.md`).
