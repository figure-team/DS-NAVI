import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useDashboardStore } from "../../store";
import BusinessFlowView from "../BusinessFlowView";
import { businessFlowRejectedReason, parseBusinessFlows } from "../../utils/businessFlow";
import type { BizFlow } from "../../utils/businessFlow";
import { findDomain } from "../../utils/domainData";
import { useEscClose } from "./shared";
import { BORDER, FAINT, OK, WARN } from "./types";

/**
 * ② 업무흐름도 비포·에프터 모달 (2026-07-17 사용자 결정).
 *
 * 좌 = 비포(현행 그대로), 우 = 에프터(같은 도식 + **영향 도달 표식**). 렌더러는 업무지도 >
 * 시스템구성도 > 업무흐름도의 BusinessFlowView 를 그대로 쓴다(범례 포함) — 다른 도식을 새로
 * 그리면 두 화면이 갈라진다.
 *
 * "에프터"가 표식인 이유(창작 금지): 확정 전 요청의 미래 도식(활동 추가/삭제 후 토폴로지)을
 * 그리는 건 엔진 산출이 아니라 창작이다. 여기서 참인 것은 "이 변경의 영향이 어느 활동에
 * 도달하는가"(upstream.flows × 활동의 flowRef 결정론 조인)뿐이고, 정확히 그것만 그린다.
 * 신규(to-be) 기능은 위치를 알 수 없으므로 도식 밖 칩으로만 표기한다.
 */

interface Candidate {
  domainId: string;
  domainName: string;
  title: string;
  flow: BizFlow;
  impactIds: Set<string>;
  rejected: string | null;
}

/** 비교 패널 한쪽 — 라벨 스트립 + 도식(부모 높이 채움). 그리드 자식으로 직접 두어야
 *  stretch 로 높이를 받는다 — 래퍼로 감싸면 내부 flex-1 이 0 높이로 붕괴한다(QA 실측). */
