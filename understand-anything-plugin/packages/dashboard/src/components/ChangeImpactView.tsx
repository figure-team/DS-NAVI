import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, BtnAccent, Ev, StatTile } from "./proto/Proto";
import TopBarSlot from "../app/shell/TopBarSlot";
import InfoPopover, { type InfoRow } from "./InfoPopover";
import { Chip, UnresolvedModal } from "./data-map/UnresolvedChips";
import type { DbUnresolved } from "./data-map/types";
import type { BadgeTone } from "./proto/Proto";
import SearchInput from "./ui/SearchInput";
// RTM ② 영향분석과 표면 정렬(2026-07-17) — 같은 조건 카드·같은 비포·에프터 모달을 쓴다.
// 두 화면이 같은 스냅샷을 읽으므로(§2.3 "한 번 돌리고 두 곳에서 본다") 표현도 갈라지지 않는다.
import DataCompareModal from "./rtm/DataCompareModal";
import FlowCompareModal from "./rtm/FlowCompareModal";
import { CompareBtn, SectionCard } from "./rtm/ImpactStepView";

/**
 * 변경 · 영향 분석 뷰(pmpl-proto pg-change 정합) — impact.json 을 CR 단위 화면으로 승격한다.
 * 구조 그래프의 색칠 오버레이로만 소비되던 상·하류 도달성(seeds·needsReview·viaKinds 분해)에 더해
 * 진입점(라우트)·도메인·플로우·영속성(매퍼/테이블) 영향까지 그대로 노출하고,
 * 변경영향분석서(09)/구조 오버레이(?overlay=impact)/도메인 딥링크로 연결한다.
 *
 * 데이터: dev 서버 GET /impact.json (토큰 게이트). 404 → 빈 상태, 그 외 실패 → 오류 상태.
 * 검증: impact-verify-report.json 이 있으면 GROUNDED 근거를 표면화(부재 시 미표기 — 정직).
 *
 * 좌측 트리는 원장(/impact-history) 단일 목록이다. impact.json 은 질의문을 담지 않으므로
 * 루트 슬롯만으로는 "무슨 질의였나" 를 알 수 없다 — 그래서 슬롯 지문(앵커 커밋 + 시드 집합)을
 * 원장 최신 done 항목의 스냅샷과 대조해 그 항목에 [최신] 배지를 붙이고 질의문을 표기한다.
 * 대조 실패 = 원장에 없는 실행(CLI /understand-impact 직접 실행 등)이 슬롯을 덮어쓴 상태이므로
 * "기록 없는 분석" 으로 분리해 노출한다(감추면 오래된 분석이 [최신] 로 위장된다 — 실제 사고 이력).
 *
 * 앵커 커밋은 화면에 띄우지 않는다 — 사용자가 판단에 쓸 수 없는 내부 식별자라서, 제목엔 질의문이
 * 간다. 대신 앵커를 현재 census 와 대조해 재스캔 여부만 배지로 알린다(앵커의 출처가 곧 census —
 * engine.ts:120 `gitCommit: census.gitCommit`). **스캔 대비** 신선도이지 코드(HEAD) 대비가
 * 아니므로 "최신" 이라 말하지 않는다 — 코드만 바뀌고 재스캔을 안 한 경우는 잡지 못한다.
 */
interface Citation {
  filePath: string;
  line: number;
}

interface ImpactFile {
  relPath: string;
  minDepth: number;
  viaKinds: string[];
  /** 도달 근거 file:line — 시드 인접이 아닌 경로 병합 등으로 null 가능(실데이터 실측). */
  citation: Citation | null;
}

interface Seed {
  relPath: string;
  origin: string;
  confidence: string;
}

interface NeedsReviewItem {
  reason: string;
  ref: string;
  /** 선택 — 미지정/그 외는 경고(warn), "info" 는 무해 참고. UnresolvedBanner 규약과 동일. */
  severity?: string;
}

/** upstream.api — 영향받는 진입점(라우트). */
interface ApiRoute {
  id: string;
  filePath: string;
  line: number;
  handler: string;
  targetKind: string;
  via: string;
  confidence: string;
}

/** upstream.domains — 영향 도메인(진입점 기반 추정). */
interface DomainRef {
  domainId: string;
  key: string;
  name: string;
  confidence: string;
}

/** upstream.flows — 영향 플로우(진입점 기반 추정). */
interface FlowRef {
  flowId: string;
  routeId: string;
  domainId: string;
  domainKey: string;
  domainName: string;
  confidence: string;
  via: string;
}

interface MapperRef {
  namespace: string;
  relPath: string;
  owners: string[];
  citation: Citation | null;
}

interface TableCatalogEntry {
  name: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
}

interface TableSlot {
  mapperRelPath: string;
  sqlSlice: { filePath: string; startLine: number; endLine: number };
}

interface Persistence {
  mappers?: MapperRef[];
  kgTableCatalog?: TableCatalogEntry[];
  tableCandidateSlots?: TableSlot[];
  note?: string;
}

interface ImpactData {
  gitCommit: string;
  depthCap: number;
  fanInThreshold: number;
  edgeKinds: string[];
  seeds: Seed[];
  upstream: {
    files: ImpactFile[];
    api?: ApiRoute[];
    domains?: DomainRef[];
    flows?: FlowRef[];
    persistence?: Persistence;
  };
  downstream: { files: ImpactFile[] };
  needsReview: NeedsReviewItem[];
  overEdges?: { importOnlyCount?: number };
}

interface VerifyItem {
  ref: string;
  kind: string;
  verdict: string;
}

interface VerifyReport {
  items: VerifyItem[];
  overall: {
    citationOk: number;
    citationTotal: number;
    groundedPct: number;
    itemGrounded: number;
    itemTotal: number;
    uncitedClaims: number;
  };
}

