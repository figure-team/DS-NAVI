// 엔진 빌드 보장 + stale dist 자동 재빌드.
// 플러그인 설치 직후엔 packages/legacy-core/dist 가 없다(빌드 산출물·node_modules 는 git 미포함).
// dist 가 없으면 legacy-core 에서 install + build 한다.
//   - legacy-core 자체의 런타임 의존은 zod 뿐(U-A 코드 의존 0)이지만,
//   - 루트 pnpm-workspace.yaml 때문에 install 은 워크스페이스 전체로 확장되고
//     루트 prepare 가 U-A core 까지 빌드한다 → 한 번의 자동 빌드로 U-A·ktds 엔진이 모두 준비된다.
//   - 따라서 tree-sitter 네이티브 프리빌드 다운로드를 위해 최초 1회 네트워크가 필요하다.
//
// Staleness: 플러그인 업데이트(소스 갱신)인데 옛 dist 가 남아 있으면, 과거엔
// `existsSync(dist)` 만 보고 구 엔진을 조용히 실행했다(#step-layer 회귀 원인).
// 이제 빌드 시 dist 에 버전 스탬프(.build-version = package.json version)를 남기고,
// 실행 때 현재 소스 버전과 비교해 다르면(또는 스탬프 부재 시) 재빌드한다. ktds 규칙상
// 소스 변경은 버전 bump 를 동반하므로 업데이트가 확실히 잡힌다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

function hasCmd(cmd) {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** legacy-core/package.json 의 version (읽기 실패 시 "" → dist 가 있어도 stale 취급). */
function readVersion(core) {
  try {
    return JSON.parse(readFileSync(join(core, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/**
 * dist 가 현재 소스와 일치하는지 판정한다(빌드를 실행하지 않는 순수 함수 — 테스트용 export).
 * @returns {{ stale: boolean, reason: string, version: string, distFile: string, stampFile: string }}
 */
export function distStatus(core) {
  const distFile = join(core, "dist", "index.js");
  const stampFile = join(core, "dist", ".build-version");
  const version = readVersion(core);

  if (!existsSync(distFile)) return { stale: true, reason: "missing", version, distFile, stampFile };

  let stamp = null;
  try {
    stamp = readFileSync(stampFile, "utf8").trim();
  } catch {
    /* 스탬프 없음 — 구 빌드(스탬프 도입 전) 또는 외부 복사본 */
  }
  if (stamp === null) return { stale: true, reason: "no-stamp", version, distFile, stampFile };
  if (stamp !== version) {
    return { stale: true, reason: `version ${stamp} → ${version}`, version, distFile, stampFile };
  }
  return { stale: false, reason: "fresh", version, distFile, stampFile };
}

/**
 * @ktds/legacy-core 가 (현재 소스 버전으로) 빌드돼 있도록 보장하고, dist 진입점의
 * file:// URL 을 반환한다. 이미 최신이면 즉시 반환(추가 작업 없음).
 */
export async function ensureBuilt() {
  const here = dirname(fileURLToPath(import.meta.url)); // <plugin>/scripts
  const core = resolve(here, "..", "packages", "legacy-core");
  const { stale, reason, version, distFile, stampFile } = distStatus(core);

  if (stale) {
    const pm = hasCmd("pnpm") ? "pnpm" : hasCmd("npm") ? "npm" : null;
    if (!pm) {
      throw new Error("[ktds] 엔진 빌드에 pnpm 또는 npm 이 필요합니다. (Node 22+ 권장)");
    }
    const label = reason === "missing" ? "최초 1회 엔진 빌드" : `엔진 재빌드(${reason})`;
    process.stderr.write(`[ktds] ${label} 중 (${pm}) — 잠시 걸립니다...\n`);
    execFileSync(pm, ["install"], { cwd: core, stdio: "inherit" });
    execFileSync(pm, ["run", "build"], { cwd: core, stdio: "inherit" });
    if (!existsSync(distFile)) {
      throw new Error(`[ktds] 빌드 후에도 산출물이 없습니다: ${distFile}`);
    }
    // 스탬프 기록(빌드 직후) — 다음 실행부터 버전 비교로 stale 판정. 실패해도 치명적이지 않다.
    try {
      writeFileSync(stampFile, version);
    } catch {
      /* 쓰기 권한 없음 등 — 다음 실행 때 no-stamp 로 한 번 더 재빌드될 뿐 */
    }
    process.stderr.write("[ktds] 엔진 빌드 완료.\n");
  }
  return pathToFileURL(distFile).href;
}
