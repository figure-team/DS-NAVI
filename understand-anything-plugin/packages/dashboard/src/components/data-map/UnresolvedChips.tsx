import { useEffect, useMemo, useState } from "react";

import { Ev } from "../proto/Proto";
import type { DbUnresolved } from "./types";

/**
 * db-schema unresolved 배너 — severity 분리(개편 ①).
 * warn(및 구버전 미지정) = 경고 배너, info = 중립 "참고" 배너(동일 정의 중복 등 무해 신호).
 *
 * 배너는 항상 한 줄(요약)로 고정 — 클릭하면 높이 고정 모달이 열린다. 인라인 펼침을 두지
 * 않는 이유는 스케일 때문: eGov 실측이 warn 11,292건/사유 436종, info 근거 8,700건이라
 * 인라인으로 깔면 페이지 스크롤이 감당이 안 된다.
 *
 * 모달은 마스터-디테일 2단 — 좌측 사유 목록, 우측 선택한 사유의 근거만. 양쪽 독립 스크롤.
 * 근거는 REF_PAGE 건씩 점진 렌더(8,700행 일괄 렌더 회피). 침묵 누락 금지 — 전체 건수는
 * 배너·헤더·"n/N 표시"에 항상 표면화한다.
 */

const REF_PAGE = 200;

/** eGov 급(11,292건)에서 자릿수를 읽을 수 있게 — 천 단위 구분자. */
const n = (v: number) => v.toLocaleString("ko-KR");

type ReasonGroup = { reason: string; refs: string[] };

function groupByReason(items: DbUnresolved[]): ReasonGroup[] {
  const m = new Map<string, string[]>();
  for (const u of items) m.set(u.reason, [...(m.get(u.reason) ?? []), u.ref]);
  return [...m.entries()]
    .map(([reason, refs]) => ({ reason, refs }))
    .sort((a, b) => b.refs.length - a.refs.length);
}

function EvidencePane({ group }: { group: ReasonGroup }) {
  const [shown, setShown] = useState(REF_PAGE);
  // 사유를 바꾸면 페이지를 처음으로 되돌린다.
  useEffect(() => setShown(REF_PAGE), [group.reason]);

  const visible = group.refs.slice(0, shown);
  const rest = group.refs.length - visible.length;

  return (
    <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
      <div
        className="border-b border-border-subtle text-text-secondary"
        style={{ padding: "8px 14px", fontSize: 12, fontWeight: 650 }}
      >
        근거 {n(group.refs.length)}건
        {rest > 0 && (
          <span className="text-text-muted" style={{ fontWeight: 400 }}>
            {" "}
            — {n(visible.length)}건 표시
          </span>
        )}
      </div>
      <div style={{ overflowY: "auto", padding: "8px 14px 12px" }}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {visible.map((ref, i) => (
            <li key={`${ref}-${i}`} style={{ marginBottom: 3 }}>
              <Ev>{ref}</Ev>
            </li>
          ))}
        </ul>
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setShown((n) => n + REF_PAGE)}
            className="rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium transition-colors cursor-pointer bg-transparent"
            style={{ fontSize: 11.5, padding: "3px 10px", marginTop: 8 }}
          >
            {n(Math.min(REF_PAGE, rest))}건 더 보기 (남은 {n(rest)}건)
          </button>
        )}
      </div>
    </div>
  );
}

