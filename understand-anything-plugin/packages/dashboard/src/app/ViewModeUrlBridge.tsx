import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useDashboardStore } from "../store";
import { MODE_TO_PATH, modeForPath } from "./viewModePaths";

/**
 * P1 과도기 양방향 동기화 — URL과 store.viewMode를 서로 거울로 유지한다.
 *
 * store 내부에서 viewMode를 바꾸는 지점(도메인 자동랜딩 setDomainGraph, openWikiDoc,
 * navigateToDomain, knowledge 자동전환, MobileDrawer)을 P1에서 건드리지 않고 흡수하기
 * 위한 장치. P2에서 해당 지점들이 navigate()로 치환되면 이 컴포넌트는 제거된다.
 */
export default function ViewModeUrlBridge() {
  const location = useLocation(); // basename이 제거된 라우터 경로 (window.location 금지)
  const navigate = useNavigate();
  const viewMode = useDashboardStore((s) => s.viewMode);
  // store 변경과 경로 변경을 구분하는 가드 — 경로가 먼저 바뀐 커밋에서 이전
  // viewMode 기준으로 되돌리는 navigate(바운스)를 막는다.
  const prevMode = useRef(viewMode);

  // URL → store: 경로가 가리키는 모드와 store가 다르면 store를 맞춘다.
  useEffect(() => {
    const mode = modeForPath(location.pathname);
    if (mode && mode !== useDashboardStore.getState().viewMode) {
      useDashboardStore.getState().setViewMode(mode);
    }
  }, [location.pathname]);

  // store → URL: 내부 액션으로 viewMode가 "변한" 경우에만 경로를 따라간다.
  useEffect(() => {
    if (prevMode.current === viewMode) return;
    prevMode.current = viewMode;
    if (modeForPath(location.pathname) !== viewMode) {
      navigate(MODE_TO_PATH[viewMode]);
    }
  }, [viewMode, location.pathname, navigate]);

  return null;
}
