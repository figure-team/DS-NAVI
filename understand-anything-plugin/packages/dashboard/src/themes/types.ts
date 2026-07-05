export type PresetId =
  | "ds-navi-light"
  | "dark-gold"
  | "dark-ocean"
  | "dark-forest"
  | "dark-rose"
  | "light-minimal";

export interface AccentSwatch {
  id: string;
  name: string;
  accent: string;
  accentDim: string;
  accentBright: string;
}

export interface ThemePreset {
  id: PresetId;
  name: string;
  isDark: boolean;
  colors: Record<string, string>;
  accentSwatches: AccentSwatch[];
  defaultAccentId: string;
}

export type HeadingFont = "serif" | "sans" | "mono";

export interface ThemeConfig {
  presetId: PresetId;
  accentId: string;
  headingFont?: HeadingFont;
}

// FRONT_REDESIGN P4: 기본 테마 = DS-NAVI 라이트(DS-APM 디자인 언어, 설계문서 §6).
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  presetId: "ds-navi-light",
  accentId: "ktred",
  headingFont: "sans",
};
