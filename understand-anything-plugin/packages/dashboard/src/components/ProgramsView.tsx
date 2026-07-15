import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, ConfBadge, ProtoTabs, StatTile } from "./proto/Proto";
import TopBarSlot from "../app/shell/TopBarSlot";
import InfoPopover from "./InfoPopover";

/**
 * 프로그램 목록 뷰(pmpl-proto pg-programs) — 엔진 산출물을 전용 화면으로 승격한다.
 * 4탭: 프로그램 인벤토리 / FP 산정 근거 / 인터페이스 / 배치. 숫자·행은 전부 실데이터
 * (program-inventory.json · interfaces.json · batch-jobs.json)로, 동일 commit 결정론.
 *
 * 데이터: dev 서버가 `.spec/map/` 을 화이트리스트 서빙(GET /program-inventory.json 등),
 * 데모는 public/ 로 동봉. 파일 부재(404)면 해당 탭에 "엔진 스캔 미실행" 을 정직하게 표기한다.
 * 합성 금지: 엔진 미산출 항목(복잡도 분류 등)은 렌더하지 않고 산출물 문서로 유도한다.
 *
 * URL 단일 소스: ?ptab=&pq=&ptype=&pdomain= (검색은 replace). fetch 는 마운트 1회로,
 * searchParams 변화는 refetch 를 유발하지 않는다(무한 refetch 방지).
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
interface Evidence {
  file: string;
  line: number;
}
interface FpDataFunction {
  name: string;
  kind: string;
  evidence?: Evidence;
}
interface FpTransaction {
  routeId?: string;
  method?: string;
  path?: string;
  kind?: string;
  evidence?: Evidence;
}
interface ProgramInventory {
  programs: Program[];
  stats: InventoryStats;
  fp: { summary: FpSummary; dataFunctions?: FpDataFunction[]; transactions?: FpTransaction[] };
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
  evidence?: Evidence;
}
interface ProtocolCount {
  protocol: string;
  count: number;
}
interface InterfacesFile {
  items: InterfaceItem[];
  stats: { total: number; byProtocol?: ProtocolCount[]; unresolvedEndpoints?: number; callSiteTotal?: number };
  suspectSignals: SuspectSignals;
}
interface BatchJob {
  id?: string;
  name?: string;
  trigger?: string;
  schedule?: string;
  handler?: string;
  evidence?: Evidence;
}
interface TriggerCount {
  trigger: string;
  count: number;
}
interface BatchFile {
  jobs: BatchJob[];
  stats: { total: number; byTrigger?: TriggerCount[]; unresolvedHandlers?: number };
  suspectSignals: SuspectSignals;
}

type TabKey = "list" | "fp" | "if" | "batch";
const TAB_KEYS: TabKey[] = ["list", "fp", "if", "batch"];

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

/**
 * domainVia 신뢰도 라벨 — 전부 정적 분석 자동 판정(사람 확정 아님).
 * reachability = 호출/도달성 그래프로 귀속 추적(근거확보). common = 복수 도메인 공유.
 * directory/prefix = 경로·이름 접두 추정. null(도메인 없음)은 별도 "미조인" 으로 구분.
 */
const VIA_DISPLAY: Record<string, { label: string; tone: "ok" | "info" | "warn"; title: string }> = {
  reachability: { label: "근거확보", tone: "ok", title: "호출·도달성 그래프로 도메인 귀속이 추적됨 — 기계 판정" },
  common: { label: "공유", tone: "info", title: "복수 도메인이 공유하는 공통 요소 — 기계 판정" },
  directory: { label: "추정", tone: "warn", title: "디렉터리 경로 기반 추정 — 기계 판정" },
  prefix: { label: "추정", tone: "warn", title: "이름 접두 기반 추정 — 기계 판정" },
};

/**
 * 프로그램 ID 생성 규칙(엔진 program-inventory 와 동일) — PGM-<유형태그>-<파일경로 sha256 앞 8hex>.
 * 경로 시드라 재스캔·내용 수정에도 안정(결정론), 파일 이동·개명 시에만 변경된다.
 */
const ID_RULE =
  "프로그램 ID = PGM-<유형태그>-<파일 경로 sha256 앞 8자리>\n" +
  "유형태그: SCR 화면 · API · BAT 배치 · SVC 서비스 · DAO · DB · MAP Mapper XML · COM 공통 · TST 테스트\n" +
  "경로 기반 결정론 — 재스캔에도 ID 불변, 파일 이동·개명 시에만 변경";

