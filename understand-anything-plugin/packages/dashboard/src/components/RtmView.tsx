import { useCallback, useEffect, useState } from "react";

import { useDashboardStore } from "../store";
import TrustBadge from "./TrustBadge";

/**
 * 요구사항 추적표(RTM) 뷰 — R2(읽기) + R3(행 단위 추정→확정). 설계: docs/ktds/RTM_TAB_DESIGN.md.
 *
 * 뷰① 기능 기준: 도메인별 기능 그리드. 각 기능 행은 4축 추적 셀(진입점/구현/데이터/테스트)을
 * 코드 근거 + 신뢰도와 함께 보인다. 행 클릭 → 상세 패널에서 셀 교정 + 확정(approver). 생성물
 * rtm.json 은 불변, 편집/확정은 rtm-overrides.json 오버레이(읽기 시 병합, 오버레이가 이김).
 * 데이터: GET /rtm.json · GET /rtm-overrides.json · POST /rtm-override(토큰 게이트).
 * 요구사항 뷰②(R4)·인테이크(R5)는 후속.
 */
type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";

interface Evidence {
  file: string;
  line: number | null;
  snippet?: string;
}
interface TraceCell {
  value: string;
  confidence: Confidence;
  evidence: Evidence[];
}
interface FunctionRow {
  id: string;
  featureId: string;
  name: string;
  domainId: string;
  domainName: string;
  entryPoint: TraceCell;
  implementation: TraceCell;
  data: TraceCell;
  test: TraceCell;
  origin: "AS_IS" | "TO_BE";
  state: "IMPLEMENTED" | "PARTIAL" | "PLANNED" | "CHANGED" | "ORPHANED";
  requirementHistory: string[];
}
interface DomainGroup {
  id: string;
  name: string;
  functionCount: number;
}
interface RtmModel {
  schemaVersion: number;
  gitCommit: string | null;
  domains: DomainGroup[];
  functions: FunctionRow[];
}
interface RtmOverride {
  editedCells: Record<string, string>;
  approver: string;
  at: string;
}

const APPROVER_LS_KEY = "ktds.approver";

/** 신뢰도 → 칩 라벨 + 색. 추정/확인필요를 눈에 띄게(위험 신호), 확정은 절제. */
const CONF: Record<Confidence, { label: string; color: string }> = {
  CONFIRMED: { label: "확정", color: "var(--color-text-muted)" },
  CONFIRMED_AI: { label: "확정·AI", color: "var(--color-text-muted)" },
  INFERRED: { label: "추정", color: "#d4a574" },
  UNVERIFIED: { label: "확인필요", color: "#c98a8a" },
};

/** 기능 상태 → 배지. R2/R3 산출은 IMPLEMENTED/PLANNED 만 등장(나머지는 R4+). */
const STATE: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: "✅ 구현",
  PARTIAL: "🔁 부분",
  PLANNED: "⚠ 미구현",
  CHANGED: "~ 변경",
  ORPHANED: "🚫 고아",
};

type CellKey = "entryPoint" | "implementation" | "data" | "test";
const COLS: Array<{ key: CellKey; label: string }> = [
  { key: "entryPoint", label: "진입점" },
  { key: "implementation", label: "구현" },
  { key: "data", label: "데이터(CRUD)" },
  { key: "test", label: "테스트" },
];

function evidenceTitle(cell: TraceCell): string | undefined {
  if (cell.evidence.length === 0) return undefined;
  return cell.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join("\n");
}

