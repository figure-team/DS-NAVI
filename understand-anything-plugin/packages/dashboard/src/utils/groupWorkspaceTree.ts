import type { BizProcess } from "./businessFlow";

/**
 * 업무 지도 그룹 워크스페이스 — 좌측 3단(서브도메인 목록 | 업무 프로세스 목록 | 순서도)을
 * 서브도메인▸업무흐름도 2레벨 트리 1단으로 통합(사용자 요구, 2026-07-14). 이 파일은
 * 트리 구성/검색의 순수 로직만 담는다(React 없음, GroupWorkspaceView 가 렌더).
 *
 * 리프(흐름) 1건 = 그 서브도메인의 businessFlows[] 프로세스 1건, 또는(프로세스가
 * 전무하지만 기능은 있으면) 결정론 순차 근사 1건(FlowListView/StructureDepth3View 와
 * 동일 폴백 관례 — bfIndex=null 로 구분, URL 에는 ?bf= 를 싣지 않는다).
 */

export interface TreeFlowItem {
  /** React key + 검색/활성 매칭용 안정 식별자. */
  key: string;
  domainId: string;
  /** null = 순차 근사 폴백(단일 항목, ?bf= 미부여 — FlowListView 기본값 0과 동치). */
  bfIndex: number | null;
  title: string;
}

export interface TreeDomainNode {
  id: string;
  name: string;
  icon: string;
  flowCount: number;
  items: TreeFlowItem[];
}

/**
 * BizProcess[] + "기능은 있는가"를 트리 리프 목록으로 변환. 프로세스가 1건 이상이면
 * 그대로(제목 없으면 labels.defaultTitle 로 순번 라벨), 전무하지만 기능은 있으면
 * 순차 근사 1건, 기능도 없으면 빈 배열(트리에서 펼칠 것이 없음).
 */
export function buildTreeFlowItems(
  domainId: string,
  processes: BizProcess[],
  hasAnyFlow: boolean,
  labels: { defaultTitle: (n: number) => string; fallbackTitle: string },
): TreeFlowItem[] {
  if (processes.length > 0) {
    return processes.map((p) => ({
      key: `${domainId}::${p.index}`,
      domainId,
      bfIndex: p.index,
      title: p.title ?? labels.defaultTitle(p.index + 1),
    }));
  }
  if (hasAnyFlow) {
    return [{ key: `${domainId}::fallback`, domainId, bfIndex: null, title: labels.fallbackTitle }];
  }
  return [];
}

/** 선택된 프로세스 인덱스(클램프 완료, FlowListView 의 bfIdx 계산과 동일 규칙)로 활성 리프 key 를 만든다. */
export function activeLeafKey(domainId: string, hasRealProcesses: boolean, clampedBfIndex: number): string {
  return hasRealProcesses ? `${domainId}::${clampedBfIndex}` : `${domainId}::fallback`;
}

/** 검색 매칭 — 도메인명 또는 하위 흐름 제목 부분일치(NFC 정규화, 대소문자 무시). 빈 질의는 항상 매치. */
export function matchesTreeQuery(domainName: string, items: TreeFlowItem[], query: string): boolean {
  const q = query.trim().normalize("NFC").toLowerCase();
  if (!q) return true;
  if (domainName.normalize("NFC").toLowerCase().includes(q)) return true;
  return items.some((it) => it.title.normalize("NFC").toLowerCase().includes(q));
}

/** 트리 필터 — 매칭되는 도메인만 남긴다(순서 보존). */
export function filterTreeDomains(domains: TreeDomainNode[], query: string): TreeDomainNode[] {
  return domains.filter((d) => matchesTreeQuery(d.name, d.items, query));
}
