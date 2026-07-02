import { useLocation } from "react-router";
import { modeForPath } from "../app/viewModePaths";
import type { ViewMode } from "../store";

/**
 * 현재 라우트가 가리키는 뷰 모드 (FRONT_REDESIGN P2).
 * store.viewMode를 대체 — URL이 네비게이션의 단일 진실.
 * 루트("/")나 알 수 없는 경로에서는 null.
 */
export function useViewMode(): ViewMode | null {
  const { pathname } = useLocation();
  return modeForPath(pathname);
}
