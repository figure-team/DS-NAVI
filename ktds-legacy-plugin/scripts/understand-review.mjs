#!/usr/bin/env node
// /understand-review 엔진 진입점 — 변경분 실측 리뷰 (T12, ADR-002 부록 B).
//   리뷰: node understand-review.mjs <projectRoot> [analyze] [--base <ref>] [--sr <SR-ID>] [--by <handle>]
//
// 예측(/understand-impact)의 짝: git diff(base..워킹트리, 미커밋 포함)가 보고한
// **실제 변경 파일**을 시드로 같은 impact 엔진에 투입한다. base 기본값 =
// 마지막 map 스캔 시점 commit(census.gitCommit). 분석 전 map을 재스캔해 현재
// 코드 기준 간선으로 계산한다(confirm 게이트는 건드리지 않음).
// 산출: .spec/map/review.json + review-verify-report.json (impact.json=마지막
// 예측 보존) + docs/09_release/change-review-checklist.md(읽기전용) +
// .understand-anything/diff-overlay.json(실측 채널 — Diff 토글) + REVIEW_ANALYZED 감사.
// --sr이면 사전 예측(.spec/impact/<ID>/impact.json)과 대조 + 리뷰 보관.
import { join } from "node:path";
import { ensureBuilt } from "./ensure-built.mjs";
import { installEpipeGuard, parseArgv, assertOptionalHandle, basename } from "./cli-utils.mjs";

installEpipeGuard();

const {
  analyzeImpact, loadImpactInputs, scanDomainMap,
  collectChangedFiles, changesToSeeds, filterChangesToInventory,
  buildReviewComparison, buildReviewChecklist, publishReviewChecklist, publishReviewOverlay,
  archiveReviewRun, assertSrId, srImpactDir,
  REVIEW_REPORT_FILENAME, REVIEW_VERIFY_FILENAME,
  ImpactInputMissingError, ReviewGitError, ImpactResultSchema, logEvent,
} = await import(await ensureBuilt());

const SUBS = ["analyze"];

const { root, rest, flag, spec } = parseArgv(SUBS);
const sub = rest[0] && !rest[0].startsWith("-") ? rest[0] : "analyze";

