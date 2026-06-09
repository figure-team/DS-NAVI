// 최초 1회 엔진 빌드 보장.
// 플러그인 설치 직후엔 packages/legacy-core/dist 가 없다(빌드 산출물·node_modules 는 git 미포함).
// dist 가 없으면 legacy-core 를 standalone 으로 install + build 한다(U-A 의존성 0, 런타임 의존은 zod 뿐).
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
