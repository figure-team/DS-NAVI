import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, ConfBadge, Ev, PageHead, ProtoTabs, StatTile } from "./proto/Proto";

/**
 * 프로그램 목록 뷰(pmpl-proto pg-programs) — 엔진 산출물을 전용 화면으로 승격한다.
 * 4탭: 프로그램 인벤토리 / FP 산정 근거 / 인터페이스 / 배치. 숫자·행은 전부 실데이터
 * (program-inventory.json · interfaces.json · batch-jobs.json)로, 동일 commit 결정론.
 *
 * 데이터: dev 서버가 `.spec/map/` 을 화이트리스트 서빙(GET /program-inventory.json 등),
 * 데모는 public/ 로 동봉. 파일 부재(404)면 해당 탭에 "엔진 스캔 미실행" 을 정직하게 표기한다.
 * 합성 금지: 엔진 미산출 항목(복잡도 분류 등)은 렌더하지 않고 산출물 문서로 유도한다.
 */

interface Program {
  id: string;
  name: string;
  type: string;
  domain: string | null;
  domainVia?: string | null;
  layer?: string | null;
  loc: number;
  filePath: string;
  notes?: string[];
}
interface ByType {
  type: string;
  count: number;
}
interface OtherLang {
  lang: string;
  count: number;
}
interface Excluded {
  configXml: number;
  otherLang: OtherLang[];
  unreadable: number;
}
interface InventoryStats {
  byType: ByType[];
  excluded: Excluded;
  total: number;
}
interface FpSummary {
  ilf: number;
  eif: number;
  ei: number;
  eo: number;
  eq: number;
  unclassified: number;
  unadjustedFp: number;
}
interface ProgramInventory {
  programs: Program[];
  stats: InventoryStats;
  fp: { summary: FpSummary };
  gitCommit: string;
}

interface SuspectSample {
  file?: string;
  line?: number;
  signal?: string;
  note?: string;
}
interface SuspectSignals {
  count: number;
  samples: SuspectSample[];
}
interface InterfaceItem {
  id?: string;
  name?: string;
  direction?: string;
  protocol?: string;
  endpoint?: string;
  evidence?: { file: string; line: number };
}
interface InterfacesFile {
  items: InterfaceItem[];
  stats: { total: number };
  suspectSignals: SuspectSignals;
}
interface BatchJob {
  id?: string;
  name?: string;
  trigger?: string;
  schedule?: string;
  handler?: string;
  evidence?: { file: string; line: number };
}
interface BatchFile {
  jobs: BatchJob[];
  stats: { total: number };
  suspectSignals: SuspectSignals;
}

type TabKey = "list" | "fp" | "if" | "batch";

/** 프로그램 유형 → 화면 라벨. 미매핑 유형은 원문을 그대로 노출한다(합성 금지). */
const TYPE_LABEL: Record<string, string> = {
  screen: "화면",
  service: "서비스",
  dao: "DAO",
  "mapper-xml": "Mapper XML",
  common: "공통",
  test: "테스트",
};
const typeLabel = (t: string): string => TYPE_LABEL[t] ?? t;

/** 200행 초과 시 상위 N만 렌더(정직 표기 병행). */
const ROW_CAP = 200;
const DELIVERABLE_LINK = "/deliverables/si-프로그램목록";

/** BtnOutline 과 동일한 외형을 갖는 라우터 링크. */
function OutlineLink({ to, title, children }: { to: string; title?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      title={title}
      className="rounded-lg border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
      style={{ padding: "7px 14px", fontSize: 13, textDecoration: "none", display: "inline-block" }}
    >
      {children}
    </Link>
  );
}

/** pmpl-proto .card.panel — 소제목(h3) 을 갖는 패널 카드. */
function PanelCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 20px" }}>
      {children}
    </div>
  );
}
function PanelHead({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <h3 className="flex items-center gap-2 text-text-primary" style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, ...style }}>
      {children}
    </h3>
  );
}

/** FP 후보 한 줄 — 라벨 + 값 + (보조) + 신뢰도/배지. */
function FpRow({ label, value, sub, badge }: { label: string; value: ReactNode; sub?: string; badge?: ReactNode }) {
  return (
    <div className="flex items-center" style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <span className="text-text-secondary" style={{ fontSize: 13 }}>
        {label}
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5">
        <b className="text-text-primary tabular-nums" style={{ fontSize: 15 }}>
          {value}
        </b>
        {sub != null && (
          <span className="text-text-muted" style={{ fontSize: 11 }}>
            {sub}
          </span>
        )}
        {badge}
      </div>
    </div>
  );
}

