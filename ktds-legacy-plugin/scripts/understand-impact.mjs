#!/usr/bin/env node
// /understand-impact 엔진 진입점 — 결정론 변경 영향도 분석 (ADR-002).
//   카탈로그: node understand-impact.mjs <projectRoot> seeds
//   분석:     node understand-impact.mjs <projectRoot> analyze --path <file> [--path <file2> ...] [--sr <SR-ID>] [--by <handle>]
//   상태:     node understand-impact.mjs <projectRoot> status [--list]
//
// 자연어→시드 매핑은 host(Claude) 역할이다(SKILL.md). 엔진은 --path로 받은
// 파일 집합만 입력으로 쓴다. 비-TTY/슬래시에서 시드 없이 analyze하면 임의
// 분석을 하지 않고 카탈로그+안내만 낸다(fail-closed). 전제: /understand-map
// scan이 .spec/map/ 산출물을 만들어둬야 한다(없으면 안내).
// --sr: 분석 사본을 .spec/impact/<SR-ID>/에 보관 (status --list로 이력 조회).
// 분석 후 .understand-anything/impact-overlay.json(예측 채널)을 발행해 대시보드
// '영향도' 토글이 시각화한다 (KG 없으면 생략). 실측 비교는 /understand-review.
import { join } from "node:path";
import { ensureBuilt } from "./ensure-built.mjs";

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

const {
  analyzeImpact, buildChangeImpact, publishChangeImpact, loadImpactInputs,
  publishImpactOverlay, cleanupLegacyImpactDiffOverlay,
  archiveImpactRun, listImpactRuns, assertSrId,
  ImpactInputMissingError, logEvent,
} = await import(await ensureBuilt());

const SUBS = ["seeds", "analyze", "status"];

function assertHandle(by, usage) {
  if (by !== undefined && (by === "" || by.startsWith("-"))) {
    throw new Error(`usage: ${usage} (핸들은 비어있거나 '-'로 시작할 수 없음)`);
  }
}

const argv = process.argv.slice(2);
const root = argv[0] && !argv[0].startsWith("-") && !SUBS.includes(argv[0]) ? argv[0] : process.cwd();
const rest = argv[0] === root ? argv.slice(1) : argv;
const sub = rest[0] ?? "analyze";
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const multiFlag = (n) => rest.flatMap((v, i) => (v === n && rest[i + 1] ? [rest[i + 1]] : []));
const spec = join(root, ".spec");

function basename(p) { return p.split("/").pop(); }

async function printCatalog() {
  const inputs = await loadImpactInputs(root);
  console.log("=== 시드 매핑 카탈로그 (자연어→파일 매핑용) ===");
  const byLang = {};
  for (const f of inputs.census.files) byLang[f.lang] = (byLang[f.lang] ?? 0) + 1;
  console.log(`파일 ${inputs.census.fileCount}개 — ${Object.entries(byLang).map(([l, c]) => `${l}:${c}`).join(" ")}`);
  console.log(`\n[라우트/진입점 ${inputs.routes.routes.length}개]`);
  for (const r of inputs.routes.routes) {
    console.log(`  ${r.routeId}  →  ${r.handler ?? "?"}  (${r.filePath})`);
  }
  for (const b of inputs.routes.batchEntries) {
    console.log(`  ${b.entryId}  →  ${b.handler ?? "?"}  (${b.filePath})`);
  }
  if (inputs.confirmed) {
    console.log(`\n[도메인 ${inputs.confirmed.domains.length}개]`);
    for (const d of inputs.confirmed.domains) {
      console.log(`  ${d.key}${d.name !== d.key ? ` (${d.name})` : ""} — 루트 ${d.roots.length}개`);
    }
  } else {
    console.log("\n[도메인] 미확정 (/understand-map confirm 전) — 흐름/도메인 영향은 NEEDS_REVIEW로 강등됨");
  }
}

