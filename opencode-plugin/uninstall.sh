#!/usr/bin/env bash
# opencode-plugin 제거 — install.sh 가 깐 것만 지운다.
# 사용자 소유(opencode.json, oh-my-openagent.json, tui.json, node_modules)는 건드리지 않는다.
#
# 사용법:  opencode-plugin/uninstall.sh [--target <opencode-config-dir>]
#   기본 target: $HOME/.config/opencode (전역)
#   프로젝트 스코프: --target <project>/.opencode
set -euo pipefail

REPO_PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 기본: 현재 프로젝트(.opencode). 전역은 --global.
TARGET="$PWD/.opencode"
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    --global) TARGET="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}" ;;
    --target)  j=$((i+1)); TARGET="${!j}" ;;
    --project) j=$((i+1)); TARGET="${!j%/}/.opencode" ;;
  esac
done

echo "→ opencode-plugin 제거  (target: $TARGET)"

# 우리 커맨드 — 생성기가 아는 이름 목록(--list)만 제거(사용자 다른 커맨드는 보존)
if [[ -f "$REPO_PLUGIN_DIR/scripts/gen-commands.mjs" ]]; then
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    rm -f "$TARGET/command/$name.md" && echo "   - command/$name.md"
  done < <(node "$REPO_PLUGIN_DIR/scripts/gen-commands.mjs" --list)
fi

# 우리 플러그인(plugins/*.js)
if [[ -d "$REPO_PLUGIN_DIR/plugins" ]]; then
  for f in "$REPO_PLUGIN_DIR/plugins/"*.js; do
    name="$(basename "$f")"
    rm -f "$TARGET/plugins/$name" && echo "   - plugins/$name"
  done
fi

# U-A 에이전트(understand-anything-plugin/agents 의 파일명만)
UA_AGENTS="$(cd "$REPO_PLUGIN_DIR/.." && pwd)/understand-anything-plugin/agents"
if [[ -d "$UA_AGENTS" ]]; then
  for f in "$UA_AGENTS/"*.md; do
    name="$(basename "$f")"
    rm -f "$TARGET/agents/$name" && echo "   - agents/$name"
  done
fi

# 번들 심링크/복사
rm -rf "$TARGET/bundle" "$TARGET/bundle-ua" && echo "   - bundle, bundle-ua"

# 빈 디렉터리는 비었을 때만 정리
for d in command plugins agents; do rmdir "$TARGET/$d" 2>/dev/null || true; done

echo "→ 완료."
