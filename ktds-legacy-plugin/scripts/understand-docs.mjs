#!/usr/bin/env node
// /understand-docs — 근거 기반 5종 문서 생성 + 검토/승인/감사.
//   생성:   node understand-docs.mjs <projectRoot> [runId]
//   검토:   node understand-docs.mjs <projectRoot> review --list
//           node understand-docs.mjs <projectRoot> review --doc <file>
//   승인:   node understand-docs.mjs <projectRoot> approve --doc <file> --by <handle>
//   반려:   node understand-docs.mjs <projectRoot> return  --doc <file>
//   감사:   node understand-docs.mjs <projectRoot> audit --list | audit --date <YYYY-MM-DD>
//
// 결정론 skeleton만 생성. 실제 LLM 산문은 host CLI(Claude)가 SKILL.md 지시로 채운다.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  runDocsPipeline, listDrafts, startReview, approveDoc, returnDoc,
  readAudit, getDocState, loadApprovals,
} from "../packages/legacy-core/dist/index.js";

const SUBS = ["review", "approve", "return", "audit"];
const argv = process.argv.slice(2);
const root = argv[0] && !argv[0].startsWith("-") && !SUBS.includes(argv[0]) ? argv[0] : process.cwd();
const rest = argv[0] === root ? argv.slice(1) : argv;
const sub = rest[0];
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const has = (n) => rest.includes(n);
const spec = join(root, ".spec");
const docDir = join(root, "docs");

async function tagCounts(doc) {
  const md = await readFile(join(docDir, doc), "utf-8").catch(() => "");
  return {
    inferred: (md.match(/\[추정\]/g) || []).length,
    review: (md.match(/\[확인 필요\]/g) || []).length,
  };
}

try {
  if (sub === "review" && has("--list")) {
    const drafts = await listDrafts(spec);
    console.log(`DRAFT 문서 ${drafts.length}건:`);
    for (const d of drafts) {
      const t = await tagCounts(d.doc);
      console.log(`  - ${d.doc}   [추정] ${t.inferred} · [확인 필요] ${t.review}`);
    }
  } else if (sub === "review" && flag("--doc")) {
    const doc = flag("--doc");
    await startReview(spec, doc);
    const t = await tagCounts(doc);
    console.log(`검토 시작: ${doc} → ${await getDocState(spec, doc)}`);
    console.log(`  확정 검토 대상: [추정] ${t.inferred}건, [확인 필요] ${t.review}건 (담당자 확정 후 approve)`);
  } else if (sub === "approve") {
    const doc = flag("--doc"), by = flag("--by");
    if (!doc || !by) throw new Error("usage: approve --doc <file> --by <handle>");
    const rec = await approveDoc(spec, doc, by);
    console.log(`승인 완료: ${doc} → ${await getDocState(spec, doc)} (by ${rec.by}, ${rec.at})`);
  } else if (sub === "return") {
    const doc = flag("--doc");
    if (!doc) throw new Error("usage: return --doc <file>");
    await returnDoc(spec, doc);
    console.log(`반려: ${doc} → ${await getDocState(spec, doc)}`);
  } else if (sub === "audit") {
    const date = flag("--date");
    const events = await readAudit(spec, date ? { date } : {});
    console.log(`감사 로그 ${events.length}건${date ? ` (${date})` : ""}:`);
    for (const e of events) {
      console.log(`  ${e.ts}  ${e.type}${e.doc ? " · " + e.doc : ""}${e.by ? " · by " + e.by : ""}`);
    }
  } else {
    const runId = rest[0] && !rest[0].startsWith("-") ? rest[0] : `run-${Date.now()}`;
    const res = await runDocsPipeline(root, { runId });
    console.log(`DRAFT 생성: ${res.published.join(", ")}`);
    console.log(`→ ${res.docsDir} · 검토: understand-docs.mjs ${root} review --list`);
  }
} catch (err) {
  console.error(`오류: ${err.message}`);
  process.exitCode = 1;
}
