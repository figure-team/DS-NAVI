#!/usr/bin/env bash
# ktds-legacy 플러그인 소스 자급화(vendor).
#
# 문제: pnpm workspace 개발 트리에서는 packages/legacy-core/node_modules 가 워크스페이스
# 루트(.pnpm)와 sibling 플러그인(@understand-anything/core)을 가리키는 심링크다. 플러그인을
# /plugin install(소스 cp -R)로 설치하면 이 심링크가 플러그인 밖을 가리켜 깨지고, 런타임에
# `Cannot find package 'zod'` 등으로 죽는다.
#
# 해법: pnpm deploy(--legacy)로 워크스페이스 dep(@understand-anything/core 포함)까지 전부
# 실파일로 평탄화한 자급 node_modules(내부 .pnpm, UA 플러그인과 동일 모델)를 만들어 소스의
# packages/legacy-core/node_modules 에 주입한다. 이후 /plugin install 또는 cp -R 로 그대로
# 설치된다. dev deps(typescript/vitest)도 포함되어 build/test 도 계속 동작한다.
#
# 주의: 루트 `pnpm install` 을 다시 돌리면 node_modules 가 워크스페이스 심링크로 되돌아간다.
#       설치/배포 직전에 이 스크립트를 재실행해 자급 상태로 만들 것.
#
# 사용법:  ktds-legacy-plugin/scripts/vendor-deps.sh
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LC="$PLUGIN_DIR/packages/legacy-core"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ [1/3] 엔진 빌드 (@understand-anything/core + @ktds/legacy-core)" >&2
pnpm --filter @understand-anything/core build >&2
pnpm --filter @ktds/legacy-core build >&2

echo "→ [2/3] pnpm deploy — 자급 node_modules 생성 (dev 포함)" >&2
pnpm --filter @ktds/legacy-core deploy --legacy "$TMP/deploy" >&2

echo "→ [3/3] 소스 packages/legacy-core/node_modules 교체" >&2
rm -rf "$LC/node_modules"
cp -R "$TMP/deploy/node_modules" "$LC/node_modules"

echo "✓ 소스 자급화 완료: $LC/node_modules (내부 .pnpm)" >&2
echo "  검증: node $PLUGIN_DIR/scripts/understand-map.mjs <projectRoot> scan" >&2
