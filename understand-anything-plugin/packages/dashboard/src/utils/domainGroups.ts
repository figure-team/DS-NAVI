import type { KnowledgeGraph } from "@understand-anything/core/types";
import { domainColor, domainIcon, type DomainCard } from "./domainData";

/**
 * 도메인 계층(DOMAIN_HIERARCHY_DESIGN §7) 대시보드 데이터 계층 — 상단도메인
 * (그룹) → 서브도메인(결정론 도메인) 오버레이. 순수 함수만(React/@xyflow 없음),
 * emit 이 additive 로 내보낸 `ktdsMap.groups` 를 방어적으로 파싱한다.
 *
 * 그룹 부재/빈 배열은 이 파일의 모든 함수가 "빈 결과"를 반환하도록 설계돼 있어,
 * 호출측(DomainMapView/DomainsPage)이 groups.length === 0 을 기존 평면 렌더의
 * 유일한 분기점으로 쓸 수 있다(회귀 0, D2/D3/§8).
 */

/** plan.groups 를 그대로 투영한 원본 형태(emit.ts ConfirmedGroup 과 대응). */
export interface DomainGroup {
  /** `g:` 접두 네임스페이스 — 도메인 key 공간과 분리(불변 규칙 3). */
  key: string;
  name: string;
  /** 도메인 key(= domainKeyFromId 결과), 사전순. */
  memberKeys: string[];
}

/**
 * `domain-graph.json` 의 raw `ktdsMap` 필드를 방어적으로 파싱한다(core 의
 * validateGraph 는 이 필드를 모른다 — passthrough 가 아니라서 zod 파싱 후 유실되므로,
 * 호출측은 검증 *전* raw fetch 결과에서 이 함수를 호출해야 한다). 알 수 없는 형태·
 * 불변 규칙 위반 항목은 조용히 걸러낸다(스키마는 사람 게이트를 이미 거쳤지만,
 * 구버전 산출물·수동 편집 JSON 에 대한 방어).
 */
export function parseDomainGroups(rawKtdsMap: unknown): DomainGroup[] {
  if (!rawKtdsMap || typeof rawKtdsMap !== "object") return [];
  const groups = (rawKtdsMap as Record<string, unknown>).groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g): DomainGroup | null => {
      const o = g as Record<string, unknown>;
      if (typeof o.key !== "string" || !o.key.startsWith("g:")) return null;
      if (typeof o.name !== "string" || o.name.length === 0) return null;
      if (!Array.isArray(o.memberKeys)) return null;
      const memberKeys = o.memberKeys.filter((m): m is string => typeof m === "string");
      if (memberKeys.length === 0) return null; // 불변 규칙 5 — 빈 그룹 금지.
      return { key: o.key, name: o.name, memberKeys };
    })
    .filter((g): g is DomainGroup => g !== null);
}

/** 그래프에 실존하는 서브도메인으로 좁혀진 그룹(랜딩 카드 + 워크스페이스 내비 공통 소스). */
export interface ResolvedGroup {
  key: string;
  name: string;
  /** 실존 도메인 노드 id("domain:<key>") — memberKeys 순서 보존. */
  memberDomainIds: string[];
  /** 미분류(합성) 그룹 — 실제 plan 그룹이 아니라 대시보드가 조립한 그룹. */
  isUnclassified: boolean;
}

const UNCLASSIFIED_KEY = "g:__unclassified";

/**
 * DomainGroup[] 을 그래프의 실제 도메인 노드에 대조해 좁히고, 어느 그룹에도
 * 속하지 않은 도메인을 "미분류" 합성 그룹으로 묶는다(설계 §7 — 미소속 도메인은
 * 카드 1장으로). 그룹 배열이 비어 있으면(=그룹 없는 프로젝트) 빈 배열을 반환한다
 * — 호출측이 이 경우 완전히 평면 렌더로 폴백해야 한다(D2 폴백 규약).
 */
