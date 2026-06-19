// ktds-fork (ADR-003): 활성 오버레이 채널에 맞는 배지 라벨을 산출하는 공용 훅.
// diff="변경됨/영향받음", impact="변경예정/영향받음". 6개 노드 컴포넌트가 동일
// 3줄 블록을 중복하던 것을 단일 진실 공급원으로 통합 (업스트림 머지 표면 축소).
import { useI18n } from "../contexts/I18nContext";
import { useDashboardStore } from "../store";

export function useDiffLabels(): { lblChanged: string; lblAffected: string } {
  const { t } = useI18n();
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const lblChanged = overlaySource === "impact" ? t.impactToggle.seed : t.diffToggle.changed;
  const lblAffected = overlaySource === "impact" ? t.impactToggle.affected : t.diffToggle.affected;
  return { lblChanged, lblAffected };
}