export default function RtmView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const setApproverHandle = useDashboardStore((s) => s.setApproverHandle);
  const tokenQ = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken);

  const [model, setModel] = useState<RtmModel | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RtmOverride>>({});
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetch(`/rtm.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: RtmModel) => {
        if (!alive) return;
        if (Array.isArray(data?.functions)) setModel(data);
        else setError("rtm.json 형식 오류");
      })
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)));
    fetch(`/rtm-overrides.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: unknown) => {
        if (alive && data && typeof data === "object" && !Array.isArray(data)) {
          setOverrides(data as Record<string, RtmOverride>);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tokenQ]);

  const resolveApprover = useCallback((): string | null => {
    const fromStore = approverHandle?.trim();
    if (fromStore) return fromStore;
    const fromLs = typeof localStorage !== "undefined" ? localStorage.getItem(APPROVER_LS_KEY)?.trim() : undefined;
    if (fromLs) {
      setApproverHandle(fromLs);
      return fromLs;
    }
    const entered = typeof window !== "undefined" ? window.prompt("확정자(이름/핸들)를 입력하세요:")?.trim() : "";
    if (entered) {
      try {
        localStorage.setItem(APPROVER_LS_KEY, entered);
      } catch {
        /* ignore */
      }
      setApproverHandle(entered);
      return entered;
    }
    return null;
  }, [approverHandle, setApproverHandle]);

  /** 셀 표시값 — 오버레이 편집이 있으면 그 값(사람 확정), 없으면 생성물. */
  const effValue = (f: FunctionRow, key: CellKey | "name"): string => {
    const edited = overrides[f.id]?.editedCells?.[key];
    if (typeof edited === "string") return edited;
    return key === "name" ? f.name : f[key].value;
  };
  const isEdited = (f: FunctionRow, key: string): boolean =>
    typeof overrides[f.id]?.editedCells?.[key] === "string";
  const isConfirmed = (f: FunctionRow): boolean => Boolean(overrides[f.id]);

  const selectedRow = model?.functions.find((f) => f.id === selected) ?? null;

  const beginEdit = useCallback(() => {
    if (!selectedRow) return;
    setDraft({
      name: effValue(selectedRow, "name"),
      entryPoint: effValue(selectedRow, "entryPoint"),
      implementation: effValue(selectedRow, "implementation"),
      data: effValue(selectedRow, "data"),
      test: effValue(selectedRow, "test"),
    });
    setEditing(true);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow, overrides]);

  /** 확정 저장 — editing 이면 변경된 셀만, 아니면 빈 편집으로 행 확정(as-is). */
  const onConfirm = useCallback(
    async (fromEdit: boolean) => {
      if (!selectedRow || !accessToken) return;
      const approver = resolveApprover();
      if (!approver) return;
      const editedCells: Record<string, string> = {};
      if (fromEdit) {
        for (const key of ["name", "entryPoint", "implementation", "data", "test"] as const) {
          const original = key === "name" ? selectedRow.name : selectedRow[key].value;
          if (draft[key] !== undefined && draft[key] !== original) editedCells[key] = draft[key];
        }
      }
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/rtm-override?token=${encodeURIComponent(accessToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fnId: selectedRow.id, editedCells, approver }),
        });
        const data = (await res.json().catch(() => null)) as (RtmOverride & { error?: string }) | null;
        if (!res.ok || !data) {
          setSaveError(data?.error ?? `HTTP ${res.status}`);
          return;
        }
        setOverrides((prev) => ({ ...prev, [selectedRow.id]: { editedCells: data.editedCells, approver: data.approver, at: data.at } }));
        setEditing(false);
      } catch (e) {
        setSaveError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [selectedRow, accessToken, draft, resolveApprover],
  );

  const evidenceRate = (() => {
    if (!model) return 0;
    const cells = model.functions.flatMap((f) => [f.entryPoint, f.implementation, f.data, f.test]);
    if (cells.length === 0) return 0;
    return Math.round((cells.filter((c) => c.confidence === "CONFIRMED").length / cells.length) * 100);
  })();

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-root overflow-hidden relative">
      {/* 헤더 + 뷰 토글 */}
      <div className="flex items-center gap-3 shrink-0 bg-panel border-b border-border-subtle" style={{ padding: "10px 20px" }}>
        <span className="text-text-primary" style={{ fontSize: 14 }}>요구사항 추적표 (RTM)</span>
        <div className="flex items-center gap-1 ml-2">
          <span className="rounded-md bg-accent/20 text-accent" style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>기능 기준</span>
          <span className="rounded-md text-text-muted" style={{ padding: "3px 10px", fontSize: 11 }} title="요구사항 기준 뷰는 R4에서 제공됩니다.">요구사항 기준 (준비중)</span>
        </div>
        {model && (
          <span className="ml-auto text-text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
            도메인 {model.domains.length} · 기능 {model.functions.length} · 근거율 {evidenceRate}%
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: 20, paddingBottom: selectedRow ? "42vh" : 20 }}>
        {error ? (
          <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 520 }}>
            요구사항 추적표를 불러오지 못했습니다 ({error}).<br />
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>understand-rtm</code> 을 먼저 실행해{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>.understand-anything/rtm.json</code> 을 생성하세요.
          </div>
        ) : !model ? (
          <div className="text-text-muted" style={{ fontSize: 13 }}>불러오는 중…</div>
        ) : model.functions.length === 0 ? (
          <div className="text-text-muted" style={{ fontSize: 13 }}>기능이 없습니다.</div>
        ) : (
          model.domains.map((domain) => {
            const rows = model.functions.filter((f) => f.domainId === domain.id);
            if (rows.length === 0) return null;
            const confirmedCount = rows.filter(isConfirmed).length;
            return (
              <section key={domain.id} style={{ marginBottom: 26 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <span className="text-accent" style={{ fontSize: 13, fontWeight: 600 }}>{domain.name}</span>
                  <span className="text-text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                    기능 {domain.functionCount} · 확정 {confirmedCount}/{rows.length}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12, width: "max-content", minWidth: "100%" }}>
                    <thead>
                      <tr>
                        {["기능", ...COLS.map((c) => c.label), "상태"].map((h) => (
                          <th key={h} style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", background: "var(--color-elevated)", color: "var(--color-text-secondary)", textAlign: "left", whiteSpace: "nowrap", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f) => {
                        const sel = f.id === selected;
                        return (
                          <tr
                            key={f.id}
                            onClick={() => {
                              setSelected(f.id);
                              setEditing(false);
                              setSaveError(null);
                            }}
                            style={{ cursor: "pointer", background: sel ? "rgba(212,165,116,0.08)" : undefined }}
                          >
                            <td style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                              <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{f.featureId}</span>{" "}
                              <span className="text-text-primary" style={{ fontSize: 12 }}>{effValue(f, "name")}</span>
                            </td>
                            {COLS.map((c) => {
                              const cell = f[c.key];
                              const edited = isEdited(f, c.key);
                              const chip = edited ? { label: "확정", color: "var(--color-accent)" } : CONF[cell.confidence];
                              return (
                                <td key={c.key} title={evidenceTitle(cell)} style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", verticalAlign: "top" }}>
                                  <span className="text-text-secondary" style={{ fontSize: 12 }}>
                                    {effValue(f, c.key).length > 0 ? effValue(f, c.key) : <span className="text-text-muted">—</span>}
                                  </span>
                                  <span style={{ marginLeft: 6, fontSize: 9.5, color: chip.color, whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>[{chip.label}]</span>
                                </td>
                              );
                            })}
                            <td style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                              {isConfirmed(f) ? (
                                <TrustBadge confirmedBy={overrides[f.id].approver} />
                              ) : (
                                <span className="text-text-secondary" style={{ fontSize: 11.5 }}>{STATE[f.state]}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* 상세 패널 — 행 클릭 시 하단 슬라이드업(현행 상태 + 편집/확정). */}
      {selectedRow && (
        <div className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border-subtle animate-slide-up z-20 overflow-auto" style={{ height: "40vh" }}>
          <div className="flex items-center gap-3 sticky top-0 bg-panel border-b border-border-subtle" style={{ padding: "10px 20px" }}>
            <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{selectedRow.featureId}</span>
            <span className="text-text-primary" style={{ fontSize: 14 }}>{effValue(selectedRow, "name")}</span>
            {isConfirmed(selectedRow) ? (
              <TrustBadge confirmedBy={overrides[selectedRow.id].approver} />
            ) : (
              <span className="text-text-secondary" style={{ fontSize: 11.5 }}>{STATE[selectedRow.state]}</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {saveError && <span className="text-amber-400" style={{ fontSize: 11 }}>저장 실패: {saveError}</span>}
              {!canWrite ? (
                <span className="text-text-muted" style={{ fontSize: 11 }}>읽기전용(라이브 서버 없음)</span>
              ) : editing ? (
                <>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-border-subtle text-text-secondary hover:text-text-primary transition-colors" style={{ padding: "4px 12px", fontSize: 12 }}>취소</button>
                  <button type="button" onClick={() => onConfirm(true)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-50" style={{ padding: "4px 12px", fontSize: 12 }}>{saving ? "저장 중…" : "저장 + 확정"}</button>
                </>
              ) : (
                <>
                  {!isConfirmed(selectedRow) && (
                    <button type="button" onClick={() => onConfirm(false)} disabled={saving} className="rounded-md border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-50" style={{ padding: "4px 12px", fontSize: 12 }}>{saving ? "확정 중…" : "확정"}</button>
                  )}
                  <button type="button" onClick={beginEdit} className="rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-accent transition-colors" style={{ padding: "4px 12px", fontSize: 12 }}>편집</button>
                </>
              )}
              <button type="button" onClick={() => { setSelected(null); setEditing(false); }} className="text-text-muted hover:text-text-primary transition-colors" style={{ fontSize: 16, lineHeight: 1, padding: "0 4px" }} title="닫기">×</button>
            </span>
          </div>
          <div style={{ padding: 20 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <tbody>
                {([{ key: "name" as const, label: "기능명" }, ...COLS] as Array<{ key: CellKey | "name"; label: string }>).map(({ key, label }) => {
                  const cell = key === "name" ? null : selectedRow[key];
                  return (
                    <tr key={key}>
                      <td style={{ padding: "8px 12px 8px 0", color: "var(--color-text-muted)", whiteSpace: "nowrap", verticalAlign: "top", width: 96 }}>{label}</td>
                      <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                        {editing ? (
                          <input
                            value={draft[key] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            className="w-full bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent transition-colors"
                            style={{ fontSize: 12.5, padding: "5px 9px" }}
                          />
                        ) : (
                          <span className="text-text-secondary" style={{ fontSize: 12.5 }}>
                            {effValue(selectedRow, key).length > 0 ? effValue(selectedRow, key) : <span className="text-text-muted">—</span>}
                            {cell && (
                              <span style={{ marginLeft: 8, fontSize: 10, color: isEdited(selectedRow, key) ? "var(--color-accent)" : CONF[cell.confidence].color, fontFamily: "var(--font-mono)" }}>
                                [{isEdited(selectedRow, key) ? "확정" : CONF[cell.confidence].label}]
                              </span>
                            )}
                          </span>
                        )}
                        {!editing && cell && cell.evidence.length > 0 && (
                          <div className="text-text-muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", marginTop: 3 }}>
                            근거: {cell.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join(", ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
