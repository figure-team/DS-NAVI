import type { ThemeConfig } from "./types.ts";
import { getAccent, getPreset } from "./presets.ts";

export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function deriveFromAccent(accentHex: string, isDark: boolean): Record<string, string> {
  const rgb = hexToRgb(accentHex);
  return {
    "color-border-subtle": `rgba(${rgb}, ${isDark ? 0.12 : 0.1})`,
    "color-border-medium": `rgba(${rgb}, ${isDark ? 0.25 : 0.18})`,
    "glass-bg": isDark ? "rgba(20, 20, 20, 0.8)" : "rgba(255, 255, 255, 0.8)",
    "glass-bg-heavy": isDark ? "rgba(20, 20, 20, 0.95)" : "rgba(255, 255, 255, 0.95)",
    "glass-border": `rgba(${rgb}, ${isDark ? 0.1 : 0.08})`,
    "glass-border-heavy": `rgba(${rgb}, ${isDark ? 0.15 : 0.12})`,
    "scrollbar-thumb": `rgba(${rgb}, 0.2)`,
    "scrollbar-thumb-hover": `rgba(${rgb}, 0.35)`,
    "glow-accent": `rgba(${rgb}, 0.15)`,
    "glow-accent-strong": `rgba(${rgb}, 0.4)`,
    "glow-accent-pulse": `rgba(${rgb}, 0.6)`,
    "color-edge": `rgba(${rgb}, 0.3)`,
    "color-edge-dim": `rgba(${rgb}, 0.08)`,
    "color-edge-dot": `rgba(${rgb}, 0.15)`,
    "color-accent-overlay-bg": `rgba(${rgb}, 0.05)`,
    "color-accent-overlay-border": `rgba(${rgb}, 0.25)`,
    "kbd-bg": `rgba(${rgb}, 0.1)`,
  };
}

/**
 * FRONT_REDESIGN P4: 프리셋 colors 맵에 없는 3층(component) 토큰의 모드별 기본값.
 * 지식 노드·레이어·diff 색은 배경 밝기에 따라 가독 범위가 달라 모드 단위로 스위치한다.
 * (프리셋이 같은 키를 정의하면 프리셋이 이긴다 — 적용 순서 참고.)
 */
const MODE_EXTRAS: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    "node-article": "#d4a574",
    "node-entity": "#7ba4c9",
    "node-topic": "#c9b06c",
    "node-claim": "#6fb07a",
    "node-source": "#8a8a8a",
    "layer-api": "#d4a574",
    "layer-service": "#38bdf8",
    "layer-dao": "#a78bfa",
    "layer-db": "#f87171",
    "layer-other": "#6b7280",
    "diff-changed": "#e05252",
    "diff-affected": "#d4a030",
    "diff-changed-dim": "rgba(224, 82, 82, 0.25)",
    "diff-affected-dim": "rgba(212, 160, 48, 0.25)",
  },
  light: {
    "node-article": "#92400e",
    "node-entity": "#2e6a8f",
    "node-topic": "#8a6d1f",
    "node-claim": "#2e7a4e",
    "node-source": "#6b7280",
    "layer-api": "#b45309",
    "layer-service": "#0369a1",
    "layer-dao": "#6d28d9",
    "layer-db": "#b91c1c",
    "layer-other": "#4b5563",
    "diff-changed": "#c11322",
    "diff-affected": "#b45309",
    "diff-changed-dim": "rgba(193, 19, 34, 0.22)",
    "diff-affected-dim": "rgba(180, 83, 9, 0.22)",
  },
};

export function applyTheme(config: ThemeConfig): void {
  const preset = getPreset(config.presetId);
  const accent = getAccent(preset, config.accentId);
  const style = document.documentElement.style;

  // 1. Mode-level component tokens (P4) — 프리셋 전환 시 이전 프리셋 잔류값 방지를 위해
  //    항상 전체 키를 다시 쓴다.
  const extras = MODE_EXTRAS[preset.isDark ? "dark" : "light"];
  for (const [key, value] of Object.entries(extras)) {
    style.setProperty(`--color-${key}`, value);
  }

  // 2. Apply accent colors from swatch
  style.setProperty("--color-accent", accent.accent);
  style.setProperty("--color-accent-dim", accent.accentDim);
  style.setProperty("--color-accent-bright", accent.accentBright);

  // 3. Apply derived values
  const derived = deriveFromAccent(accent.accent, preset.isDark);
  for (const [key, value] of Object.entries(derived)) {
    style.setProperty(`--${key}`, value);
  }

  // 4. Apply base preset colors LAST — 프리셋이 파생값(보더·엣지 등)을 오버라이드할 수 있게.
  for (const [key, value] of Object.entries(preset.colors)) {
    style.setProperty(`--color-${key}`, value);
  }

  // 5. Set data-theme for CSS-only selectors
  document.documentElement.setAttribute("data-theme", preset.isDark ? "dark" : "light");

  // 6. Apply heading font preference — P4 기본은 산세리프(Pretendard).
  const fontMap: Record<string, string> = {
    serif: "var(--font-serif)",
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  };
  const headingFont = config.headingFont ?? "sans";
  style.setProperty("--font-heading", fontMap[headingFont] ?? fontMap.sans);
}
