import { useEffect, useState } from "react";

import { useDashboardStore } from "../store";

/**
 * 요구사항 추적표(RTM) 뷰 — R2(읽기 전용). 설계: docs/ktds/RTM_TAB_DESIGN.md.
 *
 * 뷰① 기능 기준: 도메인별로 묶은 기능 그리드. 각 기능 행은 4축 추적 셀(진입점/구현/데이터/테스트)을
 * 코드 근거 + 신뢰도와 함께 보인다. rtm.json(생성물, understand-rtm)을 dev 서버 GET /rtm.json
 * (토큰 게이트)으로 읽는다. 편집/확정(R3)·요구사항 뷰②(R4)·인테이크(R5)는 후속.
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

/** 신뢰도 → 칩 라벨 + 색. 추정/확인필요를 눈에 띄게(위험 신호), 확정은 절제. */
const CONF: Record<Confidence, { label: string; color: string }> = {
  CONFIRMED: { label: "확정", color: "var(--color-text-muted)" },
  CONFIRMED_AI: { label: "확정·AI", color: "var(--color-text-muted)" },
  INFERRED: { label: "추정", color: "#d4a574" },
  UNVERIFIED: { label: "확인필요", color: "#c98a8a" },
};

/** 기능 상태 → 배지. R2 산출은 IMPLEMENTED/PLANNED 만 등장(나머지는 R4+). */
const STATE: Record<FunctionRow["state"], string> = {
  IMPLEMENTED: "✅ 구현",
  PARTIAL: "🔁 부분",
  PLANNED: "⚠ 미구현",
  CHANGED: "~ 변경",
  ORPHANED: "🚫 고아",
};

const COLS: Array<{ key: keyof Pick<FunctionRow, "entryPoint" | "implementation" | "data" | "test">; label: string }> = [
  { key: "entryPoint", label: "진입점" },
  { key: "implementation", label: "구현" },
  { key: "data", label: "데이터(CRUD)" },
  { key: "test", label: "테스트" },
];

function evidenceTitle(cell: TraceCell): string | undefined {
  if (cell.evidence.length === 0) return undefined;
  return cell.evidence.map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join("\n");
}

/** 추적 셀 — 값 + 신뢰도 칩(근거는 title 툴팁). 빈 값은 '—'. */
function Cell({ cell }: { cell: TraceCell }) {
  const conf = CONF[cell.confidence];
  return (
    <td
      title={evidenceTitle(cell)}
      style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", verticalAlign: "top" }}
    >
      <span className="text-text-secondary" style={{ fontSize: 12 }}>
        {cell.value.length > 0 ? cell.value : <span className="text-text-muted">—</span>}
      </span>
      <span
        style={{ marginLeft: 6, fontSize: 9.5, color: conf.color, whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}
      >
        [{conf.label}]
      </span>
    </td>
  );
}

export default function RtmView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const tokenQ = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [model, setModel] = useState<RtmModel | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      alive = false;
    };
  }, [tokenQ]);

  const evidenceRate = (() => {
    if (!model) return 0;
    const cells = model.functions.flatMap((f) => [f.entryPoint, f.implementation, f.data, f.test]);
    if (cells.length === 0) return 0;
    return Math.round((cells.filter((c) => c.confidence === "CONFIRMED").length / cells.length) * 100);
  })();

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-root overflow-hidden">
      {/* 헤더 + 뷰 토글 */}
      <div
        className="flex items-center gap-3 shrink-0 bg-panel border-b border-border-subtle"
        style={{ padding: "10px 20px" }}
      >
        <span className="text-text-primary" style={{ fontSize: 14 }}>
          요구사항 추적표 (RTM)
        </span>
        <div className="flex items-center gap-1 ml-2">
          <span
            className="rounded-md bg-accent/20 text-accent"
            style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600 }}
          >
            기능 기준
          </span>
          <span
            className="rounded-md text-text-muted"
            style={{ padding: "3px 10px", fontSize: 11 }}
            title="요구사항 기준 뷰는 R4에서 제공됩니다."
          >
            요구사항 기준 (준비중)
          </span>
        </div>
        {model && (
          <span className="ml-auto text-text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
            도메인 {model.domains.length} · 기능 {model.functions.length} · 근거율 {evidenceRate}%
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: 20 }}>
        {error ? (
          <div className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 520 }}>
            요구사항 추적표를 불러오지 못했습니다 ({error}).
            <br />
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>understand-rtm</code> 을 먼저 실행해
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}> .understand-anything/rtm.json</code> 을 생성하세요.
          </div>
        ) : !model ? (
          <div className="text-text-muted" style={{ fontSize: 13 }}>불러오는 중…</div>
        ) : model.functions.length === 0 ? (
          <div className="text-text-muted" style={{ fontSize: 13 }}>기능이 없습니다.</div>
        ) : (
          model.domains.map((domain) => {
            const rows = model.functions.filter((f) => f.domainId === domain.id);
            if (rows.length === 0) return null;
            return (
              <section key={domain.id} style={{ marginBottom: 26 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <span className="text-accent" style={{ fontSize: 13, fontWeight: 600 }}>
                    {domain.name}
                  </span>
                  <span className="text-text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                    기능 {domain.functionCount}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12, width: "max-content", minWidth: "100%" }}>
                    <thead>
                      <tr>
                        {["기능", ...COLS.map((c) => c.label), "상태"].map((h) => (
                          <th
                            key={h}
                            style={{
                              border: "1px solid var(--color-border-subtle)",
                              padding: "6px 9px",
                              background: "var(--color-elevated)",
                              color: "var(--color-text-secondary)",
                              textAlign: "left",
                              whiteSpace: "nowrap",
                              fontWeight: 600,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f) => (
                        <tr key={f.id}>
                          <td
                            style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", whiteSpace: "nowrap", verticalAlign: "top" }}
                          >
                            <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                              {f.featureId}
                            </span>{" "}
                            <span className="text-text-primary" style={{ fontSize: 12 }}>{f.name}</span>
                          </td>
                          {COLS.map((c) => (
                            <Cell key={c.key} cell={f[c.key]} />
                          ))}
                          <td
                            style={{ border: "1px solid var(--color-border-subtle)", padding: "6px 9px", whiteSpace: "nowrap", verticalAlign: "top" }}
                          >
                            <span className="text-text-secondary" style={{ fontSize: 11.5 }}>{STATE[f.state]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
