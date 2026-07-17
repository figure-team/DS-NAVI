import { useMemo } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { buildDomainCards } from "../utils/domainData";
import { parseBusinessFlows } from "../utils/businessFlow";
import { resolveGroups, buildGroupCards } from "../utils/domainGroups";
import TopBarSlot from "../app/shell/TopBarSlot";
import InfoPopover, { type InfoRow } from "./InfoPopover";

/**
 * 업무 지도 정보 팝오버(ⓘ) — 시스템 구성도(/domains 랜딩)와 구조 탭(/structure) 공통.
 * 두 페이지가 각각 렌더해 탭을 오가도 TopBar ⓘ 가 유지된다(2026-07-15, 구조 탭에서
 * 사라지던 문제 해소 — 카운트 계산 소스는 domainGraph 로 단일).
 *
 * 도메인·업무·기능 총계. 그룹(상위도메인)이 있으면 상위/하위도메인 분해로 표기.
 */
export default function WorkMapInfoPopover() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const domainGroupsRaw = useDashboardStore((s) => s.domainGroups);
  const { t } = useI18n();

  const data = useMemo(
    () => (domainGraph ? buildDomainCards(domainGraph) : null),
    [domainGraph],
  );

  // 도메인별 업무(businessFlows) 수 — 총계와 그룹 카드 양쪽에 쓴다.
  const workCountByDomain = useMemo(() => {
    const m = new Map<string, number>();
    if (domainGraph) {
      for (const n of domainGraph.nodes) {
        if (n.type === "domain") m.set(n.id, parseBusinessFlows(n).length);
      }
    }
    return m;
  }, [domainGraph]);

  const totalWorks = useMemo(
    () => [...workCountByDomain.values()].reduce((s, n) => s + n, 0),
    [workCountByDomain],
  );

  const groupCards = useMemo(() => {
    if (!domainGraph || !data) return [];
    const resolved = resolveGroups(domainGraph, domainGroupsRaw, t.domainMap.unclassified);
    return buildGroupCards(resolved, data.cards, workCountByDomain);
  }, [domainGraph, domainGroupsRaw, data, workCountByDomain, t]);

  if (!domainGraph || !data) return null;

  const rows: InfoRow[] =
    groupCards.length > 0
      ? [
          { label: "상위도메인", value: `${groupCards.length}개` },
          { label: "하위 도메인", value: `${groupCards.reduce((s, g) => s + g.subDomainCount, 0)}개` },
          { label: "업무", value: `${totalWorks}개` },
          { label: "기능", value: `${data.stats.flowCount}개` },
        ]
      : [
          { label: "도메인", value: `${data.stats.domainCount}개` },
          { label: "업무", value: `${totalWorks}개` },
          { label: "기능", value: `${data.stats.flowCount}개` },
        ];

  return (
    <TopBarSlot>
      <InfoPopover title="도메인 정보" rows={rows} />
    </TopBarSlot>
  );
}
