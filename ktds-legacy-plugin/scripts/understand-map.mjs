#!/usr/bin/env node
// /understand-map 엔진 진입점 — 결정론 도메인 맵 (S1~S7).
//   스캔:   node understand-map.mjs <projectRoot> scan [--auto-approve [--by <handle>]]
//   후보표: node understand-map.mjs <projectRoot> plan
//   확정:   node understand-map.mjs <projectRoot> confirm            (TTY: 인터랙티브 게이트)
//           node understand-map.mjs <projectRoot> confirm --auto-approve --by <handle>
//   상태:   node understand-map.mjs <projectRoot> status
//   번들:   node understand-map.mjs <projectRoot> bundle      (S8 LLM 입력 — .spec/map/bundle/)
//   채움반영: node understand-map.mjs <projectRoot> emit      (fill/*.json → 검증 → domain-graph.json)
//
// 게이트(S7)는 자동 도메인 경계의 전문가 일치율 한계(ADR §1.3) 때문에 생략
// 불가다. 비-TTY에서 confirm은 후보 표 + 안내만 출력한다(임의 전체 확정 방지,
// Stage-12f 패턴) — 호스트(Claude)는 SKILL.md 지시대로 사용자에게 항목 단위로
// 묻고 --auto-approve --by 또는 TTY 세션을 권한다.
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { ensureBuilt } from "./ensure-built.mjs";

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

const {
  scanDomainMap, planTable, buildAutoPlan, renameDomain, mergeDomains,
  moveRoot, excludeDomain, detectPlanDrift, readConfirmedPlan,
  writeConfirmedPlan, logEvent, buildBundles, runFillPipeline,
} = await import(await ensureBuilt());

const SUBS = ["scan", "plan", "confirm", "status", "bundle", "emit"];

function assertHandle(by, usage) {
  if (!by || by.startsWith("-")) {
    throw new Error(`usage: ${usage} (핸들은 비어있거나 '-'로 시작할 수 없음)`);
  }
}

const argv = process.argv.slice(2);
const root = argv[0] && !argv[0].startsWith("-") && !SUBS.includes(argv[0]) ? argv[0] : process.cwd();
const rest = argv[0] === root ? argv.slice(1) : argv;
const sub = rest[0] ?? "scan";
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const has = (n) => rest.includes(n);
const spec = join(root, ".spec");

function summarize(r) {
  console.log(`census ${r.census.fileCount}파일 | 라우트 ${r.routes.routes.length} | 배치 ${r.routes.batchEntries.length} | 간선 ${r.edges.edges.length} (미해소 ${r.edges.unresolved.length}) | 슬라이스 ${r.slices.slices.length}`);
  console.log(planTable(r.candidates));
  if (r.skeleton) {
    const n = r.skeleton.nodes;
    console.log(`skeleton: domain ${n.filter((x) => x.type === "domain").length} · flow ${n.filter((x) => x.type === "flow").length} · step ${n.filter((x) => x.type === "step").length} → ${r.skeletonPath}`);
  } else {
    console.log("skeleton 미생성 — 도메인 경계 확정 필요: confirm (TTY) 또는 confirm --auto-approve --by <핸들>");
  }
}

async function auditConfirm(plan, mode) {
  await logEvent(spec, "MAP_PLAN_CONFIRMED", {
    by: plan.decidedBy,
    detail: {
      mode,
      domains: plan.domains.map((d) => ({ key: d.key, name: d.name, roots: d.roots.length })),
      excludedKeys: plan.excludedKeys,
    },
  });
}

