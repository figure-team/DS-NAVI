/**
 * ktds legacy-core — playwright-core 로더.
 *
 * 브라우저 구동 코드는 scripts/*.mjs 러너에 있지만, playwright-core 의존성은
 * 이 패키지(legacy-core)에 있으므로 dynamic import 를 여기서 수행해야
 * 워크스페이스 심링크/vendored(node_modules 자급) 양쪽에서 해석이 보장된다.
 */

/** playwright-core 모듈 로드. 실패 시 설치 안내 포함 에러. */
export async function loadPlaywright(): Promise<typeof import('playwright-core')> {
  try {
    return await import('playwright-core')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      'playwright-core 를 로드할 수 없습니다. 의존성을 설치하세요:\n' +
        '  pnpm install (레포 루트)\n' +
        '브라우저 실행 파일이 없다는 오류라면:\n' +
        '  npx playwright@1.61.1 install chromium\n' +
        `원인: ${detail}`,
    )
  }
}
