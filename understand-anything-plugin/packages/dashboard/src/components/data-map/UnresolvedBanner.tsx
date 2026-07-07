import { useState } from "react";

import { Ev } from "../proto/Proto";
import type { DbUnresolved } from "./types";

/**
 * db-schema unresolved 배너 — severity 분리(개편 ①).
 * warn(및 구버전 미지정) = 경고 배너, info = 중립 "참고" 배너(동일 정의 중복 등 무해 신호).
 * reason 별 그룹핑으로 동일 사유 다건 나열을 접는다. 침묵 누락 금지 — 건수는 항상 표면화.
 */

function groupByReason(items: DbUnresolved[]): Array<{ reason: string; refs: string[] }> {
  const m = new Map<string, string[]>();
  for (const u of items) m.set(u.reason, [...(m.get(u.reason) ?? []), u.ref]);
  return [...m.entries()].map(([reason, refs]) => ({ reason, refs }));
}

function BannerFold({
  tone,
  title,
  sub,
  items,
}: {
  tone: "warn" | "info";
  title: string;
  sub: string;
  items: DbUnresolved[];
}) {
  const [open, setOpen] = useState(false);
  const borderColor = tone === "warn" ? "var(--color-status-warn)" : "var(--color-border-medium)";
  const groups = groupByReason(items);
  return (
    <div
      className="rounded-lg border border-border-subtle bg-panel"
      style={{ borderLeft: `3px solid ${borderColor}`, padding: "8px 14px", marginBottom: 10 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-0"
        style={{ font: "inherit" }}
      >
        <span style={{ fontSize: 9, width: 10 }}>{open ? "▾" : "▸"}</span>
        <span className="text-text-primary" style={{ fontSize: 13, fontWeight: 650 }}>
          {title}
        </span>
        <span className="text-text-muted" style={{ fontSize: 12 }}>
          {sub}
        </span>
      </button>
      {open && (
        <div style={{ margin: "8px 0 4px", paddingLeft: 20 }}>
          {groups.map((g) => (
            <div key={g.reason} style={{ marginBottom: 6 }}>
              <div className="text-text-secondary" style={{ fontSize: 12.5 }}>
                {g.reason} <span className="text-text-muted">×{g.refs.length}</span>
              </div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                {g.refs.map((ref) => (
                  <li key={ref} style={{ marginBottom: 1 }}>
                    <Ev>{ref}</Ev>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UnresolvedBanner({ unresolved }: { unresolved: DbUnresolved[] }) {
  const warns = unresolved.filter((u) => u.severity !== "info");
  const infos = unresolved.filter((u) => u.severity === "info");
  if (unresolved.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {warns.length > 0 && (
        <BannerFold
          tone="warn"
          title={`미해결 항목 ${warns.length}건`}
          sub="— 스캔 중 결정되지 않은 신호(정합 확인 필요)"
          items={warns}
        />
      )}
      {infos.length > 0 && (
        <BannerFold
          tone="info"
          title={`참고 ${infos.length}건`}
          sub="— 무해 신호(동일 정의 중복 등)"
          items={infos}
        />
      )}
    </div>
  );
}
