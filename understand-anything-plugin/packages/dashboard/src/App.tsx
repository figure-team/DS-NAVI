import { RouterProvider } from "react-router";
import { router } from "./app/routes";

/**
 * P1(FRONT_REDESIGN): 995줄 모놀리스였던 App은 라우터 진입점으로 축소.
 * 토큰 가드·데이터 로딩·셸은 app/Root.tsx, 레거시 화면 본체는 app/legacy/LegacyDashboard.tsx.
 */
function App() {
  return <RouterProvider router={router} />;
}

export default App;
