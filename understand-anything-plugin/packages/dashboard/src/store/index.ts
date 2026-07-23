// 대시보드 전역 스토어 — 슬라이스 조합 파사드.
//
// 병렬 워크트리 선분할(2026-07-10): 메뉴별 병렬 작업이 store 한 파일에서 충돌하지 않도록
// 소유 슬라이스로 분리했다. 규약:
//   - 각 워크트리는 "자기 슬라이스 파일"에만 필드/액션을 추가한다.
//   - graph = WT-A(구조), domain = WT-B(업무지도·정책서),
//     overlay = WT-E(변경·영향, 구조 오버레이는 A와 조율),
//     code-viewer/session/types/이 파일 = 공용(셸) — 수정 전 조율.
//   - 새 메뉴 상태가 필요하면 새 슬라이스 파일을 만들고 여기 extends/스프레드 두 줄만 추가.
// 소비자는 종전대로 `../store`(이 index)에서 import — 경로·공개 API 무변경.
//
// STRUCTURE_FROM_MAP_DESIGN v2(2026-07-14): canvas-slice(파일/클래스 KG 뷰의 필터·
// 컨테이너 펼침·ELK 레이아웃 캐시)는 그 유일한 소비처 GraphView/GraphWorkbench 완전
// 은퇴와 함께 삭제됐다 — 구조 메뉴는 이제 4뎁스 도메인 드릴다운 그래프뿐.
import { create } from "zustand";
import { createGraphSlice } from "./slices/graph-slice";
import type { GraphSlice } from "./slices/graph-slice";
import { createCodeViewerSlice } from "./slices/code-viewer-slice";
import type { CodeViewerSlice } from "./slices/code-viewer-slice";
import { createOverlaySlice } from "./slices/overlay-slice";
import type { OverlaySlice } from "./slices/overlay-slice";
import { createDomainSlice } from "./slices/domain-slice";
import type { DomainSlice } from "./slices/domain-slice";
import { createSessionSlice } from "./slices/session-slice";
import type { SessionSlice } from "./slices/session-slice";
import { createIncidentSlice } from "./slices/incident-slice";
import type { IncidentSlice } from "./slices/incident-slice";

export interface DashboardStore
  extends GraphSlice,
    CodeViewerSlice,
    OverlaySlice,
    DomainSlice,
    SessionSlice,
    IncidentSlice {}

export const useDashboardStore = create<DashboardStore>()((set, get, api) => ({
  ...createGraphSlice(set, get, api),
  ...createCodeViewerSlice(set, get, api),
  ...createOverlaySlice(set, get, api),
  ...createDomainSlice(set, get, api),
  ...createSessionSlice(set, get, api),
  ...createIncidentSlice(set, get, api),
}));

// 기존 `store.ts` 공개 API 유지 — 타입·상수는 types.ts에서 그대로 재수출.
export * from "./types";
