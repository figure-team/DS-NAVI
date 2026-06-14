import { describe, expect, test } from "vitest";
import { classifyNextJsFile, nextJsRoutesFor } from "./nextjs.js";
import type { NextJsCandidate } from "./nextjs.js";

// ── classifyNextJsFile ────────────────────────────────────────────────────────

describe("classifyNextJsFile — App Router", () => {
  test("app/page.tsx → 루트 페이지", () => {
    const c = classifyNextJsFile("src/app/page.tsx");
    expect(c).not.toBeNull();
    expect(c!.router).toBe("app");
    expect(c!.urlPath).toBe("/");
    expect(c!.isApi).toBe(false);
    expect(c!.needsContent).toBe(false);
  });

  test("app/dashboard/page.tsx → /dashboard 페이지", () => {
    const c = classifyNextJsFile("src/app/dashboard/page.tsx");
    expect(c!.urlPath).toBe("/dashboard");
    expect(c!.isApi).toBe(false);
  });

  test("app/api/users/route.ts → API route, needsContent=true", () => {
    const c = classifyNextJsFile("src/app/api/users/route.ts");
    expect(c!.router).toBe("app");
    expect(c!.urlPath).toBe("/api/users");
    expect(c!.isApi).toBe(true);
    expect(c!.needsContent).toBe(true);
  });

  test("app/(marketing)/about/page.tsx → route group 무시", () => {
    const c = classifyNextJsFile("src/app/(marketing)/about/page.tsx");
    expect(c!.urlPath).toBe("/about");
  });

  test("app/[id]/page.tsx → 동적 세그먼트 → {id}", () => {
    const c = classifyNextJsFile("src/app/[id]/page.tsx");
    expect(c!.urlPath).toBe("/{id}");
  });

  test("app/[...slug]/page.tsx → catch-all → *", () => {
    const c = classifyNextJsFile("src/app/[...slug]/page.tsx");
    expect(c!.urlPath).toBe("/*");
  });

  test("app/[[...slug]]/page.tsx → optional catch-all → *", () => {
    const c = classifyNextJsFile("src/app/[[...slug]]/page.tsx");
    expect(c!.urlPath).toBe("/*");
  });

  test("app/@modal/page.tsx → parallel route slot은 URL 세그먼트 아님", () => {
    const c = classifyNextJsFile("src/app/@modal/photo/page.tsx");
    expect(c!.urlPath).toBe("/photo");
  });

  test("app/dashboard/layout.tsx → route 파일 아님 → null", () => {
    expect(classifyNextJsFile("src/app/dashboard/layout.tsx")).toBeNull();
  });

  test("app/loading.tsx → route 아님 → null", () => {
    expect(classifyNextJsFile("src/app/loading.tsx")).toBeNull();
  });

  test(".d.ts 파일 → null", () => {
    expect(classifyNextJsFile("src/app/page.d.ts")).toBeNull();
  });
});

describe("classifyNextJsFile — Pages Router", () => {
  test("pages/index.tsx → 루트", () => {
    const c = classifyNextJsFile("src/pages/index.tsx");
    expect(c!.router).toBe("pages");
    expect(c!.urlPath).toBe("/");
    expect(c!.isApi).toBe(false);
    expect(c!.needsContent).toBe(false);
  });

  test("pages/about.tsx → /about", () => {
    const c = classifyNextJsFile("src/pages/about.tsx");
    expect(c!.urlPath).toBe("/about");
  });

  test("pages/api/users.ts → API route", () => {
    const c = classifyNextJsFile("src/pages/api/users.ts");
    expect(c!.isApi).toBe(true);
    expect(c!.urlPath).toBe("/api/users");
  });

  test("pages/blog/[slug].tsx → 동적 세그먼트", () => {
    const c = classifyNextJsFile("src/pages/blog/[slug].tsx");
    expect(c!.urlPath).toBe("/blog/{slug}");
  });

  test("pages/[...all].tsx → catch-all", () => {
    const c = classifyNextJsFile("src/pages/[...all].tsx");
    expect(c!.urlPath).toBe("/*");
  });

  test("pages/_app.tsx → null (_app, _document, _error 제외)", () => {
    expect(classifyNextJsFile("src/pages/_app.tsx")).toBeNull();
  });

  test("pages/_document.tsx → null", () => {
    expect(classifyNextJsFile("src/pages/_document.tsx")).toBeNull();
  });

  test("pages/_error.tsx → null", () => {
    expect(classifyNextJsFile("src/pages/_error.tsx")).toBeNull();
  });

  test("지원하지 않는 확장자 → null", () => {
    expect(classifyNextJsFile("src/pages/about.vue")).toBeNull();
    expect(classifyNextJsFile("src/pages/about.java")).toBeNull();
  });
});