function summarize(result, verify) {
  const u = result.upstream;
  console.log(`\n변경 영향도 분석 — 시드 ${result.seeds.length}개: ${result.seeds.map((s) => basename(s.relPath)).join(", ")}`);
  console.log(`상류(영향받는 호출자) ${u.files.length}파일 · 하류(의존 협력자) ${result.downstream.files.length}파일`);
  console.log(`API·진입점 영향: ${u.api.map((a) => `${a.id}[${a.via}]`).join(" | ") || "(없음)"}`);
  console.log(`DB 매퍼: ${u.persistence.mappers.map((m) => basename(m.relPath)).join(", ") || "(없음)"} (테이블 슬롯 ${u.persistence.tableCandidateSlots.length} · KG테이블 ${u.persistence.kgTableCatalog.length})`);
  console.log(`흐름 ${u.flows.length} · 도메인 ${u.domains.map((d) => d.name ?? d.key).join(", ") || "(없음)"}`);
  console.log(`검토 필요 ${result.needsReview.length}건 (hub ${result.overEdges.hubNodes.length} · 교차검증 불일치 ${result.overEdges.crossCheckDiff.length})`);
  console.log(`근거율 ${verify.overall.groundedPct}% (GROUNDED ${verify.overall.itemGrounded}/${verify.overall.itemTotal} · 인용ok ${verify.overall.citationOk}/${verify.overall.citationTotal})`);
}

