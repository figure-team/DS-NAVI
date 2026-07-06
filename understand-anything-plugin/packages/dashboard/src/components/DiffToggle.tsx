import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

// ktds: 오버레이 3채널 토글 — Diff(실측: git 변경, /understand-review·understand-diff)
// + 영향도(예측: /understand-impact) + 위험(정적 품질: risk-report 등급 상/중).
// 동시 표시 없음(store.toggleOverlay가 배타 전환).
export default function DiffToggle() {
  const diffMode = useDashboardStore((s) => s.diffMode);
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const diffData = useDashboardStore((s) => s.diffOverlayData);
  const impactData = useDashboardStore((s) => s.impactOverlayData);
  const riskData = useDashboardStore((s) => s.riskOverlayData);
  const toggleOverlay = useDashboardStore((s) => s.toggleOverlay);
  const { t } = useI18n();

  const channels = [
    {
      source: "diff" as const,
      label: "Diff",
      data: diffData,
      legend: { changed: t.diffToggle.changed, affected: t.diffToggle.affected },
      titles: t.diffToggle,
    },
    {
      source: "impact" as const,
      label: t.impactToggle.label,
      data: impactData,
      legend: { changed: t.impactToggle.seed, affected: t.impactToggle.affected },
      titles: t.impactToggle,
    },
    {
      source: "risk" as const,
      label: "위험",
      data: riskData,
      legend: { changed: "등급 상", affected: "등급 중" },
      titles: {
        showOverlay: "위험 오버레이 표시 (r)",
        hideOverlay: "위험 오버레이 숨김 (r)",
        noData: "위험 데이터 없음 — risk-report 미생성",
      },
    },
  ];

  const active = channels.find((c) => c.source === overlaySource && diffMode);

  return (
    <div className="flex items-center gap-2">
      {channels.map((c) => {
        const hasData = (c.data?.changed.length ?? 0) > 0;
        const isOn = diffMode && overlaySource === c.source;
        return (
          <button
            key={c.source}
            onClick={() => toggleOverlay(c.source)}
            disabled={!hasData}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              isOn
                ? "bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]"
                : hasData
                  ? "bg-elevated text-text-secondary hover:bg-surface"
                  : "bg-elevated text-text-muted cursor-not-allowed"
            }`}
            title={hasData ? (isOn ? c.titles.hideOverlay : c.titles.showOverlay) : c.titles.noData}
          >
            {c.label} {isOn ? "ON" : "OFF"}
          </button>
        );
      })}

      {active && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-diff-changed)" }}
            />
            <span className="text-text-secondary text-[11px]">
              {active.legend.changed}
              <span className="text-text-muted ml-0.5">({active.data!.changed.length})</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-diff-affected)" }}
            />
            <span className="text-text-secondary text-[11px]">
              {active.legend.affected}
              <span className="text-text-muted ml-0.5">({active.data!.affected.length})</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
