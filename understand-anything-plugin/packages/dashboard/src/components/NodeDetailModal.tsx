import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "../contexts/I18nContext";
import { useDashboardStore } from "../store";
import type { GraphNode } from "@understand-anything/core/types";
import {
  parseFlowStepClaim,
  type DomainClaimCitation,
  type StepDetailSection,
} from "../utils/domainData";
import CitationChip from "./CitationChip";
import VerdictBadge from "./VerdictBadge";
import TrustBadge from "./TrustBadge";

const APPROVER_STORAGE_KEY = "ktds.approver";

/**
 * 노드 상세 모달 (P3) — 템플릿 섹션별 의미 주장(요약·역할 등) + 결정론 신호(메서드·
 * 호출관계). 의미 주장은 **인라인 편집·확정**(서버 저장) 가능 — 저장 즉시 신뢰 배지가
 * `확정(approver)`. 결정론 사실(메서드/호출)은 편집 대상 아님(읽기). 병합은 read-time:
 * store 의 node-overrides 가 그래프 주장을 덮는다(domain-graph.json 불변).
 */
export interface NodeDetailModalProps {
  node: GraphNode;
  layerColor: string;
  laneLabel: string;
  methods: string[];
  callsOut: Array<{ id: string; name: string }>;
  callsIn: Array<{ id: string; name: string }>;
  detailSections: StepDetailSection[];
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

interface EditableClaim {
  key: string; // "summary" | "detail:<sectionId>"
  label: string;
  original: string;
  verdict: "GROUNDED" | "NEEDS_REVIEW" | null;
  citations: DomainClaimCitation[];
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

  const override = useDashboardStore((s) => s.nodeOverrides[node.id]);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const accessToken = useDashboardStore((s) => s.accessToken);
  const saveNodeOverride = useDashboardStore((s) => s.saveNodeOverride);
  const canWrite = accessToken !== null;

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const sectionLabel = (sectionId: string): string =>
    t.flowView.detailSections[sectionId as keyof typeof t.flowView.detailSections] ?? sectionId;

  // 편집 가능한 의미 주장: 요약 + 템플릿 상세 섹션. 결정론 사실은 제외.
  const editableClaims = useMemo<EditableClaim[]>(() => {
    const summaryClaim = parseFlowStepClaim(node);
    const out: EditableClaim[] = [
      {
        key: "summary",
        label: t.flowView.detailSummary,
        original: node.summary ?? "",
        verdict: summaryClaim?.verdict ?? null,
        citations: summaryClaim?.citations ?? [],
      },
    ];
    for (const s of detailSections) {
      out.push({
        key: `detail:${s.sectionId}`,
        label: sectionLabel(s.sectionId),
        original: s.text,
        verdict: s.verdict,
        citations: s.citations,
      });
    }
    return out;
    // sectionLabel/t are stable per render; deps cover the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, detailSections, t]);

  // read-time 병합: 오버레이가 있으면 그 텍스트가 그래프 주장을 덮는다.
  const effectiveText = (key: string, original: string): string =>
    override?.editedClaims?.[key] ?? original;

  const beginEdit = () => {
    const seed: Record<string, string> = {};
    for (const c of editableClaims) seed[c.key] = effectiveText(c.key, c.original);
    setDrafts(seed);
    setError(null);
    setEditing(true);
  };

  const resolveApprover = (): string | null => {
    if (approverHandle && approverHandle.trim()) return approverHandle.trim();
    const remembered = localStorage.getItem(APPROVER_STORAGE_KEY);
    if (remembered && remembered.trim()) return remembered.trim();
    const entered = window.prompt(t.flowView.approverPrompt)?.trim();
    if (!entered) return null;
    localStorage.setItem(APPROVER_STORAGE_KEY, entered);
    return entered;
  };

  const onSave = async () => {
    const approver = resolveApprover();
    if (!approver) return; // 사용자가 입력 취소 — 조용히 중단(상태 변경 없음).
    // 확정 단위 = 노드 통째(설계 §2.4): 편집 가능한 모든 의미 주장을 함께 확정.
    const editedClaims: Record<string, string> = {};
    for (const c of editableClaims) editedClaims[c.key] = drafts[c.key] ?? effectiveText(c.key, c.original);
    setSaving(true);
    setError(null);
    const result = await saveNodeOverride(node.id, editedClaims, approver);
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.error ?? t.flowView.saveError);
  };

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
        {/* Header — layer badge + name + file:line + trust badge + close. */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-block uppercase font-semibold rounded px-1.5 py-0.5"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: layerColor,
                  background: `${layerColor}1f`,
                }}
              >
                {laneLabel}
              </span>
              <TrustBadge
                confirmedBy={override?.approver ?? null}
                verdict={parseFlowStepClaim(node)?.verdict ?? null}
              />
            </div>
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
          {/* 의미 주장 섹션(요약/역할 등) — 읽기 또는 인라인 편집. */}
          <section className="space-y-4">
            {editableClaims.map((c) => (
              <div key={c.key}>
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-muted mb-1.5">
                  {c.label}
                  {/* 오버레이 있으면 사람 확정, 없으면 기계 verdict. */}
                  {override ? (
                    <TrustBadge confirmedBy={override.approver} />
                  ) : (
                    c.verdict && <VerdictBadge verdict={c.verdict} />
                  )}
                </p>
                {editing ? (
                  <textarea
                    value={drafts[c.key] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                    rows={c.key === "summary" ? 2 : 4}
                    className="w-full bg-elevated text-text-primary text-sm rounded-lg px-3 py-2 border border-border-subtle focus:outline-none focus:border-accent/60 leading-relaxed"
                  />
                ) : (
                  <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {effectiveText(c.key, c.original) || "—"}
                  </p>
                )}
                {/* 인용칩 — 편집 중에도 보존/표시(v1 은 텍스트만 편집, 인용 재작성은 v2). */}
                {c.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.citations.map((ci, i) => (
                      <CitationChip key={`${ci.filePath}:${ci.line}:${i}`} filePath={ci.filePath} line={ci.line} status={ci.status} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {detailSections.length === 0 && !editing && (
              <p className="text-xs text-text-muted">{t.flowView.detailSectionsEmpty}</p>
            )}
          </section>

          {/* 편집/저장 컨트롤. 라이브 서버(토큰) 없으면 읽기 전용 안내. */}
          <div className="flex items-center gap-2">
            {canWrite ? (
              editing ? (
                <>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-md bg-accent/15 border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
                  >
                    {t.flowView.saveButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                    }}
                    disabled={saving}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                  >
                    {t.flowView.cancelButton}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={beginEdit}
                  className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
                >
                  {t.flowView.editButton}
                </button>
              )
            ) : (
              <p className="text-[11px] text-text-muted">{t.flowView.noWriteServer}</p>
            )}
            {error && <span className="text-[11px] text-amber-500">{t.flowView.saveError}: {error}</span>}
            {override && !editing && (
              <span className="text-[11px] text-text-muted ml-auto">{t.flowView.userEditedNote}</span>
            )}
          </div>

          {/* 사용 메서드(결정론, 편집 불가). */}
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
