/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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

export default defineConfig({
  test: {
    environment: "node",
    // Collect ALL test files under src (not only those in __tests__/), so ktds
    // views (src/ktds/*.test.ts) are not silently skipped by the gate.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
            pathname === "/meta.json" ||
            pathname === "/config.json" ||
            pathname === "/file-content.json" ||
            pathname === "/node-overrides.json" ||
            pathname === "/node-overrides" ||
            pathname === "/doc-list.json" ||
            pathname === "/doc-content.json" ||
            pathname === "/doc";

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
              };
            });
            sendJson(res, 200, { docs, hasOutput: !!dir });
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

          const fileName =
            pathname === "/diff-overlay.json"
              ? "diff-overlay.json"
              : pathname === "/meta.json"
              ? "meta.json"
              : pathname === "/domain-graph.json"
              ? "domain-graph.json"
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
