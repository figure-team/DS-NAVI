import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useOutletContext,
} from "react-router";
import Root from "./Root";
import type { ShellContext } from "./Root";
import LegacyDashboard from "./legacy/LegacyDashboard";
import { useDashboardStore } from "../store";

/**
 * "/" 스마트 리다이렉트 — "열자마자 도메인 지도 랜딩"(di-ds-navi-001)의 라우터 구현.
 * domain-graph 조회가 끝날 때까지 대기 후, 있으면 /domains 없으면 /structure.
 * 쿼리 파라미터(onboard= 등)는 보존한다.
 */
function IndexRedirect() {
  const { domainGraphChecked } = useOutletContext<ShellContext>();
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const location = useLocation();
  if (!domainGraphChecked) return null;
  return (
    <Navigate
      to={{ pathname: domainGraph ? "/domains" : "/structure", search: location.search }}
      replace
    />
  );
}

/**
 * 라우트 맵 (FRONT_REDESIGN §3) — P1: 상위 6개 섹션.
 * 모든 섹션이 같은 LegacyDashboard를 마운트하고 ViewModeUrlBridge가 store와 동기화한다.
 * P3에서 섹션별 페이지·하위 라우트(/domains/:domainId 등)로 분화된다.
 */
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      children: [
        { index: true, element: <IndexRedirect /> },
        { path: "structure", element: <LegacyDashboard /> },
        { path: "domains", element: <LegacyDashboard /> },
        { path: "wiki", element: <LegacyDashboard /> },
        { path: "deliverables", element: <LegacyDashboard /> },
        { path: "rtm", element: <LegacyDashboard /> },
        { path: "knowledge", element: <LegacyDashboard /> },
        { path: "*", element: <Navigate to="/structure" replace /> },
      ],
    },
  ],
  // 데모 정적 빌드(base:"/demo/")에서도 경로가 맞도록 basename을 BASE_URL로.
  { basename: import.meta.env.BASE_URL },
);