function UnresolvedModal({
  title,
  sub,
  items,
  onClose,
}: {
  title: string;
  sub: string;
  items: DbUnresolved[];
  onClose: () => void;
}) {
  const groups = useMemo(() => groupByReason(items), [items]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = groups[selected] ?? groups[0];

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
        aria-label={title}
        className="glass-heavy rounded-xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col"
        // height 고정이 아니라 상한 — jpetstore(사유 1건)처럼 적으면 모달이 같이 줄고,
        // eGov(436건)처럼 많을 때만 70vh에서 잘려 내부 스크롤로 넘어간다.
        style={{ maxHeight: "70vh" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <p className="text-text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {sub}
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

        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          {/* 좌 — 사유(항목) 목록 */}
          <div
            className="flex flex-col border-r border-border-subtle"
            style={{ width: "42%", minWidth: 0 }}
          >
            <div
              className="border-b border-border-subtle text-text-secondary"
              style={{ padding: "8px 14px", fontSize: 12, fontWeight: 650 }}
            >
              사유 {n(groups.length)}건
            </div>
            <div style={{ overflowY: "auto", padding: "6px 8px 10px" }}>
              {groups.map((g, i) => {
                const on = i === selected;
                return (
                  <button
                    key={g.reason}
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-current={on}
                    className={`w-full text-left rounded cursor-pointer border-0 transition-colors ${
                      on ? "text-text-primary" : "bg-transparent text-text-secondary hover:bg-elevated"
                    }`}
                    style={{
                      font: "inherit",
                      fontSize: 12.5,
                      padding: "6px 8px",
                      marginBottom: 2,
                      // 선택 강조는 proto-tree .doc.on 관례와 동일한 accent 틴트.
                      background: on
                        ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
                        : undefined,
                    }}
                  >
                    {g.reason} <span className="text-text-muted">×{n(g.refs.length)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 우 — 선택한 사유의 근거만 */}
          {active && <EvidencePane group={active} />}
        </div>
      </div>
    </div>
  );
}

function Chip({
  tone,
  label,
  title,
  sub,
  items,
}: {
  tone: "warn" | "info";
  label: string;
  title: string;
  sub: string;
  items: DbUnresolved[];
}) {
  const [open, setOpen] = useState(false);
  const warn = tone === "warn";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 배너에 있던 부연(sub)은 칩에 자리가 없어 aria-label·title 로 보존 — 모달 부제에도 동일하게 남김.
        aria-label={`${title} ${sub} — 클릭하면 사유·근거`}
        title={`${title} ${sub}`}
        className="rounded-full border cursor-pointer transition-colors hover:bg-elevated whitespace-nowrap"
        style={{
          font: "inherit",
          fontSize: 11.5,
          fontWeight: 650,
          lineHeight: 1.7,
          padding: "0 8px",
          background: "transparent",
          borderColor: warn ? "var(--color-status-warn)" : "var(--color-border-medium)",
          color: warn ? "var(--color-status-warn)" : "var(--color-text-muted)",
        }}
      >
        {label}
      </button>
      {open && (
        <UnresolvedModal title={title} sub={sub} items={items} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * PageHead meta 줄에 인라인으로 얹는 칩 묶음 — 배너 행을 대체(2026-07-15).
 * 배너가 탭 바 위에서 46px 을 상시 먹고, db-schema 신호가 crud-matrix 기반 CRUD 탭에서도
 * 뜨던 스코프 누수를 함께 정리. meta 는 ReactNode 라 Proto.tsx(공통 금지 파일) 수정 없이 얹힌다.
 */
export default function UnresolvedChips({ unresolved }: { unresolved: DbUnresolved[] }) {
  const warns = unresolved.filter((u) => u.severity !== "info");
  const infos = unresolved.filter((u) => u.severity === "info");
  if (unresolved.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ marginLeft: 2 }}>
      {warns.length > 0 && (
        <Chip
          tone="warn"
          label={`⚠ 미해결 ${n(warns.length)}`}
          title={`미해결 항목 ${n(warns.length)}건`}
          sub="— 스캔 중 결정되지 않은 신호(정합 확인 필요)"
          items={warns}
        />
      )}
      {infos.length > 0 && (
        <Chip
          tone="info"
          label={`참고 ${n(infos.length)}`}
          title={`참고 ${n(infos.length)}건`}
          sub="— 무해 신호(동일 정의 중복 등)"
          items={infos}
        />
      )}
    </span>
  );
}
