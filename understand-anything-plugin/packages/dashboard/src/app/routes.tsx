import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useOutletContext,
} from "react-router";
import Root from "./Root";
import type { ShellContext } from "./Root";
import StructurePage from "./pages/StructurePage";
import KnowledgePage from "./pages/KnowledgePage";
import WikiPage from "./pages/WikiPage";
import DomainsPage from "./pages/DomainsPage";
import RtmPage from "./pages/RtmPage";
import DeliverablesPage from "./pages/DeliverablesPage";
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
 * 라우트 맵 (FRONT_REDESIGN §3) — P2: 섹션별 페이지 컴포넌트.
 * URL이 네비게이션의 단일 진실 — store에는 viewMode가 없다.
 * P3에서 하위 라우트(/domains/:domainId 등)로 분화된다.
 */
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      children: [
        { index: true, element: <IndexRedirect /> },
        { path: "structure", element: <StructurePage /> },
        { path: "domains", element: <DomainsPage /> },
        { path: "wiki", element: <WikiPage /> },
        { path: "deliverables", element: <DeliverablesPage /> },
        { path: "rtm", element: <RtmPage /> },
        { path: "knowledge", element: <KnowledgePage /> },
        { path: "*", element: <Navigate to="/structure" replace /> },
      ],
    },
  ],
  // 데모 정적 빌드(base:"/demo/")에서도 경로가 맞도록 basename을 BASE_URL로.
  { basename: import.meta.env.BASE_URL },
);
