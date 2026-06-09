# 설치 가이드 — ktds Legacy 문서 자동화

> ⚠️ **MVP는 비민감 샘플 전용.** 보안 게이트(축②)는 Phase 2이므로, 실제 고객 코드에는 사용하지 않는다.

## 1. 전제 조건

| 항목 | 요구 | 비고 |
| --- | --- | --- |
| Node.js | **22 LTS 권장** (24에서도 빌드 확인됨) | U-A CI 기준 22 |
| pnpm | 10.6.2 | `corepack prepare pnpm@10.6.2 --activate` |
| git | 필요 | fork 추적·offline clone |
| U-A 플러그인 | **선행 설치** | ktds는 U-A가 만든 `knowledge-graph.json`을 읽는다 |

ktds는 `Lum1104/Understand-Anything`의 **fork**이며, U-A 스킬(`/understand`)과 ktds 스킬(`/understand-init`, `/understand-docs`, `/understand-export`)을 **하나의 마켓플레이스**로 제공한다.

## 2. 온라인 설치 (개방형/유형3)

> ⚠️ **마켓플레이스 이름은 `ktds`** (`.claude-plugin/marketplace.json`의 `name`). 설치 시 플러그인 뒤에 **`@ktds`** 를 붙인다. (옛 이름 `@understand-anything` 아님 — 2026-06-09 변경)

```bash
# Claude Code 안에서 (GitHub repo 또는 로컬 경로 모두 가능)
/plugin marketplace add figure-team/code-atlas    # 또는 /abs/local/path
/plugin install understand-anything@ktds          # U-A (/understand)
/plugin install ktds-legacy@ktds                  # ktds (/understand-init, -docs, -export)
```

> **수동 빌드 불필요.** ktds 스킬을 **처음 실행할 때 엔진이 자동 빌드**된다(`scripts/ensure-built.mjs`, 1회). 따라서 다른 컴퓨터에서도 `/plugin install` 후 바로 `/understand-init`/`/understand-docs`만 치면 된다.
> - **실제 동작**: 첫 실행은 `packages/legacy-core`에서 `pnpm install`을 돌리는데, 루트 `pnpm-workspace.yaml` 때문에 **워크스페이스 전체**가 설치되고(루트 `prepare`가 U-A core까지 빌드), 이어서 legacy-core가 `tsc`로 빌드된다. 즉 **한 번의 자동 빌드로 U-A·ktds 엔진이 모두 준비**된다. (검증: fresh clone에서 `/understand-init` 첫 실행 → `dist/index.js` 생성 확인.)
> - **소요 시간**: tree-sitter 네이티브 모듈(python/js/ts/ruby/rust/cpp 프리빌드) 다운로드 포함 — cold 환경에서 **약 30초~수분**(네트워크·디스크 캐시에 따라).
> - **전제**: 그 PC에 **Node 22+** 와 **pnpm 또는 npm**, 그리고 **네트워크(최초 의존성 설치)** 또는 사내 npm 레지스트리(tree-sitter 프리빌드 포함).
> - **다른 컴퓨터로 옮기기**: repo를 git push 후 `add figure-team/code-atlas`, 또는 폴더를 복사해 `add /abs/path`. (빌드 산출물·node_modules는 git 미포함 — 자동 빌드가 처리)

### 2-1. 설치 후 첫 실행 (smoke test)

분석 대상 프로젝트(`<root>`, **비민감 샘플**)에서:

```bash
/understand                          # U-A: 코드 분석 → .understand-anything/knowledge-graph.json 생성 (선행 필수)
/understand-init <root>              # config + .spec/ scaffold (★ 첫 ktds 실행 → 엔진 자동 빌드 1회)
/understand-docs <root> run-smoke    # knowledge-graph.json → 근거 5종 문서 DRAFT
/understand-docs <root> review --list           # 검토 대기 목록
/understand-docs <root> approve --doc <f> --by <handle>   # 승인
/understand-export <root>            # 독립 실행 HTML (docs/index.html, CDN 없음)
```

> 순서 주의: `/understand-docs`는 U-A가 만든 `knowledge-graph.json`을 읽으므로 **`/understand` 가 먼저** 돌아야 한다. 운영 상세는 [`OPERATOR.md`](./OPERATOR.md), 오류는 [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

## 3. 오프라인 설치 (폐쇄망 대비 — Phase 2 본격 지원)

```bash
git clone https://github.com/figure-team/code-atlas ./code-atlas   # fork 전체(U-A 포함) 복제
cd code-atlas
corepack prepare pnpm@10.6.2 --activate
pnpm install                                     # 외부 CDN 의존 없음 (tree-sitter는 프리빌드)
pnpm -r build                                    # @understand-anything/core + @ktds/legacy-core
# Claude Code에 로컬 마켓플레이스로 추가 (이름 ktds)
/plugin marketplace add ./code-atlas
/plugin install understand-anything@ktds
/plugin install ktds-legacy@ktds
```

> 오프라인에서 미리 `pnpm -r build`까지 해두면 `dist/`가 존재하므로 **첫 실행 자동 빌드가 생략**된다(`ensure-built.mjs`가 `dist/index.js` 존재를 보고 즉시 반환).

빌드 검증:
```bash
pnpm --filter @ktds/legacy-core test     # 115 tests 통과 확인
```

## 4. 디렉터리 구조 (fork 내 격리)

```
<ktds-fork>/
├ understand-anything-plugin/     U-A 원본 (무수정)
├ ktds-legacy-plugin/             ★ ktds
│  ├ skills/{understand-init,-docs,-export}/SKILL.md
│  ├ scripts/understand-{init,docs,export}.mjs
│  └ packages/legacy-core/        엔진 (@ktds/legacy-core)
├ .claude-plugin/marketplace.json  ★ additive (ktds plugin 등록)
├ pnpm-workspace.yaml              ★ additive
└ docs/ktds/                       이 매뉴얼들 + UA_BASELINE.md + UPSTREAM_MERGE.md
```

> **원본 보존:** U-A 코드/스킬은 수정하지 않는다. 매니페스트 2곳(marketplace/workspace)만 additive. upstream 추종은 [`UPSTREAM_MERGE.md`](./UPSTREAM_MERGE.md) 참조.

## 5. 업그레이드 (U-A 추종)

```bash
git fetch upstream && git merge upstream/main   # 충돌은 매니페스트 2곳 한정
pnpm install && pnpm -r build && pnpm -r test
# 스키마 드리프트 시 kg-reader fingerprint 경고 → docs/ktds/UA_BASELINE.md 갱신
```
