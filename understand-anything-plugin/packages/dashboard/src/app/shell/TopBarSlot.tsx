import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 전역 TopBar 슬롯 DOM id 2종.
 * - info(왼쪽, 섹션명 옆): 정보 팝오버(ⓘ)·칩 등 "이 화면이 뭔지" 메타.
 * - actions(오른쪽, 옴니박스 앞): 기능 버튼 툴바 — 기존 PageHead 의 meta|actions 구조 계승.
 */
export const TOPBAR_SLOT_ID = "topbar-slot";
export const TOPBAR_ACTIONS_SLOT_ID = "topbar-actions-slot";

type SlotName = "info" | "actions";
const SLOT_ID: Record<SlotName, string> = {
  info: TOPBAR_SLOT_ID,
  actions: TOPBAR_ACTIONS_SLOT_ID,
};

/**
 * 페이지별 메타/액션을 전역 TopBar 슬롯으로 텔레포트한다
 * (2026-07-15, 메뉴별 페이지 헤더 → TopBar 이관). slot 기본값 "info"(왼쪽).
 *
 * TopBar 는 Outlet(페이지)보다 먼저 마운트되므로 슬롯 DOM 은 페이지 렌더 시점에
 * 항상 존재하지만, 최초 마운트 순서를 타지 않도록 effect 로 엘리먼트를 잡은 뒤 렌더한다.
 * 페이지가 언마운트되면 포털도 함께 사라지므로 슬롯이 자동으로 비워진다.
 */
export default function TopBarSlot({
  children,
  slot = "info",
}: {
  children: React.ReactNode;
  slot?: SlotName;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById(SLOT_ID[slot]));
    return () => setEl(null);
  }, [slot]);
  return el ? createPortal(children, el) : null;
}