function Pane({ label, tone, children, foot, style }: { label: string; tone: string; children: ReactNode; foot?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="flex flex-col min-h-0 min-w-0" style={style}>
      <div className="shrink-0 flex items-center" style={{ gap: 7, padding: "7px 14px", borderBottom: BORDER, background: `color-mix(in srgb, ${tone} 7%, transparent)` }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: "none" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>{label}</span>
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
      {foot}
    </div>
  );
}

export default function FlowCompareModal({ flows, addedNames, onClose }: {
  flows: { flowId: string; domainId: string }[];
  /** ①의 changeset.added — 위치 미정 신규 후보(도식 창작 금지 → 칩 표기). */
  addedNames: string[];
  onClose: () => void;
}) {
  useEscClose(onClose);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const affected = useMemo(() => new Set(flows.map((f) => f.flowId)), [flows]);

  // 후보 프로세스 — 영향 흐름(flowRef)이 실제 등장하는 업무 프로세스만. 영향 노드가 0인
  // 프로세스를 끼우면 "에프터 == 비포"인 무의미한 비교가 후보를 흐린다.
  const candidates = useMemo<Candidate[]>(() => {
    if (!domainGraph) return [];
    const out: Candidate[] = [];
    for (const domainId of [...new Set(flows.map((f) => f.domainId))]) {
      const node = findDomain(domainGraph, domainId);
      if (!node) continue;
      const rejected = businessFlowRejectedReason(node);
      for (const proc of parseBusinessFlows(node)) {
        const ids = new Set(
          proc.flow.nodes.filter((n) => n.flowRef && affected.has(n.flowRef)).map((n) => n.id),
        );
        if (ids.size > 0) {
          out.push({
            domainId,
            domainName: node.name ?? domainId.replace(/^domain:/, ""),
            title: proc.title ?? `프로세스 ${proc.index + 1}`,
            flow: proc.flow,
            impactIds: ids,
            rejected,
          });
        }
      }
    }
    return out;
  }, [domainGraph, flows, affected]);

  const [sel, setSel] = useState(0);
  const cur = candidates[Math.min(sel, Math.max(candidates.length - 1, 0))] ?? null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="glass-heavy rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: "min(96vw, 1600px)", height: "min(92vh, 960px)" }}>
        {/* 헤더 — 제목 + 프로세스 선택 칩(복수 후보일 때) + 닫기 */}
        <div className="shrink-0 flex items-center flex-wrap border-b border-border-subtle" style={{ gap: 8, padding: "12px 18px", rowGap: 6 }}>
          <h2 className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>업무흐름도 비포 · 에프터</h2>
          <span className="text-text-muted" style={{ fontSize: 11 }}>영향 흐름 {flows.length}건 — 도식·범례는 업무지도의 업무흐름도와 동일</span>
          {candidates.length > 1 && (
            <span className="flex items-center flex-wrap" style={{ gap: 5, marginLeft: 8, rowGap: 4 }}>
              {candidates.map((c, i) => (
                <button key={`${c.domainId}:${c.title}:${i}`} type="button" onClick={() => setSel(i)}
                  className="rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  style={{ padding: "3px 9px", fontSize: 11, border: i === sel ? "1px solid var(--color-accent)" : BORDER, color: i === sel ? "var(--color-accent)" : "var(--color-text-secondary)", background: i === sel ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent" }}>
                  {c.domainName} — {c.title}
                  <span className="tabular-nums" style={{ marginLeft: 5, fontSize: 9.5, color: WARN }}>영향 {c.impactIds.size}</span>
                </button>
              ))}
            </span>
          )}
          <button onClick={onClose} aria-label="닫기" className="ml-auto text-text-muted hover:text-text-primary cursor-pointer" style={{ fontSize: 18, lineHeight: 1, background: "none", border: "none" }}>×</button>
        </div>

        {!domainGraph ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 13 }}>업무지도 그래프를 아직 불러오지 못했습니다 — 잠시 후 다시 여세요.</div>
        ) : !cur ? (
          <div className="flex-1 flex items-center justify-center" style={{ padding: 40 }}>
            <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.7, maxWidth: 520 }}>
              영향받는 코드 흐름이 <b className="text-text-secondary">업무 프로세스 도식에 연결되어 있지 않습니다</b> —
              해당 도메인의 업무흐름도가 미채움(순차 근사)이거나 활동에 flowRef 가 기재되지 않은 경우입니다.
              도식 자체는 업무 지도에서 볼 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-2">
            <Pane label="비포 — 현행" tone={OK}>
              {/* key — 프로세스 전환 시 ELK 레이아웃·선택 리셋(FlowListView 의 key=bfIdx 와 동형). */}
              <BusinessFlowView key={`before-${sel}`} domainId={cur.domainId} biz={cur.flow} rejectedReason={cur.rejected} title={`비포 — ${cur.title}`} domainName={cur.domainName} />
            </Pane>
              <Pane
                label="에프터 — 변경 반영 시 (영향 도달 표식)"
                tone={WARN}
                style={{ borderLeft: BORDER }}
                foot={
                  addedNames.length > 0 ? (
                    <div className="shrink-0 flex items-baseline flex-wrap border-t border-border-subtle" style={{ gap: 6, padding: "7px 14px", rowGap: 4 }}>
                      <span style={{ fontSize: 10, color: FAINT, flex: "none" }} title="①의 changeset.added — 아직 코드·도식이 없어 위치를 그릴 수 없습니다(창작 금지). 확정·구현 후 재분석이 도식에 반영합니다.">신규(위치 미정)</span>
                      {addedNames.map((n) => (
                        <span key={n} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: OK, border: `1px dashed color-mix(in srgb, ${OK} 55%, transparent)`, borderRadius: 5, padding: "1px 6px" }}>+{n.replace(/^to-be:/, "")}</span>
                      ))}
                    </div>
                  ) : undefined
                }
              >
                <BusinessFlowView key={`after-${sel}`} domainId={cur.domainId} biz={cur.flow} rejectedReason={cur.rejected} title={`에프터 — ${cur.title}`} domainName={cur.domainName}
                  impactIds={cur.impactIds} impactLegend="영향 도달 — 이 변경이 연쇄로 건드리는 활동" />
              </Pane>
          </div>
        )}

        {/* 정직성 각주 — 에프터는 미래 도식의 창작이 아니라 영향 도달의 투영이다. */}
        <div className="shrink-0 border-t border-border-subtle text-text-muted" style={{ padding: "7px 18px", fontSize: 10.5, lineHeight: 1.5 }}>
          <b className="text-text-secondary">에프터</b>는 현행 도식 위에 <b style={{ color: WARN }}>영향 도달</b>(변경 시드에서 연쇄로 닿는 활동)을 표식한 것입니다 —
          확정 전 요청의 미래 토폴로지(활동 추가·삭제)는 엔진 산출이 아니라 그리지 않습니다.
        </div>
      </div>
    </div>
  );
}
