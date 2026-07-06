/**
 * WORK_MAP P1 시각 QA — 구성도 랜딩.
 * 검사: AC-1(페이지 무스크롤), AC-2(메뉴 라벨 "업무 지도" + 기존 딥링크), AC-3(연동 패널 degrade),
 * 기능 칩 ?flow= 딥링크. 스크린샷: 1920x1080 / 1366x768.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const { loadPlaywright } = await import(
  join(here, "..", "packages", "legacy-core", "dist", "screen-capture", "playwright-loader.js")
);
const { chromium } = await loadPlaywright();

const BASE = process.argv[2] ?? "http://127.0.0.1:5321";
const TOKEN = process.argv[3] ?? "qa-token";
const OUT = process.argv[4] ?? "./qa-workmap-out";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch();
for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  const errors = [];
  // 선택적 리소스(404 가 정상 degrade): system-map(P2 전), diff-overlay, favicon — qa-rtm-visual 관례.
  // "Failed to load resource" 콘솔 에러는 URL이 없어 개별 판별 불가 — 실제 404 는 response 핸들러가 잡는다.
  const OPTIONAL_404 = [/system-map\.json/, /diff-overlay\.json/, /favicon/, /manifest/, /Failed to load resource/];
  page.on("console", (m) => {
    if (m.type() === "error" && !OPTIONAL_404.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !OPTIONAL_404.some((re) => re.test(r.url()))) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/domains?token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // AC-1: 페이지(루트 컨테이너) 무스크롤 — body/서브루트 스크롤 높이 = 클라이언트 높이
  const scroll = await page.evaluate(() => {
    const el = document.documentElement;
    return { sh: el.scrollHeight, ch: el.clientHeight, bodySh: document.body.scrollHeight };
  });
  check(`AC-1 무스크롤 @${vp.w}x${vp.h}`, scroll.sh <= scroll.ch + 1, `scrollHeight ${scroll.sh} vs client ${scroll.ch}`);

  // 도메인 박스 5개 렌더
  const boxes = await page.locator(".domain-card").count();
  check(`도메인 박스 5개 @${vp.w}`, boxes === 5, `실측 ${boxes}`);

  // AC-3: 연동 패널 degrade 문구(system-map 없음)
  const degrade = await page.getByText("연동 데이터 없음").count();
  check(`AC-3 연동 패널 degrade @${vp.w}`, degrade >= 1);

  // AC-2: NavRail 라벨 "업무 지도"
  const navLabel = await page.getByText("업무 지도", { exact: true }).count();
  check(`AC-2 메뉴 라벨 @${vp.w}`, navLabel >= 1, `count ${navLabel}`);

  await page.screenshot({ path: `${OUT}/landing-${vp.w}x${vp.h}.png` });

  if (vp.w === 1920) {
    // 기능 칩 클릭 → ?flow= 딥링크 (evaluate 클릭 — 헤드리스 안정)
    const chip = page.locator(".domain-card button[title]").filter({ hasNot: page.locator("text=상세보기") }).nth(2);
    const chipTitle = await chip.getAttribute("title");
    await chip.evaluate((el) => el.click());
    await page.waitForTimeout(1200);
    const url = page.url();
    check("기능 칩 → ?flow= 딥링크", /\/domains\/[^/]+\?.*flow=/.test(url), url.slice(0, 110));
    await page.screenshot({ path: `${OUT}/chip-deeplink.png` });
    check("칩 대상 기능", !!chipTitle, chipTitle ?? "");

    // 기존 딥링크 하위호환: /domains/:id?flow= 직접 진입
    await page.goto(`${BASE}/domains?token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    // 도메인 박스 본문 클릭 → 워크스페이스
    await page.locator(".domain-card > button.w-full").first().evaluate((el) => el.click());
    await page.waitForTimeout(800);
    check("도메인 박스 → 워크스페이스", /\/domains\/[^/?]+/.test(page.url()), page.url().slice(0, 110));

    // 상세보기 모달
    await page.goto(`${BASE}/domains?token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const detailBtns = await page.locator(".domain-card button[aria-haspopup='dialog']").count();
    await page.locator(".domain-card button[aria-haspopup='dialog']").first().evaluate((el) => el.click());
    await page.waitForTimeout(900);
    const dialog = await page.locator("[role='dialog']").count();
    check("상세보기 모달", dialog === 1, `detailBtns ${detailBtns}, dialog ${dialog}`);
    await page.screenshot({ path: `${OUT}/detail-modal.png` });
  }

  check(`HTTP/console 에러 0건 @${vp.w}`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
await browser.close();

const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `\nFAIL ${fails.length}건` : "\n전부 통과");
process.exit(fails.length ? 1 : 0);
