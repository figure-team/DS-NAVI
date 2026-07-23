import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import ReactMarkdown from "react-markdown";
import { useDashboardStore } from "../store";
import type { IncidentLedgerEntry } from "../store/slices/incident-slice";
import NavGroup from "./ui/NavGroup";

/**
 * 장애 분석(/incident) — DS-APM RCA 리포트 원장(좌 270px) + 건별 워크스페이스(우).
 * 설계: docs/ktds/INCIDENT_ANALYSIS_DESIGN.md §2.4. 좌원장/우콘텐츠·`?id=` 쿼리 전환은
 * ChangeImpactView·SessionView 와 동형(라우트 분리 반려 선례 준수).
 *
 * 데이터 흐름: /incident-history(원장+드롭+job) → 건 선택 → /incident-item 으로
 * report.json/seed.json/impact.json/resolution.md 를 상태 단계에 맞춰 읽는다.
 * 실행은 2-spawn 시드 게이트: prepare(수령+판정, 결정론) → 사용자 시드 확정 → resolve(LLM).
 */

interface ParsedReport {
  sourceFile?: string;
  parseable?: boolean;
  reasons?: string[];
  frontmatter?: {
    runId?: string;
    service?: string;
    createdAt?: string | null;
    confidence?: "high" | "medium" | "low";
    baselineCommit?: string | null;
  } | null;
  sections?: Record<string, string>;
  title?: string | null;
}

interface SeedResolution {
  ref: { path: string; line: number; section: string };
  verdict: "matched" | "not-in-project" | "ambiguous";
  relPath: string | null;
  via: "path" | "basename" | null;
  candidates: string[];
}
interface SeedResult {
  censusGitCommit?: string | null;
  resolutions?: SeedResolution[];
  seeds?: string[];
  allNotInProject?: boolean;
}

interface ImpactSnapshot {
  gitCommit?: string;
  upstream?: {
    files?: unknown[];
    api?: unknown[];
    flows?: unknown[];
    domains?: Array<{ key?: string }>;
    persistence?: { mappers?: unknown[] };
  };
  downstream?: { files?: unknown[] };
  needsReview?: unknown[];
}

