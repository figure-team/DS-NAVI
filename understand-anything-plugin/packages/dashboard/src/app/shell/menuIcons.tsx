import type { ReactNode } from "react";

/**
 * 메뉴 아이콘 단일 소스 — NavRail(좌측 레일)과 TopBar(상단 섹션 아이콘)가 공유한다.
 * 구 NavRail 지역 상수에서 추출(2026-07-15, TopBar 섹션 아이콘 도입).
 */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  className: "w-full h-full",
} as const;

export const iconHome = (
  <svg {...svgProps}>
    <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />
  </svg>
);
export const iconDomain = (
  <svg {...svgProps}>
    <circle cx="7" cy="7" r="3.2" />
    <circle cx="17" cy="7" r="3.2" />
    <circle cx="12" cy="17" r="3.2" />
    <path d="M9 9.5 11 14M15 9.5 13 14" />
  </svg>
);
export const iconRtm = (
  <svg {...svgProps}>
    <path d="M4 5h16M4 12h16M4 19h10" />
    <circle cx="19" cy="19" r="2.4" />
  </svg>
);
export const iconDocs = (
  <svg {...svgProps}>
    <path d="M6 2.5h9L20 8v13.5H6zM14.5 3v5.5H20" />
    <path d="M9 13h7M9 17h5" />
  </svg>
);
export const iconScreens = (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="12" rx="1.8" />
    <path d="M9 20h6M12 16v4" />
    <circle cx="7" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
// 신설 6메뉴 아이콘 — pmpl-proto nav SVG 그대로.
export const iconData = (
  <svg {...svgProps}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
    <path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
  </svg>
);
export const iconChange = (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v6M12 15v6M5 6l4.5 3.5M19 6l-4.5 3.5M5 18l4.5-3.5M19 18l-4.5-3.5" />
  </svg>
);
export const iconPrograms = (
  <svg {...svgProps}>
    <path d="M4 4h16v5H4zM4 15h7v5H4zM15 15h5v5h-5z" />
  </svg>
);
export const iconQuality = (
  <svg {...svgProps}>
    <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" />
    <path d="M9 12l2 2 4-4.5" />
  </svg>
);
export const iconReport = (
  <svg {...svgProps}>
    <path d="M5 21V10M12 21V4M19 21v-7" />
  </svg>
);
export const iconPolicy = (
  <svg {...svgProps}>
    <path d="M6 3h12v18l-6-3.5L6 21z" />
    <path d="M9.5 9.5h5M9.5 13h3.5" />
  </svg>
);
export const iconKbd = (
  <svg {...svgProps}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
  </svg>
);

/**
 * 현재 섹션(useViewMode 값)에 맞는 아이콘 — TopBar 좌측 섹션 아이콘용.
 * 구조 탭(structural)은 업무 지도 소속이라 도메인 아이콘을 승계. 미매핑/홈은 iconHome.
 */
export function iconForMode(mode: string | null | undefined): ReactNode {
  switch (mode) {
    case "domain":
      return iconDomain;
    case "data":
      return iconData;
    case "screenspec":
      return iconScreens;
    case "rtm":
      return iconRtm;
    case "change":
      return iconChange;
    case "programs":
      return iconPrograms;
    case "quality":
      return iconQuality;
    case "report":
      return iconReport;
    case "policy":
      return iconPolicy;
    case "docs":
      return iconDocs;
    default:
      return iconHome;
  }
}
