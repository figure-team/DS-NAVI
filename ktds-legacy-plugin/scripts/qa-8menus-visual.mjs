/**
 * 8개 메뉴 세부 조정·보완 시각 QA — /screenspec /change /rtm /programs /quality /report /policy /deliverables
 * 렌더 정상 + 콘솔/리소스 에러 0 + URL 딥링크 스모크(구현 후 단언 보강).
 * 사용: node qa-8menus-visual.mjs [BASE] [TOKEN] [OUT]
 * 전제: dashboard dev 서버(UNDERSTAND_ACCESS_TOKEN=qa-token, GRAPH_DIR=examples/jpetstore-6) 가동.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const { loadPlaywright } = await import(
  join(here, "..", "packages", "legacy-core", "dist", "screen-capture", "playwright-loader.js")
);
const { chromium } = await loadPlaywright();

const BASE = process.argv[2] ?? "http://127.0.0.1:5321";
const TOKEN = process.argv[3] ?? "qa-token";
const OUT = process.argv[4] ?? join(REPO, ".omc", "qa-8menus-out");
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

// 선택 리소스 404 허용(qa-newmenus 관례).
const OPTIONAL_404 = [
  /diff-overlay\.json/, /favicon/, /manifest/, /wiki-graph\.json/, /golden-baseline\.json/,
  /impact-overlay\.json/, /doc-xlsx/, /Failed to load resource/,
];

// 각 메뉴: 기본 렌더 + 대표 딥링크 파라미터 재진입 스모크.
const PAGES = [
  { path: "/screens", h1: "화면설계서", mustHave: ["동작(핸들러)", "신뢰도"], deep: "?q=order" },
  { path: "/change", h1: "변경 · 영향 분석", mustHave: ["변경 기점", "하류"], deep: "?q=." },
  { path: "/rtm", h1: "요구사항 추적", mustHave: ["기능"], deep: "?q=주문" },
  { path: "/programs", h1: "프로그램 목록", mustHave: ["FP 산정 근거", "인터페이스"], deep: "?pq=order" },
  { path: "/quality", h1: "품질 · 위험", mustHave: ["위험 모듈", "분석 커버리지"], deep: "?tab=cov" },
  { path: "/report", h1: "실적 보고서", mustHave: ["하이라이트", "모듈별 변경"], deep: "" },
  { path: "/policy", h1: "정책서", mustHave: ["카테고리별 정책", "대조 현황"], deep: "" },
  { path: "/deliverables", h1: "산출물", mustHave: ["확정"], deep: "?status=confirmed" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !OPTIONAL_404.some((re) => re.test(m.text()))) errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400 && !OPTIONAL_404.some((re) => re.test(r.url()))) errors.push(`${r.status()} ${r.url()}`);
});

for (const p of PAGES) {
  errors.length = 0;
  await page.goto(`${BASE}${p.path}?token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const h1 = (await page.locator("h1").first().textContent().catch(() => "")) ?? "";
  check(`${p.path} h1`, h1.replace(/\s+/g, " ").includes(p.h1.replace(/\s+/g, " ")), `실측 "${h1.trim()}"`);
  for (const text of p.mustHave) {
    const n = await page.getByText(text, { exact: false }).count();
    check(`${p.path} "${text}" 표시`, n > 0, `count ${n}`);
  }
  check(`${p.path} 콘솔/리소스 에러 0`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.screenshot({ path: join(OUT, `${p.path.slice(1)}.png`), fullPage: true });

  if (p.deep) {
    errors.length = 0;
    await page.goto(`${BASE}${p.path}${p.deep}&token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const body = (await page.locator("body").textContent().catch(() => "")) ?? "";
    check(`${p.path}${p.deep} 딥링크 렌더`, body.length > 200, `body ${body.length}자`);
    check(`${p.path}${p.deep} 에러 0`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.screenshot({ path: join(OUT, `${p.path.slice(1)}-deep.png`), fullPage: true });
  }
}

await browser.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 통과${fail ? ` · 실패 ${fail}` : ""}`);
process.exit(fail ? 1 : 0);
