import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { ElkPoint } from "../utils/elk-layout";

// Custom edge that renders ELK's pre-computed orthogonal routing (one distinct
// track per edge) so overlapping connections stay visually separable. When an
// edge carries no ELK points (e.g. inflated file→file edges inside an expanded
// container) it falls back to React Flow's smooth-step path.

const CORNER_RADIUS = 10;

/** Polyline through `points` with rounded right-angle corners. */
function roundedPath(points: ElkPoint[], r: number): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: p1.x + ((p0.x - p1.x) / d1) * rr, y: p1.y + ((p0.y - p1.y) / d1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / d2) * rr, y: p1.y + ((p2.y - p1.y) / d2) * rr };
    d += ` L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/**
 * 칩 라벨 앵커 — DOWN 레이아웃에서 노드에 가리지 않는 지점. 분기 라벨은 첫
 * **수평** 구간의 중점에 둔다(수평 런은 계층 사이 코리도어에 놓여 항상 노드
 * 밖이다 — 순서도 관례와도 일치). 수평 구간이 없으면(직선 하강) 경로 중점.
 */
/**
 * 분기 라벨 공통 높이 앵커 — 같은 노드(판단)에서 출발한 분기들은 상태값이므로
 * 라벨을 **같은 높이**에 나란히 둔다: 출발점에서 고정 깊이(+26px)의 수평선과
 * 경로가 만나는 지점. 경로가 그 깊이를 지나지 않으면(루프백 등) 기존 규칙
 * (수평 런 중점 → 소스 직후)으로 폴백.
 */
const CHIP_DEPTH = 26;

function chipAnchorAtDepth(points: ElkPoint[]): ElkPoint {
  const targetY = points[0].y + CHIP_DEPTH;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.y <= targetY && b.y >= targetY) || (a.y >= targetY && b.y <= targetY)) {
      const t = b.y === a.y ? 0 : (targetY - a.y) / (b.y - a.y);
      return { x: a.x + (b.x - a.x) * t, y: targetY };
    }
  }
  return chipAnchor(points);
}

function chipAnchor(points: ElkPoint[]): ElkPoint {
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i].x - points[i - 1].x);
    const dy = Math.abs(points[i].y - points[i - 1].y);
    if (dx > dy && dx > 12) {
      return { x: (points[i].x + points[i - 1].x) / 2, y: (points[i].y + points[i - 1].y) / 2 };
    }
  }
  // 수평 구간이 없는 수직 직행 엣지 — 경로 중점은 이웃 노드의 세로 스팬에 걸릴
  // 수 있다(계정 수정 "변경 안 함" 겹침). 소스 직후(판단 바로 아래 코리도어)에
  // 앵커한다 — 분기 라벨을 출발점 곁에 두는 순서도 관례와도 일치.
  return pathPointAtLength(points, 26);
}

/** 경로 시작에서 호 길이 `len` 만큼 진행한 지점(경로가 짧으면 끝점). */
function pathPointAtLength(points: ElkPoint[], len: number): ElkPoint {
  let remain = len;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (remain <= seg && seg > 0) {
      const t = remain / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    remain -= seg;
  }
  return points[points.length - 1];
}

/** Point halfway along the polyline by arc length — used to anchor the label. */
function pathMidpoint(points: ElkPoint[]): ElkPoint {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLen.push(l);
    total += l;
  }
  let half = total / 2;
  for (let i = 0; i < segLen.length; i++) {
    if (half <= segLen[i]) {
      const t = segLen[i] === 0 ? 0 : half / segLen[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    half -= segLen[i];
  }
  return points[Math.floor(points.length / 2)];
}

export default function ElkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const points = (data?.points as ElkPoint[] | undefined) ?? undefined;
  // opt-in(업무 흐름도): 라벨을 SVG 텍스트 대신 노드 위 레이어의 칩으로 그린다 —
  // 기본 경로 중간점 라벨은 HTML 노드 아래 깔려 가려진다(구조 탭 카운트 라벨은
  // 기존 동작 유지).
  const labelChip = data?.labelChip === true;
  // opt-out(업무 흐름도): ELK 에 준 크기와 렌더 크기가 동일하면 스냅이 불필요하고,
  // 오히려 루프백(위로 가는) 엣지를 bottom/top 핸들에 강제로 붙여 왜곡시킨다.
  const snapHandles = data?.snapHandles !== false;

  let path: string;
  let labelX: number;
  let labelY: number;
  if (points && points.length >= 2) {
    // ELK routes against the node sizes we handed it, which can differ from the
    // actually-rendered (content-sized) card, leaving a gap. Snap each endpoint
    // to React Flow's real handle — but only along the axis perpendicular to the
    // handle face (Top/Bottom → snap Y, keep ELK's X; Left/Right → snap X, keep
    // ELK's Y). Snapping both axes would drag an off-centre ELK entry to the
    // handle centre and bend the otherwise-straight track (regressed the layer
    // overview). Keeping the parallel axis at ELK's value preserves the track.
    const snap = (
      elk: ElkPoint,
      handleX: number,
      handleY: number,
      pos: Position | undefined,
    ): ElkPoint =>
      pos === Position.Left || pos === Position.Right
        ? { x: handleX, y: elk.y }
        : { x: elk.x, y: handleY };
    const routed: ElkPoint[] = snapHandles
      ? [
          snap(points[0], sourceX, sourceY, sourcePosition),
          ...points.slice(1, -1),
          snap(points[points.length - 1], targetX, targetY, targetPosition),
        ]
      : points;
    path = roundedPath(routed, CORNER_RADIUS);
    const mid = labelChip ? chipAnchorAtDepth(routed) : pathMidpoint(routed);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    const [p, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 6,
    });
    path = p;
    labelX = lx;
    labelY = ly;
  }

  if (labelChip) {
    return (
      <>
        <BaseEdge path={path} markerEnd={markerEnd} style={style} />
        {label != null && label !== "" && (
          <EdgeLabelRenderer>
            {/* zIndex 1000 — edgelabel 레이어에서 노드 위로 올린다(공식 예제 규약).
                칩 배경이 밑을 지나는 간선을 가려 판독성을 확보한다. */}
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "none",
                zIndex: 1000,
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                background: "var(--color-panel)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 5,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
    />
  );
}
