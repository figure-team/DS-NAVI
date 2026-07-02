import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * 좌측 NavRail (FRONT_REDESIGN §4) — 현행 상단 탭 5개를 대체하는 섹션 내비게이션.
 * P1: 다크 테마 토큰 그대로 사용(라이트 전환은 P4), 표시 조건은 기존 탭 그룹과 동일.
 */
export default function NavRail() {
  const graph = useDashboardStore((s) => s.graph);
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const wikiGraph = useDashboardStore((s) => s.wikiGraph);
  const { t } = useI18n();

  const items: NavItem[] = [{ to: "/", label: "홈", icon: iconHome }];
  if (graph && isKnowledgeGraph) {
    items.push({ to: "/knowledge", label: "지식그래프", icon: iconDomain });
  } else if (graph) {
    if (domainGraph) items.push({ to: "/domains", label: t.drawer.domain, icon: iconDomain });
    items.push({ to: "/structure", label: t.drawer.structural, icon: iconStructure });
    items.push({ to: "/rtm", label: "추적표", icon: iconRtm });
    items.push({ to: "/deliverables", label: "산출물", icon: iconDocs });
    if (wikiGraph) items.push({ to: "/wiki", label: "문서", icon: iconWiki });
  }

  return (
    <nav className="w-[200px] shrink-0 h-full flex flex-col bg-surface border-r border-border-subtle px-2.5 py-3.5">
      <div className="flex items-baseline gap-1.5 px-2.5 pb-4">
        <span className="font-heading font-bold text-base text-text-primary tracking-wide">DS-NAVI</span>
      </div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `relative flex items-center gap-2.5 px-3 py-2 my-px rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-text-primary hover:bg-elevated"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r bg-accent" />
              )}
              <span className="w-[17px] h-[17px] shrink-0">{item.icon}</span>
              {item.label}
            </>
          )}
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
const iconWiki = (
  <svg {...svgProps}>
    <path d="M4 5a2.5 2.5 0 0 1 2.5-2.5H20V19H6.5A2.5 2.5 0 0 0 4 21.5z" />
    <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
  </svg>
);
