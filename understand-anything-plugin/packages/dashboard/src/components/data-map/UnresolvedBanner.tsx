import { useEffect, useState } from "react";

import { Ev } from "../proto/Proto";
import type { DbUnresolved } from "./types";

/**
 * db-schema unresolved 배너 — severity 분리(개편 ①).
 * warn(및 구버전 미지정) = 경고 배너, info = 중립 "참고" 배너(동일 정의 중복 등 무해 신호).
 * reason 별 그룹핑으로 동일 사유 다건 나열을 접는다. 침묵 누락 금지 — 건수는 항상 표면화.
 * 펼침은 사유(항목)만 나열하고, 근거(ref)는 항목별 버튼 → 모달에서 모아 본다.
 */

type ReasonGroup = { reason: string; refs: string[] };

function groupByReason(items: DbUnresolved[]): ReasonGroup[] {
  const m = new Map<string, string[]>();
  for (const u of items) m.set(u.reason, [...(m.get(u.reason) ?? []), u.ref]);
  return [...m.entries()].map(([reason, refs]) => ({ reason, refs }));
}

function EvidenceModal({ group, onClose }: { group: ReasonGroup; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`근거 — ${group.reason}`}
        className="glass-heavy rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col"
        style={{ maxHeight: "70vh" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-semibold text-text-primary">근거 {group.refs.length}건</h2>
            <p className="text-text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {group.reason}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-text-muted hover:text-text-primary transition-colors bg-transparent border-0 cursor-pointer"
            style={{ font: "inherit", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <ul style={{ margin: 0, padding: "12px 20px 16px 36px", overflowY: "auto" }}>
          {group.refs.map((ref) => (
            <li key={ref} style={{ marginBottom: 3 }}>
              <Ev>{ref}</Ev>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
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
  const [evidenceOf, setEvidenceOf] = useState<ReasonGroup | null>(null);
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
            <div key={g.reason} className="flex items-center gap-2" style={{ marginBottom: 5 }}>
              <span className="text-text-secondary" style={{ fontSize: 12.5 }}>
                {g.reason} <span className="text-text-muted">×{g.refs.length}</span>
              </span>
              <button
                type="button"
                onClick={() => setEvidenceOf(g)}
                aria-label={`${g.reason} 근거 ${g.refs.length}건 보기`}
                className="rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-medium transition-colors cursor-pointer bg-transparent"
                style={{ fontSize: 11, padding: "1px 6px", lineHeight: 1.5 }}
              >
                근거 {g.refs.length}
              </button>
            </div>
          ))}
        </div>
      )}
      {evidenceOf && <EvidenceModal group={evidenceOf} onClose={() => setEvidenceOf(null)} />}
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
