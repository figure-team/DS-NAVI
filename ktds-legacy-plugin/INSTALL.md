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
워크스페이스 루트(`.pnpm`)와 sibling 플러그인(`@understand-anything/core`)을 가리키는
**심링크**다. 플러그인을 `/plugin install`(소스 `cp -R`)로 설치하면 이 심링크가 플러그인
밖을 가리켜 깨지고, 런타임에 `Cannot find package 'zod'` 등으로 죽는다.

→ 설치/배포 직전에 소스를 자급화한다(워크스페이스 dep 까지 실파일로 평탄화한 자급
node_modules 주입, 내부 `.pnpm` — UA 플러그인과 동일 모델):

```bash
ktds-legacy-plugin/scripts/vendor-deps.sh
```

실행 후 `packages/legacy-core/node_modules` 가 자급 상태가 되어 `/plugin install` 또는
`cp -R` 로 그대로 설치된다. dev deps(typescript/vitest)도 포함되어 build/test 도 계속
동작한다.

> 주의: 루트 `pnpm install` 을 다시 돌리면 node_modules 가 워크스페이스 심링크로
> 되돌아간다. 그 경우 `vendor-deps.sh` 를 재실행해 자급 상태로 만든 뒤 설치할 것.

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
