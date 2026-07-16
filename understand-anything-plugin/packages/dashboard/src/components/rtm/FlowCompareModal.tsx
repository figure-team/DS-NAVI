import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useDashboardStore } from "../../store";
import BusinessFlowView from "../BusinessFlowView";
import FlowSpineView from "../FlowSpineView";
import { businessFlowRejectedReason, parseBusinessFlows } from "../../utils/businessFlow";
import type { BizFlow } from "../../utils/businessFlow";
import { findDomain } from "../../utils/domainData";
import { useEscClose } from "./shared";
import { BORDER, FAINT, OK, WARN } from "./types";

/**
 * ② 흐름 비포·에프터 모달 (2026-07-17 사용자 결정, +기능흐름도 2차 확장).
 *
 * 두 렌즈를 한 모달이 겸한다:
 *  - **업무흐름도** — 좌 = 현행 그대로, 우 = 같은 도식 + 영향 도달 활동 표식. 렌더러는
 *    업무지도의 BusinessFlowView 재사용(범례 포함).
 *  - **기능흐름도** — 업무흐름도 활동의 "기능 열기"(flow:) 드릴다운이 도메인 페이지로
 *    튕기는 대신 **여기서 코드 흐름 비포·에프터로 전환**한다(모달 밖 이탈 없이 심화 —
 *    사용자 UX 요구). 렌더러는 코드 탭의 FlowSpineView 재사용, 에프터는 영향 파일
 *    집합(시드/도달)으로 단계를 표식한다.
 *
 * "에프터"가 표식인 이유(창작 금지): 확정 전 요청의 미래 도식(활동 추가/삭제 후 토폴로지)을
 * 그리는 건 엔진 산출이 아니라 창작이다. 여기서 참인 것은 "이 변경의 영향이 어디에
 * 도달하는가"(결정론 조인)뿐이고, 정확히 그것만 그린다. 신규(to-be)는 위치를 알 수 없으므로
 * 도식 밖 칩으로만 표기한다.
 */

interface Candidate {
  domainId: string;
  domainName: string;
  title: string;
  flow: BizFlow;
  /** 도달 활동(시드 제외) — '영향' 배지. */
  impactIds: Set<string>;
  /** 변경 기점 활동(flowRef ∈ 시드 기능) — '~ 변경 기점' 배지. 도달과 라벨을 가른다(오독 방지). */
  seedIds: Set<string>;
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

/** 신규(to-be) 칩 스트립 — 에프터 패널 하단 공용(창작 금지: 도식 밖 표기). */
function AddedFoot({ addedNames }: { addedNames: string[] }) {
  if (addedNames.length === 0) return null;
  return (
    <div className="shrink-0 flex items-baseline flex-wrap border-t border-border-subtle" style={{ gap: 6, padding: "7px 14px", rowGap: 4 }}>
      <span style={{ fontSize: 10, color: FAINT, flex: "none" }} title="①의 changeset.added — 아직 코드·도식이 없어 위치를 그릴 수 없습니다(창작 금지). 확정·구현 후 재분석이 도식에 반영합니다.">신규(위치 미정)</span>
      {addedNames.map((n) => (
        <span key={n} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: OK, border: `1px dashed color-mix(in srgb, ${OK} 55%, transparent)`, borderRadius: 5, padding: "1px 6px" }}>+{n.replace(/^to-be:/, "")}</span>
      ))}
    </div>
  );
}

/** 렌즈·대상 선택 칩 공용 스타일. */
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 9px",
    fontSize: 11,
    border: active ? "1px solid var(--color-accent)" : BORDER,
    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
    background: active ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent",
  };
}

/** 표식 배지 글리프(범례용) — FlowSpineView 카드 배지의 축소판. */
function MarkGlyph({ label }: { label: string }) {
  return (
    <span aria-hidden className="rounded-full font-bold" style={{ fontSize: 8, padding: "1px 4px", color: WARN, background: `color-mix(in srgb, ${WARN} 14%, transparent)`, border: `1px solid ${WARN}` }}>{label}</span>
  );
}

