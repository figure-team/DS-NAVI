import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";

/**
 * 모바일 하단 섹션 탭바 (FRONT_REDESIGN §4 "NavRail이 하단 탭바로") —
 * 구 MobileBottomNav(그래프/정보/파일 콘텐츠 탭) 대체. 콘텐츠 탭은 GraphWorkbench가
 * 자체 처리하고, 여기는 NavRail과 동일한 섹션 내비게이션만 담당한다.
 */
export default function MobileTabBar() {
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const { t } = useI18n();

  const items: Array<{ to: string; label: string; icon: ReactNode }> = [
    { to: "/", label: "홈", icon: iconHome },
  ];
  if (graph) {
    if (domainGraph) items.push({ to: "/domains", label: t.drawer.domain, icon: iconDomain });
    items.push({ to: "/structure", label: t.drawer.structural, icon: iconStructure });
    items.push({ to: "/rtm", label: "추적표", icon: iconRtm });
    items.push({ to: "/deliverables", label: "산출물", icon: iconDocs });
  }

  return (
    <nav
      className="shrink-0 flex bg-surface border-t border-border-subtle"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              isActive ? "text-accent" : "text-text-muted"
            }`
          }
        >
          <span className="w-[19px] h-[19px]">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  className: "w-full h-full",
} as const;

const iconHome = (
  <svg {...svgProps}>
    <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />
  </svg>
);
const iconDomain = (
  <svg {...svgProps}>
    <circle cx="7" cy="7" r="3.2" />
    <circle cx="17" cy="7" r="3.2" />
    <circle cx="12" cy="17" r="3.2" />
    <path d="M9 9.5 11 14M15 9.5 13 14" />
  </svg>
);
const iconStructure = (
  <svg {...svgProps}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
    <path d="M6.5 10v2.5h5.5M17.5 10v2.5h-5.5" />
  </svg>
);
const iconRtm = (
  <svg {...svgProps}>
    <path d="M4 5h16M4 12h16M4 19h10" />
    <circle cx="19" cy="19" r="2.4" />
  </svg>
);
const iconDocs = (
  <svg {...svgProps}>
    <path d="M6 2.5h9L20 8v13.5H6zM14.5 3v5.5H20" />
    <path d="M9 13h7M9 17h5" />
  </svg>
);
