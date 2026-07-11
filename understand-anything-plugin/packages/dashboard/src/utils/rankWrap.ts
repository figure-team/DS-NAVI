// ELK layered 후처리: 넓은 랭크(같은 계층 한 줄) 감기.
//
// layered는 정의상 같은 랭크를 한 행에 깐다 — 진입 엣지가 없는 소스 노드가
// 많은 레이어(테스트 16개, 실측 가로비 5.56)에서 극단적 가로비가 나온다.
// 고립 노드 그리드(엣지 0개 한정)의 일반화로, 연결된 노드라도 랭크가
// 임계(ROW_WRAP_MIN) 이상이면 그 랭크를 화면비 그리드로 다시 감고 아래
// 랭크들을 밀어내린다. 이동한 노드의 ELK 라우팅 포인트는 호출부에서
// 무효화(smooth-step 폴백)해야 한다.

export const ROW_WRAP_MIN = 5;
export const ROW_WRAP_GAP = 48;

export interface WrapNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface RewrapResult {
  /**
   * 위치가 비균등하게 바뀐 노드 id(그리드 감기 또는 x 압축) — 이 노드에
   * 닿는 엣지의 ELK 라우팅은 무효(smooth-step 폴백).
   */
  rewrapped: Set<string>;
  /** 아래 랭크로서 y만 평행이동한 노드 id → 이동량(px). */
  shiftById: Map<string, number>;
}

/**
 * 노드들을 ELK 랭크(세로 밴드)로 묶는다. y 오름차순으로 훑으며, 현재
 * 밴드의 모든 노드 하단보다 아래에서 시작하는 노드를 다음 랭크로 본다 —
 * layered의 계층 간 간격(nodeNodeBetweenLayers)이 이를 보장한다.
 */
function clusterRows(nodes: WrapNode[]): WrapNode[][] {
  const sorted = [...nodes].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const rows: WrapNode[][] = [];
  let current: WrapNode[] = [];
  let currentBottom = -Infinity;
  for (const n of sorted) {
    if (current.length > 0 && (n.y ?? 0) >= currentBottom) {
      rows.push(current);
      current = [];
      currentBottom = -Infinity;
    }
    current.push(n);
    currentBottom = Math.max(currentBottom, (n.y ?? 0) + (n.height ?? 0));
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * 임계 이상으로 넓은 랭크를 화면비 그리드로 감아 재배치(제자리 변이)하고,
 * 그 아래 랭크들을 늘어난 높이만큼 내린다. x 순서(ELK 교차 최소화 결과)를
 * 행 우선으로 보존한다.
 */
export function rewrapWideRows(
  nodes: WrapNode[],
  opts: { aspectRatio?: number; gap?: number; minCount?: number } = {},
): RewrapResult {
  const aspect = opts.aspectRatio ?? 1.7;
  const gap = opts.gap ?? ROW_WRAP_GAP;
  const minCount = opts.minCount ?? ROW_WRAP_MIN;
  const rewrapped = new Set<string>();
  const shiftById = new Map<string, number>();
  if (nodes.length === 0) return { rewrapped, shiftById };

  const rows = clusterRows(nodes);
  let cumShift = 0;
  // 감긴 그리드들의 가로 범위 — 이후 랭크 x 압축의 기준 폭/중심.
  let wrapMinX = Infinity;
  let wrapMaxX = -Infinity;
  for (const row of rows) {
    // 위 랭크가 감겨 늘어난 만큼 이 랭크 전체를 먼저 내린다.
    if (cumShift > 0) {
      for (const n of row) {
        n.y = (n.y ?? 0) + cumShift;
        shiftById.set(n.id, cumShift);
      }
    }

    if (row.length >= minCount) {
      const cellW = Math.max(...row.map((n) => n.width ?? 0)) + gap;
      const cellH = Math.max(...row.map((n) => n.height ?? 0)) + gap;
      const cols = Math.max(
        1,
        Math.min(row.length, Math.ceil(Math.sqrt((aspect * row.length * cellH) / cellW))),
      );
      if (cols < row.length) {
        const baseX = Math.min(...row.map((n) => n.x ?? 0));
        const baseY = Math.min(...row.map((n) => n.y ?? 0));
        const oldHeight =
          Math.max(...row.map((n) => (n.y ?? 0) + (n.height ?? 0))) - baseY;
        const gridRows = Math.ceil(row.length / cols);
        const ordered = [...row].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        ordered.forEach((n, i) => {
          n.x = baseX + (i % cols) * cellW;
          n.y = baseY + Math.floor(i / cols) * cellH;
          rewrapped.add(n.id);
          shiftById.delete(n.id); // 감긴 노드는 시프트가 아니라 재배치
        });
        const newHeight = gridRows * cellH - gap;
        cumShift += Math.max(0, newHeight - oldHeight);
        wrapMinX = Math.min(wrapMinX, baseX);
        wrapMaxX = Math.max(wrapMaxX, baseX + cols * cellW - gap);
        continue;
      }
    }

    // 감기지 않은 랭크의 x 압축 — BRANDES_KOEPF가 (감기 전) 넓은 위 랭크
    // 기준으로 정렬해 둔 x는 감긴 뒤엔 의미가 없고 폭만 잡아먹는다. 위에서
    // 감기가 발생했고 이 랭크가 감긴 폭보다 넓으면, x 순서를 보존한 채
    // 감긴 콘텐츠 중심 아래로 균등 간격 재배치한다(라우팅 무효 대상).
    if (wrapMaxX > wrapMinX && row.length > 0) {
      const rowMinX = Math.min(...row.map((n) => n.x ?? 0));
      const rowMaxX = Math.max(...row.map((n) => (n.x ?? 0) + (n.width ?? 0)));
      if (rowMaxX - rowMinX > wrapMaxX - wrapMinX) {
        const ordered = [...row].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const totalW =
          ordered.reduce((s, n) => s + (n.width ?? 0), 0) + gap * (ordered.length - 1);
        let x = (wrapMinX + wrapMaxX) / 2 - totalW / 2;
        for (const n of ordered) {
          n.x = x;
          x += (n.width ?? 0) + gap;
          rewrapped.add(n.id);
          shiftById.delete(n.id);
        }
      }
    }
  }
  return { rewrapped, shiftById };
}
