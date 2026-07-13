import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  computeRowTargetLines,
  computeVisibleChips,
  countNaturalLines,
  type ChipMetric,
} from "../utils/groupCardSizing";

/** 그룹 카드 칩 영역 상한 — +N 칩도 이 줄 수 안에 포함(사용자 확정). */
const CHIP_MAX_LINES = 3;
const CHIP_GAP = 6;
/** "+N" 칩 예약 폭 — 마지막 보이는 줄 끝에 들어갈 자리를 확보한다. */
const PLUS_CHIP_WIDTH = 44;

export interface GroupCardChipSizing {
  visible: number;
  hidden: number;
}

/**
 * DomainMapView 그룹 카드 그리드 전용 — 같은 그리드 행 카드들의 칩 노출 개수를
 * "행 내 최소 자연 줄 수(상한 3줄)"에 맞춰 동시에 계산한다. 그리드 행 판정은
 * 카드 루트 엘리먼트의 실측 top(그리드 컬럼 수는 뷰포트에 따라 달라지므로 top
 * 이 같은 카드 = 같은 행) 기준이며, 컨테이너 리사이즈 시 재계산한다.
 *
 * 반환된 `sizing.get(key)` 가 undefined 면 아직 측정 전(measuring) — 호출측은
 * 이 상태에서 전체 칩을 렌더해야 측정이 가능하다(높이 출렁임 방지를 위해
 * 3줄 높이로 클립 권장, ProcessChips 와 동일한 패턴).
 */
export function useGroupCardRowSizing(keys: string[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const chipRefs = useRef(new Map<string, HTMLDivElement>());
  const [sizing, setSizing] = useState<Map<string, GroupCardChipSizing>>(new Map());

  const registerCard = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(key, el);
      else cardRefs.current.delete(key);
    },
    [],
  );
  const registerChips = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) chipRefs.current.set(key, el);
      else chipRefs.current.delete(key);
    },
    [],
  );

  const keysSignature = keys.join("|");

  // 카드 구성(그룹 재계산·필터)이 바뀌면 측정 리셋 — measuring 상태로 되돌려
  // 다음 레이아웃 이펙트가 전량 렌더 기준으로 재측정하게 한다.
  useLayoutEffect(() => {
    setSizing(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature]);

  useLayoutEffect(() => {
    if (sizing.size > 0) return; // 이미 확정 — 리셋(위 이펙트/리사이즈)만 재계산을 유발.
    const container = containerRef.current;
    if (!container || keys.length === 0) return;
    if (keys.some((k) => !cardRefs.current.get(k) || !chipRefs.current.get(k))) return;

    const containerTop = container.getBoundingClientRect().top;
    const rowOfKey = new Map<string, number>();
    const naturalByKey = new Map<string, number>();
    const chipMetricsByKey = new Map<string, ChipMetric[]>();

    for (const key of keys) {
      const cardEl = cardRefs.current.get(key);
      const chipEl = chipRefs.current.get(key);
      if (!cardEl || !chipEl) continue;
      rowOfKey.set(key, Math.round(cardEl.getBoundingClientRect().top - containerTop));
      const chips: ChipMetric[] = Array.from(chipEl.children).map((c) => {
        const el = c as HTMLElement;
        return { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth };
      });
      chipMetricsByKey.set(key, chips);
      naturalByKey.set(key, countNaturalLines(chips));
    }

    const rowGroups = new Map<number, string[]>();
    for (const [key, row] of rowOfKey) {
      const list = rowGroups.get(row);
      if (list) list.push(key);
      else rowGroups.set(row, [key]);
    }

    const next = new Map<string, GroupCardChipSizing>();
    for (const rowKeys of rowGroups.values()) {
      const naturalLines = rowKeys.map((k) => naturalByKey.get(k) ?? 0);
      const target = computeRowTargetLines(naturalLines, CHIP_MAX_LINES);
      for (const key of rowKeys) {
        const chips = chipMetricsByKey.get(key) ?? [];
        const width = chipRefs.current.get(key)?.clientWidth ?? 0;
        next.set(key, computeVisibleChips(chips, target, width, CHIP_GAP, PLUS_CHIP_WIDTH));
      }
    }
    setSizing(next);
  }, [keys, sizing]);

  // 컨테이너 리사이즈(뷰포트 변경) — 그리드 컬럼 수/카드 폭이 바뀌면 재측정.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let lastW = container.clientWidth;
    const ro = new ResizeObserver(() => {
      if (container.clientWidth !== lastW) {
        lastW = container.clientWidth;
        setSizing(new Map());
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return { containerRef, registerCard, registerChips, sizing };
}
