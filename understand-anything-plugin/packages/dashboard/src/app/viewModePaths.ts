import type { ViewMode } from "../store";

/**
 * viewMode ↔ URL 경로 매핑 (FRONT_REDESIGN §3).
 * P1 과도기: store의 viewMode가 아직 진실이고 URL은 거울 — P2에서 URL이 단일 진실이 되면
 * 이 매핑은 라우트 정의로 흡수된다.
 */
export const MODE_TO_PATH: Record<ViewMode, string> = {
  structural: "/structure",
  domain: "/domains",
  wiki: "/wiki",
  docs: "/deliverables",
  rtm: "/rtm",
  knowledge: "/knowledge",
};

const PATH_TO_MODE = new Map<string, ViewMode>(
  (Object.entries(MODE_TO_PATH) as Array<[ViewMode, string]>).map(([m, p]) => [p, m]),
);

/** 첫 세그먼트만 보고 모드를 해석 — 하위 라우트(P3)가 붙어도 유효. */
export function modeForPath(pathname: string): ViewMode | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? (PATH_TO_MODE.get(`/${seg}`) ?? null) : null;
}