// ── nextJsRoutesFor ────────────────────────────────────────────────────────

describe("nextJsRoutesFor — App Router page (GET)", () => {
  test("page 파일 → GET 단건, kind=page", () => {
    const candidate: NextJsCandidate = {
      router: "app",
      needsContent: false,
      urlPath: "/dashboard",
      isApi: false,
    };
    const routes = nextJsRoutesFor("src/app/dashboard/page.tsx", candidate, null);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("/dashboard");
    expect(routes[0].kind).toBe("page");
    expect(routes[0].framework).toBe("nextjs");
    expect(routes[0].handler).toBeNull();
    expect(routes[0].notes).toEqual([]);
  });
});

describe("nextJsRoutesFor — App Router API route (needsContent=true)", () => {
  test("export GET, POST → 두 개의 별도 route", () => {
    const candidate: NextJsCandidate = {
      router: "app",
      needsContent: true,
      urlPath: "/api/users",
      isApi: true,
    };
    const content = `
export async function GET(request: Request) { return Response.json([]); }
export async function POST(request: Request) { return Response.json({}); }
`;
    const routes = nextJsRoutesFor("src/app/api/users/route.ts", candidate, content);
    const methods = routes.map((r) => r.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
    expect(routes[0].kind).toBe("api");
    expect(routes[0].path).toBe("/api/users");
  });

  test("export const DELETE → DELETE route", () => {
    const candidate: NextJsCandidate = {
      router: "app",
      needsContent: true,
      urlPath: "/api/items/{id}",
      isApi: true,
    };
    const content = `export const DELETE = async (req: Request) => Response.json({});`;
    const routes = nextJsRoutesFor("src/app/api/items/[id]/route.ts", candidate, content);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("DELETE");
  });

  test("content 없는 API route → ANY", () => {
    const candidate: NextJsCandidate = {
      router: "app",
      needsContent: true,
      urlPath: "/api/health",
      isApi: true,
    };
    const routes = nextJsRoutesFor("src/app/api/health/route.ts", candidate, null);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("ANY");
  });

  test("content에 handler export 없을 때 → ANY", () => {
    const candidate: NextJsCandidate = {
      router: "app",
      needsContent: true,
      urlPath: "/api/noop",
      isApi: true,
    };
    const routes = nextJsRoutesFor("src/app/api/noop/route.ts", candidate, "// no exports");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("ANY");
  });
});

describe("nextJsRoutesFor — Pages Router API (isApi, no content scan)", () => {
  test("pages/api/* → ANY, kind=api", () => {
    const candidate: NextJsCandidate = {
      router: "pages",
      needsContent: false,
      urlPath: "/api/auth",
      isApi: true,
    };
    const routes = nextJsRoutesFor("src/pages/api/auth.ts", candidate, null);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("ANY");
    expect(routes[0].kind).toBe("api");
  });
});

describe("nextJsRoutesFor — filePath, line, rawPath", () => {
  test("filePath 및 line=1 보존", () => {
    const candidate: NextJsCandidate = {
      router: "pages",
      needsContent: false,
      urlPath: "/about",
      isApi: false,
    };
    const routes = nextJsRoutesFor("src/pages/about.tsx", candidate, null);
    expect(routes[0].filePath).toBe("src/pages/about.tsx");
    expect(routes[0].line).toBe(1);
    expect(routes[0].rawPath).toBe("/about");
  });
});