/** 200행 초과 시 상위 N만 렌더(정직 표기 병행). */
const ROW_CAP = 200;
const DELIVERABLE_LINK = "/deliverables/si-프로그램목록";

/** 검색 매치 하이라이트 — 대소문자 무시로 needle 구간을 강조한다(합성 없음). */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const nl = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(nl, i);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`${idx}-${parts.length}`}
        style={{ background: "color-mix(in srgb, var(--color-status-info) 26%, transparent)", color: "inherit", borderRadius: 3, padding: "0 1px" }}
      >
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    i = idx + needle.length;
    idx = lower.indexOf(nl, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

/**
 * 근거(file:line) 클릭 → 코드 뷰어. Proto.Ev(표기 전용) 대신 로컬 클릭형 버튼.
 * 프로그램 행은 line 미보유 → filePath:1 로 열되 표기는 경로만(showLine=false).
 * 코드 뷰어 allowlist(그래프 밖 파일)로 실제 열람이 실패해도 UI 는 깨지지 않는다(툴팁 유지).
 */
function EvBtn({
  file,
  line,
  showLine = true,
  onOpen,
}: {
  file: string;
  line: number;
  showLine?: boolean;
  onOpen: (file: string, line: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file, line)}
      title={`코드 열기 — ${file}:${line}`}
      className="cursor-pointer bg-transparent border-0 text-text-muted hover:text-accent transition-colors"
      style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: 0, textAlign: "left", wordBreak: "break-all" }}
    >
      {showLine ? `${file}:${line}` : file}
    </button>
  );
}

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

/** 범례 토글 버튼 — 필터 줄에 상주하며 범례 패널 표시를 켜고 끈다. */
function LegendToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      title={open ? "범례 숨기기" : "범례 보기 — ID 규칙·유형태그·배지 읽는 법"}
      className={`rounded-md border transition-colors cursor-pointer ${
        open
          ? "border-accent text-accent bg-transparent"
          : "border-border-subtle text-text-muted bg-elevated hover:text-text-secondary"
      }`}
      style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px" }}
    >
      범례 {open ? "숨기기" : "보기"}
    </button>
  );
}

/** 범례 패널 — 토글이 켜졌을 때 필터 줄 바로 아래에 표시. */
function Legend({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-text-muted rounded-lg bg-elevated"
      style={{ fontSize: 11.5, lineHeight: 1.7, padding: "10px 12px", margin: "0 4px 10px" }}
    >
      {children}
    </div>
  );
}

/** sticky thead — 스크롤 컨테이너 내부 기준. */
const STICKY_HEAD: CSSProperties = { position: "sticky", top: 0, background: "var(--color-panel)", zIndex: 2 };

/** 검색 input(공용) — 활성 탭에 걸린 ?pq= 를 조작한다. */
function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="bg-elevated text-text-primary rounded-md border border-border-subtle outline-none focus:border-accent transition-colors"
      style={{ fontSize: 13, padding: "6px 10px", minWidth: 200 }}
    />
  );
}

