import type { CSSProperties, ReactNode } from "react";

/**
 * pmpl-proto 공용 프리미티브 (docs/ktds/front-redesign/pmpl-proto.html §스타일) —
 * 배지(.badge)·신뢰도(.conf)·통계 타일(.stat)·페이지 헤더(.page-head)·탭(.tabs)·버튼.
 * 색은 전부 테마 토큰/color-mix 기반이라 다크 프리셋에서도 동작한다.
 */

/* ── .badge — 상태 배지 (ok/warn/info/err/mut) ── */
export type BadgeTone = "ok" | "warn" | "info" | "err" | "mut";

const TONE: Record<BadgeTone, { color: string; bg: string }> = {
  ok: { color: "var(--color-status-ok)", bg: "color-mix(in srgb, var(--color-status-ok) 12%, transparent)" },
  warn: { color: "var(--color-status-warn)", bg: "color-mix(in srgb, var(--color-status-warn) 12%, transparent)" },
  info: { color: "var(--color-status-info)", bg: "color-mix(in srgb, var(--color-status-info) 12%, transparent)" },
  err: { color: "var(--color-status-error)", bg: "color-mix(in srgb, var(--color-status-error) 11%, transparent)" },
  mut: { color: "var(--color-text-muted)", bg: "var(--color-elevated)" },
};

export function Badge({
  tone,
  children,
  title,
  style,
}: {
  tone: BadgeTone;
  children: ReactNode;
  title?: string;
  style?: CSSProperties;
}) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center whitespace-nowrap font-bold"
      style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, color: t.color, background: t.bg, ...style }}
    >
      {children}
    </span>
  );
}

/* ── .conf — 신뢰도 배지: 확정(fix) / 확정·AI(ai) / 추정(est) / 확인 필요(chk) ── */
export type ConfKind = "fix" | "ai" | "est" | "chk";

// 라벨 통일(2026-07-15 사용자 결정): 자동판정 신뢰도는 사람 '확정'과 구분해 "근거확보".
// 단일 소스는 components/confidence.ts — 여기 기본 라벨도 그에 맞춘다.
const CONF: Record<ConfKind, { label: string; color: string; bg: string }> = {
  fix: { label: "근거확보", color: "var(--color-status-ok)", bg: "color-mix(in srgb, var(--color-status-ok) 12%, transparent)" },
  ai: { label: "근거확보(추정)", color: "var(--color-conf-ai)", bg: "color-mix(in srgb, var(--color-conf-ai) 12%, transparent)" },
  est: { label: "추정", color: "var(--color-status-warn)", bg: "color-mix(in srgb, var(--color-status-warn) 12%, transparent)" },
  chk: { label: "확인 필요", color: "var(--color-status-error)", bg: "color-mix(in srgb, var(--color-status-error) 11%, transparent)" },
};

export function ConfBadge({
  kind,
  label,
  title,
  style,
}: {
  kind: ConfKind;
  /** 라벨 오버라이드(예: "확정(홍길동)") — 기본은 종류별 표준 라벨 */
  label?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const c = CONF[kind];
  return (
    <span
      title={title}
      className="inline-flex items-center whitespace-nowrap font-bold"
      style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, color: c.color, background: c.bg, ...style }}
    >
      {label ?? c.label}
    </span>
  );
}

/* ── .card .stat — 통계 타일 ── */
export function StatTile({
  label,
  value,
  small,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  /** value 우측 보조 표기(프로토 .value small) */
  small?: ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "14px 16px" }}>
      <div className="text-text-muted font-medium" style={{ fontSize: 12, marginBottom: 6 }}>
        {label}
      </div>
      <div
        className="tabular-nums"
        style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.5px", color: valueColor ?? "var(--color-text-primary)" }}
      >
        {value}
        {small != null && (
          <small className="text-text-muted" style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 4, letterSpacing: 0 }}>
            {small}
          </small>
        )}
      </div>
    </div>
  );
}

/* ── .page-head — 페이지 헤더: (eyebrow +) h1 + meta + 우측 액션 ── */
export function PageHead({
  title,
  eyebrow,
  meta,
  actions,
  compact,
}: {
  title: ReactNode;
  /** 브레드크럼형 상단 소제목(프로토 .eyebrow) */
  eyebrow?: ReactNode;
  /** 타이틀 우측 메타 텍스트(프로토 .page-head .meta) */
  meta?: ReactNode;
  /** 우측 정렬 액션 버튼들 */
  actions?: ReactNode;
  /** fit 페이지용 축소 마진 */
  compact?: boolean;
}) {
  return (
    <div className="flex items-end gap-3.5 flex-wrap" style={{ marginBottom: compact ? 14 : 18 }}>
      <div className="min-w-0">
        {eyebrow != null && (
          <p className="text-text-muted font-bold" style={{ fontSize: 11.5, letterSpacing: "0.06em", marginBottom: 3 }}>
            {eyebrow}
          </p>
        )}
        <h1
          className="font-heading text-text-primary font-bold truncate"
          style={{ fontSize: eyebrow != null ? 20 : 22, lineHeight: 1.25, letterSpacing: "-0.3px" }}
        >
          {title}
        </h1>
      </div>
      {meta != null && (
        <div className="text-text-muted" style={{ fontSize: 13, paddingBottom: 3 }}>
          {meta}
        </div>
      )}
      <div className="flex-1" />
      {actions}
    </div>
  );
}

/* ── .tabs — 하단 보더 탭 (count 보조 표기) ── */
export function ProtoTabs<K extends string>({
  tabs,
  active,
  onChange,
  style,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  active: K;
  onChange: (key: K) => void;
  style?: CSSProperties;
}) {
  return (
    <div className="flex border-b border-border-subtle" style={{ gap: 2, marginBottom: 16, ...style }}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`cursor-pointer transition-colors ${on ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
            style={{
              fontSize: 13.5,
              fontWeight: on ? 650 : 550,
              padding: "8px 14px",
              border: "none",
              background: "none",
              borderBottom: `2px solid ${on ? "var(--color-accent)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.count != null && (
              <span className="text-text-muted tabular-nums" style={{ fontSize: 11, marginLeft: 4 }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── .btn-outline / .btn-accent ── */
export function BtnOutline({
  children,
  onClick,
  sm,
  title,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  sm?: boolean;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default font-semibold"
      style={sm ? { padding: "4px 10px", fontSize: 12, borderRadius: 6, ...style } : { padding: "7px 14px", fontSize: 13, ...style }}
    >
      {children}
    </button>
  );
}

export function BtnAccent({
  children,
  onClick,
  sm,
  title,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  sm?: boolean;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border border-accent bg-panel text-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default font-semibold"
      style={sm ? { padding: "4px 10px", fontSize: 12, borderRadius: 6, ...style } : { padding: "7px 14px", fontSize: 13, ...style }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "color-mix(in srgb, var(--color-accent) 8%, var(--color-panel))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-panel)";
      }}
    >
      {children}
    </button>
  );
}

/* ── .ev — file:line 근거 표기 ── */
export function Ev({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11, ...style }}>
      {children}
    </span>
  );
}
