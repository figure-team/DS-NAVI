// Shared layer color palette — used by LayerClusterNode, PortalNode, ContainerNode, GraphView.
// (구 LayerLegend 헤더 스트립 — "N 레이어 + 레이어별 노드 수" — 은 브레드크럼·개요
// 카드와 중복 정보라 2026-07-11 사용자 결정으로 제거. 팔레트 모듈만 남김.)
export const LAYER_PALETTE = [
  { bg: "rgba(74, 124, 155, 0.12)", border: "rgba(74, 124, 155, 0.4)", label: "#4a7c9b" },   // blue (API)
  { bg: "rgba(90, 158, 111, 0.12)", border: "rgba(90, 158, 111, 0.4)", label: "#5a9e6f" },   // green (Data)
  { bg: "rgba(139, 111, 176, 0.12)", border: "rgba(139, 111, 176, 0.4)", label: "#8b6fb0" }, // purple (Service)
  { bg: "rgba(201, 160, 108, 0.12)", border: "rgba(201, 160, 108, 0.4)", label: "#c9a06c" }, // gold (Config)
  { bg: "rgba(176, 122, 138, 0.12)", border: "rgba(176, 122, 138, 0.4)", label: "#b07a8a" }, // pink (UI)
  { bg: "rgba(74, 155, 140, 0.12)", border: "rgba(74, 155, 140, 0.4)", label: "#4a9b8c" },   // teal (Middleware)
  { bg: "rgba(120, 130, 145, 0.12)", border: "rgba(120, 130, 145, 0.4)", label: "#788291" }, // slate (Test)
];

export function getLayerColor(index: number) {
  return LAYER_PALETTE[index % LAYER_PALETTE.length];
}
