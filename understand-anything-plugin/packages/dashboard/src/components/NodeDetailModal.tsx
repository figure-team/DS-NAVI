import { useEffect, useRef } from "react";

import { useI18n } from "../contexts/I18nContext";
import type { GraphNode } from "@understand-anything/core/types";
import type { StepDetailSection } from "../utils/domainData";
import CitationChip from "./CitationChip";
import VerdictBadge from "./VerdictBadge";

/**
 * 노드 상세 모달 (P2, 읽기 전용) — 기능 스파인 노드의 풍부한 상세를 띄운다:
 * 템플릿 섹션별 의미 주장(역할 등, 인용·검증 포함) + 사용 메서드(결정론) +
 * 호출관계 in/out(결정론). 편집/확정(P3)은 후속. 사이드바 "상세보기"가 연다.
 */
export interface NodeDetailModalProps {
  node: GraphNode;
  /** 계층 색/라벨 — 사이드바와 동일 토큰으로 일관성 유지. */
  layerColor: string;
  laneLabel: string;
  /** 결정론 신호(FlowSpineView 가 calls 엣지에서 계산해 전달). */
  methods: string[];
  callsOut: Array<{ id: string; name: string }>;
  callsIn: Array<{ id: string; name: string }>;
  /** 템플릿 섹션별 의미 주장(parseStepDetailSections). */
  detailSections: StepDetailSection[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

export default function NodeDetailModal({
  node,
  layerColor,
  laneLabel,
  methods,
  callsOut,
  callsIn,
  detailSections,
  onClose,
  onSelectNode,
}: NodeDetailModalProps) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [onClose]);

  // 섹션 id → 표시명(로케일). 미정의 id 는 id 그대로(향후 사용자 커스텀 템플릿 대비).
  const sectionLabel = (sectionId: string): string =>
    t.flowView.detailSections[sectionId as keyof typeof t.flowView.detailSections] ?? sectionId;

  const navigate = (id: string) => {
    onSelectNode(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-label={node.name}
        className="glass-heavy rounded-xl shadow-2xl w-full max-w-2xl max-h-[82vh] overflow-hidden animate-fade-slide-in"
      >
        {/* Header — layer badge + name + file:line + close. */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="min-w-0">
            <span
              className="inline-block uppercase font-semibold rounded px-1.5 py-0.5 mb-1.5"
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                color: layerColor,
                background: `${layerColor}1f`,
              }}
            >
              {laneLabel}
            </span>
            <h2 className="font-heading text-xl text-text-primary break-words">{node.name}</h2>
            {node.filePath && (
              <p className="text-[11px] text-text-muted break-all mt-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                {node.filePath}
                {node.lineRange ? `:${node.lineRange[0]}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-text-muted hover:text-accent transition-colors"
            aria-label={t.flowView.closeDetail}
            style={{ fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(82vh-92px)]">
          {/* 의미 주장 섹션(역할 등) — 텍스트 + 검증 배지 + 인용칩. */}
          {detailSections.length > 0 ? (
            detailSections.map((s) => (
              <section key={s.sectionId}>
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  {sectionLabel(s.sectionId)}
                  <VerdictBadge verdict={s.verdict} />
                </p>
                <p className="text-sm text-text-secondary leading-relaxed">{s.text}</p>
                {s.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.citations.map((c, i) => (
                      <CitationChip key={`${c.filePath}:${c.line}:${i}`} filePath={c.filePath} line={c.line} status={c.status} />
                    ))}
                  </div>
                )}
              </section>
            ))
          ) : (
            <p className="text-xs text-text-muted">{t.flowView.detailSectionsEmpty}</p>
          )}

          {/* 사용 메서드(결정론). */}
          {methods.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5">{t.flowView.detailMethods}</p>
              <div className="flex flex-col gap-0.5">
                {methods.map((m) => (
                  <span key={m} className="text-[12px] text-text-secondary" style={{ fontFamily: "var(--font-mono)" }}>
                    {m}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 호출관계 in/out(결정론) — 클릭 시 해당 노드로 이동. */}
          {(callsOut.length > 0 || callsIn.length > 0) && (
            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5">{t.flowView.detailCallsOut}</p>
                {callsOut.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {callsOut.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(c.id)}
                        className="text-left text-[12px] text-text-secondary hover:text-accent transition-colors truncate"
                        title={c.name}
                      >
                        → {c.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-muted">—</p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5">{t.flowView.detailCallsIn}</p>
                {callsIn.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {callsIn.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(c.id)}
                        className="text-left text-[12px] text-text-secondary hover:text-accent transition-colors truncate"
                        title={c.name}
                      >
                        ← {c.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-muted">—</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
