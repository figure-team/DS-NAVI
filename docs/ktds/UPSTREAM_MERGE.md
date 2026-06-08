# Upstream Merge 가이드 (follow-main)

> ktds는 `Lum1104/Understand-Anything`의 fork다. ktds 코드는 격리 추가물이므로 upstream을 계속 추종한다. plan §1 D1a.

## 원칙
- **U-A 코드/스킬 파일은 수정하지 않는다** (원본 보존, A1). ktds 로직은 전부 격리 디렉터리에만:
  - `ktds-legacy-plugin/` (플러그인·스킬)
  - `ktds-legacy-plugin/packages/legacy-core/` (엔진)
  - `fixtures/`, `docs/ktds/`
- 통합은 U-A 내부 TS API import가 아니라 on-disk `knowledge-graph.json` 계약을 통한다.

## 알려진 merge 충돌점 (additive 2곳)
ktds가 손대는 upstream 매니페스트는 **단 2개**, 둘 다 additive:
1. `pnpm-workspace.yaml` — `ktds-legacy-plugin/packages/*`, `ktds-legacy-plugin` glob 추가
2. `.claude-plugin/marketplace.json` — `plugins[]`에 `ktds-legacy` 항목 추가

upstream merge 시 이 2개 파일에서만 충돌 가능 → ours/theirs 수동 병합 후 위 additive 라인 재적용.

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
