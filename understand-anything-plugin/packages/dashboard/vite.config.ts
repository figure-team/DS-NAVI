/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  ClaudeJobTracker,
  headlessDirective,
  runClaudeSkill,
  type ClaudeJobBase,
} from "./server/claude-headless";

// Generate a one-time token when the server process starts.
// This token is printed to the terminal and must be in the URL
// to fetch knowledge-graph.json or diff-overlay.json.
const ACCESS_TOKEN = process.env.UNDERSTAND_ACCESS_TOKEN || crypto.randomBytes(16).toString("hex");
const MAX_SOURCE_FILE_BYTES = 1024 * 1024;

function graphFileCandidates(fileName: string): string[] {
  const graphDir = process.env.GRAPH_DIR;
  return [
    ...(graphDir
      ? [path.resolve(graphDir, `.understand-anything/${fileName}`)]
      : []),
    path.resolve(process.cwd(), `.understand-anything/${fileName}`),
    path.resolve(process.cwd(), `../../../.understand-anything/${fileName}`),
  ];
}

function findGraphFile(fileName: string): string | null {
  return graphFileCandidates(fileName).find((candidate) => fs.existsSync(candidate)) ?? null;
}

// 신설 메뉴(데이터·변경영향·프로그램·품질·보고서·정책서)의 엔진 산출은 `.spec/map/` 에 산다
// (ktds-legacy-plugin understand-map/impact/report/policy 계열이 기록). graphFileCandidates 와
// 같은 우선순위(GRAPH_DIR → cwd → 모노레포 루트)로 해석한다.
function specMapFileCandidates(fileName: string): string[] {
  const graphDir = process.env.GRAPH_DIR;
  return [
    ...(graphDir ? [path.resolve(graphDir, `.spec/map/${fileName}`)] : []),
    path.resolve(process.cwd(), `.spec/map/${fileName}`),
    path.resolve(process.cwd(), `../../../.spec/map/${fileName}`),
  ];
}

function findSpecMapFile(fileName: string): string | null {
  return specMapFileCandidates(fileName).find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** `.spec/map/` 읽기 전용 서빙 대상 — pathname(=파일명) 화이트리스트. */
const SPEC_MAP_ENDPOINTS = new Set([
  "/db-schema.json",
  "/crud-matrix.json",
  "/program-inventory.json",
  "/interfaces.json",
  "/batch-jobs.json",
  "/risk-report.json",
  "/coverage.json",
  "/work-summary.json",
  "/impact.json",
  "/policy-signals.json",
  "/policy-reconcile.json",
]);

function projectRootFromGraphFile(candidate: string): string {
  return path.dirname(path.dirname(candidate));
}

function normalizeGraphPath(filePath: string, projectRoot: string): string | null {
  const rawPath = path.isAbsolute(filePath)
    ? filePath.startsWith(projectRoot)
      ? path.relative(projectRoot, filePath)
      : null
    : filePath;
  if (rawPath === null) return null;
  const normalized = path.normalize(rawPath);
  if (
    !normalized ||
    normalized === "." ||
    normalized.includes("\0") ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized.split(path.sep).join("/");
}

function graphFilePathSet(graphFile: string, projectRoot: string): Set<string> {
  const allowed = new Set<string>();
  try {
    const raw = JSON.parse(fs.readFileSync(graphFile, "utf-8")) as {
      nodes?: Array<Record<string, unknown>>;
    };
    for (const node of raw.nodes ?? []) {
      if (typeof node.filePath !== "string") continue;
      const normalized = normalizeGraphPath(node.filePath, projectRoot);
      if (normalized) allowed.add(normalized);
    }
  } catch {
    return allowed;
  }
  return allowed;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const byExt: Record<string, string> = {
    bash: "bash",
    c: "c",
    cc: "cpp",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    go: "go",
    h: "c",
    hpp: "cpp",
    html: "markup",
    java: "java",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    ts: "typescript",
    tsx: "tsx",
    txt: "text",
    yaml: "yaml",
    yml: "yaml",
  };
  return byExt[ext] ?? "text";
}

function sendJson(res: import("http").ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function rejectFileRequest(message: string, statusCode = 400) {
  return { statusCode, payload: { error: message } };
}

function readSourceFile(url: URL) {
  const requestedPath = url.searchParams.get("path") ?? "";
  if (!requestedPath) return rejectFileRequest("Missing path");
  if (requestedPath.includes("\0")) return rejectFileRequest("Invalid path");
  if (path.isAbsolute(requestedPath)) return rejectFileRequest("Absolute paths are not allowed");

  const normalizedPath = path.normalize(requestedPath);
  if (
    normalizedPath === "." ||
    normalizedPath.startsWith(`..${path.sep}`) ||
    normalizedPath === ".." ||
    path.isAbsolute(normalizedPath)
  ) {
    return rejectFileRequest("Path must stay inside the project");
  }

  const graphFile = findGraphFile("knowledge-graph.json");
  if (!graphFile) {
    return rejectFileRequest("No knowledge graph found. Run /understand first.", 404);
  }

  const projectRoot = projectRootFromGraphFile(graphFile);
  const absoluteFile = path.resolve(projectRoot, normalizedPath);
  const relativeToRoot = path.relative(projectRoot, absoluteFile);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    relativeToRoot === ".." ||
    path.isAbsolute(relativeToRoot)
  ) {
    return rejectFileRequest("Path must stay inside the project");
  }
  const safeRelativePath = relativeToRoot.split(path.sep).join("/");
  if (!graphFilePathSet(graphFile, projectRoot).has(safeRelativePath)) {
    return rejectFileRequest("File is not in the knowledge graph", 404);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absoluteFile);
  } catch {
    return rejectFileRequest("File not found", 404);
  }

  if (!stat.isFile()) return rejectFileRequest("Path is not a file");
  if (stat.size > MAX_SOURCE_FILE_BYTES) {
    return rejectFileRequest("File is too large to preview", 413);
  }

  const buffer = fs.readFileSync(absoluteFile);
  if (buffer.includes(0)) return rejectFileRequest("Binary files cannot be previewed", 415);

  const content = buffer.toString("utf8");
  return {
    statusCode: 200,
    payload: {
      path: safeRelativePath,
      language: detectLanguage(relativeToRoot),
      content,
      sizeBytes: buffer.byteLength,
      lineCount: content.length === 0 ? 0 : content.split(/\r\n|\n|\r/).length,
    },
  };
}

// ── P3: 노드 오버레이(사용자 편집/확정) — 서버 저장 ───────────────────────────
const MAX_OVERRIDE_BODY_BYTES = 256 * 1024;

/**
 * 편집 허용 필드 화이트리스트 — **의미 주장만**(summary, detail:<sectionId>). 결정론
 * 사실(메서드/호출/파일:라인/계층)은 코드 추출이라 편집 거부(재스캔 시 재생성).
 */
function isEditableClaimKey(key: string): boolean {
  return key === "summary" || /^detail:[A-Za-z0-9_-]+$/.test(key);
}

/**
 * node-overrides.json 절대 경로 — domain-graph.json 과 동일 `.understand-anything/`
 * (영속 출력 디렉터리, 재스캔 생존). 프로젝트(=domain-graph) 미발견이면 null.
 */
function nodeOverridesFilePath(): string | null {
  const graphFile = findGraphFile("domain-graph.json");
  if (!graphFile) return null;
  return path.join(path.dirname(graphFile), "node-overrides.json");
}

/** 현재 domain-graph.json 의 노드 id 집합 — POST 시 nodeId 실존 검증용. */
function domainGraphNodeIds(): Set<string> {
  const ids = new Set<string>();
  const graphFile = findGraphFile("domain-graph.json");
  if (!graphFile) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(graphFile, "utf-8")) as { nodes?: Array<{ id?: unknown }> };
    for (const n of raw.nodes ?? []) if (typeof n.id === "string") ids.add(n.id);
  } catch {
    // 파싱 실패 → 빈 집합(검증에서 모든 nodeId 차단).
  }
  return ids;
}

