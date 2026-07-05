import { RouterProvider } from "react-router";
import { router } from "./app/routes";

/**
 * FRONT_REDESIGN: App은 라우터 진입점. 토큰 가드·데이터 로딩은 app/Root.tsx,
 * 셸(NavRail/TopBar/전역 레이어)은 app/shell/, 섹션 화면은 app/pages/.
 */
function App() {
  return <RouterProvider router={router} />;
}

export default App;
