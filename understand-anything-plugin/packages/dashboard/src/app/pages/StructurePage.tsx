import { Navigate, useSearchParams } from "react-router";

/**
 * 라우트 통일(2026-07-15): 구조는 별도 라우트가 아니라 업무 지도 메뉴의 탭
 * (`/domains?tab=structure`)이다. 이 컴포넌트는 구 `/structure...` 딥링크/북마크를
 * 쿼리스트링을 보존해 새 경로로 넘기는 리다이렉트만 담당한다(본문은 StructureTab).
 */
export default function StructurePage() {
  const [sp] = useSearchParams();
  const qs = sp.toString();
  return <Navigate to={`/domains?tab=structure${qs ? `&${qs}` : ""}`} replace />;
}