export default function FlowCompareModal({ flows, addedNames, impactFiles, seedFiles, seedFlowIds, onClose }: {
  flows: { flowId: string; domainId: string }[];
  /** ①의 changeset.added — 위치 미정 신규 후보(도식 창작 금지 → 칩 표기). 없으면 빈 배열. */
  addedNames: string[];
  /** 영향 도달 파일 집합(상류 API·파일 + 하류 파일·매퍼) — 기능흐름도 에프터의 표식 재료. */
  impactFiles: Set<string>;
  /** 변경 시드 파일 집합 — 기능흐름도 에프터에서 '~ 변경 기점'으로 도달과 구분. */
  seedFiles: Set<string>;
  /**
   * 변경 기점 기능(flow) id 집합 — 업무흐름도 에프터에서 시드 기능의 활동을 '~ 변경 기점'으로
   * 가른다(RTM ②: impactRun.bySource 의 fnId 가 곧 flow id). 원장(/change)엔 이 정보가 없어
   * 생략 가능 — 그땐 전부 '영향'으로만 표식한다(근거 없는 승격 금지).
   */
  seedFlowIds?: Set<string>;
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
        const seedIds = new Set(
          proc.flow.nodes.filter((n) => n.flowRef && seedFlowIds?.has(n.flowRef)).map((n) => n.id),
        );
        const ids = new Set(
          proc.flow.nodes
            .filter((n) => n.flowRef && affected.has(n.flowRef) && !seedIds.has(n.id))
            .map((n) => n.id),
        );
        if (ids.size > 0 || seedIds.size > 0) {
          out.push({
            domainId,
            domainName: node.name ?? domainId.replace(/^domain:/, ""),
            title: proc.title ?? `프로세스 ${proc.index + 1}`,
            flow: proc.flow,
            impactIds: ids,
            seedIds,
            rejected,
          });
        }
      }
    }
    return out;
  }, [domainGraph, flows, affected, seedFlowIds]);

  const [sel, setSel] = useState(0);
  const cur = candidates[Math.min(sel, Math.max(candidates.length - 1, 0))] ?? null;

  // 기능흐름도 모드 — 업무흐름도의 "기능 열기" 드릴다운이 여기로 전환한다. 업무 프로세스
  // 도식이 없어도(후보 0) 영향 흐름만 있으면 기능흐름도 비교는 가능하므로 초기 모드를 가른다.
  const [view, setView] = useState<"biz" | "code">(candidates.length > 0 || flows.length === 0 ? "biz" : "code");
  const [codeFlowId, setCodeFlowId] = useState<string | null>(flows[0]?.flowId ?? null);
  const flowName = (id: string): string =>
    domainGraph?.nodes.find((n) => n.id === id)?.name ?? id.replace(/^flow:/, "").replace(/^ANY\s+/, "");
  const openCode = (flowRef: string) => { setCodeFlowId(flowRef); setView("code"); };
  // 드릴다운으로 영향 목록 밖 흐름을 열 수도 있다 — 조용히 바꿔치지 않고 칩으로 실체를 보인다.
  const codeChips = useMemo(() => {
    const base = flows.map((f) => f.flowId);
    if (codeFlowId && !base.includes(codeFlowId)) base.push(codeFlowId);
    return base;
  }, [flows, codeFlowId]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="glass-heavy rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: "min(96vw, 1600px)", height: "min(92vh, 960px)" }}>
        {/* 헤더 — 제목 + 렌즈 토글(업무/기능) + 대상 선택 칩 + 닫기 */}
        <div className="shrink-0 flex items-center flex-wrap border-b border-border-subtle" style={{ gap: 8, padding: "12px 18px", rowGap: 6 }}>
          <h2 className="text-text-primary" style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
            {view === "biz" ? "업무흐름도" : "기능흐름도"} 비포 · 에프터
          </h2>
          {/* 렌즈 토글 — 업무(프로세스 순서도) ↔ 기능(코드 흐름 스파인). */}
          <span className="flex items-center" style={{ gap: 4 }}>
            <button type="button" onClick={() => setView("biz")} disabled={candidates.length === 0}
              title={candidates.length === 0 ? "영향 흐름이 업무 프로세스 도식에 연결되어 있지 않습니다" : "업무 프로세스 순서도로 봅니다"}
              className="rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40" style={chipStyle(view === "biz")}>업무흐름도</button>
            <button type="button" onClick={() => setView("code")} disabled={codeChips.length === 0}
              title={codeChips.length === 0 ? "영향받는 코드 흐름이 없습니다" : "코드 흐름(기능흐름도)으로 봅니다 — 업무흐름도의 '기능 열기'로도 옵니다"}
              className="rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40" style={chipStyle(view === "code")}>기능흐름도</button>
          </span>
          {/* 대상 선택 칩 — 렌즈별(업무: 프로세스 / 기능: 흐름). */}
          {view === "biz" && candidates.length > 1 && (
            <span className="flex items-center flex-wrap" style={{ gap: 5, marginLeft: 8, rowGap: 4 }}>
              {candidates.map((c, i) => (
                <button key={`${c.domainId}:${c.title}:${i}`} type="button" onClick={() => setSel(i)}
                  className="rounded-md transition-colors cursor-pointer whitespace-nowrap" style={chipStyle(i === sel)}>
                  {c.domainName} — {c.title}
                  <span className="tabular-nums" style={{ marginLeft: 5, fontSize: 9.5, color: WARN }}>표식 {c.seedIds.size + c.impactIds.size}</span>
                </button>
              ))}
            </span>
          )}
          {view === "code" && codeChips.length > 0 && (
            <span className="flex items-center flex-wrap" style={{ gap: 5, marginLeft: 8, rowGap: 4 }}>
              {codeChips.map((id) => (
                <button key={id} type="button" onClick={() => setCodeFlowId(id)} title={id}
                  className="rounded-md transition-colors cursor-pointer whitespace-nowrap" style={chipStyle(id === codeFlowId)}>
                  {flowName(id)}
                  {!affected.has(id) && <span style={{ marginLeft: 5, fontSize: 9.5, color: FAINT }} title="영향 목록 밖 흐름 — 업무흐름도에서 드릴다운으로 열었습니다">영향 외</span>}
                </button>
              ))}
            </span>
          )}
          {/* 기능흐름도 표식 범례 — FlowSpineView 엔 범례 패널이 없어 헤더가 진다. */}
          {view === "code" && (
            <span className="flex items-center" style={{ gap: 9, marginLeft: 6 }}>
              <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }} title="①식별이 변경 대상으로 지목한 기능의 진입점 파일">
                <MarkGlyph label="~ 변경 기점" />시드 파일의 단계
              </span>
              <span className="flex items-center" style={{ gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }} title="변경 기점에서 연쇄로 닿는 파일 — 구현 시 함께 수정될 수 있으나 그 판정은 여기서 하지 않는다">
                <MarkGlyph label="영향" />도달 파일의 단계
              </span>
            </span>
          )}
          <button onClick={onClose} aria-label="닫기" className="ml-auto text-text-muted hover:text-text-primary cursor-pointer" style={{ fontSize: 18, lineHeight: 1, background: "none", border: "none" }}>×</button>
        </div>

        {!domainGraph ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 13 }}>업무지도 그래프를 아직 불러오지 못했습니다 — 잠시 후 다시 여세요.</div>
        ) : view === "biz" ? (
          !cur ? (
            <div className="flex-1 flex items-center justify-center" style={{ padding: 40 }}>
              <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.7, maxWidth: 520 }}>
                영향받는 코드 흐름이 <b className="text-text-secondary">업무 프로세스 도식에 연결되어 있지 않습니다</b> —
                해당 도메인의 업무흐름도가 미채움(순차 근사)이거나 활동에 flowRef 가 기재되지 않은 경우입니다.
                {codeChips.length > 0 && <> 상단 <b className="text-text-secondary">기능흐름도</b> 토글로 코드 흐름 비교는 볼 수 있습니다.</>}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-2">
              {/* key — 프로세스 전환 시 ELK 레이아웃·선택 리셋(FlowListView 의 key=bfIdx 와 동형). */}
              <Pane label="비포 — 현행" tone={OK}>
                <BusinessFlowView key={`before-${sel}`} domainId={cur.domainId} biz={cur.flow} rejectedReason={cur.rejected} title={`비포 — ${cur.title}`} domainName={cur.domainName} onOpenFlow={openCode} />
              </Pane>
              <Pane label="에프터 — 변경 반영 시 (영향 도달 표식)" tone={WARN} style={{ borderLeft: BORDER }} foot={<AddedFoot addedNames={addedNames} />}>
                <BusinessFlowView key={`after-${sel}`} domainId={cur.domainId} biz={cur.flow} rejectedReason={cur.rejected} title={`에프터 — ${cur.title}`} domainName={cur.domainName}
                  impactIds={cur.impactIds} seedIds={cur.seedIds}
                  impactLegend="영향 도달 — 변경 기점에서 연쇄로 닿는 활동(구현 시 함께 수정될 수 있음)" onOpenFlow={openCode} />
              </Pane>
            </div>
          )
        ) : !codeFlowId ? (
          <div className="flex-1 flex items-center justify-center text-text-muted" style={{ fontSize: 12.5 }}>영향받는 코드 흐름이 없습니다.</div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-2">
            <Pane label="비포 — 현행" tone={OK}>
              <FlowSpineView key={`code-before-${codeFlowId}`} flowId={codeFlowId} hideBack />
            </Pane>
            <Pane label="에프터 — 변경 반영 시 (영향 도달 표식)" tone={WARN} style={{ borderLeft: BORDER }} foot={<AddedFoot addedNames={addedNames} />}>
              <FlowSpineView key={`code-after-${codeFlowId}`} flowId={codeFlowId} hideBack impactFiles={impactFiles} seedFiles={seedFiles} />
            </Pane>
          </div>
        )}

        {/* 정직성 각주 — 에프터는 미래 도식의 창작이 아니라 영향 도달의 투영이다. */}
        <div className="shrink-0 border-t border-border-subtle text-text-muted" style={{ padding: "7px 18px", fontSize: 10.5, lineHeight: 1.5 }}>
          <b className="text-text-secondary">에프터</b>는 현행 도식 위에 <b style={{ color: WARN }}>~ 변경 기점</b>(①이 지목한 변경 기능)과 <b style={{ color: WARN }}>영향</b>(기점에서 연쇄로 닿는 {view === "biz" ? "활동" : "단계"})을 표식한 것입니다.
          <b className="text-text-secondary"> 영향 {view === "biz" ? "활동" : "단계"}도 구현 시 함께 수정될 수 있습니다</b> — 무엇을 고칠지의 판정은 엔진 산출이 아니라 여기서 단언하지 않으며,
          미래 토폴로지({view === "biz" ? "활동" : "단계"} 추가·삭제)도 그리지 않습니다.
          {view === "biz" && <> 활동을 누른 뒤 <b className="text-text-secondary">기능 열기</b>를 누르면 그 기능의 <b className="text-text-secondary">기능흐름도 비포·에프터</b>로 들어갑니다.</>}
        </div>
      </div>
    </div>
  );
}
