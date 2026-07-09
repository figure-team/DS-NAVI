#!/usr/bin/env bash
# ktds-legacy 플러그인 소스 자급화(vendor) — git 마켓플레이스 배포용 lean 자급본.
#
# 배경/문제
#   pnpm workspace 개발 트리에서 packages/legacy-core/node_modules 는 워크스페이스
#   루트(.pnpm)와 sibling(@understand-anything/core)을 가리키는 심링크다. git 마켓플레이스는
#   커밋된 파일만 클론하는데 node_modules·dist 는 .gitignore 라 안 실린다. 그래서 신선한
#   `marketplace add <git>` 후 `/understand-init` 등이 `Cannot find package 'zod'` 로 죽고,
#   문법 wasm 이 없으면 `/understand-map` 이 crash 없이 java-facts=0(조용히 빈 분석)이 된다.
#
# 해법(이 스크립트)
#   런타임에 실제 필요한 것만 **플러그인 루트 node_modules 에 flat 실파일**로 자급한다.
#     - JS 클로저: zod · ignore · fuse.js · yaml · web-tree-sitter · @understand-anything/core(dist만)
#     - 문법: tree-sitter-* 각 패키지를 package.json + *.wasm 로만 트리밍(네이티브 prebuild ~280M 제외)
#   플러그인 루트 node_modules 는 pnpm 이 만들지 않아(무-의존 패키지) dev 워크스페이스와 충돌하지
#   않고, node walk-up 해석으로 legacy-core/dist 에서 그대로 잡힌다(legacy-core/node_modules 의
#   깨진 심링크가 있어도 ENOENT→상위로 통과). require.resolve("tree-sitter-java/..wasm") 방식도
#   플러그인 루트에서 해석된다.
#   제외: playwright-core(13M, 스크린샷 명령 전용 — 별도 `playwright install` 필요), 네이티브
#   prebuild, dev deps(typescript/vitest — 설치본에서 build/test 안 함).
#
# .gitignore 는 아래 두 경로를 예외 처리(!)해 이 자급본과 legacy-core/dist 를 커밋한다.
# 소스 변경 후 릴리스 직전 재실행하고 결과를 커밋할 것(RELEASE 체크리스트).
#
# 사용법:  ktds-legacy-plugin/scripts/vendor-deps.sh
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$PLUGIN_DIR/.." && pwd)"
LC="$PLUGIN_DIR/packages/legacy-core"
CORE_SRC="$ROOT/understand-anything-plugin/packages/core"
VEND="$PLUGIN_DIR/node_modules"

echo "→ [1/4] 엔진 빌드 (@understand-anything/core + @ktds/legacy-core)" >&2
pnpm --filter @understand-anything/core build >&2
pnpm --filter @ktds/legacy-core build >&2

echo "→ [2/4] 플러그인 루트 node_modules 초기화" >&2
rm -rf "$VEND"
mkdir -p "$VEND/@understand-anything"

# 실제 설치 경로 해석. exports 필드가 ./package.json 을 막는 패키지(fuse.js 등)가 있어
# require.resolve 대신 후보 node_modules 에서 직접 찾아 deref 한다(심링크→실디렉터리).
pkg_dir() {
  local pkg="$1" cand
  for cand in "$CORE_SRC/node_modules/$pkg" "$LC/node_modules/$pkg" "$ROOT/node_modules/$pkg"; do
    if [ -e "$cand" ]; then readlink -f "$cand"; return 0; fi
  done
  # 최후: pnpm store 글롭(scoped 는 + 치환)
  local flat="${pkg//\//+}"
  cand="$(ls -d "$ROOT"/node_modules/.pnpm/"$flat"@*/node_modules/"$pkg" 2>/dev/null | head -1)"
  [ -n "$cand" ] && { readlink -f "$cand"; return 0; }
  echo "!! 패키지 미발견: $pkg" >&2; return 1
}

echo "→ [3/4] JS 런타임 클로저 자급 (실디렉터리)" >&2
for pkg in zod ignore fuse.js yaml web-tree-sitter; do
  src="$(pkg_dir "$pkg")"
  cp -rL "$src" "$VEND/$pkg"
  echo "   + $pkg" >&2
done
# core 는 dist + package.json 만(자체 node_modules 는 위 클로저로 대체 — leaf 는 node builtin 뿐)
cp "$CORE_SRC/package.json" "$VEND/@understand-anything/core/package.json" 2>/dev/null || { mkdir -p "$VEND/@understand-anything/core"; cp "$CORE_SRC/package.json" "$VEND/@understand-anything/core/package.json"; }
cp -rL "$CORE_SRC/dist" "$VEND/@understand-anything/core/dist"
echo "   + @understand-anything/core (dist only)" >&2

echo "→ [4/4] 문법 패키지 자급 (package.json + *.wasm, prebuild 제외)" >&2
# core dist 의 wasmPackage 설정에서 문법 패키지 목록을 추출(권위 소스).
GRAMMARS="$(grep -rhoE 'wasmPackage:\s*"[^"]+"' "$CORE_SRC/dist" -r --include='*.js' | sed -E 's/.*"(.*)"/\1/' | sort -u)"
for g in $GRAMMARS; do
  src="$(pkg_dir "$g")"
  dst="$VEND/$g"
  mkdir -p "$dst"
  cp "$src/package.json" "$dst/package.json"
  # 모든 *.wasm(예: typescript=typescript+tsx, php=php+php_only) 복사, prebuilds/src/bindings 제외
  find "$src" -maxdepth 1 -name '*.wasm' -exec cp {} "$dst/" \;
  echo "   + $g ($(find "$dst" -name '*.wasm' | wc -l | tr -d ' ') wasm)" >&2
done

# 정리: .bin(dangling 심링크 우려)·빈 중첩 node_modules·컴파일된 테스트(vitest 참조) 제거
find "$VEND" -type d -name .bin -prune -exec rm -rf {} + 2>/dev/null || true
find "$VEND" -type d \( -name __tests__ -o -name tests \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$VEND" -type f -name '*.test.*' -delete 2>/dev/null || true
find "$VEND" -mindepth 2 -type d -name node_modules -empty -delete 2>/dev/null || true

echo "✓ 자급 완료: $VEND ($(du -sh "$VEND" | cut -f1))" >&2
echo "  검증: node $PLUGIN_DIR/scripts/understand-map.mjs <projectRoot> scan (java-facts>0 확인)" >&2