export default function ProgramsView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [inv, setInv] = useState<ProgramInventory | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<InterfacesFile | null>(null);
  const [interfacesMissing, setInterfacesMissing] = useState(false);
  const [batch, setBatch] = useState<BatchFile | null>(null);
  const [batchMissing, setBatchMissing] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // URL 단일 소스 — 탭·검색·필터. fetch 의존성과 분리되어 refetch 를 유발하지 않는다.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("ptab") ?? "list";
  const tab: TabKey = TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "list";
  const q = searchParams.get("pq") ?? "";
  const typeFilter = searchParams.get("ptype") ?? "전체";
  const domainFilter = searchParams.get("pdomain") ?? "전체";

  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set(k, v);
        else prev.delete(k);
        return prev;
      },
      { replace },
    );

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
        if (needle) {
          const hay = [p.name, p.filePath, p.id, p.domain ?? "", ...(p.notes ?? [])].join(" ").toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [inv, q, typeFilter, domainFilter]);

  const total = inv?.stats.total ?? inv?.programs.length ?? 0;
  const rows = filtered.slice(0, ROW_CAP);
  const overflow = filtered.length - rows.length;
  const otherLangSum = (inv?.stats.excluded.otherLang ?? []).reduce((n, o) => n + o.count, 0);

  const fp = inv?.fp.summary;
  const dataFunctions = inv?.fp.dataFunctions ?? [];
  const transactions = inv?.fp.transactions ?? [];
  const gitShort = inv?.gitCommit ? inv.gitCommit.slice(0, 7) : "—";

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "list", label: "프로그램", count: total },
    { key: "fp", label: "FP 산정 근거" },
    { key: "if", label: "인터페이스", count: interfaces?.stats.total },
    { key: "batch", label: "배치", count: batch?.stats.total },
  ];

  // 인터페이스/배치 검색(활성 탭의 ?pq= 재사용).
  const ifNeedle = q.trim().toLowerCase();
  const ifRows = (interfaces?.items ?? []).filter(
    (it) =>
      !ifNeedle ||
      [it.direction, it.protocol, it.endpoint, it.name, it.id].filter(Boolean).join(" ").toLowerCase().includes(ifNeedle),
  );
  const batchRows = (batch?.jobs ?? []).filter(
    (j) =>
      !ifNeedle ||
      [j.name, j.id, j.trigger, j.schedule, j.handler].filter(Boolean).join(" ").toLowerCase().includes(ifNeedle),
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {/* 메뉴 헤더 제거(2026-07-15) — 정보는 TopBar 정보 팝오버(ⓘ), xlsx 링크는 액션 슬롯으로.
          미해석 엔드포인트·핸들러 카운트는 warn 배지로 표면화(상세 리스트가 없어 비클릭). */}
      <TopBarSlot>
        <span className="inline-flex items-center gap-2">
          <InfoPopover
            title="프로그램 정보"
            rows={[
              { label: "산출물", value: "program-inventory" },
              { label: "결정성", value: "동일 commit 결정론" },
              { label: "commit", value: gitShort },
            ]}
          />
          {(interfaces?.stats.unresolvedEndpoints ?? 0) > 0 && (
            <Badge tone="warn" title="엔드포인트를 확정하지 못한 연계 신호 — 표면화">
              ⚠ 미해석 엔드포인트 {interfaces!.stats.unresolvedEndpoints}
            </Badge>
          )}
          {(batch?.stats.unresolvedHandlers ?? 0) > 0 && (
            <Badge tone="warn" title="핸들러를 확정하지 못한 배치 신호 — 표면화">
              ⚠ 미해석 핸들러 {batch!.stats.unresolvedHandlers}
            </Badge>
          )}
        </span>
      </TopBarSlot>
      <TopBarSlot slot="actions">
        <OutlineLink to={DELIVERABLE_LINK} title="산출물 문서로 이동(xlsx 병기 확인)">
          xlsx 다운로드
        </OutlineLink>
      </TopBarSlot>

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
          <ProtoTabs tabs={tabs} active={tab} onChange={(k) => setParam("ptab", k === "list" ? null : k)} />

          {tab === "list" && (
            <>
              <section className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginBottom: 14 }}>
                {inv.stats.byType.map((b) => {
                  const active = typeFilter === b.type;
                  return (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => setParam("ptype", active ? null : b.type)}
                      aria-pressed={active}
                      title={active ? `${typeLabel(b.type)} 필터 해제` : `${typeLabel(b.type)} 유형만 보기`}
                      className="text-left cursor-pointer"
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        borderRadius: 10,
                        outline: active ? "2px solid var(--color-accent)" : "none",
                        outlineOffset: 2,
                      }}
                    >
                      <StatTile label={typeLabel(b.type)} value={b.count} small={active ? "선택됨" : undefined} />
                    </button>
                  );
                })}
                {fp && fp.unclassified > 0 && (
                  <StatTile label="미분류" value={fp.unclassified} small="표면화" valueColor="var(--color-status-warn)" />
                )}
              </section>

              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                {/* 필터 줄 — 검색 + 유형 + 도메인 */}
                <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: "12px 4px" }}>
                  <SearchInput
                    value={q}
                    onChange={(v) => setParam("pq", v || null, true)}
                    placeholder="이름·경로·ID·도메인·노트 검색"
                    label="프로그램 검색(이름·경로·ID·도메인·노트)"
                  />
                  <select
                    value={typeFilter}
                    onChange={(e) => setParam("ptype", e.target.value === "전체" ? null : e.target.value)}
                    aria-label="유형 필터"
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
                    onChange={(e) => setParam("pdomain", e.target.value === "전체" ? null : e.target.value)}
                    aria-label="도메인 필터"
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
                  <LegendToggle open={showLegend} onToggle={() => setShowLegend((v) => !v)} />
                  <div className="flex-1" />
                  <span className="text-text-muted tabular-nums" style={{ fontSize: 12 }}>
                    {filtered.length}/{total}본
                  </span>
                </div>

                {showLegend && (
                  <Legend>
                    <p style={{ margin: 0 }}>
                      <b>ID</b> — <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>PGM-&lt;유형&gt;-&lt;경로 해시 8자리&gt;</span>{" "}
                      (파일 경로 sha256 앞 8자리). 경로 기반 결정론이라 재스캔·코드 수정에도 불변, 파일 이동·개명 시에만 변경.
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      <b>유형태그</b> — SCR 화면 · API · BAT 배치 · SVC 서비스 · DAO · DB · MAP Mapper XML · COM 공통 · TST 테스트.
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      <b>도메인 배지</b> — 정적 분석 자동 판정: <b>근거확보</b>(도달성 추적) · <b>공유</b>(복수 도메인) · <b>추정</b>(경로·접두) ·{" "}
                      <b>미조인</b>(귀속 없음).
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      <b>경로</b> — 클릭 시 코드 열람.
                    </p>
                  </Legend>
                )}

                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th scope="col" title={ID_RULE} style={{ cursor: "help" }}>
                          ID
                        </th>
                        <th scope="col">이름</th>
                        <th scope="col">유형</th>
                        <th scope="col">레이어</th>
                        <th scope="col">도메인</th>
                        <th scope="col" className="num">
                          LOC
                        </th>
                        <th scope="col">경로</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            <Highlight text={p.id} q={q} />
                          </td>
                          <td style={{ fontWeight: 650 }}>
                            <Highlight text={p.name} q={q} />
                            {p.notes && p.notes.length > 0 && (
                              <span
                                title={p.notes.join("\n")}
                                className="text-text-muted bg-elevated"
                                style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5, marginLeft: 6, whiteSpace: "nowrap", fontWeight: 500 }}
                              >
                                라우트 {p.notes.length}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className="text-text-secondary bg-elevated"
                              style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap" }}
                            >
                              {typeLabel(p.type)}
                            </span>
                          </td>
                          <td className="text-text-muted" style={{ fontSize: 12 }}>
                            {p.layer && p.layer !== "unknown" ? p.layer : "—"}
                          </td>
                          <td>
                            <DomainCell domain={p.domain} via={p.domainVia} q={q} />
                          </td>
                          <td className="num">{p.loc}</td>
                          <td>
                            <EvBtn file={p.filePath} line={1} showLine={false} onOpen={openCodeViewerAt} />
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-text-muted" style={{ textAlign: "center", padding: "20px 0" }}>
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
            <div className="flex flex-col" style={{ gap: 14 }}>
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

              {/* 데이터 기능 후보 표(ILF/EIF) — 근거 클릭 → 코드, 이름 → 데이터 탭 테이블 */}
              {dataFunctions.length > 0 && (
                <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                  <div className="text-text-primary" style={{ fontSize: 13, fontWeight: 650, padding: "12px 4px 8px" }}>
                    데이터 기능 후보 {dataFunctions.length}건 — 유형·근거 추적
                  </div>
                  <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
                    <table className="proto-tbl">
                      <thead>
                        <tr>
                          <th scope="col" style={STICKY_HEAD}>
                            이름
                          </th>
                          <th scope="col" style={STICKY_HEAD}>
                            유형
                          </th>
                          <th scope="col" style={STICKY_HEAD}>
                            근거
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataFunctions.map((d, i) => (
                          <tr key={`${d.name}-${i}`}>
                            <td style={{ fontWeight: 650, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                              <Link
                                to={`/data?tab=tables&table=${encodeURIComponent(d.name)}`}
                                title={`데이터 탭에서 ${d.name} 테이블 보기`}
                                style={{ color: "var(--color-status-info)", textDecoration: "none" }}
                              >
                                {d.name}
                              </Link>
                            </td>
                            <td>
                              <Badge tone="info" title="FP 데이터 기능 분류(정적 분석 자동 판정)">
                                {d.kind}
                              </Badge>
                            </td>
                            <td>
                              {d.evidence ? (
                                <EvBtn file={d.evidence.file} line={d.evidence.line} onOpen={openCodeViewerAt} />
                              ) : (
                                <span className="text-text-muted" style={{ fontSize: 11 }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 트랜잭션 후보 표 — 미분류 사유 추적(경로·메서드·근거) */}
              {transactions.length > 0 && (
                <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                  <div className="text-text-primary" style={{ fontSize: 13, fontWeight: 650, padding: "12px 4px 8px" }}>
                    트랜잭션 후보 {transactions.length}건 — 왜 미분류인지 근거로 추적
                  </div>
                  <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
                    <table className="proto-tbl">
                      <thead>
                        <tr>
                          <th scope="col" style={STICKY_HEAD}>
                            메서드
                          </th>
                          <th scope="col" style={STICKY_HEAD}>
                            경로
                          </th>
                          <th scope="col" style={STICKY_HEAD}>
                            분류
                          </th>
                          <th scope="col" style={STICKY_HEAD}>
                            근거
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((t, i) => (
                          <tr key={t.routeId ?? i}>
                            <td className="text-text-secondary" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, whiteSpace: "nowrap" }}>
                              {t.method ?? "—"}
                            </td>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, wordBreak: "break-all" }}>{t.path ?? t.routeId ?? "—"}</td>
                            <td>
                              {t.kind === "UNCLASSIFIED" ? (
                                <Badge tone="warn" title="EI/EO/EQ 로 확정 분류하지 못함 — 집계 제외·표면화">
                                  미분류
                                </Badge>
                              ) : (
                                <Badge tone="info">{t.kind ?? "—"}</Badge>
                              )}
                            </td>
                            <td>
                              {t.evidence ? (
                                <EvBtn file={t.evidence.file} line={t.evidence.line} onOpen={openCodeViewerAt} />
                              ) : (
                                <span className="text-text-muted" style={{ fontSize: 11 }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-text-muted" style={{ fontSize: 11.5, padding: "10px 4px 0", lineHeight: 1.6 }}>
                    미분류 트랜잭션은 FP 하한 집계에서 제외하고 표면화합니다 — 근거(file:line) 클릭 시 코드 열람.
                  </div>
                </div>
              )}
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
                <IfStatLine stats={interfaces.stats} />
                <SuspectList signals={interfaces.suspectSignals} />
              </PanelCard>
            ) : (
              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: "12px 4px 4px" }}>
                  <SearchInput
                    value={q}
                    onChange={(v) => setParam("pq", v || null, true)}
                    placeholder="방향·프로토콜·엔드포인트 검색"
                    label="인터페이스 검색"
                  />
                  <div className="flex-1" />
                  <span className="text-text-muted tabular-nums" style={{ fontSize: 12 }}>
                    {ifRows.length}/{interfaces.items.length}건
                  </span>
                </div>
                <div style={{ padding: "0 4px 8px" }}>
                  <IfStatLine stats={interfaces.stats} />
                </div>
                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th scope="col" style={STICKY_HEAD}>
                          방향
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          프로토콜
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          엔드포인트
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          근거
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ifRows.map((it, i) => (
                        <tr key={it.id ?? i}>
                          <td className="text-text-secondary">{it.direction ?? "—"}</td>
                          <td className="text-text-secondary">
                            <Highlight text={it.protocol ?? "—"} q={q} />
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                            <Highlight text={it.endpoint ?? it.name ?? "—"} q={q} />
                          </td>
                          <td>
                            {it.evidence ? (
                              <EvBtn file={it.evidence.file} line={it.evidence.line} onOpen={openCodeViewerAt} />
                            ) : (
                              <span className="text-text-muted" style={{ fontSize: 11 }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {ifRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-text-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                            조건에 맞는 연계가 없습니다.
                          </td>
                        </tr>
                      )}
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
                <BatchStatLine stats={batch.stats} />
                <SuspectList signals={batch.suspectSignals} />
              </PanelCard>
            ) : (
              <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "6px 14px 14px" }}>
                <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: "12px 4px 4px" }}>
                  <SearchInput
                    value={q}
                    onChange={(v) => setParam("pq", v || null, true)}
                    placeholder="잡·트리거·핸들러 검색"
                    label="배치 검색"
                  />
                  <div className="flex-1" />
                  <span className="text-text-muted tabular-nums" style={{ fontSize: 12 }}>
                    {batchRows.length}/{batch.jobs.length}건
                  </span>
                </div>
                <div style={{ padding: "0 4px 8px" }}>
                  <BatchStatLine stats={batch.stats} />
                </div>
                <div className="overflow-x-auto">
                  <table className="proto-tbl">
                    <thead>
                      <tr>
                        <th scope="col" style={STICKY_HEAD}>
                          잡
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          트리거
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          스케줄
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          핸들러
                        </th>
                        <th scope="col" style={STICKY_HEAD}>
                          근거
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchRows.map((j, i) => (
                        <tr key={j.id ?? i}>
                          <td style={{ fontWeight: 650 }}>
                            <Highlight text={j.name ?? j.id ?? "—"} q={q} />
                          </td>
                          <td className="text-text-secondary">
                            <Highlight text={j.trigger ?? "—"} q={q} />
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{j.schedule ?? "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                            <Highlight text={j.handler ?? "—"} q={q} />
                          </td>
                          <td>
                            {j.evidence ? (
                              <EvBtn file={j.evidence.file} line={j.evidence.line} onOpen={openCodeViewerAt} />
                            ) : (
                              <span className="text-text-muted" style={{ fontSize: 11 }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {batchRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-text-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                            조건에 맞는 배치 잡이 없습니다.
                          </td>
                        </tr>
                      )}
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

/** 도메인 셀 — 단일 도메인은 /domains/:key 로 점프, 복합(a+b)은 텍스트. via 신뢰도 배지 병기. */
function DomainCell({ domain, via, q }: { domain: string | null; via?: string | null; q: string }) {
  if (!domain) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        —
        <Badge tone="mut" title="도메인 귀속 없음 — 미조인(기계 판정)">
          미조인
        </Badge>
      </span>
    );
  }
  const single = !domain.includes("+");
  const viaInfo = via ? VIA_DISPLAY[via] : undefined;
  return (
    <span className="inline-flex items-center gap-1.5">
      {single ? (
        <Link
          to={`/domains/${encodeURIComponent(domain)}`}
          title={`${domain} 도메인으로 이동`}
          style={{ color: "var(--color-status-info)", textDecoration: "none" }}
        >
          <Highlight text={domain} q={q} />
        </Link>
      ) : (
        <span className="text-text-secondary">
          <Highlight text={domain} q={q} />
        </span>
      )}
      {viaInfo && (
        <Badge tone={viaInfo.tone} title={viaInfo.title}>
          {viaInfo.label}
        </Badge>
      )}
    </span>
  );
}

/** 인터페이스 통계 라인 — 총계·프로토콜 분포(미해석 엔드포인트는 TopBar warn 배지로 이관). */
function IfStatLine({ stats }: { stats: InterfacesFile["stats"] }) {
  const byProtocol = stats.byProtocol ?? [];
  return (
    <div className="flex flex-wrap items-center text-text-muted" style={{ gap: 10, fontSize: 12 }}>
      <span className="tabular-nums">연계 총 {stats.total}건</span>
      {stats.callSiteTotal != null && <span className="tabular-nums">호출부 {stats.callSiteTotal}</span>}
      {byProtocol.map((p) => (
        <span key={p.protocol} className="tabular-nums">
          {p.protocol} {p.count}
        </span>
      ))}
    </div>
  );
}

/** 배치 통계 라인 — 총계·트리거 분포(미해석 핸들러는 TopBar warn 배지로 이관). */
function BatchStatLine({ stats }: { stats: BatchFile["stats"] }) {
  const byTrigger = stats.byTrigger ?? [];
  return (
    <div className="flex flex-wrap items-center text-text-muted" style={{ gap: 10, fontSize: 12 }}>
      <span className="tabular-nums">잡 총 {stats.total}건</span>
      {byTrigger.map((t) => (
        <span key={t.trigger} className="tabular-nums">
          {t.trigger} {t.count}
        </span>
      ))}
    </div>
  );
}
