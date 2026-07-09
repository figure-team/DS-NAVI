# ktds-legacy 플러그인 설치

`/understand-init`, `/understand-map`, `/understand-docs`, `/understand-impact`,
`/understand-onboard` 명령을 제공하는 플러그인이다.

## 1. 마켓플레이스 등록 (명령어가 목록에 뜨게)

루트 `.claude-plugin/marketplace.json` 의 `plugins[]` 에 두 번째 항목으로 등록돼 있다:

```json
{ "name": "ktds-legacy", "source": "./ktds-legacy-plugin" }
```

이게 있어야 Claude 가 ktds 스킬(명령어)을 인식한다. (UA 업스트림 기본 marketplace 에는
`understand-anything` 하나만 있어, 이 항목이 없으면 ktds 명령은 아예 안 보인다.)

등록은 "설치 가능 목록"에 올릴 뿐 자동 활성화가 아니다. 실제 활성화는 프로젝트별이다(§3).

## 2. 소스 자급화 (명령어가 실제로 실행되게)

⚠️ **핵심:** 개발 트리(pnpm workspace)에서 `packages/legacy-core/node_modules` 는
워크스페이스 루트(`.pnpm`)와 sibling(`@understand-anything/core`)을 가리키는 **심링크**이고,
`dist`·`node_modules` 는 `.gitignore` 대상이다. 그래서 아무 조치 없이 `marketplace add <git>`
로 신선하게 클론하면 커밋된 소스만 받아 런타임에 `Cannot find package 'zod'` 로 죽고,
문법 wasm 이 없으면 `/understand-map` 이 crash 없이 `java-facts=0`(조용히 빈 분석)이 된다.

→ **해법: 플러그인 루트에 lean 자급본을 만들어 git 에 커밋한다.** `.gitignore` 는
`ktds-legacy-plugin/node_modules/` 와 `packages/legacy-core/dist/` 를 예외(`!`) 처리해
이 산출물을 추적한다. 소스 변경 후 **릴리스 직전** 재실행하고 결과를 커밋할 것:

```bash
ktds-legacy-plugin/scripts/vendor-deps.sh   # ~37M: JS 런타임 클로저 + 문법 wasm
git add -A ktds-legacy-plugin/node_modules ktds-legacy-plugin/packages/legacy-core/dist
```

- 자급 위치는 **플러그인 루트 `node_modules`**(flat 실파일). pnpm 이 만들지 않는 경로라
  dev 워크스페이스와 충돌하지 않고, node walk-up + `require.resolve` 로 그대로 해석된다.
- 포함: `zod · ignore · fuse.js · yaml · web-tree-sitter · @understand-anything/core(dist)`
  + `tree-sitter-*` 문법(각 `package.json + *.wasm` 만, 네이티브 prebuild ~280M 제외).
- **제외**: `playwright-core`(스크린샷·QA-visual 명령 전용 — 그 명령은 별도 `playwright
  install` 필요), 네이티브 prebuild, dev deps.

> 주의: 루트 `pnpm install` 은 `packages/legacy-core/node_modules` 를 심링크로 되돌리지만
> 자급본은 플러그인 루트에 있어 영향받지 않는다. 소스(엔진/문법 설정)를 바꿨을 때만
> `vendor-deps.sh` 재실행 후 재커밋하면 된다.

## 3. 프로젝트별 활성화 (원하는 프로젝트에만)

플러그인 활성화는 **프로젝트 스코프(local)**로 한다(전역 user 스코프 아님). 켜고 싶은
프로젝트 디렉터리에서:

```
/plugin
```

→ `understand-anything` 마켓플레이스 → `ktds-legacy` 선택 → 설치 스코프 **"this project
(local)"** 선택. 그러면 `~/.claude/plugins/installed_plugins.json` 에 해당 `projectPath`
로만 등록된다. 프로젝트마다 반복하면 원하는 프로젝트에만 적용된다.

그 뒤 **새 Claude Code 세션**을 시작하면 `/understand-map` 등이 명령어 목록에 뜨고
실제로 실행된다.

## 검증

```bash
node ktds-legacy-plugin/scripts/understand-map.mjs <projectRoot> scan
```

`census/routes/edges/slices/candidates` 가 출력되면 자급 소스가 정상이다.
