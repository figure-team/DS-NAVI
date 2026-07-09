/**
 * wiki vault 영속 IO (P4.4) — `.spec/wiki/` 하위에 vault 파일을 안정 기록.
 *
 * 결정론: 파일 내용은 buildWikiVault 가 이미 byte-identical 로 생성하므로 그대로 기록.
 * 쓰기 전 wiki 디렉터리를 비우고(mkdir -p) 재생성한다 — 방법론 전환(as-built ->
 * si-standard)으로 더는 산출되지 않는 orphan .md 가 남아 index.md 와 어긋나지 않게
 * 한다. 기록한 절대 경로 목록(정렬)을 반환한다.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
/** `.spec/wiki/` 디렉터리 경로 — wiki vault 산출물이 사는 곳. */
export function specWikiDir(projectRoot) {
    return join(projectRoot, '.spec', 'wiki');
}
/**
 * WikiVault 를 `.spec/wiki/` 하위에 기록. 각 파일의 부모 디렉터리를 mkdir -p 후
 * 안정 기록한다(내용은 buildWikiVault 가 보장하는 결정론 본문). 기록 경로(정렬) 반환.
 */
export function writeWikiVault(projectRoot, vault) {
    const root = specWikiDir(projectRoot);
    // orphan 방지: wiki 디렉터리만 통째로 비우고 재생성한다(다른 .spec 산출물은 보존).
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const written = [];
    const files = [...vault.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const file of files) {
        const abs = join(root, file.path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, file.content, 'utf8');
        written.push(abs);
    }
    return written.slice().sort();
}
//# sourceMappingURL=persist.js.map