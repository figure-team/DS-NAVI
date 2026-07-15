import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { ThemePicker } from "../../components/ThemePicker";
import {
  iconHome,
  iconDomain,
  iconData,
  iconScreens,
  iconRtm,
  iconChange,
  iconPrograms,
  iconQuality,
  iconReport,
  iconPolicy,
  iconDocs,
  iconKbd,
} from "./menuIcons";

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
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const { t } = useI18n();

  // 프로토(pmpl-proto) 그룹·순서 — 이해(업무 지도[구성도+구조 탭]·데이터·화면설계서) /
  // 요구·변경(추적표·변경·영향) / 정량·보고(프로그램·품질·위험·보고서) /
  // 정책·산출(정책서·산출물). 라우트 통일(2026-07-15): 구조는 /domains?tab=structure 탭이라
  // /domains 항목이 자연히 활성(forceActive 핵 제거).
  const items: NavItem[] = [{ to: "/", label: "홈", icon: iconHome }];
  if (graph) {
    if (domainGraph) items.push({ to: "/domains", label: t.drawer.domain, icon: iconDomain, group: "이해" });
    items.push({ to: "/data", label: "데이터", icon: iconData, group: domainGraph ? undefined : "이해" });
    items.push({ to: "/screens", label: "화면설계서", icon: iconScreens });
    items.push({ to: "/rtm", label: "추적표", icon: iconRtm, group: "요구 · 변경" });
    items.push({ to: "/change", label: "변경·영향", icon: iconChange });
    items.push({ to: "/programs", label: "프로그램", icon: iconPrograms, group: "정량 · 보고" });
    items.push({ to: "/quality", label: "품질·위험", icon: iconQuality });
    items.push({ to: "/report", label: "보고서", icon: iconReport });
    items.push({ to: "/policy", label: "정책서", icon: iconPolicy, group: "정책 · 산출" });
    items.push({ to: "/deliverables", label: "산출물", icon: iconDocs });
  }

  return (
    <nav className="w-[220px] shrink-0 h-full flex flex-col bg-surface border-r border-border-subtle px-2.5 py-3.5">
      <div className="flex items-baseline gap-1.5 px-2.5 pt-1 pb-4">
        <span className="text-[17px] font-bold text-text-primary tracking-[-0.2px]">DS-NAVI</span>
      </div>
      {items.map((item) => {
        return (
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
              {(isActive) && (
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
        );
      })}
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
