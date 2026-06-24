# ktds Code Atlas — 버전 base-tracking 스킴

> P0.3 산출물. fork(`understand-anything`) + ktds 확장 레이어의 버전 동기 규칙.
> 검증: `node scripts/version-sync-check.mjs` (P0 exit 게이트 b).

## 2-스킴 / 매니페스트 매핑

### Scheme A — UA base-tracking: `<UA-base>-ktds.N`

upstream UA 버전 `<UA-base>` 을 추적하면서, 그 base 위에 적용한 ktds 변경 회차를 `.N` 으로 센다.
(`N` 은 같은 UA base 안에서 ktds 측 변경이 누적될 때마다 증가; UA base 가 올라가면 `.0` 으로 리셋.)

매니페스트(5종, 모두 동일 값):

1. `.claude-plugin/plugin.json` (platform: Claude)
2. `.copilot-plugin/plugin.json` (platform: Copilot)
3. `.cursor-plugin/plugin.json` (platform: Cursor)
4. `understand-anything-plugin/.claude-plugin/plugin.json` (UA plugin)
5. `understand-anything-plugin/package.json` (`@understand-anything/skill`)

현재 값: `2.8.0-ktds.0` (UA base `2.8.0`, ktds 회차 `0`).

### Scheme B — ktds semver: `X.Y.Z`

ktds 확장 패키지의 독립 semver. UA base 와 무관하게 ktds 기능 변화에 따라 증가.

매니페스트(2종, 모두 동일 값):

1. `ktds-legacy-plugin/.claude-plugin/plugin.json` (`ktds-legacy`)
2. `ktds-legacy-plugin/packages/legacy-core/package.json` (`@ktds/legacy-core`)

현재 값: `0.1.0`.

## core 무수정 게이트의 baseline

불변식 "UA core(understand-anything-plugin/packages/core) 무수정" 의 회귀 게이트는
**fork 시점(merge-base)** 을 baseline 으로 쓴다. raw `upstream/main` 은 upstream 이 fork
이후 전진하면 그 자체 변경까지 diff 에 섞여 거짓 실패를 내므로 사용하지 않는다.

- fork 시점은 `ua-base` 태그로 고정(`git tag ua-base <merge-base(upstream/main, HEAD)>`).
- 게이트:

  ```sh
  git diff ua-base..HEAD -- understand-anything-plugin/packages/core   # 항상 ∅ 이어야 함
  ```

- upstream 동기화 시: `git fetch upstream`, 머지/리베이스 후 `ua-base` 를 새 merge-base 로 갱신.

> 참고: 위 `.claude-plugin/`·`package.json` 등 매니페스트의 버전 필드 수정은
> `packages/core` 밖이므로 core 무수정 게이트에 영향이 없으며, fork 마킹을 위한 의도된 변경이다.
