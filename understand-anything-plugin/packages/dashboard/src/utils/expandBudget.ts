// 펼친 컨테이너의 점진 공개(progressive disclosure) 예산 + 내부 그리드 배치.
//
// 조사 근거(2026-07-11): node-link 그래프는 화면 동시 노드 30~50개에서 가독성이
// 급락하며(Ghoniem et al.), 실전 도구(Sourcetrail·C4·IntelliJ·CodeScene)는 예외
// 없이 "전량 표시"를 버리고 집계·상위 N·검색 주도 확장으로 수렴한다. 구 BMAD
// 반려 교훈: 개수 예산만으로는 부족하고 배치(그리드)까지 함께 규정해야 한다.

/** 펼친 컨테이너가 기본으로 노출하는 파일 노드 상한(허브 랭킹 상위). */
export const EXPAND_VISIBLE_BUDGET = 10;

/**
 * 상한 초과분이 이 여유 이하면 칩 없이 전부 노출한다 — "+1개 더" 칩이
 * 실 노드 하나보다 오히려 자리를 더 차지하는 역전을 막는다.
 */
export const EXPAND_BUDGET_SLACK = 2;

export interface RankedChildren {
  /** 노출할 자식 id — 연결도(허브) 내림차순. */
  visible: string[];
  /** "+N개" 칩으로 접힐 자식 id. */
  hidden: string[];
}

/**
 * 컨테이너 자식을 연결도(fan-in + fan-out)로 랭킹해 예산 내 상위만 남긴다.
 * 연결도는 레이어 내 전체 엣지 기준(형제 간 + 컨테이너 밖 교차 모두 포함) —
 * "이 폴더에서 진짜 봐야 할 파일"은 배선이 몰리는 허브라는 CodeScene류 가정.
 * 동률은 id 사전순으로 결정론을 보장한다.
 */
export function rankVisibleChildren(
  childIds: string[],
  edges: ReadonlyArray<{ source: string; target: string }>,
  budget: number = EXPAND_VISIBLE_BUDGET,
  slack: number = EXPAND_BUDGET_SLACK,
): RankedChildren {
  if (childIds.length <= budget + slack) {
    return { visible: [...childIds], hidden: [] };
  }
  const childSet = new Set(childIds);
  const degree = new Map<string, number>();
  for (const e of edges) {
    if (childSet.has(e.source)) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    }
    if (childSet.has(e.target)) {
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
  }
  const ranked = [...childIds].sort((a, b) => {
    const diff = (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return { visible: ranked.slice(0, budget), hidden: ranked.slice(budget) };
}

export interface ChildGridOptions {
  cellWidth: number;
  cellHeight: number;
  gap: number;
  paddingX: number;
  /** 컨테이너 헤더(이름·개수 칩)가 차지하는 상단 여백. */
  paddingTop: number;
  paddingBottom: number;
  /** 목표 화면 비율 — 고립 노드 그리드와 같은 감기 공식(기본 1.7). */
  aspectRatio?: number;
}

export interface ChildGrid {
  /** 셀 id → 컨테이너 좌상단 기준 상대 좌표. */
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

/**
 * 셀들을 화면 비율에 맞춰 여러 행으로 감아 배치하고 컨테이너 실측 크기를
 * 계산한다. ELK layered가 같은 랭크를 한 줄로 까는 병리(펼친 컨테이너 안
 * JSP 13개 → 극단적 가로비)를 의존 무시 그리드로 대체한다 — 형제 간 배선은
 * ElkEdge의 smooth-step 폴백이 그린다.
 */
export function computeChildGrid(
  cellIds: string[],
  opts: ChildGridOptions,
): ChildGrid {
  const { cellWidth, cellHeight, gap, paddingX, paddingTop, paddingBottom } = opts;
  const aspect = opts.aspectRatio ?? 1.7;
  const n = cellIds.length;
  const positions = new Map<string, { x: number; y: number }>();
  if (n === 0) {
    return { positions, width: paddingX * 2, height: paddingTop + paddingBottom };
  }
  const stepX = cellWidth + gap;
  const stepY = cellHeight + gap;
  const cols = Math.max(
    1,
    Math.min(n, Math.ceil(Math.sqrt((aspect * n * stepY) / stepX))),
  );
  const rows = Math.ceil(n / cols);
  cellIds.forEach((id, i) => {
    positions.set(id, {
      x: paddingX + (i % cols) * stepX,
      y: paddingTop + Math.floor(i / cols) * stepY,
    });
  });
  return {
    positions,
    width: paddingX * 2 + cols * stepX - gap,
    height: paddingTop + rows * stepY - gap + paddingBottom,
  };
}
