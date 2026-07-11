import { useId, useState } from "react";
import type { DomainRelation } from "../utils/domainData";

/**
 * 화면1 구성도의 도메인 간 관계선 레이어 (WORK_MAP 개편 — PM/PL "구성도" 기대 충족).
 * 부모(DomainMapView)가 측정한 카드 사각형(rects, 보드 좌표계)을 받아 카드 테두리
 * 사이에 방향 화살표 곡선을 그린다. 데이터는 buildDomainRelations(crossDomainInteractions
 * 파싱 성공분)만 — 날조 0. 선 호버 시 상호작용 원문 툴팁, 나머지 선은 감쇠.
 *
 * SVG 루트는 pointer-events:none(카드 클릭 무방해), 히트 전용 투명 굵은 패스만
 * 마우스를 받는다. 양방향 쌍은 각자 진행방향 왼쪽으로 휘어 서로 분리된다.
 */

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometry {
  d: string;
  /** 툴팁 제목 "출발 → 도착" 구성용. */
  rel: DomainRelation;
}

/** 중심→방향으로 사각형 테두리까지의 거리(slab) — 관계선을 카드 밖에서 시작/끝낸다. */
function edgeDistance(r: CardRect, ux: number, uy: number): number {
  const tx = ux !== 0 ? r.w / 2 / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? r.h / 2 / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

/** 테두리 여백 — 화살촉이 카드에 파묻히지 않게 띄운다. */
const GAP = 7;

function buildGeometry(rel: DomainRelation, rects: Map<string, CardRect>): Geometry | null {
  const a = rects.get(rel.source);
  const b = rects.get(rel.target);
  if (!a || !b) return null;
  const c1 = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const c2 = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const t1 = edgeDistance(a, ux, uy) + GAP;
  const t2 = edgeDistance(b, -ux, -uy) + GAP;
  // 카드가 겹치거나 너무 붙어 선을 그릴 공간이 없으면 생략(쓰레기 지오메트리 방지).
  if (t1 + t2 + 12 > len) return null;
  const x1 = c1.x + ux * t1;
  const y1 = c1.y + uy * t1;
  const x2 = c2.x - ux * t2;
  const y2 = c2.y - uy * t2;
  // 진행방향 왼쪽으로 휨 — 역방향 관계선(B→A)은 자동으로 반대쪽에 놓인다.
  const bow = Math.min(36, len * 0.1);
  const cx = (x1 + x2) / 2 - uy * bow;
  const cy = (y1 + y2) / 2 + ux * bow;
  return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, rel };
}

export default function DomainRelationsLayer({
  relations,
  rects,
  names,
}: {
  relations: DomainRelation[];
  rects: Map<string, CardRect>;
  /** 도메인 id → 표시명 (툴팁 제목). */
  names: Map<string, string>;
}) {
  const uid = useId();
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const geoms = relations
    .map((rel) => buildGeometry(rel, rects))
    .filter((g): g is Geometry => g !== null);
  if (geoms.length === 0) return null;

  const hovered = hover ? geoms[hover.index] : null;

  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none", overflow: "visible" }}
        aria-hidden
      >
        <defs>
          <marker
            id={`${uid}m`}
            viewBox="0 0 8 8"
            markerWidth={8}
            markerHeight={8}
            refX={7}
            refY={4}
            orient="auto"
          >
            <path d="M0,0.5 L7.5,4 L0,7.5 z" fill="var(--color-text-muted)" />
          </marker>
          <marker
            id={`${uid}ma`}
            viewBox="0 0 8 8"
            markerWidth={8}
            markerHeight={8}
            refX={7}
            refY={4}
            orient="auto"
          >
            <path d="M0,0.5 L7.5,4 L0,7.5 z" fill="var(--color-accent)" />
          </marker>
        </defs>
        {geoms.map((g, i) => {
          const active = hover?.index === i;
          const dimmed = hover !== null && !active;
          return (
            <g key={i} style={{ transition: "opacity 0.15s", opacity: dimmed ? 0.2 : 1 }}>
              <path
                d={g.d}
                fill="none"
                stroke={active ? "var(--color-accent)" : "var(--color-text-muted)"}
                strokeWidth={active ? 2 : 1.3}
                strokeOpacity={active ? 1 : 0.55}
                markerEnd={`url(#${uid}${active ? "ma" : "m"})`}
              />
              {/* 히트 전용 — 가는 선의 호버 타깃을 넓힌다. */}
              <path
                d={g.d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "default" }}
                onMouseEnter={(e) => setHover({ index: i, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ index: i, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover && (
        <div
          className="fixed z-50 rounded-lg border border-border-medium bg-surface shadow-xl"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 372),
            top: Math.min(hover.y + 12, window.innerHeight - 160),
            width: 360,
            maxWidth: "90vw",
            padding: "10px 12px",
            pointerEvents: "none",
          }}
          role="tooltip"
        >
          <div className="text-text-primary font-bold" style={{ fontSize: 12, marginBottom: 6 }}>
            {names.get(hovered.rel.source) ?? hovered.rel.source}
            <span className="text-text-muted" style={{ padding: "0 5px" }}>→</span>
            {names.get(hovered.rel.target) ?? hovered.rel.target}
          </div>
          <ul className="flex flex-col" style={{ gap: 5 }}>
            {hovered.rel.texts.map((text, i) => (
              <li
                key={i}
                className="text-text-secondary"
                style={{ fontSize: 11.5, lineHeight: 1.55 }}
              >
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
