import { createBrowserRouter, Navigate } from "react-router";
import Root from "./Root";
import HomePage from "./pages/HomePage";
import StructurePage from "./pages/StructurePage";
import KnowledgePage from "./pages/KnowledgePage";
import WikiPage from "./pages/WikiPage";
import DomainsPage from "./pages/DomainsPage";
import RtmPage from "./pages/RtmPage";
import DeliverablesPage from "./pages/DeliverablesPage";

/**
 * 라우트 맵 (FRONT_REDESIGN §3) — P3: 홈 랜딩 + 도메인 하위 라우트.
 * URL이 네비게이션의 단일 진실 — store에는 viewMode가 없다.
 * 도메인: /domains(지도) → /domains/:domainId(흐름 목록, 인라인 스파인은 ?flow=).
 */
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "structure", element: <StructurePage /> },
        { path: "domains", element: <DomainsPage /> },
        { path: "domains/:domainId", element: <DomainsPage /> },
        { path: "wiki", element: <WikiPage /> },
        { path: "deliverables", element: <DeliverablesPage /> },
        { path: "rtm", element: <RtmPage /> },
        { path: "knowledge", element: <KnowledgePage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  // 데모 정적 빌드(base:"/demo/")에서도 경로가 맞도록 basename을 BASE_URL로.
  { basename: import.meta.env.BASE_URL },
);