if (sub === "scan") {
  if (has("--auto-approve")) {
    const by = flag("--by");
    if (by !== undefined) assertHandle(by, "scan --auto-approve --by <handle>");
    // 핸들은 scanDomainMap에 전달 — confirmed plan은 정확한 decidedBy로
    // 단 한 번만 쓰인다 (이중 쓰기/crash 귀속 손실 제거, 리뷰 반영)
    const r = await scanDomainMap(root, { autoApprove: by ?? true });
    if (r.confirmedCreated) await auditConfirm(r.confirmed, "auto-approve");
    summarize(r);
  } else {
    const r = await scanDomainMap(root);
    summarize(r);
    const drift = r.confirmed ? detectPlanDrift(r.confirmed, r.candidates) : null;
    if (drift && (drift.missingRoots.length || drift.newRoots.length)) {
      console.log("⚠ 확정 플랜 드리프트 감지 — 재확정(confirm) 권장:");
      for (const m of drift.missingRoots) console.log(`  사라진 루트: ${m}`);
      for (const n of drift.newRoots) console.log(`  새 루트: ${n}`);
    }
  }
} else if (sub === "plan") {
  const r = await scanDomainMap(root);
  console.log(planTable(r.candidates));
} else if (sub === "status") {
  const confirmed = await readConfirmedPlan(root);
  if (!confirmed) {
    console.log("미확정 — 게이트 대기 (confirm)");
  } else {
    console.log(`확정됨 (by ${confirmed.decidedBy}, commit ${confirmed.gitCommit ?? "없음"})`);
    for (const d of confirmed.domains) {
      console.log(`  ${d.key}${d.name !== d.key ? ` (${d.name})` : ""} — 루트 ${d.roots.length}개`);
    }
    if (confirmed.excludedKeys.length) console.log(`  제외: ${confirmed.excludedKeys.join(", ")}`);
  }
} else if (sub === "confirm") {
  const r = await scanDomainMap(root);
  if (has("--auto-approve")) {
    const by = flag("--by");
    assertHandle(by, "confirm --auto-approve --by <handle>");
    if (await readConfirmedPlan(root)) {
      console.log("이미 확정됨 — 변경하려면 .spec/map/domain-plan.confirmed.json 삭제 후 재확정 또는 TTY confirm 세션 사용.");
    } else {
      const plan = buildAutoPlan(r.candidates, by);
      await writeConfirmedPlan(root, plan);
      await auditConfirm(plan, "auto-approve");
    }
    const r2 = await scanDomainMap(root);
    summarize(r2);
  } else if (!process.stdin.isTTY) {
    // 비-TTY: 임의 전체 확정 방지 — 표와 안내만 (Stage-12f 패턴)
    console.log(planTable(r.candidates));
    console.log("비-TTY에서는 인터랙티브 확정 불가. 다음 중 하나:");
    console.log("  1) 터미널에서: node understand-map.mjs <root> confirm");
    console.log("  2) 후보 그대로 일괄 승인: confirm --auto-approve --by <핸들>");
  } else {
    await interactiveConfirm(r);
  }
} else if (sub === "bundle") {
  const r = await scanDomainMap(root);
  if (!r.skeleton) {
    console.error("skeleton 없음 — 먼저 도메인 경계를 확정하세요 (confirm)");
    process.exit(2);
  }
  const { bundles, paths } = await buildBundles(root, r.skeleton);
  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    console.log(`${b.key}: flow ${b.flows.length} · step ${b.steps.length} · 파일 ${b.files.length}${b.sliceOmitted.length ? ` (슬라이스 생략 ${b.sliceOmitted.length})` : ""} → ${paths[i]}`);
  }
  console.log(`다음: 도메인별로 fill/<key>.json 작성 후 emit (계약: name/summary/domainMeta만, 모든 사실 주장에 파일:라인+스니펫 인용)`);
} else if (sub === "emit") {
  const result = await runFillPipeline(root);
  const o = result.report.overall;
  console.log(`검증: 항목 ${o.itemTotal} (GROUNDED ${o.itemGrounded}) · 인용 ${o.citationTotal} (ok ${o.citationOk}) · 근거율 ${o.groundedPct}%`);
  if (result.pending.length) console.log(`미채움 도메인: ${result.pending.join(", ")}`);
  for (const inv of result.invalid) console.log(`✗ fill 스키마 위반 [${inv.key}]: ${inv.error.split("\n")[0]}`);
  for (const rej of result.rejected) console.log(`✗ 구조 위반 기각 [${rej.domainId}] ${rej.ref}: ${rej.reason}`);
  if (result.unfilled.length) console.log(`빈칸 잔여 노드 ${result.unfilled.length}개 (재시도: 해당 도메인 fill만 재작성)`);
  if (result.staleSkeleton) console.log("⚠ skeleton이 옛 commit 산물 — 라인 이동으로 인용이 어긋날 수 있음. scan 재실행 권장.");
  console.log(`domain-graph: ${result.domainGraphPath}`);
  console.log(`verify-report: ${result.verifyReportPath}`);
} else {
  console.error(`unknown subcommand: ${sub} (${SUBS.join("|")})`);
  process.exit(2);
}

// 인터랙티브 게이트 세션. 플랜 연산은 전부 순수 함수 — 실수해도 q로 빠지면
// 디스크에 아무것도 남지 않는다. 저장은 a(승인) 한 곳뿐.
async function interactiveConfirm(scanResult) {
  let plan = (await readConfirmedPlan(root)) ?? buildAutoPlan(scanResult.candidates, "");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(planTable(scanResult.candidates));
  console.log("명령: a=승인·저장 | r <key> <새이름>=개명 | m <from> <into>=병합 | v <루트경로> <key>=루트이동 | x <key>=제외 | p=현재 플랜 | q=저장 없이 종료");
  let handle = "";
  try {
    for (;;) {
      const line = (await rl.question("map> ").catch(() => "q")).trim();
      if (line === "" ) continue;
      const [cmd, ...args] = line.split(/\s+/);
      try {
        if (cmd === "q") { console.log("저장하지 않고 종료."); return; }
        if (cmd === "p") {
          for (const d of plan.domains) console.log(`  ${d.key}${d.name !== d.key ? ` (${d.name})` : ""} — 루트: ${d.roots.map((x) => x.split("/").pop()).join(", ")}`);
          if (plan.excludedKeys.length) console.log(`  제외: ${plan.excludedKeys.join(", ")}`);
          continue;
        }
        if (cmd === "r") { plan = renameDomain(plan, args[0], args.slice(1).join(" ")); continue; }
        if (cmd === "m") { plan = mergeDomains(plan, args[0], args[1]); continue; }
        if (cmd === "v") { plan = moveRoot(plan, args[0], args[1]); continue; }
        if (cmd === "x") { plan = excludeDomain(plan, args[0]); continue; }
        if (cmd === "a") {
          while (!handle) {
            handle = (await rl.question("승인자 핸들(이니셜, 실명·사번 금지): ")).trim();
            if (handle.startsWith("-")) handle = "";
          }
          plan = { ...plan, decidedBy: handle };
          await writeConfirmedPlan(root, plan);
          await auditConfirm(plan, "interactive");
          const r2 = await scanDomainMap(root);
          summarize(r2);
          return;
        }
        console.log("알 수 없는 명령. a/r/m/v/x/p/q");
      } catch (err) {
        console.log(`  ✗ ${err.message}`);
      }
    }
  } finally {
    rl.close();
  }
}