export function resolveGroups(
  graph: KnowledgeGraph,
  groups: DomainGroup[],
  unclassifiedName: string,
): ResolvedGroup[] {
  if (groups.length === 0) return [];
  const domainIds = graph.nodes.filter((n) => n.type === "domain").map((n) => n.id);
  const domainIdSet = new Set(domainIds);
  const claimed = new Set<string>();

  const resolved: ResolvedGroup[] = groups
    .map((g): ResolvedGroup => {
      const memberDomainIds = g.memberKeys
        .map((k) => `domain:${k}`)
        .filter((id) => domainIdSet.has(id));
      for (const id of memberDomainIds) claimed.add(id);
      return { key: g.key, name: g.name, memberDomainIds, isUnclassified: false };
    })
    .filter((g) => g.memberDomainIds.length > 0);

  const unclassifiedIds = domainIds.filter((id) => !claimed.has(id));
  if (unclassifiedIds.length > 0) {
    resolved.push({
      key: UNCLASSIFIED_KEY,
      name: unclassifiedName,
      memberDomainIds: unclassifiedIds,
      isUnclassified: true,
    });
  }
  return resolved;
}

/** 그룹 워크스페이스 좌측 내비 한 행 — 기존 DomainCard 에서 표시에 필요한 부분만. */
export interface GroupMember {
  id: string;
  name: string;
  icon: string;
  flowCount: number;
  filled: boolean;
}

/** ResolvedGroup + 카드 데이터 → 워크스페이스 좌측 내비 목록(memberDomainIds 순서 보존). */
export function buildGroupMembers(group: ResolvedGroup, cards: DomainCard[]): GroupMember[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return group.memberDomainIds
    .map((id) => byId.get(id))
    .filter((c): c is DomainCard => c !== undefined)
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, flowCount: c.flowCount, filled: c.filled }));
}

/** 랜딩 상단도메인 카드 — 소속 서브도메인 집계(D2). */
export interface GroupCard {
  key: string;
  name: string;
  icon: string;
  color: string;
  isUnclassified: boolean;
  subDomainCount: number;
  flowCount: number;
  workCount: number;
  filled: boolean;
  groundedPct: number | null;
  groundedCount: number;
  reviewCount: number;
  /** 대표 서브도메인 칩(id+name) — memberDomainIds 순서(사전순) 상위 N, 클릭 시 해당
   * 서브도메인으로 직행(딥링크)한다. */
  memberChips: { id: string; name: string }[];
  /** 칩에 표시되지 않은 나머지 서브도메인 수. */
  moreCount: number;
}

const CHIP_TOP_N = 4;

/**
 * 랜딩 카드 집계 — buildDomainCards(기존)의 cards + processesByDomain(업무 수)를
 * 그룹 단위로 합산한다. 근거율은 grounded/review 합산 후 재계산(도메인별 pct 평균이
 * 아니라 claim 단위 가중 평균 — 소규모 도메인의 편향 방지).
 */
export function buildGroupCards(
  groups: ResolvedGroup[],
  cards: DomainCard[],
  workCountByDomain: Map<string, number>,
): GroupCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return groups.map((g): GroupCard => {
    const members = g.memberDomainIds
      .map((id) => byId.get(id))
      .filter((c): c is DomainCard => c !== undefined);
    const flowCount = members.reduce((sum, c) => sum + c.flowCount, 0);
    const workCount = members.reduce((sum, c) => sum + (workCountByDomain.get(c.id) ?? 0), 0);
    const groundedCount = members.reduce((sum, c) => sum + c.groundedCount, 0);
    const reviewCount = members.reduce((sum, c) => sum + c.reviewCount, 0);
    const total = groundedCount + reviewCount;
    const filled = members.some((c) => c.filled);
    return {
      key: g.key,
      name: g.name,
      icon: g.isUnclassified ? "🗂️" : domainIcon(g.name, g.key),
      color: domainColor(g.key),
      isUnclassified: g.isUnclassified,
      subDomainCount: members.length,
      flowCount,
      workCount,
      filled,
      groundedPct: total > 0 ? Math.round((groundedCount / total) * 100) : null,
      groundedCount,
      reviewCount,
      memberChips: members.slice(0, CHIP_TOP_N).map((c) => ({ id: c.id, name: c.name })),
      moreCount: Math.max(members.length - CHIP_TOP_N, 0),
    };
  });
}