try {
  if (sub === "seeds") {
    await printCatalog();
  } else if (sub === "status") {
    if (rest.includes("--list")) {
      const runs = await listImpactRuns(root);
      if (runs.length === 0) {
        console.log("SR 보관 없음 — analyze --sr <SR-ID> 로 분석을 보관하세요 (.spec/impact/).");
      } else {
        console.log(`=== SR 영향분석 보관 ${runs.length}건 (.spec/impact/) ===`);
        for (const r of runs) {
          if (!r.valid) { console.log(`  ${r.srId}  [손상 — 보관본 파싱 실패, 재분석 권장]`); continue; }
          const pct = r.groundedPct === null ? "?" : `${r.groundedPct}%`;
          console.log(`  ${r.srId}  시드 ${r.seeds.map(basename).join(", ")} · 상류 ${r.upstreamFiles} · API ${r.api} · 매퍼 ${r.mappers} · 검토필요 ${r.needsReview} · 근거율 ${pct}${r.hasReview ? " · [리뷰 있음]" : ""}${r.predictionCorrupt ? " · [예측 손상 — 재분석 권장]" : ""}`);
        }
      }
    } else {
      const inputs = await loadImpactInputs(root).catch(() => null);
      if (!inputs) { console.log("미실행 — .spec/map 산출물 없음 (먼저 /understand-map scan)"); }
      else {
        const { readFile } = await import("node:fs/promises");
        const p = join(spec, "map", "impact.json");
        const raw = await readFile(p, "utf-8").catch(() => null);
        if (!raw) console.log("impact.json 없음 — analyze를 먼저 실행하세요.");
        else {
          const r = JSON.parse(raw);
          console.log(`마지막 분석: 시드 ${r.seeds.map((s) => basename(s.relPath)).join(", ")} · 상류 ${r.upstream.files.length} · API ${r.upstream.api.length} · 검토필요 ${r.needsReview.length}`);
        }
      }
    }
  } else if (sub === "analyze") {
    const paths = multiFlag("--path");
    const by = flag("--by");
    const srId = flag("--sr");
    assertHandle(by, "analyze --path <file> ... --by <handle>");
    // fail-closed: --sr 값 누락을 침묵 무보관으로 흘리지 않는다 (리뷰 minor)
    if (rest.includes("--sr") && srId === undefined) {
      throw new Error("usage: analyze --path <파일> ... --sr <SR-ID> (--sr 값 누락)");
    }
    if (srId !== undefined) assertSrId(srId); // 디렉터리명 안전성 fail-closed
    if (paths.length === 0) {
      // fail-closed: 시드 없이 임의 분석 금지
      console.log("시드(--path)가 없습니다. 임의 분석을 하지 않습니다.");
      console.log("절차: (1) 아래 카탈로그로 자연어→파일을 매핑하고 (2) 사용자 확인 후");
      console.log("      analyze --path <파일> [--path <파일2> ...] 로 실행하세요.\n");
      try {
        await printCatalog();
      } catch (e) {
        // 입력(.spec/map) 부재는 셋업 오류 → exit 2(안내 후). 시드 미지정 자체는
        // 정상 안내라 exit 0이지만, 입력이 없으면 wrapper가 성공으로 오인하면 안 됨.
        console.error(e.message);
        process.exit(e instanceof ImpactInputMissingError ? 2 : 1);
      }
      process.exit(0);
    }
    const seeds = paths.map((relPath) => ({ relPath, origin: "path", confidence: "CONFIRMED_HUMAN" }));
    const { result, verify, impactPath, verifyPath, inputs } = await analyzeImpact(root, seeds);
    const doc = buildChangeImpact(result, verify, {
      census: inputs.census.files,
      confirmed: inputs.confirmed,
      ownership: inputs.slices.ownership,
    });
    const docPath = await publishChangeImpact(root, doc);
    // 보관/오버레이 실패가 감사(IMPACT_ANALYZED)를 유실시키지 않게 — 오류는
    // 감사 detail에 기록하고 출력 후 비제로 종료 (리뷰 minor).
    let archiveDir = null, archiveError = null;
    if (srId !== undefined) {
      try { archiveDir = await archiveImpactRun(root, srId, { result, verify, doc }); }
      catch (e) { archiveError = e.message; }
    }
    let overlay = null, overlayError = null;
    try { overlay = await publishImpactOverlay(root, result); }
    catch (e) { overlayError = e.message; }
    // 0.8.0 잔재(예측이 diff-overlay.json에 쓰던 파일) 정리 — 실패해도 무해(독립 경고)
    try { await cleanupLegacyImpactDiffOverlay(root); }
    catch (e) { console.warn(`잔재 diff-overlay 정리 실패(무해): ${e.message}`); }
    await logEvent(spec, "IMPACT_ANALYZED", {
      by,
      detail: {
        seeds: seeds.map((s) => s.relPath),
        ...(srId !== undefined ? { srId } : {}),
        ...(archiveError ? { archiveError } : {}),
        ...(overlayError ? { overlayError } : {}),
        upstreamFiles: result.upstream.files.length,
        api: result.upstream.api.length,
        mappers: result.upstream.persistence.mappers.length,
        hubCount: result.overEdges.hubNodes.length,
        groundedPct: verify.overall.groundedPct,
        overlay: overlay
          ? {
              changed: overlay.overlay.changedNodeIds.length,
              affected: overlay.overlay.affectedNodeIds.length,
              unresolved: overlay.overlay.ktdsImpact.unresolved.length,
              backedUp: overlay.backedUp,
            }
          : null,
      },
    });
    summarize(result, verify);
    console.log(`\nimpact: ${impactPath}`);
    console.log(`verify: ${verifyPath}`);
    console.log(`문서: ${docPath} (읽기전용 분석물 — 검토·승인 상태기계 밖)`);
    if (archiveDir) console.log(`SR 보관: ${archiveDir} (status --list로 이력 조회)`);
    if (archiveError) console.error(`SR 보관 실패: ${archiveError} (분석·보고서는 발행됨, 감사에 archiveError 기록)`);
    if (overlay) {
      const k = overlay.overlay.ktdsImpact;
      console.log(`대시보드 영향도 오버레이: ${overlay.path} (시드 ${overlay.overlay.changedNodeIds.length} · 영향 ${overlay.overlay.affectedNodeIds.length}${k.unresolved.length ? ` · KG 미조인 ${k.unresolved.length}` : ""})`);
      if (overlay.overlay.changedNodeIds.length === 0) {
        console.warn("  주의: 시드가 KG에 매칭되지 않아 대시보드가 오버레이를 표시하지 않습니다 (/understand 분석 범위 확인).");
      } else {
        console.log("  /understand-dashboard 실행 → '영향도' 토글(i 키): 적색=시드 · 호박색=영향. 재분석 후 새로고침.");
      }
    } else if (overlayError) {
      console.error(`대시보드 오버레이 실패: ${overlayError} (분석·보고서는 발행됨, 감사에 overlayError 기록)`);
    } else {
      console.log("대시보드 오버레이: 생략 (.understand-anything/knowledge-graph.json 없음/손상 — /understand 후 재분석 시 생성)");
    }
    console.log("DB 테이블/컬럼은 tableCandidateSlots의 SQL 슬라이스에서 host가 인용 추출하세요(SKILL.md).");
    if (archiveError || overlayError) process.exit(1);
  } else {
    console.error(`unknown subcommand: ${sub} (${SUBS.join("|")})`);
    process.exit(2);
  }
} catch (err) {
  if (err instanceof ImpactInputMissingError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
