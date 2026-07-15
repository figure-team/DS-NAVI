import type { ViewMode } from "../store";

/**
 * viewMode ↔ URL 경로 매핑 (FRONT_REDESIGN §3).
 * P2부터 URL이 네비게이션의 단일 진실 — 컴포넌트는 useViewMode()(라우트 파생)로 읽고,
 * 섹션 전환은 navigate(MODE_TO_PATH[...])로 한다.
 */
export const MODE_TO_PATH: Record<ViewMode, string> = {
  domain: "/domains",
  docs: "/deliverables",
  rtm: "/rtm",
  screenspec: "/screens",
  data: "/data",
  change: "/change",
  programs: "/programs",
  quality: "/quality",
  report: "/report",
  policy: "/policy",
};

const PATH_TO_MODE = new Map<string, ViewMode>(
  (Object.entries(MODE_TO_PATH) as Array<[ViewMode, string]>).map(([m, p]) => [p, m]),
);

/** 첫 세그먼트만 보고 모드를 해석 — 하위 라우트(P3)가 붙어도 유효. */
export function modeForPath(pathname: string): ViewMode | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? (PATH_TO_MODE.get(`/${seg}`) ?? null) : null;
}

/**
 * 훅을 쓸 수 없는 문맥(키보드 단축키 핸들러 등)용 — window.location에서 현재 모드 해석.
 * 데모 정적 빌드의 basename(BASE_URL)을 벗겨낸다.
 */
export function currentMode(): ViewMode | null {
  if (typeof window === "undefined") return null;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  let pathname = window.location.pathname;
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || "/";
  }
  return modeForPath(pathname);
}