const STATUS_LABEL: Record<IncidentLedgerEntry["status"], string> = {
  unparseable: "파싱 불가",
  ingested: "수령됨",
  seeded: "시드 판정됨",
  analyzed: "영향 분석됨",
  resolved: "해결방안 확정",
};
const STATUS_TONE: Record<IncidentLedgerEntry["status"], string> = {
  unparseable: "bg-rose-500/15 text-rose-500",
  ingested: "bg-elevated text-text-secondary",
  seeded: "bg-sky-500/15 text-sky-600",
  analyzed: "bg-violet-500/15 text-violet-600",
  resolved: "bg-emerald-500/15 text-emerald-600",
};
const CONFIDENCE_TONE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-600",
  medium: "bg-amber-500/15 text-amber-600",
  low: "bg-rose-500/15 text-rose-500",
};

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[13px] font-bold text-text-primary">{title}</h3>
        {aside && <div className="ml-auto flex items-center gap-1.5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

async function fetchItem<T>(token: string, run: string, name: string): Promise<T | null> {
  try {
    const res = await fetch(
      `/incident-item?run=${encodeURIComponent(run)}&name=${encodeURIComponent(name)}&token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function IncidentView() {
  const token = useDashboardStore((s) => s.accessToken);
  const entries = useDashboardStore((s) => s.incidentEntries);
  const drops = useDashboardStore((s) => s.incidentDrops);
  const job = useDashboardStore((s) => s.incidentJob);
  const loaded = useDashboardStore((s) => s.incidentLoaded);
  const loadHistory = useDashboardStore((s) => s.loadIncidentHistory);
  const startPrepare = useDashboardStore((s) => s.startIncidentPrepare);
  const startResolve = useDashboardStore((s) => s.startIncidentResolve);

  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id");
  const selected = useMemo(
    () => entries.find((e) => e.runId === selectedId) ?? null,
    [entries, selectedId],
  );
  // 미수령 드롭 = 원장에 없는 파일. 목록에 "신규" 행으로 병합해 보인다(APM 이 파일을 만들면
  // 수동 클릭 없이 바로 목록에 뜬다). 선택 키 = runId(있으면) 또는 pending:<파일>.
  const pendingDrops = useMemo(() => drops.filter((d) => !d.ingested), [drops]);
  const dropKey = (d: (typeof pendingDrops)[number]) => d.runId ?? `pending:${d.file}`;
  const selectedDrop = useMemo(
    () => pendingDrops.find((d) => dropKey(d) === selectedId) ?? null,
    [pendingDrops, selectedId],
  );

  const [ledgerOpen, setLedgerOpen] = useState(true);
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [seed, setSeed] = useState<SeedResult | null>(null);
  const [impact, setImpact] = useState<ImpactSnapshot | null>(null);
  const [resolutionMd, setResolutionMd] = useState<string | null>(null);
  // 시드 확정 UI 상태 — matched 는 기본 체크, ambiguous 는 후보 중 사용자 선택(미선택=제외).
  const [seedChecked, setSeedChecked] = useState<Record<string, boolean>>({});
  const [ambiguousPick, setAmbiguousPick] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // 선택 건의 산출물을 상태 단계에 맞춰 로드(진행 단계가 오를수록 파일이 늘어난다).
  useEffect(() => {
    if (!token || !selectedId) {
      setReport(null);
      setSeed(null);
      setImpact(null);
      setResolutionMd(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const rep = await fetchItem<ParsedReport>(token, selectedId, "report.json");
      const sd = await fetchItem<SeedResult>(token, selectedId, "seed.json");
      const imp = await fetchItem<ImpactSnapshot>(token, selectedId, "impact.json");
      const md = await fetchItem<{ content?: string }>(token, selectedId, "resolution.md");
      if (cancelled) return;
      setReport(rep);
      setSeed(sd);
      setImpact(imp);
      setResolutionMd(md?.content ?? null);
      const checked: Record<string, boolean> = {};
      for (const r of sd?.resolutions ?? []) {
        if (r.verdict === "matched" && r.relPath) checked[r.relPath] = true;
      }
      setSeedChecked(checked);
      setAmbiguousPick({});
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedId, selected?.status]);

  const running = job.status === "running";
  const confirmedPaths = useMemo(() => {
    const out: string[] = [];
    for (const [p, on] of Object.entries(seedChecked)) if (on && !out.includes(p)) out.push(p);
    for (const p of Object.values(ambiguousPick)) if (p && !out.includes(p)) out.push(p);
    return out;
  }, [seedChecked, ambiguousPick]);

  const onPrepare = useCallback(async (runId?: string | null) => {
    setActionError(null);
    const r = await startPrepare(runId ?? null);
    if (!r.ok) setActionError(r.error ?? "실행 실패");
  }, [startPrepare]);

  const onResolve = useCallback(async () => {
    if (!selectedId || confirmedPaths.length === 0) return;
    setActionError(null);
    const r = await startResolve(selectedId, confirmedPaths);
    if (!r.ok) setActionError(r.error ?? "실행 실패");
  }, [selectedId, confirmedPaths, startResolve]);

  const commitMismatch =
    report?.frontmatter?.baselineCommit &&
    seed?.censusGitCommit &&
    report.frontmatter.baselineCommit !== seed.censusGitCommit;

  const limitText = report?.sections?.["한계"];

  return (
    <div className="h-full overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <div className="grid items-start grid-cols-1 gap-[14px] lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* ── 좌: 장애 원장 ─ 화면설계서 좌측 내비(proto-tree 카드) 기준으로 통일(2026-07-22).
            작업요청 세션 원장(SessionView)과 동형: .fold 헤더 + .doc 원장 행. ──────────── */}
        <aside className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
          <NavGroup
            label="장애 원장"
            count={pendingDrops.length + entries.length}
            open={ledgerOpen}
            onToggle={() => setLedgerOpen((v) => !v)}
            right={
              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={running || !token}
                className="rounded-lg border border-border-subtle bg-elevated px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40"
                title="드롭 폴더(ds-hub/issues)를 다시 스캔합니다"
              >
                새로고침
              </button>
            }
          >
          {!loaded && <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px" }}>불러오는 중…</div>}
          {loaded && entries.length === 0 && pendingDrops.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px", lineHeight: 1.5 }}>
              장애가 없습니다. DS-APM 이 <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>ds-hub/issues/</code> 에 리포트를
              드롭하면 이 목록에 자동으로 나타납니다.
            </div>
          )}
          {/* 미수령 드롭 = "신규" 행(APM 이 만들면 클릭 없이 바로 목록에 뜬다). 먼저 노출. */}
          {pendingDrops.map((d) => {
            const key = dropKey(d);
            const active = key === selectedId;
            return (
              <button
                key={d.file}
                type="button"
                className={`doc${active ? " on" : ""}`}
                onClick={() => setParams((p) => {
                  const n = new URLSearchParams(p);
                  n.set("id", key);
                  return n;
                })}
              >
                <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                    <span className="truncate font-semibold text-text-primary" style={{ fontSize: 12 }}>
                      {d.service ?? "(서비스 미상)"}
                    </span>
                    {d.confidence && (
                      <Chip tone={CONFIDENCE_TONE[d.confidence] ?? CONFIDENCE_TONE.low}>{d.confidence}</Chip>
                    )}
                  </span>
                  <span className="line-clamp-2 text-text-secondary" style={{ display: "block", fontSize: 11.5, lineHeight: 1.35, marginTop: 2 }}>
                    {d.title ?? d.file}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {d.reportCreatedAt?.slice(0, 10) ?? ""}
                    {!d.parseable ? " · ⚠ 형식 확인 필요" : " · 미수령"}
                  </span>
                </span>
                <span className="st"><Chip tone="bg-amber-500/15 text-amber-600">신규</Chip></span>
              </button>
            );
          })}
          {entries.map((e) => {
            const active = e.runId === selectedId;
            return (
              <button
                key={e.runId}
                type="button"
                className={`doc${active ? " on" : ""}`}
                onClick={() => setParams((p) => {
                  const n = new URLSearchParams(p);
                  n.set("id", e.runId);
                  return n;
                })}
              >
                <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                    <span className="truncate font-semibold text-text-primary" style={{ fontSize: 12 }}>
                      {e.service ?? "(서비스 미상)"}
                    </span>
                    {e.confidence && (
                      <Chip tone={CONFIDENCE_TONE[e.confidence] ?? CONFIDENCE_TONE.low}>{e.confidence}</Chip>
                    )}
                  </span>
                  <span className="line-clamp-2 text-text-secondary" style={{ display: "block", fontSize: 11.5, lineHeight: 1.35, marginTop: 2 }}>
                    {e.title ?? e.sourceFile ?? e.runId}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {e.reportCreatedAt?.slice(0, 10) ?? e.ingestedAt?.slice(0, 10) ?? ""}
                    {e.allNotInProject ? " · ⚠ 타 프로젝트 의심" : ""}
                  </span>
                </span>
                <span className="st"><Chip tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Chip></span>
              </button>
            );
          })}
          </NavGroup>
        </aside>

        {/* ── 우: 건별 워크스페이스 ─────────────────────────────────── */}
        <main className="flex min-w-0 flex-col gap-[14px]">
          {(running || job.status === "failed" || actionError) && (
            <div
              className={`rounded-xl border px-4 py-2.5 text-[12.5px] ${
                job.status === "failed" || actionError
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                  : "border-border-subtle bg-surface text-text-secondary"
              }`}
            >
              {running && (
                <span>
                  {job.phase === "prepare" ? "수령·시드 판정" : "영향 분석·해결방안서"} 실행 중…
                  (한 번에 한 건 — 다른 실행은 대기가 아니라 차단됩니다)
                </span>
              )}
              {job.status === "failed" && <span>실행 실패 (exit {job.exitCode ?? "?"}) — 원장 상태는 마지막 완료 단계를 가리킵니다.</span>}
              {actionError && <span>{actionError}</span>}
            </div>
          )}

          {!selectedId && (
            <div className="rounded-xl border border-border-subtle bg-surface p-6 text-[13px] text-text-muted">
              좌측 원장에서 장애 건을 선택하세요. DS-APM 이 드롭한 신규 리포트는 목록에 "신규"로
              바로 뜨며, 선택 후 "수령·판정"하면 시드 확인 → 해결방안 생성으로 이어집니다.
            </div>
          )}

          {/* 미수령(신규) 드롭 선택 — 프리뷰 + 수령·판정 트리거. 수령되면 원장 항목으로 승격. */}
          {selectedDrop && !selected && (
            <Card
              title={`신규 리포트 — ${selectedDrop.service ?? selectedDrop.file}`}
              aside={
                selectedDrop.confidence ? (
                  <Chip tone={CONFIDENCE_TONE[selectedDrop.confidence] ?? CONFIDENCE_TONE.low}>
                    confidence {selectedDrop.confidence}
                  </Chip>
                ) : (
                  <Chip tone="bg-amber-500/15 text-amber-600">신규</Chip>
                )
              }
            >
              <div className="mb-2 text-[11px] text-text-muted">
                {selectedDrop.file} · {selectedDrop.reportCreatedAt ?? "시각 미상"} · baseline{" "}
                {selectedDrop.baselineCommit?.slice(0, 8) ?? "미상"}
              </div>
              <p className="text-[12.5px] text-text-secondary">
                {selectedDrop.title ?? "(근본 원인 미리보기 없음)"}
              </p>
              {!selectedDrop.parseable && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
                  형식(runId·service·근본 원인) 확인이 필요합니다 — 수령 시 정본 파싱으로 판정됩니다.
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onPrepare(selectedDrop.runId)}
                  disabled={running || !token}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {running && job.phase === "prepare" ? "수령·판정 중…" : "수령·판정 실행"}
                </button>
                <span className="text-[11px] text-text-muted">
                  리포트를 수령하고 file:line 을 코드와 대조해 시드를 판정합니다.
                </span>
              </div>
            </Card>
          )}

          {selectedId && selected?.status === "unparseable" && (
            <Card title="파싱 불가 리포트">
              <p className="text-[12.5px] text-text-secondary">
                수용 게이트를 통과하지 못했습니다(원문은 보존됨): {(selected.reasons ?? []).join(" · ")}
              </p>
            </Card>
          )}

          {selectedId && report && selected?.status !== "unparseable" && (
            <Card
              title={`RCA 리포트 — ${report.frontmatter?.service ?? ""}`}
              aside={
                <>
                  {report.frontmatter?.confidence && (
                    <Chip tone={CONFIDENCE_TONE[report.frontmatter.confidence] ?? CONFIDENCE_TONE.low}>
                      confidence {report.frontmatter.confidence}
                    </Chip>
                  )}
                  {commitMismatch && (
                    <Chip tone="bg-amber-500/15 text-amber-600">커밋 불일치</Chip>
                  )}
                </>
              }
            >
              <div className="mb-2 text-[11px] text-text-muted">
                {report.sourceFile} · {report.frontmatter?.createdAt ?? "시각 미상"} · baseline{" "}
                {report.frontmatter?.baselineCommit?.slice(0, 8) ?? "미상"}
                {commitMismatch && (
                  <span className="text-amber-600">
                    {" "}
                    ≠ 스캔 {seed?.censusGitCommit?.slice(0, 8)} — 장애 시점과 분석 스캔이 다른 코드일 수 있음
                  </span>
                )}
              </div>
              {report.sections?.["근본 원인"] && (
                <div className="prose prose-sm max-w-none text-[12.5px] text-text-secondary [&_p]:my-1">
                  <ReactMarkdown>{`**근본 원인**\n\n${report.sections["근본 원인"]}`}</ReactMarkdown>
                </div>
              )}
              {report.sections?.["수정 제안"] && (
                <div className="prose prose-sm mt-2 max-w-none text-[12.5px] text-text-secondary [&_p]:my-1">
                  <ReactMarkdown>{`**DS-APM 수정 제안** (자동 적용되지 않음)\n\n${report.sections["수정 제안"]}`}</ReactMarkdown>
                </div>
              )}
              {limitText && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
                  <span className="font-bold">한계</span> — {limitText}
                </div>
              )}
            </Card>
          )}

          {selectedId && seed && (
            <Card
              title="시드 판정"
              aside={
                seed.allNotInProject ? (
                  <Chip tone="bg-rose-500/15 text-rose-500">전량 not-in-project</Chip>
                ) : undefined
              }
            >
              {seed.allNotInProject && (
                <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-500">
                  다른 프로젝트의 리포트일 수 있습니다 — DS-APM 서비스→레포 매핑을 확인하세요.
                  시드가 없어 영향 분석을 진행할 수 없습니다.
                </div>
              )}
              <ul className="flex flex-col gap-1">
                {(seed.resolutions ?? []).map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
                    {r.verdict === "matched" && r.relPath ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!seedChecked[r.relPath]}
                          onChange={(ev) =>
                            setSeedChecked((m) => ({ ...m, [r.relPath as string]: ev.target.checked }))
                          }
                        />
                        <span className="font-mono text-text-primary">
                          {r.ref.path}:{r.ref.line}
                        </span>
                        {r.via === "basename" && (
                          <span className="text-text-muted">→ {r.relPath} (basename 유일)</span>
                        )}
                      </label>
                    ) : r.verdict === "ambiguous" ? (
                      <>
                        <span className="font-mono text-amber-600">
                          ? {r.ref.path}:{r.ref.line}
                        </span>
                        {(() => {
                          // 키는 path:line — 같은 basename 이 다른 줄로 두 번 ambiguous 여도
                          // 두 select 가 상태를 공유하지 않게(P2-6).
                          const key = `${r.ref.path}:${r.ref.line}`;
                          return (
                        <select
                          className="rounded border border-border-subtle bg-elevated px-1.5 py-0.5 text-[11.5px]"
                          value={ambiguousPick[key] ?? ""}
                          onChange={(ev) =>
                            setAmbiguousPick((m) => ({ ...m, [key]: ev.target.value }))
                          }
                        >
                          <option value="">후보 선택(제외)</option>
                          {r.candidates.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                          );
                        })()}
                      </>
                    ) : (
                      <span className="font-mono text-text-muted line-through">
                        ✗ {r.ref.path}:{r.ref.line} — 이 프로젝트에 없음
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {!seed.allNotInProject && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onResolve()}
                    disabled={running || confirmedPaths.length === 0 || !token}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    {running && job.phase === "resolve"
                      ? "해결방안 생성 중…"
                      : `시드 ${confirmedPaths.length}개 확정 → 영향 분석·해결방안 생성`}
                  </button>
                  <span className="text-[11px] text-text-muted">
                    확정한 시드만 분석합니다(사용자 게이트). 해결방안서는 근거 번들만으로 작성됩니다.
                  </span>
                </div>
              )}
            </Card>
          )}

          {selectedId && impact && (
            <Card title="영향 분석" aside={<Chip tone="bg-elevated text-text-secondary">엔진 결과</Chip>}>
              <div className="grid grid-cols-2 gap-2 text-[12px] text-text-secondary sm:grid-cols-4">
                <div>상류 파일 {impact.upstream?.files?.length ?? 0}</div>
                <div>API {impact.upstream?.api?.length ?? 0}</div>
                <div>업무 흐름 {impact.upstream?.flows?.length ?? 0}</div>
                <div>하류 파일 {impact.downstream?.files?.length ?? 0}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-muted">영향 도메인</span>
                {(impact.upstream?.domains ?? []).map((d, i) => (
                  <Chip key={i} tone="bg-sky-500/15 text-sky-600">
                    {d.key ?? "?"}
                  </Chip>
                ))}
                {(impact.upstream?.domains ?? []).length === 0 && (
                  <span className="text-[11px] text-text-muted">(없음)</span>
                )}
              </div>
              {selected?.jobId && (
                <div className="mt-2 text-[11px] text-text-muted">
                  변경·영향 메뉴 원장에도 "[장애]" 항목으로 기록됨 (jobId {selected.jobId})
                </div>
              )}
            </Card>
          )}

          {selectedId && resolutionMd && (
            <Card
              title="해결방안서"
              aside={
                selected?.status === "resolved" ? (
                  <Chip tone={STATUS_TONE.resolved}>인용 검증 통과</Chip>
                ) : (
                  <Chip tone="bg-amber-500/15 text-amber-600">확정 전</Chip>
                )
              }
            >
              <div className="prose prose-sm max-w-none text-[12.5px] text-text-secondary [&_h1]:text-[15px] [&_h2]:text-[13.5px] [&_p]:my-1">
                <ReactMarkdown>{resolutionMd}</ReactMarkdown>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
