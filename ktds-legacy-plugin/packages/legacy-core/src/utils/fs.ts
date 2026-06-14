/**
 * 원자적 파일 쓰기. impact/archive와 wiki/orchestrate가 각자 두던 변형의 단일 출처
 * (리팩토링 2026-06). pid 접미사로 동시 실행 tmp 경합을 막고, 실패 시 tmp를 치운다.
 * dirname을 보장 생성하므로 호출부의 사전 mkdir이 불필요하다.
 */
import { writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, filePath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
