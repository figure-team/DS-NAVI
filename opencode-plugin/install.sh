#!/usr/bin/env bash
# ktds Code Atlas — opencode 어댑터 설치기.
#
# Claude 플러그인(ktds-legacy-plugin)의 스크립트/엔진/템플릿을 그대로 재사용하고,
# opencode 가 발견·실행할 수 있도록 글로벌 설정 디렉터리에 어댑터(플러그인+커맨드)를
# 깐다. CLAUDE_PLUGIN_ROOT 의 등가물은 atlas 플러그인이 ATLAS_PLUGIN_ROOT 로 셸에 주입한다.
#
# 모드:
#   dev   (기본) — bundle 을 레포의 플러그인으로 심링크(빠른 반복, 레포 상주 필요).
#   vendor       — bundle 을 자급 복사(vendor-deps 로 평탄화된 node_modules 포함, 배포용·레포 불필요).
#
# 설치 위치(기본 = 현재 프로젝트, 전역은 명시해야 함):
#   (기본)              → $PWD/.opencode        (cd <프로젝트> 후 실행)
#   --project <root>    → <root>/.opencode
#   --target  <dir>     → <dir> 그대로
#   --global            → $HOME/.config/opencode (모든 프로젝트에 적용 — 주의)
#
# 사용법:  <repo>/opencode-plugin/install.sh [dev|vendor] [--project <root> | --target <dir> | --global]
set -euo pipefail

MODE="dev"
[[ "${1:-}" == "dev" || "${1:-}" == "vendor" ]] && MODE="$1"

REPO_PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"          # opencode-plugin/
REPO_ROOT="$(cd "$REPO_PLUGIN_DIR/.." && pwd)"
KTDS_LEGACY="$REPO_ROOT/ktds-legacy-plugin"
UA_PLUGIN="$REPO_ROOT/understand-anything-plugin"

# 기본: 현재 작업 디렉터리의 프로젝트 스코프(.opencode). 전역은 --global 로만.
TARGET="$PWD/.opencode"
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    --global) TARGET="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}" ;;
    --target)  j=$((i+1)); TARGET="${!j}" ;;
    --project) j=$((i+1)); TARGET="${!j%/}/.opencode" ;;
  esac
done

echo "→ opencode-plugin 설치"
echo "   mode    : $MODE"
echo "   target  : $TARGET"
echo "   legacy  : $KTDS_LEGACY"
echo "   ua      : $UA_PLUGIN"

mkdir -p "$TARGET/plugins" "$TARGET/command" "$TARGET/agents"

# 1) 플러그인(JS) — shell.env 로 ATLAS_PLUGIN_ROOT 주입
cp "$REPO_PLUGIN_DIR/plugins/"*.js "$TARGET/plugins/"
echo "   ✓ plugins/*.js → $TARGET/plugins/"

# 2) 커맨드(/understand-*) — SKILL 본문 포팅본
cp "$REPO_PLUGIN_DIR/command/"*.md "$TARGET/command/"
echo "   ✓ command/*.md → $TARGET/command/"

# 3) 엔진 dist 보장 — 없으면 자동 빌드(일회성, 받는 쪽이 신경 안 쓰게)
if [[ ! -f "$KTDS_LEGACY/packages/legacy-core/dist/index.js" ]]; then
  echo "   … 엔진 dist 없음 → 자동 빌드 시도 ($REPO_ROOT)"
  ( cd "$REPO_ROOT" \
    && { [[ -d node_modules ]] || pnpm install; } \
    && pnpm --filter @understand-anything/core build \
    && pnpm --filter @ktds/legacy-core build ) \
    || { echo "   ✗ 자동 빌드 실패 — 수동 실행: (cd $REPO_ROOT && pnpm install && pnpm -r build)" >&2; exit 1; }
  echo "   ✓ 엔진 빌드 완료"
fi

# 4) U-A 에이전트(project-scanner/file-analyzer/... ) — /understand 서브에이전트 디스패치용
cp "$UA_PLUGIN/agents/"*.md "$TARGET/agents/"
echo "   ✓ agents/*.md → $TARGET/agents/ ($(ls "$UA_PLUGIN/agents/"*.md | wc -l)개)"

# 5) 번들: ktds(bundle) + U-A(bundle-ua)
rm -rf "$TARGET/bundle" "$TARGET/bundle-ua"
if [[ "$MODE" == "vendor" ]]; then
  # 자급 복사: 배포용. node_modules 평탄화는 vendor-deps.sh 가 선행돼야 한다.
  cp -R "$KTDS_LEGACY" "$TARGET/bundle"
  cp -R "$UA_PLUGIN"   "$TARGET/bundle-ua"
  echo "   ✓ bundle/bundle-ua ← cp -R (vendor)"
else
  # dev: 심링크(node 는 심링크 따라감 — 실행에 문제 없음)
  ln -s "$KTDS_LEGACY" "$TARGET/bundle"
  ln -s "$UA_PLUGIN"   "$TARGET/bundle-ua"
  echo "   ✓ bundle → ktds-legacy-plugin / bundle-ua → understand-anything-plugin (dev, 심링크)"
fi

echo "→ 완료."
echo "   ktds  :  opencode run --command understand-map \"<projectRoot> scan\""
echo "   U-A   :  opencode run --command understand \"<projectRoot>\"   (서브에이전트 디스패치)"
echo "   대시보드: opencode run --command understand-dashboard \"<projectRoot>\""
