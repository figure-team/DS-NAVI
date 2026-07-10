import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import GraphWorkbench from "./GraphWorkbench";

/** 구조 그래프 섹션. */
export default function StructurePage() {
  useStructureUrlSync();
  useOverlayParam();
  return <GraphWorkbench />;
}

/**
 * ktds(메뉴 개편 2차): ?overlay=risk|diff|impact — 다른 화면(품질·위험 등)에서 딥링크로
 * 특정 오버레이를 켠 채 진입. 채널 데이터가 비동기 적재되므로 데이터 도착을 기다렸다가
 * 1회 활성 후 파라미터를 제거한다(원샷 — 새로고침 시 재강제 없음).
 */
function useOverlayParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const diffData = useDashboardStore((s) => s.diffOverlayData);
  const impactData = useDashboardStore((s) => s.impactOverlayData);
  const riskData = useDashboardStore((s) => s.riskOverlayData);

  useEffect(() => {
    const want = searchParams.get("overlay");
    if (want !== "risk" && want !== "diff" && want !== "impact") return;
    const data = want === "risk" ? riskData : want === "diff" ? diffData : impactData;
    if (!data || data.changed.length === 0) return; // 데이터 도착 대기(부재 시 no-op — 정직)
    const s = useDashboardStore.getState();
    if (!(s.overlaySource === want && s.diffMode)) s.toggleOverlay(want);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("overlay");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, diffData, impactData, riskData, setSearchParams]);
}

/**
 * P3: 구조 뷰 상태 ↔ URL 쿼리 동기화 — 공유 가능한 "이 노드 봐" 링크.
 * ?node=<id>  선택 노드
 * URL→store는 그래프 로드 완료 후 1회(setGraph가 선택을 리셋하므로), store→URL은
 * 적용 이후 replace로 미러링(히스토리 오염 없음).
 */
function useStructureUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const graph = useDashboardStore((s) => s.graph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !graph) return;
    applied.current = true;
    const s = useDashboardStore.getState();
    const node = searchParams.get("node");
    if (node && graph.nodes.some((n) => n.id === node) && s.selectedNodeId !== node) {
      s.selectNode(node);
    }
  }, [graph, searchParams]);

  useEffect(() => {
    if (!applied.current) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedNodeId) next.set("node", selectedNodeId);
        else next.delete("node");
        return next;
      },
      { replace: true },
    );
  }, [selectedNodeId, setSearchParams]);
}