/** 도메인 id(예: "domain:cart")가 속한 그룹을 찾는다(FlowListView 브레드크럼용). */
export function findOwningGroup(
  groups: ResolvedGroup[],
  domainId: string,
): ResolvedGroup | undefined {
  return groups.find((g) => g.memberDomainIds.includes(domainId));
}

/** DomainsPage 라우트 파라미터 — 단일 세그먼트(:domainId)와 2단 세그먼트(:groupKey/:domainId) 공용. */
export interface DomainRouteParams {
  domainId?: string;
  groupKey?: string;
}

export type ResolvedDomainRoute =
  | { kind: "landing" }
  | { kind: "flat"; domainId: string }
  | { kind: "group"; group: ResolvedGroup; domainId: string }
  | { kind: "redirect"; to: string };

/**
 * URL → 렌더 분기(§7 IA + 딥링크 하위호환). 순수 함수 — window 접근 없음(쿼리 보존은
 * 호출측 이펙트가 담당, 기존 flow=/view= 동기화 관례와 동일하게 라이브 location 사용).
 *
 * `groups` here is the caller's ResolvedGroup[] from `resolveGroups` — which, whenever
 * the raw plan groups are non-empty, already folds every ungrouped domain into a
 * synthetic "미분류" group. So in practice every real domain node is covered by some
 * entry (real or synthetic) once the project has any groups at all; "flat" only fires
 * when the project has *zero* groups (D2 폴백 — 완전 평면), or defensively for a stale
 * domain id that matches no node.
 *
 * - groups 가 비어 있으면(D2 폴백) 항상 "flat" — 그룹 인식 자체를 하지 않는다.
 * - `/domains/:groupKey/:domainId` (2세그먼트) → 유효하면 "group", 아니면(불일치) "landing"
 *   으로 안전 폴백(빈 워크스페이스 방지).
 * - `/domains/:id` (1세그먼트) 인데 groups 존재:
 *   - id 가 그룹 key("g:" 접두) → 그 그룹의 첫 서브도메인으로 "redirect"(§7 워크스페이스
 *     진입 시 좌측 내비 기본 선택).
 *   - 그 외(도메인 id, 소속 그룹 실재 or 미분류 합성 그룹 포함) → 그 워크스페이스로
 *     "redirect"(하위호환 — 구 평면 딥링크도 그룹/미분류 워크스페이스로 통일 진입).
 */
export function resolveDomainRoute(
  params: DomainRouteParams,
  groups: ResolvedGroup[],
): ResolvedDomainRoute {
  const { domainId, groupKey } = params;

  if (groupKey) {
    if (!domainId) return { kind: "landing" };
    const group = groups.find((g) => g.key === groupKey);
    if (!group || !group.memberDomainIds.includes(domainId)) return { kind: "landing" };
    return { kind: "group", group, domainId };
  }

  if (!domainId) return { kind: "landing" };

  // "g:" 접두는 그룹 key 네임스페이스 전용(도메인 id는 항상 "domain:" 접두라 절대
  // 충돌하지 않는다) — groups 가 아직 로딩 전(빈 배열)이라도 flat 으로 오인해 잘못된
  // 도메인으로 워크스페이스를 잠깐 렌더하는 깜빡임을 막는다.
  if (domainId.startsWith("g:")) {
    const group = groups.find((g) => g.key === domainId);
    if (!group || group.memberDomainIds.length === 0) return { kind: "landing" };
    return { kind: "redirect", to: `/domains/${group.key}/${group.memberDomainIds[0]}` };
  }

  if (groups.length === 0) return { kind: "flat", domainId };

  const owning = findOwningGroup(groups, domainId);
  if (!owning) return { kind: "flat", domainId };
  return { kind: "redirect", to: `/domains/${owning.key}/${domainId}` };
}

export { UNCLASSIFIED_KEY };