/** 미해석 신호 샘플 한 줄 — file:line + 신호/메모(정직 표기, 합성 없음). */
function suspectText(s: SuspectSample): string {
  const loc = s.file ? `${s.file}${s.line != null ? `:${s.line}` : ""}` : "";
  const desc = s.signal ?? s.note ?? "";
  return [loc, desc].filter(Boolean).join(" — ") || "(내용 없음)";
}

function SuspectList({ signals }: { signals: SuspectSignals }) {
  if (signals.count <= 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <Badge tone="warn" title="정적 스캔이 신호는 감지했으나 대상을 확정하지 못한 항목">
        미해석 신호 {signals.count}
      </Badge>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {signals.samples.map((s, i) => (
          <li key={i} className="text-text-muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7 }}>
            {suspectText(s)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 엔진 산출물 파일이 없을 때(404) 정직한 안내. */
function ScanNotRun({ what }: { what: string }) {
  return (
    <PanelCard>
      <PanelHead>{what}</PanelHead>
      <p className="text-text-secondary" style={{ fontSize: 13 }}>
        엔진 스캔 산출물이 없습니다 — 스캔이 아직 실행되지 않았습니다.
      </p>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
        &quot;산출물 없음&quot;은 &quot;0건&quot;과 다릅니다 — 데이터가 생성되면 이 탭에 결과가 표시됩니다.
      </p>
    </PanelCard>
  );
}

export default function ProgramsView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [inv, setInv] = useState<ProgramInventory | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<InterfacesFile | null>(null);
  const [interfacesMissing, setInterfacesMissing] = useState(false);
  const [batch, setBatch] = useState<BatchFile | null>(null);
  const [batchMissing, setBatchMissing] = useState(false);

  const [tab, setTab] = useState<TabKey>("list");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [domainFilter, setDomainFilter] = useState("전체");

  useEffect(() => {
    let alive = true;
    fetch(`${dataBase}program-inventory.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ProgramInventory) => {
        if (!alive) return;
        if (Array.isArray(data?.programs) && data?.stats) setInv(data);
        else setInvError("program-inventory.json 형식 오류");
      })
      .catch((e) => alive && setInvError(String(e instanceof Error ? e.message : e)));

    fetch(`${dataBase}interfaces.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: InterfacesFile) => alive && setInterfaces(data))
      .catch(() => alive && setInterfacesMissing(true));

    fetch(`${dataBase}batch-jobs.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: BatchFile) => alive && setBatch(data))
      .catch(() => alive && setBatchMissing(true));

    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  const domains = useMemo(() => {
    const set = new Set<string>();
    for (const p of inv?.programs ?? []) if (p.domain) set.add(p.domain);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [inv]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (inv?.programs ?? [])
      .filter((p) => {
        if (typeFilter !== "전체" && p.type !== typeFilter) return false;
        if (domainFilter !== "전체" && p.domain !== domainFilter) return false;
        if (needle && !p.name.toLowerCase().includes(needle) && !p.filePath.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [inv, q, typeFilter, domainFilter]);

  const total = inv?.stats.total ?? inv?.programs.length ?? 0;
  const rows = filtered.slice(0, ROW_CAP);
  const overflow = filtered.length - rows.length;
  const otherLangSum = (inv?.stats.excluded.otherLang ?? []).reduce((n, o) => n + o.count, 0);

  const fp = inv?.fp.summary;
  const gitShort = inv?.gitCommit ? inv.gitCommit.slice(0, 7) : "—";

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "list", label: "프로그램", count: total },
    { key: "fp", label: "FP 산정 근거" },
    { key: "if", label: "인터페이스", count: interfaces?.stats.total },
    { key: "batch", label: "배치", count: batch?.stats.total },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="프로그램 목록"
        meta={
          <>
            program-inventory · 동일 commit 결정론 ·{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{gitShort}</span>
          </>
        }
        actions={
          <OutlineLink to={DELIVERABLE_LINK} title="산출물 문서로 이동(xlsx 병기 확인)">
            xlsx 다운로드
          </OutlineLink>
        }
      />

      {invError ? (
        <PanelCard>
          <p className="text-text-muted" style={{ fontSize: 13 }}>
            프로그램 인벤토리를 불러오지 못했습니다: {invError}
          </p>
        </PanelCard>
      ) : !inv ? (
        <p className="text-text-muted" style={{ fontSize: 13 }}>
          불러오는 중…
        </p>
      ) : (
        <>
          <ProtoTabs tabs={tabs} active={tab} onChange={setTab} />

          {tab === "list" && (
            <>
              <section className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginBottom: 14 }}>
                {inv.stats.byType.map((b) => (
                  <StatTile key={b.type} label={typeLabel(b.type)} value={b.count} />
                ))}
                {fp && fp.unclassified > 0 && (
                  <StatTile
                    label="미분류"
                    value={fp.unclassified}
                    small="표면화"
                    valueColor="var(--color-status-warn)"
                  />
                )}
              </section>

              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                {/* 필터 줄 — 검색 + 유형 + 도메인 */}
                <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: "12px 4px" }}>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="이름·경로 검색"
                    className="bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent transition-colors"
                    style={{ fontSize: 13, padding: "6px 10px", minWidth: 200 }}
                  />
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent transition-colors cursor-pointer"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                  >
                    <option value="전체">유형 전체</option>
                    {inv.stats.byType.map((b) => (
                      <option key={b.type} value={b.type}>
                        {typeLabel(b.type)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={domainFilter}
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent transition-colors cursor-pointer"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                  >
                    <option value="전체">도메인 전체</option>
                    {domains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <span className="text-text-muted tabular-nums" style={{ fontSize: 12 }}>
                    {filtered.length}/{total}본
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>이름</th>
                        <th>유형</th>
                        <th>도메인</th>
                        <th className="num">LOC</th>
                        <th>경로</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, whiteSpace: "nowrap" }}>{p.id}</td>
                          <td style={{ fontWeight: 650 }}>{p.name}</td>
                          <td>
                            <span
                              className="text-text-secondary bg-elevated"
                              style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap" }}
                            >
                              {typeLabel(p.type)}
                            </span>
                          </td>
                          <td className="text-text-secondary">{p.domain ?? "—"}</td>
                          <td className="num">{p.loc}</td>
                          <td>
                            <Ev>{p.filePath}</Ev>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-text-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                            조건에 맞는 프로그램이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {overflow > 0 && (
                  <div className="text-text-muted" style={{ fontSize: 12, padding: "10px 4px 0" }}>
                    상위 {ROW_CAP}본 표시 · 외 {overflow}건 — 검색·필터로 좁혀 보세요.
                  </div>
                )}

                {/* 집계 제외 표면화(침묵 누락 금지) */}
                <div className="text-text-muted" style={{ fontSize: 12, padding: "10px 4px 0" }}>
                  집계 제외: 설정 XML {inv.stats.excluded.configXml} · 비대상 언어 {otherLangSum} · 판독 불가{" "}
                  {inv.stats.excluded.unreadable}
                </div>
              </div>
            </>
          )}

          {tab === "fp" && fp && (
            <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
              <PanelCard>
                <PanelHead>데이터 기능 후보</PanelHead>
                <FpRow label="ILF (내부 논리 파일)" value={fp.ilf} sub="테이블" badge={<ConfBadge kind="fix" />} />
                <FpRow label="EIF (외부 연계 파일)" value={fp.eif} badge={<ConfBadge kind="fix" />} />

                <PanelHead style={{ marginTop: 16 }}>트랜잭션 기능 후보</PanelHead>
                <FpRow label="EI (외부 입력)" value={fp.ei} badge={<ConfBadge kind="est" />} />
                <FpRow label="EO (외부 출력)" value={fp.eo} badge={<ConfBadge kind="est" />} />
                <FpRow label="EQ (외부 조회)" value={fp.eq} badge={<ConfBadge kind="est" />} />
                {fp.unclassified > 0 && (
                  <FpRow
                    label="미분류 트랜잭션"
                    value={fp.unclassified}
                    badge={
                      <Badge tone="warn" title="EI/EO/EQ 로 확정 분류하지 못한 경로 — 집계에서 제외하고 표면화">
                        미분류 표면화
                      </Badge>
                    }
                  />
                )}
              </PanelCard>

              <PanelCard>
                <PanelHead>FP 하한 산정</PanelHead>
                <div
                  className="tabular-nums"
                  style={{ fontSize: 40, fontWeight: 650, letterSpacing: "-1px", color: "var(--color-text-primary)", lineHeight: 1.1 }}
                >
                  {fp.unadjustedFp}
                </div>
                <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 12 }}>
                  FP 하한 산정치 — 미분류 {fp.unclassified}건은 집계에서 제외하고 표면화합니다(침묵 누락 금지). 근거 열은 xlsx에 포함.
                </p>
                <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
                  복잡도 분류는 엔진 미산출 — FP 상세 근거는 산출물{" "}
                  <Link to={DELIVERABLE_LINK} className="text-accent" style={{ textDecoration: "none" }}>
                    si-프로그램목록
                  </Link>{" "}
                  참조.
                </p>
              </PanelCard>
            </div>
          )}

          {tab === "if" &&
            (interfacesMissing ? (
              <ScanNotRun what="대외/대내 연계" />
            ) : !interfaces ? (
              <p className="text-text-muted" style={{ fontSize: 13 }}>
                불러오는 중…
              </p>
            ) : interfaces.items.length === 0 ? (
              <PanelCard>
                <PanelHead>
                  대외/대내 연계
                  <Badge tone="ok">스캔 완료 · 0건</Badge>
                </PanelHead>
                <p className="text-text-secondary" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.7 }}>
                  HTTP 클라이언트(RestTemplate·WebClient·HttpClient·feign), DB link, 파일 송수신, MQ(JMS·Kafka), 소켓 신호를 전수 스캔했으며{" "}
                  <b>연계 신호가 발견되지 않았습니다.</b>
                </p>
                <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                  0건은 &quot;스캔 안 함&quot;과 다릅니다 — 음성 결과도 정직하게 보고합니다. 미해석 항목이 있으면 [미확인]으로 남습니다.
                </p>
                <SuspectList signals={interfaces.suspectSignals} />
              </PanelCard>
            ) : (
              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th>방향</th>
                        <th>프로토콜</th>
                        <th>엔드포인트</th>
                        <th>근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaces.items.map((it, i) => (
                        <tr key={it.id ?? i}>
                          <td className="text-text-secondary">{it.direction ?? "—"}</td>
                          <td className="text-text-secondary">{it.protocol ?? "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{it.endpoint ?? it.name ?? "—"}</td>
                          <td>
                            <Ev>{it.evidence ? `${it.evidence.file}:${it.evidence.line}` : "—"}</Ev>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 4px 0" }}>
                  <SuspectList signals={interfaces.suspectSignals} />
                </div>
              </div>
            ))}

          {tab === "batch" &&
            (batchMissing ? (
              <ScanNotRun what="배치 · 스케줄 잡" />
            ) : !batch ? (
              <p className="text-text-muted" style={{ fontSize: 13 }}>
                불러오는 중…
              </p>
            ) : batch.jobs.length === 0 ? (
              <PanelCard>
                <PanelHead>
                  배치 · 스케줄 잡
                  <Badge tone="ok">스캔 완료 · 0건</Badge>
                </PanelHead>
                <p className="text-text-secondary" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.7 }}>
                  cron · Quartz · @Scheduled · shell 잡 신호가 발견되지 않았습니다. 배치 진입점은 도달성 분석에 자동 등록되어 &quot;데드코드&quot; 오판을 방지합니다.
                </p>
                <SuspectList signals={batch.suspectSignals} />
              </PanelCard>
            ) : (
              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th>잡</th>
                        <th>트리거</th>
                        <th>스케줄</th>
                        <th>핸들러</th>
                        <th>근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.jobs.map((j, i) => (
                        <tr key={j.id ?? i}>
                          <td style={{ fontWeight: 650 }}>{j.name ?? j.id ?? "—"}</td>
                          <td className="text-text-secondary">{j.trigger ?? "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{j.schedule ?? "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{j.handler ?? "—"}</td>
                          <td>
                            <Ev>{j.evidence ? `${j.evidence.file}:${j.evidence.line}` : "—"}</Ev>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 4px 0" }}>
                  <SuspectList signals={batch.suspectSignals} />
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
