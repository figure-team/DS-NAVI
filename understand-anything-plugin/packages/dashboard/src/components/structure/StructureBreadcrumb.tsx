import { useNavigate } from "react-router";
import { useI18n } from "../../contexts/I18nContext";

export interface StructureCrumb {
  label: string;
  href: string | null; // null = 현재 위치(링크 없음)
}

/** 구조 메뉴 공용 브레드크럼 — 노드 클릭(하향)과 대칭인 상향 내비(설계 §4). */
export default function StructureBreadcrumb({ crumbs }: { crumbs: StructureCrumb[] }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <nav
      className="shrink-0 flex items-center flex-wrap border-b border-border-subtle bg-panel"
      style={{ padding: "9px 20px", gap: 6, fontSize: 12.5 }}
      aria-label={t.structure.breadcrumbLabel}
    >
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center" style={{ gap: 6 }}>
          {i > 0 && <span className="text-text-muted" aria-hidden>›</span>}
          {c.href ? (
            <button
              type="button"
              onClick={() => navigate(c.href!)}
              className="text-text-muted hover:text-accent transition-colors cursor-pointer font-semibold"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-text-primary font-semibold">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
