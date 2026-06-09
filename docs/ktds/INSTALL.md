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

```bash
# Claude Code 안에서 (GitHub fork 또는 로컬 경로 모두 가능)
/plugin marketplace add <fork>                            # owner/repo 또는 /abs/local/path
/plugin install understand-anything@understand-anything   # U-A (/understand)
/plugin install ktds-legacy@understand-anything           # ktds (/understand-init, -docs, -export)
```

> **수동 빌드 불필요.** ktds 스킬을 **처음 실행할 때 엔진이 자동 빌드**된다(`pnpm`/`npm` + `tsc`, 수 초~수십 초, 1회). 따라서 다른 컴퓨터에서도 `/plugin install` 후 바로 `/understand-init`/`/understand-docs`만 치면 된다.
> - 전제: 그 PC에 **Node 22+** 와 **pnpm 또는 npm**, 네트워크(최초 의존성 설치)·또는 사내 레지스트리.
> - `marketplace.json`의 marketplace 이름이 `understand-anything`이라 설치 시 `@understand-anything`을 붙인다.
> - **다른 컴퓨터로 옮기기**: fork를 git push 후 `add <owner>/<repo>`, 또는 폴더를 복사해 `add /abs/path`. (빌드 산출물·node_modules는 git 미포함 — 자동 빌드가 처리)

## 3. 오프라인 설치 (폐쇄망 대비 — Phase 2 본격 지원)

```bash
git clone <ktds-fork-repo> ./ktds-legacy        # fork 전체(U-A 포함) 복제
cd ktds-legacy
corepack prepare pnpm@10.6.2 --activate
pnpm install                                     # 외부 CDN 의존 없음
pnpm -r build                                    # @understand-anything/core + @ktds/legacy-core
# Claude Code에 로컬 마켓플레이스로 추가
/plugin marketplace add ./ktds-legacy
```

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
