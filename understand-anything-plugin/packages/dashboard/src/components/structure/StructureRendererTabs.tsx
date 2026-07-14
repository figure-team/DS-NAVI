import { useI18n } from "../../contexts/I18nContext";
import type { StructureRenderer } from "../../utils/structureGraph";

/**
 * 뎁스1·2 전용 렌더러 탭 — "카드형"(기존) vs "그래프형(U-A)"(신규, 은퇴한 구 U-A KG
 * 뷰 시각 언어 재적용). 사용자가 스크린샷으로 비교해 하나를 택할 임시 A/B 탭 —
 * URL(`?renderer=`)이 진실이라 새로고침/공유 링크에도 선택이 보존된다.
 */
export default function StructureRendererTabs({
  renderer,
  onChange,
}: {
  renderer: StructureRenderer;
  onChange: (renderer: StructureRenderer) => void;
}) {
  const { t } = useI18n();
  const tabs: { key: StructureRenderer; label: string }[] = [
    { key: "card", label: t.structure.rendererCard },
    { key: "ua", label: t.structure.rendererGraph },
  ];
  return (
    <div
      role="tablist"
      aria-label={t.structure.rendererTabsLabel}
      className="flex items-center rounded-md bg-elevated"
      style={{ padding: 2, gap: 2 }}
    >
      {tabs.map((tab) => {
        const active = renderer === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`rounded transition-colors cursor-pointer font-medium ${
              active ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ padding: "3px 10px", fontSize: 11.5 }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
