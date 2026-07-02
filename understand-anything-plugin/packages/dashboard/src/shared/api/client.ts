/**
 * 중앙 API 클라이언트 (FRONT_REDESIGN §7 P1).
 * 토큰 해석/보관과 데이터 URL 조립을 한 곳으로 모은다 — App.tsx에서 이관.
 */

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const SESSION_TOKEN_KEY = "understand-anything-token";

/** Resolve data file URL — in demo mode, use env var URLs; otherwise use local paths with token. */
export function dataUrl(fileName: string, token: string | null): string {
  if (DEMO_MODE) {
    const envMap: Record<string, string | undefined> = {
      "knowledge-graph.json": import.meta.env.VITE_GRAPH_URL,
      "domain-graph.json": import.meta.env.VITE_DOMAIN_GRAPH_URL,
      "meta.json": import.meta.env.VITE_META_URL,
      "diff-overlay.json": import.meta.env.VITE_DIFF_OVERLAY_URL,
      "impact-overlay.json": import.meta.env.VITE_IMPACT_OVERLAY_URL,
      "config.json": import.meta.env.VITE_CONFIG_URL,
    };
    const url = envMap[fileName];
    if (url) return url;
    const base = import.meta.env.BASE_URL || "/";
    return `${base.endsWith("/") ? base : `${base}/`}${fileName}`;
  }
  const path = `/${fileName}`;
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

/**
 * Resolve the access token from the URL query string or sessionStorage.
 * If found in the URL, persist to sessionStorage and strip the param from the address bar.
 */
export function resolveInitialToken(): string | null {
  if (DEMO_MODE) return "__demo__";
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, urlToken);
    // Clean the URL
    params.delete("token");
    const cleanSearch = params.toString();
    const newUrl =
      window.location.pathname + (cleanSearch ? `?${cleanSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
    return urlToken;
  }
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

/** Persist a token validated through the TokenGate. */
export function storeToken(token: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}
