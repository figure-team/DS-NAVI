/**
 * ERD PNG 내보내기 계획 (ERD 2차) — 화면 줌과 무관하게 항상 zoom=1(테이블 실측 크기)로
 * 캔버스 전체를 담는다. 해상도는 pixelRatio 로 확보(기본 2배) — 테이블이 많아 이미지가
 * 커지면 브라우저 캔버스 한 변 한계 안으로만 pixelRatio 를 자동 축소한다(레이아웃 축소가
 * 아니라 픽셀 밀도 축소 — 테이블 크기 비율은 불변).
 * DOM 캡처(html-to-image)와 분리된 순수 계산 — vitest 대상.
 */

export interface ErdExportPlan {
  /** 출력 이미지 CSS 크기(px) — 실제 픽셀은 × pixelRatio. */
  width: number;
  height: number;
  /** 캡처 시 viewport 에 적용할 transform(translate x/y, scale 1 고정). */
  x: number;
  y: number;
  /** 픽셀 밀도 — 기본 2, 캔버스 한계 초과 시에만 축소. */
  pixelRatio: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 여백(px, zoom=1 기준). */
export const EXPORT_PAD = 48;
/** 목표 픽셀 밀도 — 제출물 인쇄 대비 2배. */
export const EXPORT_PIXEL_RATIO = 2;
/** 브라우저 캔버스 한 변 안전 상한(Chrome 16384 미만 여유). */
export const EXPORT_MAX_SIDE = 16000;

export function planErdExport(bounds: Bounds): ErdExportPlan {
  const width = Math.ceil(bounds.width + EXPORT_PAD * 2);
  const height = Math.ceil(bounds.height + EXPORT_PAD * 2);
  const maxSide = Math.max(width, height);
  const pixelRatio = Math.min(EXPORT_PIXEL_RATIO, EXPORT_MAX_SIDE / maxSide);
  return {
    width,
    height,
    x: -bounds.x + EXPORT_PAD,
    y: -bounds.y + EXPORT_PAD,
    pixelRatio,
  };
}
