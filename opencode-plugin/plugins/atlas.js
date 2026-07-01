// ktds DS-NAVI — opencode adapter plugin
//
// Claude Code 플러그인은 스킬 본문에서 `${CLAUDE_PLUGIN_ROOT}/scripts/*.mjs` 로
// 번들 스크립트를 호출한다. opencode 에는 그 변수가 없다. 이 플러그인은 `shell.env`
// 훅으로 모든 셸에 `ATLAS_PLUGIN_ROOT` 를 주입해 동일 패턴을 그대로 살린다.
//
// 번들 루트 결정 우선순위:
//   1) 환경변수 ATLAS_PLUGIN_ROOT (이미 설정돼 있으면 존중 — dev override)
//   2) 이 파일 기준 ../bundle  (설치본: ~/.config/opencode/bundle 심링크/복사)
//
// 번들 루트는 ktds-legacy 플러그인 디렉터리(= scripts/, packages/legacy-core/dist,
// templates/ 를 가진 self-locating 트리)를 가리켜야 한다. 스크립트는 import.meta.url
// 로 자기 위치에서 엔진·템플릿을 찾으므로 코드 수정은 전혀 없다.

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))

// 번들 루트 해소: env override(검증 통과 시) → ../<bundleName> → env 그대로(진단용).
// marker 는 그 루트가 맞는지 식별하는 하위 경로.
function resolveRoot(envName, bundleName, marker) {
  const fromEnv = process.env[envName]
  if (fromEnv && existsSync(resolve(fromEnv, marker))) return resolve(fromEnv)
  const bundled = resolve(here, "..", bundleName)
  if (existsSync(resolve(bundled, marker))) return bundled
  return fromEnv ? resolve(fromEnv) : bundled
}

// ktds-legacy 번들 (scripts/*.mjs + packages/legacy-core/dist + templates)
const ATLAS_ROOT = resolveRoot("ATLAS_PLUGIN_ROOT", "bundle", "scripts")
// understand-anything(U-A) 번들 (skills/* + packages/dashboard + packages/core)
const UA_ROOT = resolveRoot("UA_PLUGIN_ROOT", "bundle-ua", "skills")

export const AtlasPlugin = async () => {
  return {
    "shell.env": async (_input, output) => {
      // ktds 커맨드: $ATLAS_PLUGIN_ROOT 로 번들 스크립트 호출
      output.env.ATLAS_PLUGIN_ROOT = ATLAS_ROOT
      // U-A 스킬/대시보드: 본문이 ${CLAUDE_PLUGIN_ROOT} 를 최우선으로 해소하므로
      // 그 이름으로 U-A 루트를 주입하면 U-A 본문을 한 줄도 안 고치고 동작한다.
      // (별칭 UA_PLUGIN_ROOT 도 함께 노출)
      output.env.CLAUDE_PLUGIN_ROOT = UA_ROOT
      output.env.UA_PLUGIN_ROOT = UA_ROOT
    },
  }
}

export default AtlasPlugin
