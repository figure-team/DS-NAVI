/**
 * 메뉴 개편 2차 시각 QA — 신설 6화면(/data /change /programs /quality /report /policy)
 * + 구조 탭 위험 오버레이(?overlay=risk).
 * 사용: node qa-newmenus-visual.mjs [BASE] [TOKEN] [OUT]
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
const OUT = process.argv[4] ?? join(REPO, ".omc", "qa-newmenus-out");
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

// 선택 리소스 404 허용(qa-workmap 관례) — wiki-graph 는 dev 엔드포인트 없음.
const OPTIONAL_404 = [
  // golden-baseline: 라이브 dev 는 프로젝트 .spec/golden 부재 시 404 = 설계된 정직한 degrade
  // (데모 빌드는 public/golden-baseline.json 서빙). 화면은 빈 상태 카드로 처리한다.
  /diff-overlay\.json/, /favicon/, /manifest/, /wiki-graph\.json/, /golden-baseline\.json/,
  /Failed to load resource/,
];

const PAGES = [
  { path: "/data", h1: "데이터 맵", mustHave: ["테이블", "CRUD"] },
  { path: "/change", h1: "변경 · 영향 분석", mustHave: ["변경 기점", "하류"] },
  { path: "/programs", h1: "프로그램 목록", mustHave: ["FP 산정 근거", "인터페이스"] },
  { path: "/quality", h1: "품질 · 위험", mustHave: ["위험 모듈", "분석 커버리지"] },
  { path: "/report", h1: "실적 보고서", mustHave: ["하이라이트", "모듈별 변경"] },
  { path: "/policy", h1: "정책서", mustHave: ["카테고리별 정책", "대조 현황"] },
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
}

// NavRail: 신설 6항목 + 그룹 헤더 "정량 · 보고"
errors.length = 0;
await page.goto(`${BASE}/?token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
for (const label of ["데이터", "변경·영향", "프로그램", "품질·위험", "보고서", "정책서"]) {
  const n = await page.locator("nav").getByText(label, { exact: true }).count();
  check(`NavRail "${label}"`, n >= 1, `count ${n}`);
}
check("NavRail 그룹 '정량 · 보고'", (await page.locator("nav").getByText("정량 · 보고").count()) >= 1);
await page.screenshot({ path: join(OUT, "home-nav.png") });

// 구조 탭 위험 오버레이 딥링크 — 범례 "등급 상" 노출 + 토글 버튼 ON
errors.length = 0;
await page.goto(`${BASE}/structure?overlay=risk&token=${TOKEN}&onboard=skip`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const riskLegend = await page.getByText("등급 상", { exact: false }).count();
check("구조 위험 오버레이 범례", riskLegend > 0, `count ${riskLegend}`);
const riskBtn = await page.getByText("위험 ON", { exact: false }).count();
check("위험 토글 ON", riskBtn > 0, `count ${riskBtn}`);
check("구조(오버레이) 에러 0", errors.length === 0, errors.slice(0, 3).join(" | "));
await page.screenshot({ path: join(OUT, "structure-risk-overlay.png") });

await browser.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 통과${fail ? ` · 실패 ${fail}` : ""}`);
process.exit(fail ? 1 : 0);
