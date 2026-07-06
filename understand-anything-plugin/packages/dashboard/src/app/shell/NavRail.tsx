import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { ThemePicker } from "../../components/ThemePicker";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** 프로토 .grp — 이 항목 앞에 붙는 그룹 헤더(이해 / 요구 · 변경 / 정책 · 산출 · 참고) */
  group?: string;
}

interface Props {
  onShowKeyboardHelp: () => void;
}

/**
 * 좌측 NavRail (FRONT_REDESIGN §4, 시안 mockup-shell-home 정합).
 * 활성 항목 = 중립 배경(bg-elevated) + 본문색 텍스트 + 액센트 아이콘·좌측 바(시안 규칙 —
 * 액센트 틴트 배경이 아님). 하단 유틸(테마·단축키)은 시안대로 레일 하단에.
 */
export default function NavRail({ onShowKeyboardHelp }: Props) {
  const graph = useDashboardStore((s) => s.graph);
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const wikiGraph = useDashboardStore((s) => s.wikiGraph);
  const { t } = useI18n();

  // 프로토(pmpl-proto) 그룹·순서 — 이해(업무 지도·구조·데이터·화면설계서) /
  // 요구·변경(추적표·변경·영향) / 정량·보고(프로그램·품질·위험·보고서) /
  // 정책·산출·참고(정책서·산출물·문서). 메뉴 개편 2차: 신설 6메뉴 포함 전체.
  const items: NavItem[] = [{ to: "/", label: "홈", icon: iconHome }];
  if (graph && isKnowledgeGraph) {
    items.push({ to: "/knowledge", label: "지식그래프", icon: iconDomain });
  } else if (graph) {
    if (domainGraph) items.push({ to: "/domains", label: t.drawer.domain, icon: iconDomain, group: "이해" });
    items.push({
      to: "/structure",
      label: t.drawer.structural,
      icon: iconStructure,
      group: domainGraph ? undefined : "이해",
    });
    items.push({ to: "/data", label: "데이터", icon: iconData });
    items.push({ to: "/screens", label: "화면설계서", icon: iconScreens });
    items.push({ to: "/rtm", label: "추적표", icon: iconRtm, group: "요구 · 변경" });
    items.push({ to: "/change", label: "변경·영향", icon: iconChange });
    items.push({ to: "/programs", label: "프로그램", icon: iconPrograms, group: "정량 · 보고" });
    items.push({ to: "/quality", label: "품질·위험", icon: iconQuality });
    items.push({ to: "/report", label: "보고서", icon: iconReport });
    items.push({ to: "/policy", label: "정책서", icon: iconPolicy, group: "정책 · 산출 · 참고" });
    items.push({ to: "/deliverables", label: "산출물", icon: iconDocs });
    if (wikiGraph) items.push({ to: "/wiki", label: "문서", icon: iconWiki });
  }

  return (
    <nav className="w-[220px] shrink-0 h-full flex flex-col bg-surface border-r border-border-subtle px-2.5 py-3.5">
      <div className="flex items-baseline gap-1.5 px-2.5 pt-1 pb-4">
        <span className="text-[17px] font-bold text-text-primary tracking-[-0.2px]">DS-NAVI</span>
      </div>
      {items.map((item) => (
        <div key={item.to} className="contents">
          {item.group && (
            <div
              className="text-text-muted font-bold"
              style={{ fontSize: 10.5, letterSpacing: "0.08em", padding: "12px 12px 4px" }}
            >
              {item.group}
            </div>
          )}
        <NavLink
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `relative flex items-center gap-2.5 px-3 py-[9px] my-px rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-elevated text-text-primary font-semibold"
                : "font-medium text-text-secondary hover:text-text-primary hover:bg-elevated"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r bg-accent" />
              )}
              <span className={`w-[17px] h-[17px] shrink-0 ${isActive ? "text-accent" : ""}`}>
                {item.icon}
              </span>
              {item.label}
            </>
          )}
        </NavLink>
        </div>
      ))}
      <div className="flex-1" />
      {/* 하단 유틸 — 시안: border-t 위에 테마·단축키 도움말. */}
      <div className="border-t border-border-subtle pt-2 mt-2 flex flex-col gap-0.5">
        <div className="px-1.5">
          <ThemePicker />
        </div>
        <button
          type="button"
          onClick={onShowKeyboardHelp}
          className="flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
        >
          <span className="w-[16px] h-[16px] shrink-0">{iconKbd}</span>
          단축키 도움말
        </button>
      </div>
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
const iconScreens = (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="12" rx="1.8" />
    <path d="M9 20h6M12 16v4" />
    <circle cx="7" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
const iconWiki = (
  <svg {...svgProps}>
    <path d="M4 5a2.5 2.5 0 0 1 2.5-2.5H20V19H6.5A2.5 2.5 0 0 0 4 21.5z" />
    <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
  </svg>
);
// 신설 6메뉴 아이콘 — pmpl-proto nav SVG 그대로.
const iconData = (
  <svg {...svgProps}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
    <path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
  </svg>
);
const iconChange = (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v6M12 15v6M5 6l4.5 3.5M19 6l-4.5 3.5M5 18l4.5-3.5M19 18l-4.5-3.5" />
  </svg>
);
const iconPrograms = (
  <svg {...svgProps}>
    <path d="M4 4h16v5H4zM4 15h7v5H4zM15 15h5v5h-5z" />
  </svg>
);
const iconQuality = (
  <svg {...svgProps}>
    <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" />
    <path d="M9 12l2 2 4-4.5" />
  </svg>
);
const iconReport = (
  <svg {...svgProps}>
    <path d="M5 21V10M12 21V4M19 21v-7" />
  </svg>
);
const iconPolicy = (
  <svg {...svgProps}>
    <path d="M6 3h12v18l-6-3.5L6 21z" />
    <path d="M9.5 9.5h5M9.5 13h3.5" />
  </svg>
);
const iconKbd = (
  <svg {...svgProps}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
  </svg>
);
