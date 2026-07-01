import { BaseEdge, getSmoothStepPath, Position, type EdgeProps } from "@xyflow/react";
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
    const routed: ElkPoint[] = [
      snap(points[0], sourceX, sourceY, sourcePosition),
      ...points.slice(1, -1),
      snap(points[points.length - 1], targetX, targetY, targetPosition),
    ];
    path = roundedPath(routed, CORNER_RADIUS);
    const mid = pathMidpoint(routed);
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