/** GET /impact-history 원장 항목 — 대시보드가 띄운 자연어 분석의 기록(서버가 job 종료 시 append). */
interface HistoryEntry {
  jobId: string;
  query: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  status: "done" | "failed";
  gitCommit: string | null;
  /** 스냅샷으로 확보된 파일명 — impact.json 없으면 열람 불가(실패 job 등). */
  files: string[];
  /**
   * 이 실행이 루트 슬롯(.spec/map/impact.json)을 갱신했나. 부재 = true(하위호환).
   * false = 요청별 실행(추적표 인테이크의 코드영향 검증) — 열람은 되지만 슬롯의 주인은 아니다.
   */
  rootSlot?: boolean;
  /** "user-confirmed" = 사용자가 시드 후보를 확정한 실행. 부재 = 구 자율 실행(LLM 시드). */
  seedGate?: "user-confirmed" | null;
  /** 산출 시드 ↔ 확정 시드 대조 — false 는 spawn 이 지시를 벗어난 것(경고 표식). */
  seedMatch?: boolean | null;
}

/** 원장 실행 유형 배지 — 시드를 누가 정했나(근거 등급이 갈리는 축). */
function seedOriginBadge(e: HistoryEntry): { label: string; tone: BadgeTone; title: string } {
  if (e.rootSlot === false) {
    return {
      label: "RTM 요청",
      tone: "info",
      title: "추적표 요청 세션의 코드영향 검증 — 시드는 changeset 결정론 조인",
    };
  }
  if (e.seedGate === "user-confirmed") {
    return { label: "시드 확정", tone: "ok", title: "사용자가 시드 후보를 확정한 실행" };
  }
  return { label: "자율(구)", tone: "mut", title: "구 자율 실행 — LLM 이 시드를 골랐다(게이트 이전)" };
}

type Status = "loading" | "ready" | "empty" | "error";

/** relPath 를 마지막 2세그먼트로 축약(전체는 title 로). */
const short2 = (p: string): string => p.split("/").slice(-2).join("/");
/** citation 근거는 파일명만 노출. */
const baseName = (p: string): string => p.split("/").pop() ?? p;
/** flowId → 사람이 읽는 라우트 표기("flow:ANY /x" → "/x"). */
const shortFlow = (id: string): string => id.replace(/^flow:/, "").replace(/^ANY\s+/, "");
/**
 * impact.json 동일성 지문 — 앵커 커밋 + 시드 집합.
 * 루트 슬롯이 어느 원장 항목의 산출인지 대조하는 용도(슬롯엔 jobId·query 가 없다).
 */
const identOf = (d: ImpactData): string =>
  `${d.gitCommit}|${d.seeds
    .map((s) => s.relPath)
    .sort()
    .join(",")}`;

/** ISO 시각 → "MM-DD HH:mm"(로컬) — 기록 목록용 축약. */
const fmtTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

const CARD = "rounded-[10px] border border-border-subtle bg-panel card-shadow";
const GRP_LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  padding: "10px 2px 4px",
};
const ROW: CSSProperties = { padding: "5px 2px", borderTop: "1px solid var(--color-border-subtle)" };
const LINK_TEXT: CSSProperties = {
  fontSize: 12,
  color: "var(--color-status-info)",
  textDecoration: "none",
  flex: "none",
};
const PANEL_H3: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--color-text-primary)",
  marginBottom: 8,
};
const CHIP: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--color-elevated)",
  color: "var(--color-text-secondary)",
  textDecoration: "none",
  border: "1px solid var(--color-border-subtle)",
};

/** 검증 verdict → 배지(GROUNDED = 근거확보, 그 외 = 확인 필요). */
const VERDICT: Record<string, { label: string; tone: BadgeTone }> = {
  GROUNDED: { label: "근거확보", tone: "ok" },
  NEEDS_REVIEW: { label: "확인 필요", tone: "warn" },
};

/** viaKinds 조합별 그룹(정렬은 minDepth 오름차순 → 첫 등장 순서 = 얕은 깊이 우선). */
function groupByVia(files: ImpactFile[]): Array<[string, ImpactFile[]]> {
  const sorted = [...files].sort((a, b) => a.minDepth - b.minDepth);
  const map = new Map<string, ImpactFile[]>();
  for (const f of sorted) {
    const key = f.viaKinds.length > 0 ? f.viaKinds.join(" · ") : "기타";
    const bucket = map.get(key);
    if (bucket) bucket.push(f);
    else map.set(key, [f]);
  }
  return [...map.entries()];
}

/** BtnOutline sm 톤의 Link(딥링크 네비게이션). */
function LinkBtn({ to, children, title }: { to: string; children: ReactNode; title?: string }) {
  return (
    <Link
      to={to}
      title={title}
      className="rounded-md border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold"
      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, textDecoration: "none", flex: "none" }}
    >
      {children}
    </Link>
  );
}

/** file:line 근거 → 코드 뷰어 오픈(citation null 은 호출 측에서 폴백 처리). */
function CiteBtn({
  filePath,
  line,
  label,
  onOpen,
}: {
  filePath: string;
  line: number;
  label?: string;
  onOpen: (filePath: string, line: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(filePath, line)}
      title={`${filePath}:${line}`}
      className="cursor-pointer bg-transparent border-0 hover:underline"
      style={{
        font: "inherit",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--color-status-info)",
        flex: "none",
        padding: 0,
      }}
    >
      {label ?? `근거 ${baseName(filePath)}:${line}`}
    </button>
  );
}