/** node-overrides.json 읽기 — 없거나 손상이면 {} (조용한 빈 처리는 읽기에서만 허용). */
function readNodeOverrides(file: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** POST 바디를 크기 상한 안에서 수집. 초과 시 reject('too-large'). */
function collectRequestBody(
  req: import("http").IncomingMessage,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * POST /node-overrides — { nodeId, editedClaims, approver } 를 검증 후 병합 기록.
 * 검증: nodeId 실존 · editedClaims 키 화이트리스트(의미 주장) + 값 문자열 · approver 비어있지 않음.
 * 레코드 존재 = 그 노드 확정(approver). audit append-only. 응답 = 갱신된 레코드.
 */
function handleOverridePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = nodeOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-map first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let parsed: { nodeId?: unknown; editedClaims?: unknown; approver?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { nodeId, editedClaims, approver } = parsed ?? {};
      if (typeof nodeId !== "string" || !nodeId) {
        sendJson(res, 400, { error: "nodeId is required" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (!editedClaims || typeof editedClaims !== "object" || Array.isArray(editedClaims)) {
        sendJson(res, 400, { error: "editedClaims object is required" });
        return;
      }
      if (!domainGraphNodeIds().has(nodeId)) {
        sendJson(res, 400, { error: "nodeId is not in the domain graph" });
        return;
      }
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(editedClaims as Record<string, unknown>)) {
        if (!isEditableClaimKey(k)) {
          sendJson(res, 400, { error: `field is not editable (deterministic fact): ${k}` });
          return;
        }
        if (typeof v !== "string") {
          sendJson(res, 400, { error: `editedClaims[${k}] must be a string` });
          return;
        }
        clean[k] = v;
      }
      if (Object.keys(clean).length === 0) {
        sendJson(res, 400, { error: "no editable fields provided" });
        return;
      }
      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readNodeOverrides(file);
      const prev = (store[nodeId] as { audit?: unknown } | undefined) ?? {};
      const audit = Array.isArray(prev.audit) ? prev.audit : [];
      const record = {
        editedClaims: clean,
        approver: by,
        at: now,
        audit: [...audit, { event: "CONFIRMED", by, at: now }],
      };
      store[nodeId] = record;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write node-overrides:", err);
        sendJson(res, 500, { error: "Failed to write overrides" });
        return;
      }
      sendJson(res, 200, record);
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── D3: 산출물 문서(.md) 편집/확정 — node-overrides 와 동형(편집=즉시 확정). ──────────
const MAX_DOC_BODY_BYTES = 4 * 1024 * 1024; // 문서는 claim 보다 큼.

/** 생성 문서 디렉터리(.understand-anything/doc-output). 프로젝트 미발견이면 null. */
function docOutputDir(): string | null {
  const graphFile = findGraphFile("domain-graph.json");
  return graphFile ? path.join(path.dirname(graphFile), "doc-output") : null;
}
/** 문서 편집 오버레이 경로(.understand-anything/doc-overrides.json). */
function docOverridesFilePath(): string | null {
  const graphFile = findGraphFile("domain-graph.json");
  return graphFile ? path.join(path.dirname(graphFile), "doc-overrides.json") : null;
}
type DocOverride = { content: string; approver: string; at: string; audit?: unknown[] };
/** doc-overrides.json 읽기 — 없거나 손상이면 {}. */
function readDocOverrides(): Record<string, DocOverride> {
  const file = docOverridesFilePath();
  if (!file || !fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, DocOverride>) : {};
  } catch {
    return {};
  }
}
/** doc-output 의 docId 목록(.md 제외, 정렬) — POST docId 실존 검증 + 경로 traversal 방지. */
function docOutputIds(): string[] {
  const dir = docOutputDir();
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .sort();
  } catch {
    return [];
  }
}
/** frontmatter 의 title(없으면 docId). */
function docTitle(content: string, docId: string): string {
  const m = /\ntitle:\s*(.+?)\s*\n/.exec(content.slice(0, 400));
  return m ? m[1].trim() : docId;
}
/** frontmatter 의 methodology(없으면 빈 문자열) — 사이드바 폴더 그룹핑용. */
function docMethodology(content: string): string {
  const m = /\nmethodology:\s*(.+?)\s*\n/.exec(content.slice(0, 400));
  return m ? m[1].trim() : "";
}
/** 문서 본문 — 편집 오버레이 우선, 없으면 생성물. 실패 시 null. */
function readDocContent(docId: string): string | null {
  const ov = readDocOverrides()[docId];
  if (ov && typeof ov.content === "string") return ov.content;
  const dir = docOutputDir();
  if (!dir) return null;
  try {
    return fs.readFileSync(path.join(dir, `${docId}.md`), "utf-8");
  } catch {
    return null;
  }
}

/**
 * POST /doc — { docId, content, approver } 저장. 검증: docId 실존(doc-output) · content 문자열 ·
 * approver 비어있지 않음. 레코드 존재 = 그 문서 확정(approver). audit append-only. 생성물 불변,
 * 편집은 doc-overrides.json 오버레이(재생성 생존). 응답 = 메타(content 제외).
 */
function handleDocPost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = docOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-docs first." });
    return;
  }
  collectRequestBody(req, MAX_DOC_BODY_BYTES)
    .then((body) => {
      let parsed: { docId?: unknown; content?: unknown; approver?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { docId, content, approver } = parsed ?? {};
      if (typeof docId !== "string" || !docId) {
        sendJson(res, 400, { error: "docId is required" });
        return;
      }
      if (typeof content !== "string") {
        sendJson(res, 400, { error: "content (string) is required" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (!docOutputIds().includes(docId)) {
        sendJson(res, 400, { error: "docId is not a generated document" });
        return;
      }
      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readDocOverrides();
      const prev = store[docId];
      const audit = Array.isArray(prev?.audit) ? prev!.audit : [];
      const record: DocOverride = {
        content,
        approver: by,
        at: now,
        audit: [...audit, { event: "CONFIRMED", by, at: now }],
      };
      store[docId] = record;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write doc-overrides:", err);
        sendJson(res, 500, { error: "Failed to write doc overrides" });
        return;
      }
      // content 는 응답에서 제외(클라이언트가 이미 보유) — 메타만.
      sendJson(res, 200, { docId, approver: by, at: now, confirmed: true });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── R3: RTM 행 오버레이(사용자 편집/확정) — node-overrides 와 동형(편집=즉시 확정). ──
/** rtm-overrides.json 경로(.understand-anything/, rtm.json 형제, 재생성 생존). */
function rtmOverridesFilePath(): string | null {
  const graphFile = findGraphFile("domain-graph.json");
  return graphFile ? path.join(path.dirname(graphFile), "rtm-overrides.json") : null;
}
/** rtm.json 의 기능 id 집합 — POST fnId 실존 검증용(없으면 빈 집합 = 전부 차단). */
function rtmFunctionIds(): Set<string> {
  const ids = new Set<string>();
  const file = findGraphFile("rtm.json");
  if (!file) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { functions?: Array<{ id?: unknown }> };
    for (const f of raw.functions ?? []) if (typeof f.id === "string") ids.add(f.id);
  } catch {
    /* 파싱 실패 → 빈 집합 */
  }
  return ids;
}
/**
 * 편집 허용 셀 화이트리스트 — 사람이 교정/확정하는 표시 셀(name + 4 추적축) +
 * R7 사용자 정의 필드 값(`custom:<slug>`). 스키마 키(id/featureId/origin/confidence 등
 * 결정론 사실)은 편집 거부.
 */
function isEditableRtmCell(key: string): boolean {
  if (/^custom:[a-z0-9-]{1,40}$/.test(key)) return true;
  return key === "name" || key === "entryPoint" || key === "implementation" || key === "data" || key === "test";
}
type RtmOverride = { editedCells: Record<string, string>; approver: string; at: string; audit?: unknown[] };
/** rtm-overrides.json 읽기 — 없거나 손상이면 {}. */
function readRtmOverrides(): Record<string, RtmOverride> {
  const file = rtmOverridesFilePath();
  if (!file || !fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, RtmOverride>) : {};
  } catch {
    return {};
  }
}
/**
 * POST /rtm-override — { fnId, editedCells, approver } 검증 후 병합 기록.
 * 검증: fnId 실존(rtm.json) · editedCells 키 화이트리스트 + 값 문자열 · approver 비어있지 않음.
 * 레코드 존재 = 그 기능 행 확정(approver). audit append-only. 생성물(rtm.json) 불변.
 */
function handleRtmOverridePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = rtmOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-rtm first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let parsed: { fnId?: unknown; editedCells?: unknown; approver?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { fnId, editedCells, approver } = parsed ?? {};
      if (typeof fnId !== "string" || !fnId) {
        sendJson(res, 400, { error: "fnId is required" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (!editedCells || typeof editedCells !== "object" || Array.isArray(editedCells)) {
        sendJson(res, 400, { error: "editedCells object is required" });
        return;
      }
      if (!rtmFunctionIds().has(fnId)) {
        sendJson(res, 400, { error: "fnId is not in rtm.json" });
        return;
      }
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(editedCells as Record<string, unknown>)) {
        if (!isEditableRtmCell(k)) {
          sendJson(res, 400, { error: `cell is not editable: ${k}` });
          return;
        }
        if (typeof v !== "string") {
          sendJson(res, 400, { error: `editedCells[${k}] must be a string` });
          return;
        }
        clean[k] = v;
      }
      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readRtmOverrides();
      const prev = store[fnId];
      const audit = Array.isArray(prev?.audit) ? prev!.audit : [];
      const record: RtmOverride = {
        editedCells: clean,
        approver: by,
        at: now,
        audit: [...audit, { event: "CONFIRMED", by, at: now }],
      };
      store[fnId] = record;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write rtm-overrides:", err);
        sendJson(res, 500, { error: "Failed to write rtm overrides" });
        return;
      }
      sendJson(res, 200, { fnId, ...record });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── W5: RTM 테스트 시나리오 오버레이(_scenarios) — rtm-override 와 동형. ──
/** rtm.json 의 시나리오 id 집합 — POST tsId 실존 검증용(없으면 빈 집합 = 전부 차단). */
function rtmScenarioIds(): Set<string> {
  const ids = new Set<string>();
  const file = findGraphFile("rtm.json");
  if (!file) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { testScenarios?: Array<{ id?: unknown }> };
    for (const s of raw.testScenarios ?? []) if (typeof s.id === "string") ids.add(s.id);
  } catch {
    /* 파싱 실패 → 빈 집합 */
  }
  return ids;
}
/** 시나리오 편집 허용 셀 — 제목 + Given/When/Then(추적선 id·kind 는 결정론 사실이라 거부). */
function isEditableScenarioCell(key: string): boolean {
  return key === "title" || key === "given" || key === "when" || key === "then";
}
/**
 * POST /rtm-scenario-override — { tsId, editedCells, approver } 검증 후 `_scenarios` 병합 기록.
 * 레코드 존재 = 그 시나리오 확정(applyOverlay 가 CONFIRMED 승격). audit append-only.
 */
function handleRtmScenarioOverridePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = rtmOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-rtm first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let parsed: { tsId?: unknown; editedCells?: unknown; approver?: unknown; edited?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { tsId, editedCells, approver, edited } = parsed ?? {};
      if (typeof tsId !== "string" || !tsId) {
        sendJson(res, 400, { error: "tsId is required" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (!editedCells || typeof editedCells !== "object" || Array.isArray(editedCells)) {
        sendJson(res, 400, { error: "editedCells object is required" });
        return;
      }
      if (!rtmScenarioIds().has(tsId)) {
        sendJson(res, 400, { error: "tsId is not in rtm.json" });
        return;
      }
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(editedCells as Record<string, unknown>)) {
        if (!isEditableScenarioCell(k)) {
          sendJson(res, 400, { error: `cell is not editable: ${k}` });
          return;
        }
        if (typeof v !== "string") {
          sendJson(res, 400, { error: `editedCells[${k}] must be a string` });
          return;
        }
        clean[k] = v;
      }
      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readRtmOverrides() as Record<string, unknown> & { _scenarios?: Record<string, RtmOverride> };
      const section: Record<string, RtmOverride> =
        store._scenarios && typeof store._scenarios === "object" && !Array.isArray(store._scenarios)
          ? store._scenarios
          : {};
      const prev = section[tsId];
      const audit = Array.isArray(prev?.audit) ? prev!.audit : [];
      // 무편집 검토 승인과 편집 확정을 audit 로 구분(리뷰 C3 — 일괄 rubber-stamp 추적 가능).
      const event = edited === false ? "CONFIRMED_NO_EDIT" : "CONFIRMED";
      const record: RtmOverride = {
        editedCells: clean,
        approver: by,
        at: now,
        audit: [...audit, { event, by, at: now }],
      };
      section[tsId] = record;
      store._scenarios = section;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write rtm-overrides:", err);
        sendJson(res, 500, { error: "Failed to write rtm overrides" });
        return;
      }
      sendJson(res, 200, { tsId, ...record });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── R7: RTM 사용자 정의 필드(_fields) — 정의 추가/삭제(값은 기능 오버레이 custom:* 키). ──
/**
 * POST /rtm-field — { op: "add"|"remove", id: "custom:<slug>", label?, approver } 검증 후
 * `_fields` 기록. 삭제는 정의만 제거(행 값 비파괴 보존 — 재등록 시 복원, §5.1).
 */
function handleRtmFieldPost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = rtmOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-rtm first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let parsed: { op?: unknown; id?: unknown; label?: unknown; approver?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { op, id, label, approver } = parsed ?? {};
      if (op !== "add" && op !== "remove") {
        sendJson(res, 400, { error: 'op must be "add" or "remove"' });
        return;
      }
      if (typeof id !== "string" || !/^custom:[a-z0-9-]{1,40}$/.test(id)) {
        sendJson(res, 400, { error: "id must match custom:<slug> (a-z0-9-)" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (op === "add" && (typeof label !== "string" || !label.trim())) {
        sendJson(res, 400, { error: "label is required for add" });
        return;
      }
      const store = readRtmOverrides() as Record<string, unknown> & {
        _fields?: Record<string, { label: string; createdBy: string; at: string }>;
      };
      const fields =
        store._fields && typeof store._fields === "object" && !Array.isArray(store._fields)
          ? store._fields
          : {};
      if (op === "add") {
        fields[id] = { label: (label as string).trim(), createdBy: approver.trim(), at: new Date().toISOString() };
      } else {
        delete fields[id];
      }
      store._fields = fields;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write rtm-overrides:", err);
        sendJson(res, 500, { error: "Failed to write rtm overrides" });
        return;
      }
      sendJson(res, 200, { _fields: fields });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── S4: 화면설계서 — 오버레이(rtm-overrides 동형) + 캡처 PNG 스트리밍. ──
/** screens.json 경로(.understand-anything/). */
function screensFilePath(): string | null {
  return findGraphFile("screens.json");
}
/** screen-overrides.json 경로 — screens.json 형제(재생성 생존). */
function screenOverridesFilePath(): string | null {
  const f = screensFilePath();
  return f ? path.join(path.dirname(f), "screen-overrides.json") : null;
}
/** screens.json 의 화면 id 집합 — POST screenId 실존 검증용(없으면 빈 집합 = 전부 차단). */
function screenIds(): Set<string> {
  const ids = new Set<string>();
  const file = screensFilePath();
  if (!file) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { screens?: Array<{ id?: unknown }> };
    for (const s of raw.screens ?? []) if (typeof s.id === "string") ids.add(s.id);
  } catch {
    /* 파싱 실패 → 빈 집합 */
  }
  return ids;
}
/** 주석 오버라이드 키(`<kind>:<no>`)와 편집 허용 필드 — 스키마(legacy-core)와 동일 규칙. */
const SCREEN_ANNOTATION_KEY_RE = /^(field|action|link|region):\d+$/;
type ScreenAnnotationOverride = { description?: string; label?: string; note?: string; hidden?: boolean };
type ScreenOverride = {
  approver: string;
  at: string;
  titleOverride?: string;
  annotations?: Record<string, ScreenAnnotationOverride>;
  confirmed: boolean;
  audit: unknown[];
};
/** screen-overrides.json 읽기 — 없거나 손상이면 {}. */
function readScreenOverrides(): Record<string, ScreenOverride> {
  const file = screenOverridesFilePath();
  if (!file || !fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, ScreenOverride>) : {};
  } catch {
    return {};
  }
}
/**
 * POST /screen-override — { screenId, titleOverride?, annotations?, approver } 검증 후 병합 기록.
 * 검증: screenId 실존(screens.json) · annotations 키 `<kind>:<no>` + 필드 화이트리스트
 * (description/label/note 문자열, hidden 불리언) · approver 비어있지 않음.
 * 레코드 존재 = 화면 확정. audit append-only. 생성물(screens.json) 불변.
 */
function handleScreenOverridePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = screenOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No screens.json found. Run /understand-screens first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let parsed: { screenId?: unknown; titleOverride?: unknown; annotations?: unknown; approver?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { screenId, titleOverride, annotations, approver } = parsed ?? {};
      if (typeof screenId !== "string" || !screenId) {
        sendJson(res, 400, { error: "screenId is required" });
        return;
      }
      if (typeof approver !== "string" || !approver.trim()) {
        sendJson(res, 400, { error: "approver is required" });
        return;
      }
      if (!screenIds().has(screenId)) {
        sendJson(res, 400, { error: "screenId is not in screens.json" });
        return;
      }
      if (titleOverride !== undefined && typeof titleOverride !== "string") {
        sendJson(res, 400, { error: "titleOverride must be a string" });
        return;
      }
      const cleanAnn: Record<string, ScreenAnnotationOverride> = {};
      if (annotations !== undefined) {
        if (!annotations || typeof annotations !== "object" || Array.isArray(annotations)) {
          sendJson(res, 400, { error: "annotations must be an object" });
          return;
        }
        for (const [key, value] of Object.entries(annotations as Record<string, unknown>)) {
          if (!SCREEN_ANNOTATION_KEY_RE.test(key)) {
            sendJson(res, 400, { error: `invalid annotation key: ${key}` });
            return;
          }
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            sendJson(res, 400, { error: `annotations[${key}] must be an object` });
            return;
          }
          const v = value as Record<string, unknown>;
          const clean: ScreenAnnotationOverride = {};
          for (const [fk, fv] of Object.entries(v)) {
            if (fk === "hidden") {
              if (typeof fv !== "boolean") {
                sendJson(res, 400, { error: `annotations[${key}].hidden must be a boolean` });
                return;
              }
              clean.hidden = fv;
            } else if (fk === "description" || fk === "label" || fk === "note") {
              if (typeof fv !== "string") {
                sendJson(res, 400, { error: `annotations[${key}].${fk} must be a string` });
                return;
              }
              clean[fk] = fv;
            } else {
              sendJson(res, 400, { error: `annotation field is not editable: ${fk}` });
              return;
            }
          }
          cleanAnn[key] = clean;
        }
      }
      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readScreenOverrides();
      const prev = store[screenId];
      const audit = Array.isArray(prev?.audit) ? prev!.audit : [];
      // 부분 갱신(확정 전용/주석만 편집) 시 미제공 필드는 이전 값을 보존한다
      // — titleOverride/annotations 대칭(확정 버튼은 둘 다 안 보냄).
      const record: ScreenOverride = {
        approver: by,
        at: now,
        ...(typeof titleOverride === "string"
          ? { titleOverride }
          : prev?.titleOverride
            ? { titleOverride: prev.titleOverride }
            : {}),
        ...(annotations !== undefined ? { annotations: cleanAnn } : prev?.annotations ? { annotations: prev.annotations } : {}),
        confirmed: true,
        audit: [...audit, { event: prev ? "EDITED" : "CONFIRMED", by, at: now }],
      };
      store[screenId] = record;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write screen-overrides:", err);
        sendJson(res, 500, { error: "Failed to write screen overrides" });
        return;
      }
      sendJson(res, 200, { screenId, ...record });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}
/** 캡처 PNG 최대 크기 — fullPage 스크린샷 상한. */
const MAX_SCREEN_ASSET_BYTES = 10 * 1024 * 1024;
/**
 * GET /screen-asset?path=screens/<slug>.png — 캡처 PNG 스트리밍(토큰 게이트 뒤).
 * `/file-content.json` 은 바이너리를 거부(415)하므로 이미지 전용 경로가 필요하다.
 * 방어: 파일명 정규식 + resolve 후 screens/ 디렉터리 격리(containment) 재확인.
 */
function handleScreenAssetGet(url: URL, res: import("http").ServerResponse): void {
  const rel = url.searchParams.get("path") ?? "";
  if (!/^screens\/[A-Za-z0-9._-]+\.png$/.test(rel)) {
    sendJson(res, 400, { error: "invalid asset path" });
    return;
  }
  const sf = screensFilePath();
  if (!sf) {
    sendJson(res, 404, { error: "No screens.json found. Run /understand-screens first." });
    return;
  }
  const screensDir = path.resolve(path.dirname(sf), "screens");
  const abs = path.resolve(path.dirname(sf), rel);
  if (abs !== screensDir && !abs.startsWith(screensDir + path.sep)) {
    sendJson(res, 403, { error: "path escapes screens directory" });
    return;
  }
  let stat: import("fs").Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    sendJson(res, 404, { error: "asset not found" });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { error: "asset not found" });
    return;
  }
  if (stat.size > MAX_SCREEN_ASSET_BYTES) {
    sendJson(res, 413, { error: "asset too large" });
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", String(stat.size));
  fs.createReadStream(abs).pipe(res);
}

// ── 검증 스파인 입력: 요구사항 오버레이(lifecycle·고객검수·시험결과) — _requirements 아래 기록.
const RTM_LIFECYCLES = new Set(["RECEIVED", "ANALYZING", "DESIGNING", "DEVELOPING", "TESTING", "DONE", "HOLD", "REJECTED"]);
const RTM_TEST_RESULTS = new Set(["PASS", "FAIL", "NA", "UNTESTED"]);
/** rtm.json 의 요구사항 id 집합 — POST reqId 실존 검증용. */
function rtmRequirementIds(): Set<string> {
  const ids = new Set<string>();
  const file = findGraphFile("rtm.json");
  if (!file) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { requirements?: Array<{ id?: unknown }> };
    for (const r of raw.requirements ?? []) if (typeof r.id === "string") ids.add(r.id);
  } catch {
    /* 빈 집합 */
  }
  return ids;
}
/**
 * POST /rtm-req-override — { reqId, lifecycle?, signoff?, tests?, approver } 검증 후 _requirements 기록.
 * 검증: reqId 실존 · lifecycle 열거 · signoff {approved,...}|null · tests "<acId>::<caseId>"→{result,defectId}.
 * audit append-only. 생성물(rtm.json) 불변 — 오버레이만 갱신(understand-rtm 재실행이 coverage 에 반영).
 */
function handleRtmReqOverridePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  const file = rtmOverridesFilePath();
  if (!file) {
    sendJson(res, 404, { error: "No domain graph found. Run /understand-rtm first." });
    return;
  }
  collectRequestBody(req, MAX_OVERRIDE_BODY_BYTES)
    .then((body) => {
      let p: { reqId?: unknown; lifecycle?: unknown; signoff?: unknown; tests?: unknown; approver?: unknown };
      try {
        p = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { reqId, lifecycle, signoff, tests, approver } = p ?? {};
      if (typeof reqId !== "string" || !reqId) return sendJson(res, 400, { error: "reqId is required" });
      if (typeof approver !== "string" || !approver.trim()) return sendJson(res, 400, { error: "approver is required" });
      if (!rtmRequirementIds().has(reqId)) return sendJson(res, 400, { error: "reqId is not in rtm.json" });

      const rec: { lifecycle?: string; signoff?: unknown; tests?: Record<string, { result: string; defectId: string | null }> } = {};
      if (lifecycle !== undefined) {
        if (typeof lifecycle !== "string" || !RTM_LIFECYCLES.has(lifecycle)) return sendJson(res, 400, { error: `invalid lifecycle: ${String(lifecycle)}` });
        rec.lifecycle = lifecycle;
      }
      if (signoff !== undefined) {
        if (signoff !== null && (typeof signoff !== "object" || typeof (signoff as { approved?: unknown }).approved !== "boolean"))
          return sendJson(res, 400, { error: "signoff must be null or { approved:boolean, by?, at? }" });
        rec.signoff = signoff;
      }
      if (tests !== undefined) {
        if (!tests || typeof tests !== "object" || Array.isArray(tests)) return sendJson(res, 400, { error: "tests must be an object" });
        const clean: Record<string, { result: string; defectId: string | null }> = {};
        for (const [k, v] of Object.entries(tests as Record<string, unknown>)) {
          const result = (v as { result?: unknown })?.result;
          if (typeof result !== "string" || !RTM_TEST_RESULTS.has(result)) return sendJson(res, 400, { error: `tests[${k}].result invalid` });
          const defectId = (v as { defectId?: unknown })?.defectId;
          clean[k] = { result, defectId: typeof defectId === "string" ? defectId : null };
        }
        rec.tests = clean;
      }
      if (rec.lifecycle === undefined && rec.signoff === undefined && rec.tests === undefined)
        return sendJson(res, 400, { error: "nothing to update (lifecycle/signoff/tests)" });

      const now = new Date().toISOString();
      const by = approver.trim();
      const store = readRtmOverrides() as Record<string, unknown> & { _requirements?: Record<string, { lifecycle?: string; signoff?: unknown; tests?: Record<string, unknown>; approver?: string; at?: string; audit?: unknown[] }> };
      const reqs = (store._requirements && typeof store._requirements === "object" ? store._requirements : {}) as Record<string, { lifecycle?: string; signoff?: unknown; tests?: Record<string, unknown>; approver?: string; at?: string; audit?: unknown[] }>;
      const prev = reqs[reqId] ?? {};
      const audit = Array.isArray(prev.audit) ? prev.audit : [];
      const event = rec.tests ? "TEST_RECORDED" : rec.signoff !== undefined ? "SIGNED_OFF" : "LIFECYCLE";
      reqs[reqId] = {
        ...prev,
        ...(rec.lifecycle !== undefined ? { lifecycle: rec.lifecycle } : {}),
        ...(rec.signoff !== undefined ? { signoff: rec.signoff } : {}),
        tests: { ...(prev.tests ?? {}), ...(rec.tests ?? {}) },
        approver: by,
        at: now,
        audit: [...audit, { event, by, at: now }],
      };
      store._requirements = reqs;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write rtm-overrides:", err);
        return sendJson(res, 500, { error: "Failed to write rtm overrides" });
      }
      sendJson(res, 200, { reqId, ...reqs[reqId] });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── ktds: 구조 탭 "영향도 분석" — 자연어 → claude -p "/understand-impact <q>" ─────
// 대시보드 dev server가 분석 대상 프로젝트(GRAPH_DIR)에서 claude 를 헤드리스로 spawn.
// 스킬이 .understand-anything/impact-overlay.json 을 갱신 → 프론트가 재로드해 색칠.
const MAX_IMPACT_QUERY_BYTES = 16 * 1024;

// /understand-impact SKILL.md 는 "✋ 확인 게이트(생략 불가)"로 시드 승인을 사람에게
// 요구한다 → 헤드리스 claude -p 는 후보만 제시하고 멈춰 analyze 를 안 돌리고 overlay 미생성.
// 대시보드 자동 실행 경로에서는 승인을 사전 부여로 간주하고 analyze 까지 완주하도록 지시한다.
const IMPACT_AUTONOMY_DIRECTIVE = headlessDirective(
  "위 요청은 대시보드에서 자동 실행된 헤드리스 작업이다.",
  "(시드 선택 승인은 이미 부여됨), 자연어를 가장 적절한 변경 시드 파일로 직접 매핑·확정한 뒤 " +
    "멈추지 말고 analyze 단계까지 끝까지 실행하여 .understand-anything/impact-overlay.json 을 반드시 생성하라.",
);

type ImpactJob = ClaudeJobBase & { query: string | null };

// 모듈 스코프 단일 job(서버 수명 동안 추적). 동시 실행은 409로 차단.
const impactTracker = new ClaudeJobTracker<{ query: string | null }>({ query: null });

/** 분석 대상 프로젝트 루트 — GRAPH_DIR 우선, 없으면 knowledge-graph.json 위치에서 유도. */
function impactProjectRoot(): string | null {
  if (process.env.GRAPH_DIR) return path.resolve(process.env.GRAPH_DIR);
  const graphFile = findGraphFile("knowledge-graph.json");
  return graphFile ? projectRootFromGraphFile(graphFile) : null;
}

/**
 * POST /impact-analyze — { query } 자연어로 claude -p "/understand-impact <query>" 실행.
 * 즉시 202 + job 반환, 프로세스는 백그라운드 지속(프론트가 /impact-status 폴링).
 */
function handleImpactAnalyzePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  if (impactTracker.running) {
    sendJson(res, 409, {
      error: "An impact analysis is already running",
      job: impactTracker.snapshot(),
    });
    return;
  }
  const projectRoot = impactProjectRoot();
  if (!projectRoot) {
    sendJson(res, 404, { error: "No project found. Run /understand first." });
    return;
  }
  collectRequestBody(req, MAX_IMPACT_QUERY_BYTES)
    .then((body) => {
      let query = "";
      try {
        const parsed = JSON.parse(body) as { query?: unknown };
        query = typeof parsed.query === "string" ? parsed.query.trim() : "";
      } catch {
        query = "";
      }
      if (!query) {
        sendJson(res, 400, { error: "Missing 'query'" });
        return;
      }
      const jobId = impactTracker.begin({ query });
      // WAL: 스폰 전 pending 마커를 디스크에 남긴다 — 서버가 job 도중 재시작(config 리로드,
      // ctrl-c 등)해 close 핸들러를 잃어도 /impact-history 조회 시 reconcile 이 산출물
      // mtime 으로 결과를 복원한다(질의문 보존).
      try {
        fs.mkdirSync(impactHistoryDir(projectRoot), { recursive: true });
        fs.writeFileSync(
          path.join(impactHistoryDir(projectRoot), `pending-${jobId}.json`),
          JSON.stringify({ jobId, query, startedAt: impactTracker.job.startedAt }, null, 2) + "\n",
          "utf8",
        );
      } catch {
        // pending 기록 실패는 무시(본 기록은 close 핸들러가 시도)
      }
      const launched = runClaudeSkill({
        prompt: `/understand-impact ${query}${IMPACT_AUTONOMY_DIRECTIVE}`,
        cwd: projectRoot,
        jobId,
        tracker: impactTracker,
        onSpawnError: () =>
          sendJson(res, 500, { error: "Failed to launch claude", job: impactTracker.snapshot() }),
        onErrorSettled: () => recordImpactHistory(projectRoot, impactTracker.snapshot()),
        onCloseSettled: () => recordImpactHistory(projectRoot, impactTracker.snapshot()),
      });
      if (!launched) return;
      sendJson(res, 202, { job: impactTracker.snapshot() });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── ktds(WT-E): 영향 분석 히스토리 — job 종료 시 원장 append + 산출물 스냅샷 ─────
// 대시보드가 띄운 분석만 기록한다(CLI 직접 실행은 서버가 관찰하지 못함 — 정직한 범위).
// 원장: <root>/.understand-anything/impact-history/ledger.json (최신이 앞, 상한 초과분 삭제)
// 스냅샷: <root>/.understand-anything/impact-history/<jobId>/{impact,impact-verify-report,impact-overlay}.json
const IMPACT_HISTORY_MAX = 50;
/** /impact-history-item 이 서빙하는 스냅샷 파일 화이트리스트. */
const IMPACT_SNAPSHOT_FILES = new Set([
  "impact.json",
  "impact-verify-report.json",
  "impact-overlay.json",
]);

interface ImpactHistoryEntry {
  jobId: string;
  query: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  status: "done" | "failed";
  /** 스냅샷 impact.json 의 앵커 커밋(파싱 실패/부재 시 null). */
  gitCommit: string | null;
  /** 스냅샷으로 확보된 파일명 — 프론트가 열람 가능 여부를 판단. */
  files: string[];
}

function impactHistoryDir(projectRoot: string): string {
  return path.join(projectRoot, ".understand-anything", "impact-history");
}

function readImpactHistory(projectRoot: string): ImpactHistoryEntry[] {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(impactHistoryDir(projectRoot), "ledger.json"), "utf-8"),
    ) as { entries?: ImpactHistoryEntry[] };
    return Array.isArray(raw.entries) ? raw.entries : [];
  } catch {
    return []; // 부재/파손 = 기록 없음(정직한 empty)
  }
}

/** job 종료 시점 산출물을 스냅샷하고 원장에 append(동일 jobId 재기록은 dedup). 실패는 로그만. */
function recordImpactHistory(projectRoot: string, job: ImpactJob): void {
  try {
    const jobId = job.jobId;
    if (!jobId) return;
    const dir = impactHistoryDir(projectRoot);
    const snapDir = path.join(dir, jobId);
    fs.mkdirSync(snapDir, { recursive: true });
    // 존재하고 "이 job 이 갱신한"(mtime ≥ startedAt) 산출물만 복사 — exit 0 이어도 스킬이
    // 실행되지 않은 경우(예: 커맨드 미등록) 낡은 결과를 이 질의의 스냅샷처럼 기록하지 않는다.
    // 실패/무산 job 은 files 가 비어 UI 에서 열람 비활성(정직한 노출).
    const startedMs = job.startedAt ? Date.parse(job.startedAt) : Number.NaN;
    const freshEnough = (src: string): boolean => {
      if (Number.isNaN(startedMs)) return true; // 시작 시각 미상이면 배제하지 않음
      try {
        return fs.statSync(src).mtimeMs >= startedMs - 1000; // 파일시스템 mtime 해상도 여유 1s
      } catch {
        return false;
      }
    };
    const sources: Array<[string, string]> = [
      [path.join(projectRoot, ".spec", "map", "impact.json"), "impact.json"],
      [
        path.join(projectRoot, ".spec", "map", "impact-verify-report.json"),
        "impact-verify-report.json",
      ],
      [path.join(projectRoot, ".understand-anything", "impact-overlay.json"), "impact-overlay.json"],
    ];
    const files: string[] = [];
    let gitCommit: string | null = null;
    for (const [src, name] of sources) {
      if (!fs.existsSync(src) || !freshEnough(src)) continue;
      fs.copyFileSync(src, path.join(snapDir, name));
      files.push(name);
      if (name === "impact.json") {
        try {
          const parsed = JSON.parse(fs.readFileSync(src, "utf-8")) as { gitCommit?: unknown };
          if (typeof parsed.gitCommit === "string") gitCommit = parsed.gitCommit;
        } catch {
          // 파싱 실패 → gitCommit null 유지
        }
      }
    }
    const entry: ImpactHistoryEntry = {
      jobId,
      query: job.query ?? "",
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      // exit 0 이어도 이 job 이 갱신한 impact.json 이 없으면(스킬 미실행 등) 실질 실패로 기록.
      status: job.status === "done" && files.includes("impact.json") ? "done" : "failed",
      gitCommit,
      files,
    };
    const entries = [entry, ...readImpactHistory(projectRoot).filter((e) => e.jobId !== jobId)];
    for (const drop of entries.slice(IMPACT_HISTORY_MAX)) {
      try {
        fs.rmSync(path.join(dir, drop.jobId), { recursive: true, force: true });
      } catch {
        // 스냅샷 정리 실패는 무시(원장에서만 제거)
      }
    }
    fs.writeFileSync(
      path.join(dir, "ledger.json"),
      JSON.stringify({ entries: entries.slice(0, IMPACT_HISTORY_MAX) }, null, 2) + "\n",
      "utf8",
    );
    fs.rmSync(path.join(dir, `pending-${jobId}.json`), { force: true });
  } catch (err) {
    console.error("[understand-anything] Failed to record impact history:", err);
  }
}

/**
 * 서버 재시작으로 close 핸들러를 잃은 job 복원 — pending 마커와 산출물 mtime 으로 판정.
 * 산출물(impact.json)이 startedAt 이후 갱신됐으면 done 으로 원장 기록(스냅샷 포함),
 * 아직이면 고아 claude 가 돌고 있을 수 있어 30분 유예 후 failed 처리. /impact-history
 * 조회 시 lazy 하게 호출된다(별도 부팅 훅 불필요).
 */
function reconcileImpactHistory(projectRoot: string): void {
  const dir = impactHistoryDir(projectRoot);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^pending-[0-9a-f]{16}\.json$/.test(n));
  } catch {
    return; // 히스토리 디렉토리 자체가 없으면 복원할 것도 없음
  }
  if (names.length === 0) return;
  const ledger = readImpactHistory(projectRoot);
  for (const n of names) {
    const file = path.join(dir, n);
    try {
      const pending = JSON.parse(fs.readFileSync(file, "utf-8")) as {
        jobId?: string;
        query?: string;
        startedAt?: string;
      };
      const jobId = typeof pending.jobId === "string" ? pending.jobId : "";
      if (!jobId) {
        fs.rmSync(file, { force: true });
        continue;
      }
      if (impactTracker.isCurrent(jobId) && impactTracker.running) continue; // 현재 서버가 추적 중
      if (ledger.some((e) => e.jobId === jobId)) {
        fs.rmSync(file, { force: true }); // 이미 기록됨(정상 close) — 마커만 정리
        continue;
      }
      const startedMs = pending.startedAt ? Date.parse(pending.startedAt) : Number.NaN;
      let artifactMs = Number.NaN;
      try {
        artifactMs = fs.statSync(path.join(projectRoot, ".spec", "map", "impact.json")).mtimeMs;
      } catch {
        // 산출물 부재 — fresh=false 경로
      }
      const fresh =
        !Number.isNaN(startedMs) && !Number.isNaN(artifactMs) && artifactMs >= startedMs - 1000;
      if (!fresh && !Number.isNaN(startedMs) && Date.now() - startedMs < 30 * 60 * 1000) {
        continue; // 아직 돌고 있을 수 있음 — 다음 조회 때 재판정
      }
      recordImpactHistory(projectRoot, {
        status: fresh ? "done" : "failed",
        jobId,
        query: typeof pending.query === "string" ? pending.query : "",
        startedAt: pending.startedAt ?? null,
        finishedAt: fresh ? new Date(artifactMs).toISOString() : new Date().toISOString(),
        exitCode: null,
        tail: "",
      });
    } catch {
      // 개별 pending 파손은 건너뜀(다음 조회 때 재시도)
    }
  }
}

// ── P3: RTM 단계 인테이크 — 가이드 5단계를 단계당 claude -p 1회로 ─────
// 한 POST 가 start..target 단계를 순차 spawn(중간 컨펌 없이 자동진행), target 에서 멈춤. 단계마다
// claude -p "/understand-rtm --intake --session <sid> --step <k>". 세션 상태는 디스크(session.json)에
// 영속, 인메모리 rtmTracker 는 실행 추적(409 차단). 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §5.
const RTM_STEP_MIN = 1;
const RTM_STEP_MAX = 5;
function rtmStepDirective(step: number): string {
  return headlessDirective(
    `위 작업은 대시보드 추적표에서 자동 실행된 헤드리스 단계 ${step} 이다.`,
    ` SKILL.md §B 의 --step ${step} 지침만 끝까지 수행한 뒤 보고하고 멈춰라. 다음 단계는 사용자 컨펌 후 별도로 ` +
      `진행된다. 신규는 전부 [추정]이며 확정은 사람이 대시보드에서 한다.`,
  );
}

interface RtmStepExtra extends Record<string, unknown> {
  sid: string | null;
  step: number | null; // 현재 실행 중/마지막 단계
  targetStep: number | null;
  request: string | null;
}
const rtmTracker = new ClaudeJobTracker<RtmStepExtra>({
  sid: null,
  step: null,
  targetStep: null,
  request: null,
});

// ── 세션 영속(.understand-anything/rtm-intake/<sid>/) ────────────────────────
type RtmStepStatus = "pending" | "running" | "produced" | "confirmed" | "failed";
interface RtmSession {
  sid: string;
  request: string;
  createdAt: string;
  producedStep: number; // 산출물이 존재하는 최고 단계(0=없음)
  confirmedStep: number; // 사용자가 컨펌한 최고 단계
  targetStep: number;
  discarded: boolean;
  steps: Record<string, { status: RtmStepStatus }>;
}
/** 인테이크 세션 베이스 디렉터리(.understand-anything/rtm-intake). 프로젝트 미발견이면 null. */
function rtmIntakeBaseDir(): string | null {
  const graphFile = findGraphFile("domain-graph.json") ?? findGraphFile("rtm.json");
  return graphFile ? path.join(path.dirname(graphFile), "rtm-intake") : null;
}
/** sid 형식 검증(경로 traversal 방지) — 16진 8~32자. */
function isValidSid(sid: string): boolean {
  return /^[a-f0-9]{8,32}$/.test(sid);
}
function rtmSessionDir(sid: string): string | null {
  const base = rtmIntakeBaseDir();
  if (!base || !isValidSid(sid)) return null;
  return path.join(base, sid);
}
function newRtmSession(sid: string, request: string, targetStep: number): RtmSession {
  const steps: Record<string, { status: RtmStepStatus }> = {};
  for (let k = RTM_STEP_MIN; k <= RTM_STEP_MAX; k++) steps[String(k)] = { status: "pending" };
  return {
    sid,
    request,
    createdAt: new Date().toISOString(),
    producedStep: 0,
    confirmedStep: 0,
    targetStep,
    discarded: false,
    steps,
  };
}
function readRtmSession(sid: string): RtmSession | null {
  const dir = rtmSessionDir(sid);
  if (!dir) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "session.json"), "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RtmSession) : null;
  } catch {
    return null;
  }
}
function writeRtmSession(s: RtmSession): void {
  const dir = rtmSessionDir(s.sid);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s, null, 2) + "\n", "utf8");
}
/** 로드 시 복구용 — 가장 최근 생성된 비폐기 세션(createdAt 최대). 없으면 null. */
function latestRtmSession(): RtmSession | null {
  const base = rtmIntakeBaseDir();
  if (!base || !fs.existsSync(base)) return null;
  let best: RtmSession | null = null;
  try {
    for (const name of fs.readdirSync(base)) {
      if (!isValidSid(name)) continue;
      const s = readRtmSession(name);
      if (!s || s.discarded) continue;
      if (!best || (s.createdAt ?? "") > (best.createdAt ?? "")) best = s;
    }
  } catch {
    /* 디렉터리 읽기 실패 → null */
  }
  return best;
}
/** 세션 디렉터리의 산출 문서 목록(.md) + 종류. identified.json 존재 여부도 함께. */
function listRtmSessionDocs(sid: string): { name: string; kind: string }[] {
  const dir = rtmSessionDir(sid);
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((name) => {
        const kind = name.startsWith("요구사항목록표")
          ? "list"
          : name.startsWith("요구사항정의서")
          ? "definition"
          : name.startsWith("요구사항명세서")
          ? "spec"
          : "other";
        return { name, kind };
      });
  } catch {
    return [];
  }
}
/** 세션 파일 이름 검증 — basename 만, .md 또는 identified.json. traversal 차단. */
function isValidSessionFileName(name: string): boolean {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return name.endsWith(".md") || name === "identified.json";
}
/** 세션 파일 절대경로(검증 통과 + 디렉터리 이탈 방지). 실패 시 null. */
function rtmSessionFilePath(sid: string, name: string): string | null {
  const dir = rtmSessionDir(sid);
  if (!dir || !isValidSessionFileName(name)) return null;
  const full = path.join(dir, name);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

/**
 * 단계 순차 실행기 — jobId 유효한 동안 step=start..target 을 하나씩 spawn(이전 종료 후 다음).
 * 각 단계 성공 시 session.producedStep 갱신, target 도달 또는 실패 시 정지. jobId 가 교체되면 중단.
 */
function runRtmSteps(
  jobId: string,
  sid: string,
  projectRoot: string,
  request: string,
  start: number,
  target: number,
): void {
  const reqArg = request.replace(/[\r\n]+/g, " ").replace(/"/g, "'").trim();
  const setStepStatus = (k: number, status: RtmStepStatus): void => {
    const s = readRtmSession(sid);
    if (!s) return;
    s.steps[String(k)] = { status };
    if (status === "produced") s.producedStep = Math.max(s.producedStep, k);
    writeRtmSession(s);
  };
  const runOne = (k: number): void => {
    if (!rtmTracker.isCurrent(jobId)) return; // 후속 job 으로 교체됨
    rtmTracker.job.step = k;
    setStepStatus(k, "running");
    const requestArg = k === RTM_STEP_MIN ? ` --request "${reqArg}"` : "";
    runClaudeSkill({
      prompt: `/understand-rtm --intake --session ${sid} --step ${k}${requestArg}${rtmStepDirective(k)}`,
      cwd: projectRoot,
      jobId,
      tracker: rtmTracker,
      onSpawnError: () => setStepStatus(k, "failed"),
      onClose: (code) => {
        if (code !== 0) {
          rtmTracker.finish(jobId, code);
          setStepStatus(k, "failed");
          return;
        }
        setStepStatus(k, "produced");
        if (k >= target) {
          rtmTracker.finish(jobId, 0);
          return;
        }
        runOne(k + 1); // 다음 단계 자동진행(같은 호출의 N까지 구간)
      },
    });
  };
  runOne(start);
}

/**
 * POST /rtm-intake — { request?, sid?, targetStep } 단계 인테이크 시작/진행.
 * 신규(sid 없음)면 새 세션 발급 후 step 1 부터, 기존이면 producedStep+1 부터 targetStep 까지 순차 실행.
 * 미컨펌 산출(produced>confirmed)을 건너뛰고 진행하려 하면 409(컨펌 게이트). 즉시 202 + job + session.
 */
function handleRtmIntakePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  if (rtmTracker.running) {
    sendJson(res, 409, { error: "An RTM intake is already running", job: rtmTracker.snapshot() });
    return;
  }
  const projectRoot = impactProjectRoot();
  if (!projectRoot) {
    sendJson(res, 404, { error: "No project found. Run /understand first." });
    return;
  }
  if (!rtmIntakeBaseDir()) {
    sendJson(res, 404, { error: "No RTM found. Run /understand-rtm first." });
    return;
  }
  collectRequestBody(req, MAX_IMPACT_QUERY_BYTES)
    .then((body) => {
      let parsed: { request?: unknown; sid?: unknown; targetStep?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const wantTarget =
        typeof parsed.targetStep === "number" ? Math.floor(parsed.targetStep) : RTM_STEP_MAX;

      let session: RtmSession;
      let startStep: number;
      let request: string;
      if (typeof parsed.sid === "string" && parsed.sid) {
        const existing = readRtmSession(parsed.sid);
        if (!existing) {
          sendJson(res, 404, { error: "Unknown session" });
          return;
        }
        // 컨펌 게이트 — 미컨펌 산출이 있으면 더 진행 불가(같은 호출 자동진행은 예외, 여기선 새 호출).
        if (existing.producedStep > existing.confirmedStep) {
          sendJson(res, 409, {
            error: `단계 ${existing.producedStep} 을(를) 먼저 컨펌하세요.`,
            session: existing,
          });
          return;
        }
        session = existing;
        startStep = existing.producedStep + 1;
        request = existing.request;
      } else {
        request = typeof parsed.request === "string" ? parsed.request.trim() : "";
        if (!request) {
          sendJson(res, 400, { error: "Missing 'request'" });
          return;
        }
        const sid = crypto.randomBytes(8).toString("hex");
        session = newRtmSession(sid, request, wantTarget);
        startStep = RTM_STEP_MIN;
      }

      if (startStep > RTM_STEP_MAX) {
        sendJson(res, 400, { error: "이미 모든 단계(⑤)가 산출되었습니다.", session });
        return;
      }
      const target = Math.min(Math.max(wantTarget, startStep), RTM_STEP_MAX);
      session.targetStep = target;
      writeRtmSession(session);

      const jobId = rtmTracker.begin({
        sid: session.sid,
        step: startStep,
        targetStep: target,
        request,
      });
      runRtmSteps(jobId, session.sid, projectRoot, request, startStep, target);
      sendJson(res, 202, { job: rtmTracker.snapshot(), session });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

/**
 * POST /rtm-intake-confirm — { sid, step } 단계 컨펌. confirmedStep 을 갱신해 다음 단계 게이트를 연다.
 * step 은 producedStep 이하만 허용(산출되지 않은 단계 컨펌 금지).
 */
function handleRtmConfirmPost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  collectRequestBody(req, MAX_IMPACT_QUERY_BYTES)
    .then((body) => {
      let parsed: { sid?: unknown; step?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const sid = typeof parsed.sid === "string" ? parsed.sid : "";
      const step = typeof parsed.step === "number" ? Math.floor(parsed.step) : NaN;
      const session = sid ? readRtmSession(sid) : null;
      if (!session) {
        sendJson(res, 404, { error: "Unknown session" });
        return;
      }
      if (!(step >= RTM_STEP_MIN && step <= session.producedStep)) {
        sendJson(res, 400, { error: "산출된 단계만 컨펌할 수 있습니다." });
        return;
      }
      session.confirmedStep = Math.min(Math.max(session.confirmedStep, step), session.producedStep);
      for (let j = RTM_STEP_MIN; j <= session.confirmedStep; j++) {
        session.steps[String(j)] = { status: "confirmed" };
      }
      writeRtmSession(session);
      sendJson(res, 200, { session });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

/** POST /rtm-intake-discard — { sid } 활성 세션 폐기(파일은 이력 보존, discarded 플래그만). */
function handleRtmDiscardPost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  if (rtmTracker.running) {
    sendJson(res, 409, { error: "실행 중에는 폐기할 수 없습니다.", job: rtmTracker.snapshot() });
    return;
  }
  collectRequestBody(req, MAX_IMPACT_QUERY_BYTES)
    .then((body) => {
      let parsed: { sid?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const sid = typeof parsed.sid === "string" ? parsed.sid : "";
      const session = sid ? readRtmSession(sid) : null;
      if (!session) {
        sendJson(res, 404, { error: "Unknown session" });
        return;
      }
      session.discarded = true;
      writeRtmSession(session);
      sendJson(res, 200, { session });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

/** POST /rtm-intake-doc — { sid, name, content } 세션 문서(.md) 인라인 편집 저장(직접 덮어쓰기). */
function handleRtmDocPost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  collectRequestBody(req, MAX_DOC_BODY_BYTES)
    .then((body) => {
      let parsed: { sid?: unknown; name?: unknown; content?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const sid = typeof parsed.sid === "string" ? parsed.sid : "";
      const name = typeof parsed.name === "string" ? parsed.name : "";
      const content = parsed.content;
      if (typeof content !== "string") {
        sendJson(res, 400, { error: "content (string) is required" });
        return;
      }
      // 명세서 등 .md 만 편집 허용(identified.json 직접편집 금지).
      if (!name.endsWith(".md")) {
        sendJson(res, 400, { error: "편집 가능한 문서(.md)만 저장할 수 있습니다." });
        return;
      }
      const file = rtmSessionFilePath(sid, name);
      if (!file || !fs.existsSync(file)) {
        sendJson(res, 404, { error: "Unknown session document" });
        return;
      }
      try {
        fs.writeFileSync(file, content, "utf8");
      } catch (err) {
        console.error("[understand-anything] Failed to write rtm-intake doc:", err);
        sendJson(res, 500, { error: "Failed to write document" });
        return;
      }
      sendJson(res, 200, { sid, name, saved: true });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

// ── P6: RTM 변경관리(절차 B) — 요청(REQ) 철회 ────────────────────────────────
// 인테이크(다단계)와 달리 단일 파이프라인: claude -p 1회가 SKILL §C(번호→영향분석→문서04·05→
// 폐기표시·재bake→폐기배너)를 끝까지 수행한다. 결정론 부분은 rtm-intake.mjs CLI 가, 문서 작성은 LLM 이.
// 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §8.
const RTM_CHANGE_KINDS = ["withdraw"] as const;
type RtmChangeKind = (typeof RTM_CHANGE_KINDS)[number];
function rtmChangeDirective(targetReq: string, kind: RtmChangeKind): string {
  return headlessDirective(
    `위 작업은 대시보드 추적표에서 자동 실행된 변경관리(${kind === "withdraw" ? "철회" : kind})다. ` +
      `대상 요청은 ${targetReq} 이다.`,
    ` SKILL.md §C 절차를 끝까지 수행한 뒤 ` +
      `보고하고 멈춰라. **삭제 금지·이력 보존**(상태를 폐기로만), CR 문서(과업내용변경요청서·변경영향분석서)를 ` +
      `생성하고 추적표를 재생성한다. 확정·후속조치 수행은 사람이 한다.`,
  );
}

const rtmChangeTracker = new ClaudeJobTracker<{
  targetReq: string | null;
  kind: RtmChangeKind | null;
}>({ targetReq: null, kind: null });

/**
 * rtm.json 의 요청(REQ) id 집합 — RtmView.requestIdOf 규약: source.section 이 REQ- 면 그것,
 * 아니면 요구사항 id 가 REQ- 면 그것(레거시 단일 요청). 두 스타일 모두 변경요청 대상으로 인정.
 */
function rtmRequestIds(): Set<string> {
  const ids = new Set<string>();
  const file = findGraphFile("rtm.json");
  if (!file) return ids;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      requirements?: Array<{ id?: unknown; source?: { section?: unknown } | null }>;
    };
    for (const r of raw.requirements ?? []) {
      const section = r.source?.section;
      if (typeof section === "string" && /^REQ-\d+/.test(section)) ids.add(section);
      else if (typeof r.id === "string" && /^REQ-\d+/.test(r.id)) ids.add(r.id);
    }
  } catch {
    /* 빈 집합 */
  }
  return ids;
}

/** 변경관리 단일 실행기 — claude -p "/understand-rtm --change ..." 1회. jobId 교체 시 중단. */
function runRtmChange(
  jobId: string,
  projectRoot: string,
  targetReq: string,
  kind: RtmChangeKind,
): void {
  runClaudeSkill({
    prompt: `/understand-rtm --change --target-req ${targetReq} --kind ${kind}${rtmChangeDirective(targetReq, kind)}`,
    cwd: projectRoot,
    jobId,
    tracker: rtmChangeTracker,
  });
}

/**
 * POST /rtm-change — { targetReq, kind } 요청 철회 시작. 즉시 202 + job. 대상 REQ 는 rtm.json 에 실존해야 한다.
 * 한 번에 하나만(409). 결과는 GET /rtm-change-status 로 폴링하고, 완료 후 추적표·문서를 다시 읽는다.
 */
function handleRtmChangePost(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
): void {
  if (rtmChangeTracker.running) {
    sendJson(res, 409, {
      error: "A change request is already running",
      job: rtmChangeTracker.snapshot(),
    });
    return;
  }
  const projectRoot = impactProjectRoot();
  if (!projectRoot) {
    sendJson(res, 404, { error: "No project found. Run /understand first." });
    return;
  }
  collectRequestBody(req, MAX_IMPACT_QUERY_BYTES)
    .then((body) => {
      let parsed: { targetReq?: unknown; kind?: unknown } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const targetReq = typeof parsed.targetReq === "string" ? parsed.targetReq.trim() : "";
      if (!/^REQ-\d+$/.test(targetReq)) {
        sendJson(res, 400, { error: "targetReq (REQ-00N) 형식이 필요합니다." });
        return;
      }
      const kind: RtmChangeKind =
        typeof parsed.kind === "string" && (RTM_CHANGE_KINDS as readonly string[]).includes(parsed.kind)
          ? (parsed.kind as RtmChangeKind)
          : "withdraw";
      if (!rtmRequestIds().has(targetReq)) {
        sendJson(res, 400, { error: `요청 ${targetReq} 에 귀속된 요구사항이 추적표에 없습니다.` });
        return;
      }
      const jobId = rtmChangeTracker.begin({ targetReq, kind });
      runRtmChange(jobId, projectRoot, targetReq, kind);
      sendJson(res, 202, { job: rtmChangeTracker.snapshot() });
    })
    .catch(() => sendJson(res, 413, { error: "Request body too large" }));
}

export default defineConfig({
  test: {
    environment: "node",
    // Collect ALL test files under src (not only those in __tests__/), so ktds
    // views (src/ktds/*.test.ts) are not silently skipped by the gate.
    // server/ 는 dev-server 전용 노드 모듈(claude 헤드리스 잡 실행기) 테스트.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "server/**/*.test.ts"],
  },

  // FIX 1 — bind only to localhost, not 0.0.0.0
  // This blocks access from any other device on the same LAN / WiFi.
  server: {
    host: "127.0.0.1",
    port: 5173,
    open: `/?token=${ACCESS_TOKEN}`,
  },

  resolve: {
    // pnpm symlink layout can resolve react via multiple physical paths,
    // yielding two React module instances → "Invalid hook call" (dispatcher null).
    // Force a single copy for hooks to work across react-markdown et al.
    dedupe: ["react", "react-dom"],
    alias: {
      "@understand-anything/core/schema": path.resolve(__dirname, "../core/dist/schema.js"),
      "@understand-anything/core/search": path.resolve(__dirname, "../core/dist/search.js"),
      "@understand-anything/core/types": path.resolve(__dirname, "../core/dist/types.js"),
    },
  },

  // Pre-bundle React (and the JSX runtime) so every transitive importer shares
  // the same optimized instance — prevents the dev-server hook-dispatcher split.
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (id.includes("node_modules/@xyflow/")) return "xyflow";
          // ELK is ~1.6MB raw — split into its own chunk so it doesn't
          // bloat the main bundle. graphology is similarly large.
          if (id.includes("node_modules/elkjs/")) return "elk";
          if (id.includes("node_modules/graphology")) return "graphology";
          if (
            id.includes("node_modules/@dagrejs/") ||
            id.includes("node_modules/d3-force/")
          ) {
            return "graph-layout";
          }
          if (
            id.includes("node_modules/react-markdown/") ||
            id.includes("node_modules/hast-util-to-jsx-runtime/") ||
            /[\\/]node_modules[\\/](remark|rehype|mdast|hast|unist|micromark|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|devlop|bail|ccount|character-entities|is-plain-obj|trim-lines|trough|unified|vfile|zwitch)/.test(id)
          ) {
            return "markdown";
          }
        },
      },
    },
  },

  plugins: [
    react(),
    tailwindcss(),
    {
      name: "serve-knowledge-graph",
      configureServer(server) {
        // Print the access URL once so the developer can open it.
        server.httpServer?.once("listening", () => {
          const address = server.httpServer?.address();
          const port = typeof address === "object" && address ? address.port : 5173;
          console.log(
            `\n  🔑  Dashboard URL: http://127.0.0.1:${port}/?token=${ACCESS_TOKEN}\n`
          );
        });

        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1:5173");
          const pathname = url.pathname;
          const isProtectedEndpoint =
            pathname === "/knowledge-graph.json" ||
            pathname === "/domain-graph.json" ||
            pathname === "/diff-overlay.json" ||
            pathname === "/impact-overlay.json" ||
            pathname === "/system-map.json" ||
            pathname === "/meta.json" ||
            pathname === "/config.json" ||
            pathname === "/file-content.json" ||
            pathname === "/node-overrides.json" ||
            pathname === "/node-overrides" ||
            pathname === "/doc-list.json" ||
            pathname === "/doc-content.json" ||
            pathname === "/doc" ||
            pathname === "/doc-xlsx" ||
            pathname === "/impact-analyze" ||
            pathname === "/impact-status" ||
            pathname === "/impact-history" ||
            pathname === "/impact-history-item" ||
            pathname === "/rtm.json" ||
            pathname === "/rtm-overrides.json" ||
            pathname === "/rtm-override" ||
            pathname === "/rtm-req-override" ||
            pathname === "/rtm-scenario-override" ||
            pathname === "/rtm-field" ||
            pathname === "/rtm-intake" ||
            pathname === "/rtm-intake-status" ||
            pathname === "/rtm-intake-confirm" ||
            pathname === "/rtm-intake-discard" ||
            pathname === "/rtm-intake-doc" ||
            pathname === "/rtm-change" ||
            pathname === "/rtm-change-status" ||
            pathname === "/screens.json" ||
            pathname === "/screen-overrides.json" ||
            pathname === "/screen-override" ||
            pathname === "/screen-asset" ||
            pathname === "/golden-baseline.json" ||
            SPEC_MAP_ENDPOINTS.has(pathname);

          if (!isProtectedEndpoint) {
            next();
            return;
          }

          // FIX 3 — require the one-time token on all data endpoints.
          // Requests without a matching ?token= get a 403.
          if (url.searchParams.get("token") !== ACCESS_TOKEN) {
            sendJson(res, 403, { error: "Forbidden: missing or invalid token" });
            return;
          }

          // P3: 노드 오버레이 — 쓰기(POST)는 토큰 게이트 + 화이트리스트, 읽기(GET)는 병합용.
          if (pathname === "/node-overrides") {
            if (req.method === "POST") {
              handleOverridePost(req, res);
            } else {
              sendJson(res, 405, { error: "Use POST to write node overrides" });
            }
            return;
          }
          if (pathname === "/node-overrides.json") {
            const file = nodeOverridesFilePath();
            sendJson(res, 200, file ? readNodeOverrides(file) : {});
            return;
          }

          // R3: RTM 행 오버레이(편집/확정) — 읽기(GET, 병합용)·쓰기(POST, 토큰+화이트리스트).
          if (pathname === "/rtm-override") {
            if (req.method === "POST") handleRtmOverridePost(req, res);
            else sendJson(res, 405, { error: "Use POST to write rtm overrides" });
            return;
          }
          if (pathname === "/rtm-req-override") {
            if (req.method === "POST") handleRtmReqOverridePost(req, res);
            else sendJson(res, 405, { error: "Use POST to write rtm requirement overrides" });
            return;
          }
          // W5: 시나리오 확정 / R7: 사용자 정의 필드 정의.
          if (pathname === "/rtm-scenario-override") {
            if (req.method === "POST") handleRtmScenarioOverridePost(req, res);
            else sendJson(res, 405, { error: "Use POST to write rtm scenario overrides" });
            return;
          }
          if (pathname === "/rtm-field") {
            if (req.method === "POST") handleRtmFieldPost(req, res);
            else sendJson(res, 405, { error: "Use POST to write rtm field defs" });
            return;
          }
          if (pathname === "/rtm-overrides.json") {
            sendJson(res, 200, readRtmOverrides());
            return;
          }

          // S4: 화면설계서 — 오버레이(편집/확정) 읽기/쓰기 + 캡처 PNG.
          if (pathname === "/screen-override") {
            if (req.method === "POST") handleScreenOverridePost(req, res);
            else sendJson(res, 405, { error: "Use POST to write screen overrides" });
            return;
          }
          if (pathname === "/screen-overrides.json") {
            sendJson(res, 200, readScreenOverrides());
            return;
          }
          if (pathname === "/screen-asset") {
            handleScreenAssetGet(url, res);
            return;
          }

          // D3: 산출물 문서(.md) 목록/내용/저장.
          if (pathname === "/doc") {
            if (req.method === "POST") handleDocPost(req, res);
            else sendJson(res, 405, { error: "Use POST to save a document" });
            return;
          }
          if (pathname === "/doc-list.json") {
            const dir = docOutputDir();
            const ov = readDocOverrides();
            const docs = docOutputIds().map((docId) => {
              const o = ov[docId];
              const content = readDocContent(docId) ?? "";
              return {
                docId,
                title: docTitle(content, docId),
                methodology: docMethodology(content),
                confirmed: !!o,
                approver: o?.approver ?? null,
                at: o?.at ?? null,
                // W7: 병기된 xlsx 존재 여부 — DocsView 다운로드 버튼 노출 조건.
                hasXlsx: !!dir && fs.existsSync(path.join(dir, `${docId}.xlsx`)),
                // W7 비평 반영: xlsx 는 스캔 스냅샷 — 확정 편집(오버레이) 존재 또는
                // md 가 더 새로우면 stale(버튼에 "미반영 편집 있음" 경고 노출).
                xlsxStale: (() => {
                  if (!dir) return false;
                  const xf = path.join(dir, `${docId}.xlsx`);
                  if (!fs.existsSync(xf)) return false;
                  if (o) return true; // 확정 편집 오버레이 존재 → xlsx 에 미반영
                  try {
                    const mf = path.join(dir, `${docId}.md`);
                    return fs.statSync(mf).mtimeMs > fs.statSync(xf).mtimeMs;
                  } catch {
                    return false;
                  }
                })(),
              };
            });
            sendJson(res, 200, { docs, hasOutput: !!dir });
            return;
          }
          // W7: 병기 xlsx 다운로드 — docId 화이트리스트(doc-output 의 md 보유 문서 + rtm).
          if (pathname === "/doc-xlsx") {
            const docId = url.searchParams.get("docId");
            const dir = docOutputDir();
            const allowed = docId !== null && (docOutputIds().includes(docId) || docId === "rtm");
            if (!dir || !allowed) {
              sendJson(res, 404, { error: "unknown docId" });
              return;
            }
            const file = path.join(dir, `${docId}.xlsx`);
            if (!fs.existsSync(file)) {
              sendJson(res, 404, { error: "xlsx not generated — run understand-docs first" });
              return;
            }
            res.writeHead(200, {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(docId)}.xlsx`,
            });
            res.end(fs.readFileSync(file));
            return;
          }
          if (pathname === "/doc-content.json") {
            const docId = url.searchParams.get("docId");
            if (!docId || !docOutputIds().includes(docId)) {
              sendJson(res, 404, { error: "unknown docId" });
              return;
            }
            const content = readDocContent(docId);
            if (content === null) {
              sendJson(res, 500, { error: "failed to read document" });
              return;
            }
            const o = readDocOverrides()[docId];
            sendJson(res, 200, {
              docId,
              content,
              confirmed: !!o,
              approver: o?.approver ?? null,
              at: o?.at ?? null,
            });
            return;
          }

          // ktds: 구조 탭 "영향도 분석" — claude -p "/understand-impact <q>" 실행/상태.
          if (pathname === "/impact-analyze") {
            if (req.method === "POST") handleImpactAnalyzePost(req, res);
            else sendJson(res, 405, { error: "Use POST to start impact analysis" });
            return;
          }
          if (pathname === "/impact-status") {
            sendJson(res, 200, { job: impactTracker.snapshot() });
            return;
          }
          // ktds(WT-E): 영향 분석 히스토리 — 원장 목록 + 스냅샷 열람(읽기 전용).
          if (pathname === "/impact-history") {
            const historyRoot = impactProjectRoot();
            if (historyRoot) reconcileImpactHistory(historyRoot); // 재시작으로 잃은 job 복원
            sendJson(res, 200, { entries: historyRoot ? readImpactHistory(historyRoot) : [] });
            return;
          }
          if (pathname === "/impact-history-item") {
            const historyRoot = impactProjectRoot();
            const id = url.searchParams.get("id") ?? "";
            const name = url.searchParams.get("name") ?? "impact.json";
            // jobId 는 crypto.randomBytes(8).hex = 16자 소문자 hex — 경로 조작 원천 차단.
            if (!historyRoot || !/^[0-9a-f]{16}$/.test(id) || !IMPACT_SNAPSHOT_FILES.has(name)) {
              sendJson(res, 400, { error: "Invalid snapshot id or name" });
              return;
            }
            const snapFile = path.join(impactHistoryDir(historyRoot), id, name);
            if (!fs.existsSync(snapFile)) {
              sendJson(res, 404, { error: "Snapshot not found" });
              return;
            }
            try {
              sendJson(res, 200, JSON.parse(fs.readFileSync(snapFile, "utf-8")));
            } catch {
              sendJson(res, 500, { error: "Failed to read snapshot" });
            }
            return;
          }
          if (pathname === "/rtm-intake") {
            if (req.method === "POST") handleRtmIntakePost(req, res);
            else sendJson(res, 405, { error: "Use POST to start RTM intake" });
            return;
          }
          if (pathname === "/rtm-intake-status") {
            const qSid = url.searchParams.get("sid");
            const sid = qSid ?? rtmTracker.job.sid;
            let session = sid ? readRtmSession(sid) : null;
            // 명시 sid 없이 조회(로드 시) + 인메모리 job 도 없으면 디스크에서 최근 활성 세션 복구.
            if (!session && !qSid) session = latestRtmSession();
            sendJson(res, 200, {
              job: rtmTracker.snapshot(),
              session,
              docs: session ? listRtmSessionDocs(session.sid) : [],
            });
            return;
          }
          if (pathname === "/rtm-change") {
            if (req.method === "POST") handleRtmChangePost(req, res);
            else sendJson(res, 405, { error: "Use POST to start a change request" });
            return;
          }
          if (pathname === "/rtm-change-status") {
            sendJson(res, 200, { job: rtmChangeTracker.snapshot() });
            return;
          }
          if (pathname === "/rtm-intake-confirm") {
            if (req.method === "POST") handleRtmConfirmPost(req, res);
            else sendJson(res, 405, { error: "Use POST to confirm a step" });
            return;
          }
          if (pathname === "/rtm-intake-discard") {
            if (req.method === "POST") handleRtmDiscardPost(req, res);
            else sendJson(res, 405, { error: "Use POST to discard a session" });
            return;
          }
          if (pathname === "/rtm-intake-doc") {
            if (req.method === "POST") {
              handleRtmDocPost(req, res);
              return;
            }
            const sid = url.searchParams.get("sid") ?? "";
            const name = url.searchParams.get("name") ?? "";
            const file = rtmSessionFilePath(sid, name);
            if (!file || !fs.existsSync(file)) {
              sendJson(res, 404, { error: "Unknown session document" });
              return;
            }
            try {
              sendJson(res, 200, { sid, name, content: fs.readFileSync(file, "utf-8") });
            } catch {
              sendJson(res, 500, { error: "Failed to read document" });
            }
            return;
          }

          if (pathname === "/file-content.json") {
            const result = readSourceFile(url);
            sendJson(res, result.statusCode, result.payload);
            return;
          }

          if (pathname === "/config.json") {
            const configCandidates = graphFileCandidates("config.json");
            for (const candidate of configCandidates) {
              if (fs.existsSync(candidate)) {
                try {
                  const raw = JSON.parse(fs.readFileSync(candidate, "utf-8"));
                  sendJson(res, 200, raw);
                  return;
                } catch {
                  sendJson(res, 500, { error: "Failed to read config file" });
                  return;
                }
              }
            }
            sendJson(res, 200, { autoUpdate: false, outputLanguage: "en" });
            return;
          }

          // 신설 메뉴 데이터 — `.spec/map/` 산출 읽기 전용 서빙. relPath 기반(절대경로 없음)이라
          // 그래프 서빙과 달리 경로 새니타이즈가 필요 없다. 부재는 404(정직한 empty state 유도).
          if (SPEC_MAP_ENDPOINTS.has(pathname)) {
            const specFile = findSpecMapFile(pathname.slice(1));
            if (!specFile) {
              sendJson(res, 404, { error: `${pathname.slice(1)} not found (.spec/map)` });
              return;
            }
            try {
              sendJson(res, 200, JSON.parse(fs.readFileSync(specFile, "utf-8")));
            } catch {
              sendJson(res, 500, { error: `Failed to read ${pathname.slice(1)}` });
            }
            return;
          }
          // 골든셋 기준선(품질 화면) — 프로젝트 `.spec/golden/baseline.json` 이 있으면 서빙.
          if (pathname === "/golden-baseline.json") {
            const goldenCandidates = [
              ...(process.env.GRAPH_DIR
                ? [path.resolve(process.env.GRAPH_DIR, ".spec/golden/baseline.json")]
                : []),
              path.resolve(process.cwd(), ".spec/golden/baseline.json"),
              path.resolve(process.cwd(), "../../../.spec/golden/baseline.json"),
            ];
            const goldenFile = goldenCandidates.find((c) => fs.existsSync(c));
            if (!goldenFile) {
              sendJson(res, 404, { error: "golden baseline not found" });
              return;
            }
            try {
              sendJson(res, 200, JSON.parse(fs.readFileSync(goldenFile, "utf-8")));
            } catch {
              sendJson(res, 500, { error: "Failed to read golden baseline" });
            }
            return;
          }

          const fileName =
            pathname === "/diff-overlay.json"
              ? "diff-overlay.json"
              : pathname === "/impact-overlay.json"
              ? "impact-overlay.json"
              : pathname === "/meta.json"
              ? "meta.json"
              : pathname === "/domain-graph.json"
              ? "domain-graph.json"
              : pathname === "/rtm.json"
              ? "rtm.json"
              : pathname === "/system-map.json"
              ? "system-map.json"
              : pathname === "/screens.json"
              ? "screens.json"
              : "knowledge-graph.json";

          const candidates = graphFileCandidates(fileName);

          for (const candidate of candidates) {
            if (!fs.existsSync(candidate)) continue;

            // FIX 2 — sanitise absolute file paths before sending the JSON.
            // Nodes can contain filePath values like /Users/alice/company/src/auth.ts.
            // We convert those to relative paths (src/auth.ts) so the developer's
            // home directory and company directory layout are not leaked.
            try {
              const raw = JSON.parse(fs.readFileSync(candidate, "utf-8")) as {
                nodes?: Array<Record<string, unknown>>;
                [key: string]: unknown;
              };

              // Derive the project root from the candidate path so we can
              // make file paths relative to it.
              const projectRoot = projectRootFromGraphFile(candidate);

              if (Array.isArray(raw.nodes)) {
                raw.nodes = raw.nodes.map((node) => {
                  if (typeof node.filePath !== "string") return node;
                  const abs = node.filePath;
                  // Only relativise paths that actually sit inside projectRoot.
                  // Leave external or already-relative paths untouched.
                  const rel = abs.startsWith(projectRoot)
                    ? abs.slice(projectRoot.length).replace(/^[\\/]/, "")
                    : path.isAbsolute(abs)
                    ? path.basename(abs) // absolute but outside root — use filename only
                    : abs;              // already relative — keep as-is
                  return { ...node, filePath: rel };
                });
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(raw));
            } catch (err) {
              // If we cannot parse or sanitise the file, refuse to serve it
              // rather than accidentally leaking raw content.
              console.error("[understand-anything] Failed to sanitise graph file:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Failed to read graph file" }));
            }
            return;
          }

          // No matching file found on disk.
          res.statusCode = 404;
          if (pathname === "/knowledge-graph.json") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "No knowledge graph found. Run /understand first." }));
          } else {
            res.end();
          }
        });
      },
    },
  ],
});