try {
  if (sub !== "analyze") {
    console.error(`unknown subcommand: ${sub} (${SUBS.join("|")})`);
    process.exit(2);
  }
  const by = flag("--by");
  const srId = flag("--sr");
  assertOptionalHandle(by, "analyze [--base <ref>] [--sr <SR-ID>] --by <handle>");
  if (rest.includes("--sr") && srId === undefined) {
    throw new Error("usage: analyze [--base <ref>] --sr <SR-ID> (--sr 값 누락)");
  }
  if (srId !== undefined) assertSrId(srId);
  let base = flag("--base");
  if (rest.includes("--base") && base === undefined) {
    throw new Error("usage: analyze --base <ref> (--base 값 누락)");
  }

  // 1) 직전 map 산출물 — base 기본값 + 삭제 필터용 이전 인벤토리 (재스캔 전에 읽는다)
  const prev = await loadImpactInputs(root).catch((e) => {
    if (e instanceof ImpactInputMissingError) return null;
    throw e;
  });
  if (base === undefined) {
    if (!prev) {
      console.error("census.json 없음 — 먼저 /understand-map scan을 실행하거나 --base <ref>를 명시하세요.");
      process.exit(2);
    }
    base = prev.gitCommit ?? undefined;
    if (base === undefined) {
      console.error("base를 정할 수 없습니다 — map 산출물에 gitCommit이 없습니다(비-git 스캔). --base <ref>를 명시하세요.");
      process.exit(2);
    }
  }

  // 2) 실제 변경 수집 (git diff -z + untracked — 미커밋·신규 파일 포함)
  const rawChanges = await collectChangedFiles(root, base);

  // 3) map 재스캔 — 현재 코드 기준 간선/인벤토리 (confirm 게이트 무관)
  const fresh = await scanDomainMap(root);

  // 3b) census 인벤토리로 한정 — 자체 산출물(.spec/.understand-anything/생성
  // docs)·숨김 디렉터리가 untracked로 빨려 들어와 대조를 오염시키는 것 차단
  const inventory = new Set(fresh.census.files.map((f) => f.relPath));
  const priorInventory = prev ? new Set(prev.census.files.map((f) => f.relPath)) : undefined;
  const { changes, excludedChanged, excludedDeleted } = filterChangesToInventory(
    rawChanges, inventory, priorInventory,
  );
  if (excludedChanged.length > 0) {
    console.log(`분석 인벤토리 밖 변경 ${excludedChanged.length}건 제외 (자체 산출물·숨김 디렉터리 등)`);
  }
  if (changes.changed.length === 0 && changes.deleted.length === 0) {
    // 조기 종료도 감사에 남긴다 — "안 돌렸다"와 "돌렸더니 0건"은 다른 사실 (리뷰 minor)
    await logEvent(spec, "REVIEW_ANALYZED", {
      by,
      detail: { base, changed: 0, deleted: 0, excluded: excludedChanged.length, noChanges: true },
    });
    console.log(`변경 없음 — base ${base} 대비 분석 대상 변경이 없습니다.`);
    process.exit(0);
  }

  // 4) 변경 파일 → 시드 → 도달성 (예측 산출물 impact.json은 보존)
  const seeds = changesToSeeds(changes);
  if (seeds.length === 0) {
    await logEvent(spec, "REVIEW_ANALYZED", {
      by,
      detail: { base, changed: 0, deleted: changes.deleted.length, deletionsOnly: true },
    });
    console.log(`변경이 삭제 ${changes.deleted.length}건뿐입니다 — 도달성 시드가 없어 분석을 생략합니다.`);
    console.log("삭제 파일의 호출처 잔존 여부는 수동 확인하세요: " + changes.deleted.join(", "));
    process.exit(0);
  }
  const { result, verify, impactPath, verifyPath, inputs } = await analyzeImpact(
    root, seeds, undefined,
    { reportFilename: REVIEW_REPORT_FILENAME, verifyFilename: REVIEW_VERIFY_FILENAME },
  );

  // 5) 예측 대조 (--sr, 보관본 있을 때만)
  let comparison = null;
  if (srId !== undefined) {
    const { readFile } = await import("node:fs/promises");
    const predPath = join(srImpactDir(root, srId), "impact.json");
    const raw = await readFile(predPath, "utf-8").catch(() => null);
    if (raw !== null) {
      try {
        const prediction = ImpactResultSchema.parse(JSON.parse(raw));
        comparison = buildReviewComparison(
          srId, prediction, changes.changed.map((c) => c.relPath), changes.deleted,
        );
      } catch {
        console.warn(`주의: SR ${srId}의 예측 보관본 파싱 실패 — 대조 생략.`);
      }
    } else {
      console.warn(`주의: SR ${srId}의 사전 예측 보관본 없음(.spec/impact/${srId}/impact.json) — 대조 생략.`);
    }
  }

  // 6) 체크리스트 발행 + (--sr) 보관 + 실측 오버레이
  const doc = buildReviewChecklist(result, verify, {
    changes,
    comparison,
    aggregate: { census: inputs.census.files, confirmed: inputs.confirmed, ownership: inputs.slices.ownership },
    excludedChanged: excludedChanged.length,
  });
  let docPath = null, docError = null;
  try { docPath = await publishReviewChecklist(root, doc); }
  catch (e) { docError = e.message; }
  let archiveDir = null, archiveError = null;
  if (srId !== undefined) {
    try { archiveDir = await archiveReviewRun(root, srId, { result, verify, doc }); }
    catch (e) { archiveError = e.message; }
  }
  let overlay = null, overlayError = null;
  try { overlay = await publishReviewOverlay(root, result, base); }
  catch (e) { overlayError = e.message; }

  await logEvent(spec, "REVIEW_ANALYZED", {
    by,
    detail: {
      base,
      changed: changes.changed.length,
      deleted: changes.deleted.length,
      excluded: excludedChanged.length + excludedDeleted.length,
      ...(srId !== undefined ? { srId } : {}),
      ...(comparison ? {
        unpredictedChanges: comparison.unpredictedChanges.length,
        predictedSeedsNotChanged: comparison.predictedSeedsNotChanged.length,
        predictedSeedsDeleted: comparison.predictedSeedsDeleted.length,
      } : {}),
      ...(docError ? { docError } : {}),
      ...(archiveError ? { archiveError } : {}),
      ...(overlayError ? { overlayError } : {}),
      upstreamFiles: result.upstream.files.length,
      api: result.upstream.api.length,
      mappers: result.upstream.persistence.mappers.length,
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

  // 7) 요약
  const u = result.upstream;
  console.log(`\n변경 리뷰 — base ${base} 대비 변경 ${changes.changed.length}건${changes.deleted.length ? ` · 삭제 ${changes.deleted.length}건` : ""}: ${changes.changed.map((c) => basename(c.relPath)).join(", ")}`);
  console.log(`상류(영향받는 호출자) ${u.files.length}파일 · 하류 ${result.downstream.files.length}파일 · API ${u.api.length} · 매퍼 ${u.persistence.mappers.length}`);
  if (comparison) {
    console.log(`예측 대조(SR ${comparison.srId}): 예측 밖 변경 ${comparison.unpredictedChanges.length}건 · 예측 시드 미변경 ${comparison.predictedSeedsNotChanged.length}건${comparison.predictedSeedsDeleted.length ? ` · 시드 삭제 ${comparison.predictedSeedsDeleted.length}건` : ""}`);
  }
  console.log(`근거율 ${verify.overall.groundedPct}% (GROUNDED ${verify.overall.itemGrounded}/${verify.overall.itemTotal})`);
  console.log(`\nreview: ${impactPath}`);
  console.log(`verify: ${verifyPath}`);
  if (docPath) console.log(`체크리스트: ${docPath} (읽기전용 — 검토·승인 상태기계 밖)`);
  if (docError) console.error(`체크리스트 발행 실패: ${docError} (review.json은 발행됨, 감사에 docError 기록)`);
  if (archiveDir) console.log(`SR 보관: ${archiveDir} (예측·실측 나란히 — status --list에 [리뷰 있음])`);
  if (archiveError) console.error(`SR 보관 실패: ${archiveError} (감사에 archiveError 기록)`);
  if (overlay) {
    console.log(`대시보드 Diff 오버레이(실측): ${overlay.path} (변경 ${overlay.overlay.changedNodeIds.length} · 영향 ${overlay.overlay.affectedNodeIds.length}${overlay.overlay.ktdsImpact.unresolved.length ? ` · KG 미조인 ${overlay.overlay.ktdsImpact.unresolved.length}` : ""})`);
    if (overlay.backedUp) console.warn("  주의: 기존 diff-overlay.json(다른 출처)을 .bak으로 보존하고 덮어썼습니다.");
    console.log("  /understand-dashboard 실행 → Diff 토글(d 키): 적색=변경됨 · 호박색=영향받음.");
  } else if (overlayError) {
    console.error(`대시보드 오버레이 실패: ${overlayError} (감사에 overlayError 기록)`);
  } else {
    console.log("대시보드 오버레이: 생략 (.understand-anything/knowledge-graph.json 없음/손상)");
  }
  if (docError || archiveError || overlayError) process.exit(1);
} catch (err) {
  if (err instanceof ImpactInputMissingError || err instanceof ReviewGitError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