function FileRow({ f, onOpen }: { f: ImpactFile; onOpen: (filePath: string, line: number) => void }) {
  return (
    <div className="flex items-center gap-2" style={ROW}>
      <span
        className="truncate"
        title={f.relPath}
        style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 0, flex: "1 1 auto", color: "var(--color-text-primary)" }}
      >
        {short2(f.relPath)}
      </span>
      {f.citation ? (
        <CiteBtn filePath={f.citation.filePath} line={f.citation.line} onOpen={onOpen} />
      ) : (
        <Ev style={{ flex: "none" }}>근거 위치 미상</Ev>
      )}
      <Badge tone="mut" style={{ flex: "none" }}>
        d{f.minDepth}
      </Badge>
    </div>
  );
}

/** 그룹 렌더 + 상위 limit 행 캡. 초과분은 "외 n건" 으로 정직하게 표기(침묵 누락 금지). */
function FileGroups({
  files,
  limit,
  onOpen,
}: {
  files: ImpactFile[];
  limit: number;
  onOpen: (filePath: string, line: number) => void;
}) {
  const groups = groupByVia(files);
  const out: ReactNode[] = [];
  let shown = 0;
  let hidden = 0;
  for (const [key, gfiles] of groups) {
    const room = Math.max(0, limit - shown);
    const take = gfiles.slice(0, room);
    hidden += gfiles.length - take.length;
    if (take.length === 0) continue;
    shown += take.length;
    out.push(
      <div key={key}>
        <div style={GRP_LABEL}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{key}</span> ({gfiles.length})
        </div>
        {take.map((f) => (
          <FileRow key={f.relPath} f={f} onOpen={onOpen} />
        ))}
      </div>,
    );
  }
  return (
    <>
      {out}
      {hidden > 0 && (
        <div className="text-text-muted" style={{ fontSize: 11.5, padding: "6px 2px 0" }}>
          외 {hidden}건
        </div>
      )}
    </>
  );
}

