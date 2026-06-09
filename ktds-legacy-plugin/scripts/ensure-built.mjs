// 최초 1회 엔진 빌드 보장.
// 플러그인 설치 직후엔 packages/legacy-core/dist 가 없다(빌드 산출물·node_modules 는 git 미포함).
// dist 가 없으면 legacy-core 에서 install + build 한다.
//   - legacy-core 자체의 런타임 의존은 zod 뿐(U-A 코드 의존 0)이지만,
//   - 루트 pnpm-workspace.yaml 때문에 install 은 워크스페이스 전체로 확장되고
//     루트 prepare 가 U-A core 까지 빌드한다 → 한 번의 자동 빌드로 U-A·ktds 엔진이 모두 준비된다.
//   - 따라서 tree-sitter 네이티브 프리빌드 다운로드를 위해 최초 1회 네트워크가 필요하다.
import { existsSync } from "node:fs";
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

/**
 * @ktds/legacy-core 가 빌드돼 있도록 보장하고, dist 진입점의 file:// URL 을 반환한다.
 * 이미 빌드돼 있으면 즉시 반환(추가 작업 없음).
 */
export async function ensureBuilt() {
  const here = dirname(fileURLToPath(import.meta.url)); // <plugin>/scripts
  const core = resolve(here, "..", "packages", "legacy-core");
  const distFile = join(core, "dist", "index.js");

  if (!existsSync(distFile)) {
    const pm = hasCmd("pnpm") ? "pnpm" : hasCmd("npm") ? "npm" : null;
    if (!pm) {
      throw new Error("[ktds] 엔진 최초 빌드에 pnpm 또는 npm 이 필요합니다. (Node 22+ 권장)");
    }
    process.stderr.write(`[ktds] 최초 1회 엔진 빌드 중 (${pm}) — 잠시 걸립니다...\n`);
    execFileSync(pm, ["install"], { cwd: core, stdio: "inherit" });
    execFileSync(pm, ["run", "build"], { cwd: core, stdio: "inherit" });
    if (!existsSync(distFile)) {
      throw new Error(`[ktds] 빌드 후에도 산출물이 없습니다: ${distFile}`);
    }
    process.stderr.write("[ktds] 엔진 빌드 완료.\n");
  }
  return pathToFileURL(distFile).href;
}
