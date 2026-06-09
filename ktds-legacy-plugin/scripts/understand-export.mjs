#!/usr/bin/env node
// /understand-export 엔진 진입점 — 5종 문서 → 독립 실행 단일 HTML (CDN 없음).
// 사용: node understand-export.mjs [projectRoot] [outFile]
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureBuilt } from "./ensure-built.mjs";

const { readKnowledgeGraph, generateDocs, exportHtml } = await import(await ensureBuilt());

const root = process.argv[2] ?? process.cwd();
const out = process.argv[3] ?? join(root, "docs", "index.html");

const graph = await readKnowledgeGraph(join(root, ".understand-anything", "knowledge-graph.json"));
const docs = await generateDocs(graph);
await writeFile(out, exportHtml(docs, { title: "Legacy 문서" }), "utf-8");
console.log(`HTML export: ${out} (외부 CDN/리소스 없음, 폐쇄망 배포 가능)`);
