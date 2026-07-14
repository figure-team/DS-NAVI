import { useEffect, useState } from "react";
import { useDashboardStore } from "../store";
import { DEMO_MODE } from "../shared/api/client";
import { parseCrossDomainGraph, type CrossDomainEdge } from "../utils/structureGraph";

/**
 * STRUCTURE_FROM_MAP_DESIGN §5 — domain-map.json(crossDomain) 로드.
 * `.spec/map/` 산출 화이트리스트 서빙(vite.config.ts SPEC_MAP_ENDPOINTS)을 다른
 * 신설 메뉴(DataMapView 등)와 동일한 패턴으로 사용 — Root.tsx 의 domain-graph.json
 * 중앙 로드와 별개(그룹/뎁스1·2 전용 부가 데이터라 구조 페이지 소비 시점에만 fetch).
 *
 * 반환: undefined = 로딩 전, null = 404/형태 불일치(그래프 없이 노드만 — degrade),
 * 배열 = 로드 완료(그룹 없으면 정상 0건도 가능).
 */
export function useCrossDomainGraph(): CrossDomainEdge[] | null | undefined {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const [edges, setEdges] = useState<CrossDomainEdge[] | null | undefined>(undefined);

  useEffect(() => {
    if (accessToken === null && !DEMO_MODE) return; // 토큰 동기화 전 — transient 403 방지.
    let cancelled = false;
    const dataBase = import.meta.env.BASE_URL;
    const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
    fetch(`${dataBase}domain-map.json${tokenQ}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        setEdges(parseCrossDomainGraph(data));
      })
      .catch(() => {
        if (!cancelled) setEdges(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return edges;
}