export default function ChangeImpactView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const openImpactModal = useDashboardStore((s) => s.openImpactModal);
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const [searchParams, setSearchParams] = useSearchParams();
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const jobStatus = useDashboardStore((s) => s.impactJob.status);

  // 분석 기록(히스토리) — 라이브 dev 서버 전용(demo 번들엔 원장·스냅샷 엔드포인트 없음).
  // ?run=<jobId> 로 과거 스냅샷 열람, 없으면 최신(live impact.json).
  const historyEnabled = !DEMO_MODE && !!accessToken;
  const rawRun = searchParams.get("run");
  const activeRun = historyEnabled && rawRun && /^[0-9a-f]{16}$/.test(rawRun) ? rawRun : null;
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [data, setData] = useState<ImpactData | null>(null);
  const [verify, setVerify] = useState<VerifyReport | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setVerify(null);
    const snapQ = (name: string) =>
      `/impact-history-item?id=${activeRun}&name=${name}&token=${encodeURIComponent(accessToken ?? "")}`;
    // 필수 — impact.json. 404 는 "아직 분석 없음"(빈 상태), 그 외 실패는 오류 상태로 구분.
    // 기록 열람(activeRun) 시엔 해당 job 스냅샷을 대신 조회.
    fetch(activeRun ? snapQ("impact.json") : `${dataBase}impact.json${tokenQ}`)
      .then(async (r) => {
        if (r.status === 404) return { kind: "empty" as const };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as ImpactData;
        if (d && Array.isArray(d.seeds) && d.downstream && d.upstream) return { kind: "ok" as const, d };
        return { kind: "empty" as const };
      })
      .then((res) => {
        if (!alive) return;
        if (res.kind === "ok") {
          setData(res.d);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    // 선택 — 검증 리포트. 부재/실패는 조용히 무시(정직: 없으면 미표기).
    fetch(
      activeRun ? snapQ("impact-verify-report.json") : `${dataBase}impact-verify-report.json${tokenQ}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((v: VerifyReport | null) => {
        if (alive && v && Array.isArray(v.items) && v.overall) setVerify(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // jobStatus: 자연어 분석 완료(running→done) 시 최신 결과 자동 재조회.
  }, [dataBase, tokenQ, activeRun, accessToken, jobStatus]);

  // 분석 기록 원장 — 마운트 시 + job 종료(done/failed 전이) 시 재조회. 부재/실패 = 기록 없음.
  useEffect(() => {
    if (!historyEnabled || jobStatus === "running") return;
    let alive = true;
    fetch(`/impact-history?token=${encodeURIComponent(accessToken ?? "")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { entries?: HistoryEntry[] } | null) => {
        if (alive && d && Array.isArray(d.entries)) setHistory(d.entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [historyEnabled, accessToken, jobStatus]);

  // 루트 슬롯 지문 — 기록 열람(activeRun) 중에도 "어느 항목이 최신인가" 를 알아야 하므로
  // data(=열람 대상)와 별개로 항상 조회한다. 부재/실패 = 슬롯 없음(빈 상태와 동일).
  const [rootMeta, setRootMeta] = useState<{ ident: string; gitCommit: string } | null>(null);
  useEffect(() => {
    if (!historyEnabled) return;
    let alive = true;
    fetch(`${dataBase}impact.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ImpactData | null) => {
        if (!alive) return;
        setRootMeta(d && Array.isArray(d.seeds) && d.gitCommit ? { ident: identOf(d), gitCommit: d.gitCommit } : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [historyEnabled, dataBase, tokenQ, jobStatus]);

  // 원장 최신 done 항목(원장은 최신이 앞). 루트 슬롯은 정의상 "가장 최근 성공 job 의 산출" 이라
  // 이 한 건만 대조하면 충분하다 — 어긋나면 원장 밖 실행이 슬롯을 덮어쓴 것.
  // ★ 단 `rootSlot === false` 인 항목(추적표 인테이크의 요청별 실행)은 **슬롯을 안 건드린다** →
  //   대조 대상에서 뺀다. 안 빼면 그 항목이 최신 자리를 차지해 지문이 어긋나고, 멀쩡한 슬롯이
  //   "기록 없는 분석" 으로 오판된다(설계: RTM_INTAKE_WORKSPACE_DESIGN.md §2.3).
  const newestDone = useMemo(
    () =>
      history.find(
        (e) => e.status === "done" && e.files.includes("impact.json") && (e.rootSlot ?? true),
      ) ?? null,
    [history],
  );
  const [newestIdent, setNewestIdent] = useState<string | null>(null);
  useEffect(() => {
    if (!newestDone) {
      setNewestIdent(null);
      return;
    }
    let alive = true;
    fetch(
      `/impact-history-item?id=${newestDone.jobId}&name=impact.json&token=${encodeURIComponent(accessToken ?? "")}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ImpactData | null) => {
        if (alive) setNewestIdent(d && Array.isArray(d.seeds) && d.gitCommit ? identOf(d) : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [newestDone, accessToken]);

  // 현재 census 의 커밋 — 앵커의 출처가 곧 census 다(engine.ts:120 `gitCommit: census.gitCommit`).
  // 앵커와 대조하면 "분석 이후 재스캔됐나 = 낡은 입력으로 계산된 분석인가" 를 정확히 판정할 수 있다.
  // 주의: 이건 **스캔 대비** 신선도다. 코드(HEAD)가 앞서갔는지는 알 수 없으므로 주장하지 않는다.
  const [censusCommit, setCensusCommit] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${dataBase}census.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { gitCommit?: string } | null) => {
        if (alive) setCensusCommit(typeof d?.gitCommit === "string" ? d.gitCommit : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ, jobStatus]);

  /** 루트 슬롯을 낳은 원장 항목 — 대조 실패 시 null(= 원장 밖 실행이 슬롯을 점유). */
  const currentJobId =
    rootMeta && newestIdent && rootMeta.ident === newestIdent ? (newestDone?.jobId ?? null) : null;
  /** 슬롯은 있는데 원장에 대응이 없음 → "기록 없는 분석" 으로 분리 노출. */
  const orphanRoot = historyEnabled && !!rootMeta && !currentJobId;

  const verdictOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of verify?.items ?? []) m.set(it.ref, it.verdict);
    return m;
  }, [verify]);

  // 영향받는 파일 검색·필터 — ?q=(파일 경로) & ?via=(viaKind). 검색 활성 시 limit 캡 해제(전량 도달).
  const upFiles = useMemo(() => data?.upstream.files ?? [], [data]);
  const downFiles = useMemo(() => data?.downstream.files ?? [], [data]);
  const allVias = useMemo(() => {
    const set = new Set<string>();
    for (const f of [...upFiles, ...downFiles]) for (const v of f.viaKinds) set.add(v);
    return [...set].sort();
  }, [upFiles, downFiles]);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const viaParam = searchParams.get("via");
  const viaFilter = viaParam && allVias.includes(viaParam) ? viaParam : null;
  const searchActive = q.length > 0 || viaFilter != null;

  const filterFiles = (files: ImpactFile[]): ImpactFile[] =>
    files.filter((f) => {
      if (q && !f.relPath.toLowerCase().includes(q)) return false;
      if (viaFilter && !f.viaKinds.includes(viaFilter)) return false;
      return true;
    });
  const downView = filterFiles(downFiles);
  const upView = filterFiles(upFiles);
  const rowLimit = searchActive ? Number.POSITIVE_INFINITY : 12;

  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set(k, v);
        else prev.delete(k);
        return prev;
      },
      { replace },
    );

  // 확인 필요(warn)·참고(info) 신호 — 데이터 맵 미해결/참고와 동일하게 TopBar 로 이관.
  // data 이전(로딩/오류)엔 빈 배열이라 칩·행·모달이 자연히 안 뜬다.
  const needsReview = data?.needsReview ?? [];
  const warnReview = needsReview.filter((r) => r.severity !== "info");
  const infoReview = needsReview.filter((r) => r.severity === "info");
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  // 비포·에프터 모달(RTM ②와 공유) — 업무/기능흐름도 · 데이터.
  const [flowCompare, setFlowCompare] = useState(false);
  const [dataCompare, setDataCompare] = useState(false);

  const infoRows: InfoRow[] = [
    { label: "산출물", value: "impact.json" },
    { label: "범위", value: "CR 단위 상·하류 도달성" },
    { label: "용도", value: "변경영향분석서(09) 원천" },
  ];
  if (infoReview.length > 0) {
    infoRows.push({
      label: "참고",
      value: `${infoReview.length}건`,
      onClick: () => setReviewInfoOpen(true),
    });
  }

  // 메뉴 헤더 제거(2026-07-15) — 정보/확인필요/참고는 TopBar, '자연어 영향 분석'은 액션 슬롯으로.
  // head 는 각 렌더 상태에서 그대로 렌더되며 포털이라 인라인 레이아웃은 차지하지 않는다.
  const head = (
    <>
      <TopBarSlot>
        <span className="inline-flex items-center gap-2">
          <InfoPopover title="변경·영향 정보" rows={infoRows} />
          {warnReview.length > 0 && (
            <Chip
              tone="warn"
              label={`⚠ 확인 필요 ${warnReview.length}`}
              title={`확인 필요 ${warnReview.length}건`}
              sub="— 정합 확인이 필요한 신호"
              items={warnReview.map(
                (r): DbUnresolved => ({ ref: r.ref, reason: r.reason, severity: "warn" }),
              )}
            />
          )}
        </span>
      </TopBarSlot>
      <TopBarSlot slot="actions">
        <BtnAccent onClick={openImpactModal}>자연어 영향 탐색</BtnAccent>
      </TopBarSlot>
      {reviewInfoOpen && (
        <UnresolvedModal
          title={`참고 ${infoReview.length}건`}
          sub="— 무해 신호"
          items={infoReview.map(
            (r): DbUnresolved => ({ ref: r.ref, reason: r.reason, severity: "info" }),
          )}
          onClose={() => setReviewInfoOpen(false)}
        />
      )}
    </>
  );

  // 좌측 트리 — 원장 단일 목록(최신 항목에 [최신] 배지). 빈/오류 상태에서도 기록 열람은
  // 가능해야 하므로 ready 분기 밖에서 만들어 공유한다.
  const selectedEntry = activeRun ? (history.find((e) => e.jobId === activeRun) ?? null) : null;
  /** 우측 헤더에 질의문을 띄울 대상 — 기록 열람이면 그 항목, 아니면 슬롯을 낳은 항목. */
  const headerEntry = activeRun
    ? selectedEntry
    : (history.find((e) => e.jobId === currentJobId) ?? null);
  const tree = (
    <div className={`${CARD} proto-tree`}>
      {historyEnabled ? (
        <>
          <div className="fold">분석 기록 ({history.length})</div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px", lineHeight: 1.5 }}>
              아직 기록 없음 — 자연어 영향 탐색을 실행하면 여기 쌓입니다.
            </div>
          ) : (
            history.map((e) => {
              const openable = e.files.includes("impact.json");
              const isCurrent = e.jobId === currentJobId;
              const on = activeRun ? activeRun === e.jobId : isCurrent;
              const origin = seedOriginBadge(e);
              return (
                <button
                  key={e.jobId}
                  type="button"
                  className={`doc${on ? " on" : ""}`}
                  disabled={!openable}
                  title={`${e.query}\n${fmtTime(e.finishedAt)}${openable ? "" : " · 결과 스냅샷 없음"}`}
                  style={openable ? undefined : { opacity: 0.55, cursor: "default" }}
                  // 최신 항목은 루트 슬롯(문서 09·구조 오버레이와 같은 기준)을 그대로 보여주므로
                  // ?run= 없이 연다 — 스냅샷 열람 배너 대신 문서/오버레이 링크가 뜬다.
                  onClick={() => setParam("run", isCurrent ? null : e.jobId)}
                >
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span className="truncate" style={{ display: "block" }}>
                      {e.query || "(질의 미상)"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{fmtTime(e.finishedAt)}</span>
                  </span>
                  <span className="st">
                    {isCurrent && <Badge tone="info">최신</Badge>}
                    <span title={origin.title}>
                      <Badge tone={origin.tone}>{origin.label}</Badge>
                    </span>
                    {e.seedMatch === false && (
                      <span title="산출 시드가 확정 시드와 다릅니다 — 실행이 지시를 벗어났을 수 있음">
                        <Badge tone="warn">시드 불일치</Badge>
                      </span>
                    )}
                    <Badge tone={e.status === "done" ? "ok" : "err"}>
                      {e.status === "done" ? "완료" : "실패"}
                    </Badge>
                  </span>
                </button>
              );
            })
          )}
          {orphanRoot && rootMeta && (
            <>
              <div className="fold">기록 없는 분석</div>
              <button
                type="button"
                className={`doc${activeRun ? "" : " on"}`}
                title={`원장에 기록이 없는 분석입니다 — CLI 직접 실행(/understand-impact) 등이 최신 슬롯을 덮어썼습니다.\n앵커 commit ${rootMeta.gitCommit}`}
                onClick={() => setParam("run", null)}
              >
                <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span className="truncate" style={{ display: "block" }}>
                    질의 미상 · {rootMeta.gitCommit.slice(0, 7)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    CLI 직접 실행 등 — 원장 미기록
                  </span>
                </span>
                <span className="st">
                  <Badge tone="info">최신</Badge>
                </span>
              </button>
            </>
          )}
        </>
      ) : (
        // 원장 없음(demo 번들 — 엔드포인트 미포함) → 슬롯 1건만 표기.
        <>
          <div className="fold">현재</div>
          <button type="button" className="doc on" style={{ cursor: "default" }}>
            <span className="truncate" style={{ minWidth: 0 }}>
              최신 분석{data ? ` · ${data.gitCommit.slice(0, 7)}` : ""}
            </span>
            <span className="st">
              <Badge tone="info">최신</Badge>
            </span>
          </button>
        </>
      )}
      <div className="fold">안내</div>
      {/* 인테이크는 impact 엔진을 호출하지 않는다(요구사항 문서 + RTM 행만 산출) — 여기서
          "RTM 인테이크로도 분석이 시작된다" 고 안내하면 오지 않을 결과를 기다리게 된다. */}
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "6px 8px", lineHeight: 1.5 }}>
        새 분석은 우상단 <b className="text-text-secondary">자연어 영향 분석</b> 또는 CLI에서{" "}
        <code>/understand-impact</code>를 실행해 시작합니다.
        <div style={{ marginTop: 6 }}>
          요구사항 접수·추적은 <Link to="/rtm" style={LINK_TEXT}>추적표</Link>에서 합니다.
        </div>
      </div>
    </div>
  );

  if (status !== "ready" || !data) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        {head}
        {status === "loading" ? (
          <p className="text-text-muted" style={{ fontSize: 13, padding: "4px 2px" }}>
            불러오는 중…
          </p>
        ) : (
          <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
            {tree}
            {status === "error" ? (
              <div
                className={CARD}
                style={{ padding: "20px 24px", borderLeft: "3px solid var(--color-status-error)" }}
              >
                <p className="text-text-primary" style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 6 }}>
                  영향 분석을 불러오지 못했습니다
                </p>
                <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  사유: <code>{errorMsg}</code> — 네트워크 또는 접근 토큰을 확인한 뒤 새로고침하세요.
                </p>
              </div>
            ) : (
              <div className={CARD} style={{ padding: "28px", textAlign: "center" }}>
                <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {activeRun
                    ? "이 기록의 결과 스냅샷을 찾을 수 없습니다 — 좌측에서 다른 기록이나 최신 분석을 선택하세요"
                    : "영향 분석 결과가 없습니다. 우상단 자연어 영향 분석 또는 CLI에서 /understand-impact를 실행해 분석을 먼저 생성하세요."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 스캔 대비 신선도 — 앵커(=분석이 소비한 census 의 커밋) vs 현재 census 의 커밋.
  // 기록 열람 중엔 판정하지 않는다(과거 스냅샷은 낡은 게 당연 — 배지가 의미 없다).
  const scanState: "current" | "stale" | "unknown" =
    activeRun || !censusCommit || !data.gitCommit
      ? "unknown"
      : censusCommit === data.gitCommit
        ? "current"
        : "stale";
  const api = data.upstream.api ?? [];
  const domains = data.upstream.domains ?? [];
  const flows = data.upstream.flows ?? [];
  const persistence = data.upstream.persistence;
  const mappers = persistence?.mappers ?? [];
  const importOnly = data.overEdges?.importOnlyCount ?? 0;

  const slotMap = new Map<string, TableSlot["sqlSlice"]>();
  for (const s of persistence?.tableCandidateSlots ?? []) slotMap.set(s.mapperRelPath, s.sqlSlice);

  // kgTableCatalog 는 대/소문자·파일 플레이스홀더 중복 → 테이블명 기준 dedup(첫 등장 유지).
  const tables: TableCatalogEntry[] = [];
  {
    const seen = new Set<string>();
    for (const t of persistence?.kgTableCatalog ?? []) {
      if (/\.sql$/i.test(t.name)) continue;
      const key = t.name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tables.push(t);
    }
    tables.sort((a, b) => a.name.toUpperCase().localeCompare(b.name.toUpperCase()));
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {head}

      {/* 프로토 .docs — 좌 260px 트리 카드 + 우 콘텐츠 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]" style={{ gap: 14 }}>
        {/* 좌 트리 — 최신 1건 + 분석 기록 원장(impact-history) */}
        {tree}

        {/* 우 콘텐츠 */}
        <div style={{ minWidth: 0 }}>
          {/* 헤더 카드 — 앵커 commit + 액션 + seeds 칩 */}
          <div className={CARD} style={{ padding: "16px 20px", marginBottom: 14 }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* 제목 = 질의문(사람 언어). 앵커 커밋은 사용자가 판단에 쓸 수 없는 내부 식별자라
                  화면에서 뺐고, 신선도 판정 재료로만 쓴다. 질의문을 모르면(원장 밖 실행) 총칭. */}
              <b className="truncate" style={{ fontSize: 15, minWidth: 0, maxWidth: 620 }} title={headerEntry?.query}>
                {headerEntry?.query || "영향 분석"}
              </b>
              {activeRun ? <Badge tone="warn">기록 열람</Badge> : <Badge tone="ok">분석 완료</Badge>}
              {/* 스캔 대비 신선도 — "코드 최신" 은 검사하지 않았으므로 주장하지 않는다. */}
              {scanState === "current" && <Badge tone="mut">현재 스캔 기준</Badge>}
              {scanState === "stale" && <Badge tone="warn">스캔 갱신됨 · 재분석 권장</Badge>}
              <div className="flex-1" />
              {activeRun ? (
                <button
                  type="button"
                  onClick={() => setParam("run", null)}
                  className="rounded-md border border-border-medium bg-panel text-text-secondary hover:bg-elevated transition-colors font-semibold cursor-pointer"
                  style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, flex: "none" }}
                >
                  최신 결과 보기
                </button>
              ) : (
                <>
                  <LinkBtn to="/deliverables/09_impact-analysis">변경영향분석서(09) 보기</LinkBtn>
                  <LinkBtn to="/domains?tab=structure&overlay=impact">그래프 오버레이 →</LinkBtn>
                </>
              )}
            </div>
            {/* 분석 시각 + 상태 주석. 질의문은 제목으로 올라갔다(원장 항목에서만 알 수 있음). */}
            <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 8 }}>
              {headerEntry && (
                <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                  {fmtTime(headerEntry.finishedAt)} 분석
                  {activeRun ? " — 과거 스냅샷이며 문서(09)·구조 오버레이는 최신 기준" : ""}
                </span>
              )}
              {/* 원장 밖 실행이 슬롯을 점유 — 질의문이 유실된 상태임을 감추지 않는다. */}
              {!activeRun && orphanRoot && (
                <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                  질의 미상 — 원장에 기록되지 않은 실행(CLI 직접 실행 등)의 결과입니다.
                </span>
              )}
              {/* 낡은 입력으로 계산된 분석 — 무엇이 어긋났는지까지 밝힌다. */}
              {scanState === "stale" && (
                <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                  이 분석 이후 코드 스캔(census)이 갱신됐습니다 — 결과가 현재 스캔과 다를 수 있습니다.
                </span>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                변경 기점 (seeds {data.seeds.length})
              </div>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {data.seeds.map((s) => {
                  const grounded = s.confidence === "CONFIRMED";
                  return (
                    <span
                      key={s.relPath}
                      title={`${s.relPath} · origin=${s.origin} · ${grounded ? "근거확보" : "추정"}(기계 판정)`}
                      className="inline-flex items-center"
                      style={{
                        gap: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--color-elevated)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {short2(s.relPath)}
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: grounded ? "var(--color-status-ok)" : "var(--color-status-warn)",
                        }}
                      >
                        {grounded ? "근거확보" : "추정"}
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="text-text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                시드 판정은 정적 분석 자동(기계 판정) — 사람 확정 아님
              </div>
            </div>
          </div>

          {/* StatTile 4개 */}
          <section className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 14 }}>
            <StatTile label="상류 파일" value={upFiles.length} />
            <StatTile label="하류 파일" value={downFiles.length} />
            <StatTile label="확인 필요" value={data.needsReview.length} />
            <StatTile label="엣지 종류" value={data.edgeKinds.length} small={`깊이 캡 ${data.depthCap}`} />
          </section>

          {/* 검증 요약(선택) — impact-verify-report.json 이 있을 때만 근거 표면화 */}
          {verify && (
            <div
              className={CARD}
              style={{ padding: "10px 16px", marginBottom: 14, borderLeft: "3px solid var(--color-status-ok)" }}
            >
              <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
                <Badge tone="ok">검증</Badge>
                <span className="text-text-secondary" style={{ fontSize: 12.5 }}>
                  {verify.overall.itemGrounded}/{verify.overall.itemTotal} 항목 근거확보(GROUNDED) · 인용 정확{" "}
                  {verify.overall.groundedPct}% ({verify.overall.citationOk}/{verify.overall.citationTotal})
                </span>
                <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                  — 미인용 주장 {verify.overall.uncitedClaims}건은 확인 필요
                </span>
              </div>
            </div>
          )}

          {/* 상류 영향 — 진입점(API)·도메인·플로우 한 카드(2026-07-17, RTM ② 조건 카드와 동형).
              종전 "영향받는 진입점"/"영향 도메인·플로우" 두 카드의 통합. */}
          {(api.length > 0 || domains.length > 0 || flows.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              <SectionCard
                tone="var(--color-status-info)" icon="↑" title="상류 영향" sub="이 변경이 흔드는 것 — 진입점 기반 추정(기계 판정)"
                action={
                  <CompareBtn
                    label="업무흐름도 비포·에프터"
                    onClick={() => setFlowCompare(true)}
                    disabled={flows.length === 0}
                    title={flows.length === 0 ? "영향받는 업무 흐름이 없어 비교할 도식이 없습니다" : "현행 업무흐름도(비포)와 영향 도달 표식(에프터)을 나란히 봅니다 — 기능흐름도 전환 포함"}
                  />
                }
              >
                {api.length > 0 && (
                  <>
                    <div style={GRP_LABEL}>진입점 ({api.length})</div>
                    {api.map((r) => {
                      const verdict = verdictOf.get(r.id);
                      const vb = verdict ? VERDICT[verdict] : undefined;
                      return (
                        <div key={r.id} className="flex items-center gap-2" style={ROW}>
                          <span
                            className="truncate"
                            title={r.id}
                            style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 0, flex: "1 1 auto", color: "var(--color-text-primary)" }}
                          >
                            {r.handler}
                          </span>
                          {vb && (
                            <Badge tone={vb.tone} style={{ flex: "none" }}>
                              {vb.label}
                            </Badge>
                          )}
                          <CiteBtn filePath={r.filePath} line={r.line} onOpen={openCodeViewerAt} />
                        </div>
                      );
                    })}
                  </>
                )}
                {domains.length > 0 && (
                  <>
                    <div style={GRP_LABEL}>도메인 ({domains.length})</div>
                    <div className="flex flex-wrap" style={{ gap: 6 }}>
                      {domains.map((d) => (
                        <Link key={d.domainId} to={`/domains/${encodeURIComponent(d.domainId)}`} title={d.domainId} style={CHIP}>
                          {d.name}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
                {flows.length > 0 && (
                  <>
                    <div style={GRP_LABEL}>플로우 ({flows.length})</div>
                    <div className="flex flex-wrap" style={{ gap: 6 }}>
                      {flows.map((f) => (
                        <Link
                          key={f.flowId}
                          to={`/domains/${encodeURIComponent(f.domainId)}?flow=${encodeURIComponent(f.flowId)}`}
                          title={`${f.flowId} · ${f.domainName}`}
                          style={CHIP}
                        >
                          {shortFlow(f.flowId)}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
                <div className="text-text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                  칩 클릭 시 도메인 · 순서도로 이동 — 비포·에프터는 우상단 버튼
                </div>
              </SectionCard>
            </div>
          )}

          {/* 하류 의존(데이터) — 매퍼 + 테이블 카탈로그 (persistence). RTM ② 하류 카드와 동형. */}
          {(mappers.length > 0 || tables.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              <SectionCard
                tone="var(--color-layer-dao)" icon="↓" title="하류 의존 — 건드리는 DB" sub="이 변경이 기대는 데이터"
                action={
                  <CompareBtn
                    label="데이터 비포·에프터"
                    onClick={() => setDataCompare(true)}
                    disabled={tables.length === 0}
                    title={tables.length === 0 ? "도달 테이블 기록이 없어 비교할 대상이 없습니다" : "현행 스키마(비포)와 변경 도달 테이블 표식(에프터)을 나란히 봅니다"}
                  />
                }
              >
              {mappers.length > 0 && (
                <>
                  <div style={GRP_LABEL}>매퍼 ({mappers.length})</div>
                  {mappers.map((m) => {
                    const slice = slotMap.get(m.relPath);
                    return (
                      <div key={m.relPath} className="flex items-center gap-2" style={ROW}>
                        <span
                          className="truncate"
                          title={m.namespace}
                          style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 0, flex: "1 1 auto", color: "var(--color-text-primary)" }}
                        >
                          {baseName(m.relPath)}
                        </span>
                        <span className="text-text-muted" style={{ fontSize: 11, flex: "none" }}>
                          소유자 {m.owners.length}
                        </span>
                        {slice ? (
                          <CiteBtn
                            filePath={slice.filePath}
                            line={slice.startLine}
                            label={`SQL ${slice.startLine}–${slice.endLine}행`}
                            onOpen={openCodeViewerAt}
                          />
                        ) : m.citation ? (
                          <CiteBtn filePath={m.citation.filePath} line={m.citation.line} onOpen={openCodeViewerAt} />
                        ) : (
                          <Ev style={{ flex: "none" }}>근거 위치 미상</Ev>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {tables.length > 0 && (
                <>
                  <div style={GRP_LABEL}>테이블 카탈로그 ({tables.length})</div>
                  <div className="flex flex-wrap" style={{ gap: 6 }}>
                    {tables.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => openCodeViewerAt(t.filePath, t.startLine ?? 1)}
                        title={`${t.filePath}:${t.startLine ?? 1}`}
                        className="cursor-pointer hover:bg-elevated"
                        style={{ ...CHIP, font: "inherit", fontFamily: "var(--font-mono)", fontSize: 12 }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                  <div className="text-text-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
                    테이블은 census 인벤토리 후보 — 매퍼 XML의 실제 접근 컬럼은 SQL 슬라이스에서 확인하세요.
                  </div>
                </>
              )}
              </SectionCard>
            </div>
          )}

          {/* 2컬럼 패널 */}
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14 }}>
            {/* 좌 — 영향 분해 (하류 + 상류 파일 전량, viaKinds 그룹) — RTM ② 조건 카드와 동형. */}
            <SectionCard tone="var(--color-layer-dao)" icon="⇉" title="영향 분해 — 도달 파일" sub="시드에서 연쇄로 닿는 파일 전량" count={upFiles.length + downFiles.length}>

              {/* 툴바 — 파일 검색 + viaKind 필터(?q=&via=). 검색 활성 시 12행 캡 해제(전량 도달). */}
              <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 10 }}>
                <SearchInput
                  value={searchParams.get("q") ?? ""}
                  onChange={(v) => setParam("q", v || null, true)}
                  placeholder="파일 경로 검색"
                  width={170}
                />
                <select
                  value={viaFilter ?? ""}
                  onChange={(e) => setParam("via", e.target.value || null)}
                  className="rounded-lg border border-border-medium bg-panel text-text-secondary"
                  style={{ padding: "6px 10px", fontSize: 12.5 }}
                >
                  <option value="">경로 종류 전체</option>
                  {allVias.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {searchActive && (
                  <span className="text-text-muted" style={{ fontSize: 12 }}>
                    {downView.length + upView.length}건 표시 중
                  </span>
                )}
              </div>

              {downView.length === 0 && upView.length === 0 ? (
                <p className="text-text-muted" style={{ fontSize: 12.5, padding: "4px 2px" }}>
                  {searchActive ? "검색·필터에 맞는 영향 파일 없음" : "영향 파일 없음"}
                </p>
              ) : (
                <>
                  {downView.length > 0 && <FileGroups files={downView} limit={rowLimit} onOpen={openCodeViewerAt} />}
                  {upView.length > 0 && (
                    <>
                      <div style={GRP_LABEL}>상류 ({upView.length})</div>
                      <FileGroups files={upView} limit={rowLimit} onOpen={openCodeViewerAt} />
                    </>
                  )}
                </>
              )}

              <div className="text-text-muted" style={{ fontSize: 11.5, padding: "10px 2px 0", lineHeight: 1.5 }}>
                d = 시드로부터 도달 깊이 · 근거(file:line) 클릭 시 코드 열람
                {importOnly > 0 && ` · import 전용 간선 ${importOnly}건은 도달성에서 제외됨`}
              </div>
            </SectionCard>

            {/* 우 — 확인 필요 · 후속 조치 */}
            <div className={CARD} style={{ padding: "16px 18px" }}>
              {/* 확인 필요(warn)·참고(info)는 TopBar 칩/행으로 이관(2026-07-15) — 아래는 영향 산출물. */}
              <h3 style={PANEL_H3}>후속 조치</h3>
              <div style={GRP_LABEL}>영향 산출물</div>
              <div className="flex items-center gap-2" style={ROW}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", flex: "1 1 auto" }}>
                  변경영향분석서(09)
                </span>
                <Link to="/deliverables/09_impact-analysis" style={LINK_TEXT}>
                  보기 →
                </Link>
              </div>
              <div className="flex items-center gap-2" style={ROW}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", flex: "1 1 auto" }}>
                  구조 그래프 오버레이
                </span>
                <Link to="/domains?tab=structure&overlay=impact" style={LINK_TEXT}>
                  열기 →
                </Link>
              </div>
              {/* 여정(FRONT_REDESIGN_DESIGN.md:29) 마무리 — 영향 확인 후 추적표에서 확정한다.
                  추적표는 이 분석의 산출물이 아니므로 그룹을 나눈다. */}
              <div style={GRP_LABEL}>다음 단계</div>
              <div className="flex items-center gap-2" style={ROW}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", flex: "1 1 auto" }}>
                  요구사항 추적표
                </span>
                <Link to="/rtm" style={LINK_TEXT} title="영향 범위를 확인했다면 추적표에서 요구사항을 확정한다">
                  열기 →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 비포·에프터 모달 — RTM ② 와 같은 컴포넌트·같은 스냅샷(표면이 갈라질 수 없다). */}
      {flowCompare && (
        <FlowCompareModal
          flows={flows.map((f) => ({ flowId: f.flowId, domainId: f.domainId }))}
          // 원장 분석은 요청(①) 없이 도는 임의 질의 — changeset.added 개념이 없다.
          addedNames={[]}
          seedFiles={new Set(data.seeds.map((s) => s.relPath))}
          impactFiles={new Set([
            ...upFiles.map((f) => f.relPath),
            ...downFiles.map((f) => f.relPath),
            ...api.map((r) => r.filePath),
            ...mappers.map((m) => m.relPath),
          ])}
          onClose={() => setFlowCompare(false)}
        />
      )}
      {dataCompare && (
        // 원장 시드는 파일(relPath)이라 기능명이 없다 — CRUD 조인 대신 스냅샷의 테이블 카탈로그로 도달만 표식.
        <DataCompareModal tables={tables.map((t) => t.name)} onClose={() => setDataCompare(false)} />
      )}
    </div>
  );
}
