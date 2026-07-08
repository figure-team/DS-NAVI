import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../store";
import { Badge, BtnOutline, PageHead, StatTile } from "./proto/Proto";

/**
 * ktds-fork (메뉴 개편 2차 · 보고서 개선): 실적 보고서 뷰 — pmpl-proto pg-report 재현.
 * 데이터: work-summary.json(/understand-report 생성물). 모든 문장·수치는 결정론
 * 템플릿으로 조립한다(LLM 산문 0 · 날조 0). 존재하는 값만 문장화하고, 원장(RTM/문서)
 * 진척이 null 이면 문장을 합성하지 않고 "미수집"으로 정직하게 표기한다.
 * 주간 추이는 commits[].dateIso 를 ISO 주(월요일 시작) 버킷으로 집계 — range 밖 주는
 * 지어내지 않는다. 직전 기간 대비 증감(previous.totals)은 저장하지 않고 파생 계산한다.
 * 커밋 테이블의 정렬·펼침·작성자/메시지 필터는 URL searchParams 로 이관(딥링크·새로고침).
 */

/* ── work-summary.json 스키마(legacy-core work-summary WorkSummaryReportSchema) ── */
interface WorkTotals {
  commits: number;
  mergeCommits: number;
  authors: number;
  files: number;
  added: number;
  deleted: number;
  generated: { files: number; added: number; deleted: number };
}
interface WorkModule {
  key: string;
  linesChanged: number;
  files: number;
  commits: number;
  source: "dir" | "program-inventory";
  topFiles: string[];
}
interface WorkCommitFile {
  path: string;
  added: number;
  deleted: number;
}
interface WorkCommit {
  sha: string;
  author: string;
  dateIso: string;
  subject: string;
  isMerge: boolean;
  files: WorkCommitFile[];
}
interface RtmProgress {
  functionsConfirmed: number;
  scenariosConfirmed: number;
  requirementsConfirmed: number;
  confirmEvents: number;
  editEvents: number;
}
interface DocProgress {
  submitted: number;
  approved: number;
  returned: number;
}
interface ResolvedRange {
  mode: "weeks" | "month" | "range";
  rawArg: string;
  fromIso: string | null;
  toIso: string | null;
  anchorSha: string | null;
}
interface PreviousWindow {
  fromIso: string;
  toIso: string;
  totals: WorkTotals;
  rtmProgress: RtmProgress | null;
  docProgress: DocProgress | null;
}
/** meta — git 수집 신뢰도/좌표계 박제(부재 가능 → 방어적 옵셔널). */
interface WorkMeta {
  gitAvailable: boolean;
  gitStatus: "ok" | "no-git" | "shallow" | "too-large" | string;
  prefix: string;
  moduleSource: "program-inventory" | "dir" | string;
  generatedPatterns?: string[];
}
interface WorkSummary {
  range: ResolvedRange;
  commits: WorkCommit[];
  totals: WorkTotals;
  previous: PreviousWindow | null;
  modules: WorkModule[];
  rtmProgress: RtmProgress | null;
  docProgress: DocProgress | null;
  meta?: WorkMeta;
}

/* ── 결정론 포매터(지역 의존 없음) ── */
/** 천단위 구분(정규식 — toLocaleString 지역 의존 회피). */
function grp(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/** 통계 타일용 축약(≥1000 → 1자리 k). */
function kfmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
/** ISO 문자열의 날짜부(YYYY-MM-DD) — 슬라이스만(타임존 계산 없음). */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
/** 경로 마지막 세그먼트(파일명) — 근거 칩 라벨용. */
function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
/** YYYY-MM-DD → 그 주 월요일(UTC 자정) 키. dow 0=Sun..6=Sat. */
function weekMonday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}
/** 월요일 키 → "M-D" 라벨(제로패딩 없음, 프로토 표기). */
function weekLabel(monday: string): string {
  const [, m, d] = monday.split("-");
  return `${Number(m)}-${Number(d)}`;
}
/** 월요일 키 → 다음 주 월요일 키(주간 축 순회용). */
function nextMonday(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 7);
  return dt.toISOString().slice(0, 10);
}
/** 기간 라벨(액션 배지) — mode 별 결정론 조립. */
function rangeLabel(r: ResolvedRange): string {
  if (r.mode === "weeks") return `주간×${r.rawArg}`;
  if (r.mode === "month") return `월간 ${r.rawArg}`;
  return `직접 범위 ${r.rawArg}`;
}
/** range → /understand-report 재실행 CLI 힌트(툴팁). */
function rerunHint(r: ResolvedRange): string {
  if (r.mode === "weeks") return `재실행: /understand-report --weeks ${r.rawArg}`;
  if (r.mode === "month") return `재실행: /understand-report --month ${r.rawArg}`;
  return `재실행: /understand-report --range ${r.rawArg}`;
}

/** 델타 표기 — prev→cur(±d). 부호는 정직하게(증가 +, 감소 −, 무변화 ±0). */
interface Delta {
  text: string;
  sign: 1 | 0 | -1;
}
function delta(cur: number, prev: number): Delta {
  const d = cur - prev;
  const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
  const sgn = d > 0 ? `+${grp(d)}` : d < 0 ? `−${grp(-d)}` : "±0";
  return { text: `${grp(prev)}→${grp(cur)}(${sgn})`, sign };
}
function deltaColor(sign: 1 | 0 | -1): string {
  if (sign > 0) return "var(--color-status-ok)";
  if (sign < 0) return "var(--color-text-muted)";
  return "var(--color-text-secondary)";
}

interface WeekBucket {
  monday: string;
  label: string;
  count: number;
}

/** commits 를 ISO 주(월요일) 버킷으로. 축은 range(있으면) 아니면 커밋 자체 범위. 후행 빈 주는 절삭(선행/중간 빈 주는 정직하게 유지). */
function bucketWeeks(commits: WorkCommit[], range: ResolvedRange): WeekBucket[] {
  const commitDays = commits.map((c) => dayOf(c.dateIso)).sort();
  const loDay = range.fromIso ? dayOf(range.fromIso) : commitDays[0];
  const hiDay = range.toIso ? dayOf(range.toIso) : commitDays[commitDays.length - 1];
  if (!loDay || !hiDay) return [];

  const counts = new Map<string, number>();
  for (const c of commits) {
    const key = weekMonday(dayOf(c.dateIso));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: WeekBucket[] = [];
  const end = weekMonday(hiDay);
  let cur = weekMonday(loDay);
  // 안전 상한(무한 루프 방지) — 실무상 주 수는 소수.
  for (let i = 0; i < 520 && cur <= end; i += 1) {
    buckets.push({ monday: cur, label: weekLabel(cur), count: counts.get(cur) ?? 0 });
    cur = nextMonday(cur);
  }
  // 커밋이 있으나 축 밖(다른 offset)인 주 보강 — 누락 없이 표면화.
  for (const [key, count] of counts) {
    if (!buckets.some((b) => b.monday === key)) {
      buckets.push({ monday: key, label: weekLabel(key), count });
    }
  }
  buckets.sort((a, b) => a.monday.localeCompare(b.monday));
  while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop();
  return buckets;
}

/** modules 출처 요약(예: "program-inventory 9 · dir 4"). */
function moduleSourceSummary(modules: WorkModule[]): string {
  const by = new Map<string, number>();
  for (const m of modules) by.set(m.source, (by.get(m.source) ?? 0) + 1);
  return [...by.entries()].map(([s, n]) => `${s} ${n}`).join(" · ");
}

/** gitStatus 불완전 사유 → 사람 말 경고 문구(부재/shallow/too-large/no-git). */
function gitWarning(meta: WorkMeta | undefined): string | null {
  if (!meta) return null;
  if (meta.gitAvailable === false || meta.gitStatus === "no-git") {
    return "git 이력을 읽지 못했습니다(no-git) — 커밋·변경 수치가 비어 있거나 불완전합니다.";
  }
  if (meta.gitStatus === "shallow") {
    return "얕은 클론(shallow)에서 수집되어 이력이 잘렸을 수 있습니다 — 커밋·변경 수치가 실제보다 적을 수 있습니다.";
  }
  if (meta.gitStatus === "too-large") {
    return "이력이 수집 상한을 초과(too-large)해 일부만 집계되었습니다 — 수치가 불완전합니다.";
  }
  return null;
}

/* ── 요약 클립보드 — 고정 한국어 문형만 조립(LLM 산문 금지, 존재 값만). ── */
function buildSummaryText(data: WorkSummary, periodText: string, top3: string[]): string {
  const { totals, rtmProgress, docProgress, previous } = data;
  const lines: string[] = [];
  lines.push(`[실적 보고서] ${periodText}`);
  lines.push(
    `커밋 ${grp(totals.commits)}건(${grp(totals.authors)}명), 파일 ${grp(totals.files)}개 변경(+${grp(totals.added)} / −${grp(totals.deleted)}, 생성물 제외 · 생성물 별도 +${grp(totals.generated.added)})`,
  );
  if (top3.length > 0) lines.push(`변경 상위 모듈: ${top3.join(", ")}`);
  if (previous) {
    const dc = delta(totals.commits, previous.totals.commits);
    const dl = delta(totals.added + totals.deleted, previous.totals.added + previous.totals.deleted);
    const df = delta(totals.files, previous.totals.files);
    lines.push(`직전 기간 대비 — 커밋 ${dc.text} · 변경 라인 ${dl.text} · 변경 파일 ${df.text}`);
  }
  if (rtmProgress) {
    lines.push(
      `RTM 확정 전환 ${grp(rtmProgress.functionsConfirmed + rtmProgress.scenariosConfirmed + rtmProgress.requirementsConfirmed)}건(기능 ${grp(rtmProgress.functionsConfirmed)} · 시나리오 ${grp(rtmProgress.scenariosConfirmed)} · 요구사항 ${grp(rtmProgress.requirementsConfirmed)})`,
    );
  }
  if (docProgress) {
    lines.push(`문서 승인 ${grp(docProgress.approved)}건(제출 ${grp(docProgress.submitted)} · 반려 ${grp(docProgress.returned)})`);
  }
  return lines.join("\n");
}

const H3: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  marginBottom: 12,
};

/* ── 인쇄 스타일(자기 파일 스코프) — body.report-printing 토글 시에만 발화, 셸 파일 무수정.
   NavRail(nav)/TopBar(header)/모바일 탭바 숨김 + 스크롤 컨테이너 전개(전체 본문 인쇄). ── */
const PRINT_CSS = `
@media print {
  body.report-printing nav,
  body.report-printing header,
  body.report-printing [data-report-noprint] { display: none !important; }
  body.report-printing #root,
  body.report-printing #root > div,
  body.report-printing #root > div > div,
  body.report-printing #root > div > div > div {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    position: static !important;
  }
  body.report-printing .report-print-root {
    height: auto !important;
    overflow: visible !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

type SortKey = "date" | "author" | "files";
type SortDir = "asc" | "desc";

export default function ReportView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<WorkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${dataBase}work-summary.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: WorkSummary) => {
        if (!alive) return;
        if (d && typeof d === "object" && Array.isArray(d.commits) && d.totals) setData(d);
        else setError("work-summary.json 형식 오류");
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e instanceof Error ? e.message : e));
      });
    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  const weeks = useMemo(() => (data ? bucketWeeks(data.commits, data.range) : []), [data]);
  const modulesSorted = useMemo(
    () => (data ? [...data.modules].sort((a, b) => b.linesChanged - a.linesChanged) : []),
    [data],
  );
  const authors = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.commits.map((c) => c.author))].sort((a, b) => a.localeCompare(b));
  }, [data]);

  /* ── 커밋 테이블 상태(URL 단일 소스) ── */
  const sortKey = (searchParams.get("sort") as SortKey | null) ?? "date";
  const sortDir = (searchParams.get("dir") as SortDir | null) ?? "desc";
  const authorFilter = searchParams.get("author") ?? "";
  const cq = searchParams.get("q") ?? "";
  const openShas = useMemo(
    () => new Set((searchParams.get("open") ?? "").split(",").filter(Boolean)),
    [searchParams],
  );

  const visibleCommits = useMemo(() => {
    if (!data) return [];
    const q = cq.trim().toLowerCase();
    const filtered = data.commits.filter(
      (c) =>
        (!authorFilter || c.author === authorFilter) &&
        (!q || c.subject.toLowerCase().includes(q) || c.sha.toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: WorkCommit, b: WorkCommit): number => {
      let base = 0;
      if (sortKey === "author") base = a.author.localeCompare(b.author);
      else if (sortKey === "files") base = a.files.length - b.files.length;
      else base = a.dateIso.localeCompare(b.dateIso);
      // sha ASC tie-break — 결정론 정렬.
      return base !== 0 ? base * dir : a.sha.localeCompare(b.sha);
    };
    return [...filtered].sort(cmp);
  }, [data, authorFilter, cq, sortKey, sortDir]);

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        if (value) prev.set(key, value);
        else prev.delete(key);
        return prev;
      },
      { replace: true },
    );
  }
  function toggleSort(key: SortKey) {
    // 같은 열 재클릭 → 방향 토글, 새 열 → 기본 desc.
    if (sortKey === key) {
      setParam("dir", sortDir === "desc" ? "asc" : "desc");
    } else {
      setSearchParams(
        (prev) => {
          prev.set("sort", key);
          prev.set("dir", "desc");
          return prev;
        },
        { replace: true },
      );
    }
  }
  function toggleOpen(sha: string) {
    const next = new Set(openShas);
    if (next.has(sha)) next.delete(sha);
    else next.add(sha);
    setParam("open", next.size > 0 ? [...next].join(",") : null);
  }

  function handleCopy() {
    if (!data) return;
    const text = buildSummaryText(data, periodText, top3);
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  }
  function handlePrint() {
    document.body.classList.add("report-printing");
    const cleanup = () => {
      document.body.classList.remove("report-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // 동기 print 다이얼로그 이후 즉시 정리(afterprint 미발화 브라우저 대비).
    cleanup();
  }

  if (error) {
    return (
      <div className="report-print-root flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <style>{PRINT_CSS}</style>
        <PageHead title="실적 보고서" meta="work-summary · git + 원장(audit) 수집 사실만 — 날조 0 원칙" />
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 20px" }}>
          <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            실적 요약 없음 — <code>/understand-report</code> 실행으로 생성하세요.
          </p>
          <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>({error})</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="report-print-root flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <PageHead title="실적 보고서" meta="work-summary · git + 원장(audit) 수집 사실만 — 날조 0 원칙" />
        <ReportSkeleton />
      </div>
    );
  }

  const { totals, range, modules, rtmProgress, docProgress, previous, meta } = data;
  const top3 = modulesSorted.slice(0, 3).map((m) => m.key);
  const maxLines = Math.max(1, ...modules.map((m) => m.linesChanged));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const periodText =
    range.fromIso && range.toIso ? `기간 ${dayOf(range.fromIso)} ~ ${dayOf(range.toIso)}` : "기간 미해석";
  const anchorText = range.anchorSha ? ` · anchor ${range.anchorSha.slice(0, 7)}` : "";
  const gitWarn = gitWarning(meta);
  const weeklyAxisLabel =
    weeks.length > 0 ? `주간 커밋 추이: ${weeks.map((w) => `${w.label} ${w.count}건`).join(", ")}` : "주간 데이터 없음";

  // 직전 기간 대비 델타(previous 존재 시에만 — null 이면 문구 합성 금지).
  const dCommits = previous ? delta(totals.commits, previous.totals.commits) : null;
  const dLines = previous
    ? delta(totals.added + totals.deleted, previous.totals.added + previous.totals.deleted)
    : null;
  const dFiles = previous ? delta(totals.files, previous.totals.files) : null;

  return (
    <div className="report-print-root flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <style>{PRINT_CSS}</style>
      <PageHead
        title="실적 보고서"
        meta="work-summary · git + 원장(audit) 수집 사실만 — 날조 0 원칙"
        actions={
          <div className="flex items-center gap-2" data-report-noprint>
            <Badge tone="mut" title={rerunHint(range)}>
              {rangeLabel(range)}
            </Badge>
            <BtnOutline onClick={handleCopy} title="요약 문장을 클립보드로 복사(고정 한국어 문형)">
              {copied ? "복사됨" : "요약 복사"}
            </BtnOutline>
            <BtnOutline onClick={handlePrint} title="현재 보고서를 인쇄(셸 숨김)">
              인쇄
            </BtnOutline>
            <BtnOutline
              onClick={() => navigate(`/deliverables/${encodeURIComponent("si-실적요약보고서")}`)}
              title="산출물의 실적 요약 보고서(md · xlsx 병기)로 이동"
            >
              md
            </BtnOutline>
          </div>
        }
      />

      {/* ── git 신뢰도 경고(불완전 수치 명시) ── */}
      {gitWarn && (
        <div
          className="rounded-[10px] card-shadow"
          style={{
            padding: "11px 15px",
            marginBottom: 14,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--color-status-warn)",
            background: "color-mix(in srgb, var(--color-status-warn) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-status-warn) 34%, transparent)",
          }}
        >
          <b>수집 신뢰도 주의</b> — {gitWarn}
        </div>
      )}

      {/* ── 하이라이트 ── */}
      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <h3 style={H3}>
          하이라이트
          <Badge tone="mut">
            {periodText}
            {anchorText}
          </Badge>
        </h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--color-text-secondary)" }}>
          기간 내 커밋 <b className="text-text-primary tabular-nums">{grp(totals.commits)}건({grp(totals.authors)}명)</b>, 파일{" "}
          <b className="text-text-primary tabular-nums">{grp(totals.files)}개</b> 변경(+{grp(totals.added)} / −{grp(totals.deleted)}, 생성물 제외 — 생성물 별도 +{grp(totals.generated.added)}).
          {top3.length > 0 && (
            <>
              {" "}변경 상위 모듈: <b className="text-text-primary">{top3.join(", ")}</b>.
            </>
          )}
          {rtmProgress && (
            <>
              {" "}RTM 확정 전환{" "}
              <b className="text-text-primary tabular-nums">
                {grp(rtmProgress.functionsConfirmed + rtmProgress.scenariosConfirmed + rtmProgress.requirementsConfirmed)}건
              </b>
              (기능 {grp(rtmProgress.functionsConfirmed)} · 시나리오 {grp(rtmProgress.scenariosConfirmed)} · 요구사항 {grp(rtmProgress.requirementsConfirmed)}).
            </>
          )}
          {docProgress && (
            <>
              {" "}문서 승인 <b className="text-text-primary tabular-nums">{grp(docProgress.approved)}건</b>(제출 {grp(docProgress.submitted)} · 반려 {grp(docProgress.returned)}).
            </>
          )}
        </p>

        {/* 직전 기간 대비 증감(previous 존재 시에만 — 저장 없이 파생) */}
        {previous && dCommits && dLines && dFiles && (
          <div
            className="flex flex-wrap items-center"
            style={{ gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <span className="text-text-muted" style={{ fontSize: 12, fontWeight: 650 }}>
              직전 기간 대비
              <span style={{ fontWeight: 400, marginLeft: 6 }}>
                ({dayOf(previous.fromIso)} ~ {dayOf(previous.toIso)})
              </span>
            </span>
            <TrendChip label="커밋" d={dCommits} />
            <TrendChip label="변경 라인" d={dLines} />
            <TrendChip label="변경 파일" d={dFiles} />
          </div>
        )}
      </div>

      {/* ── 통계 타일 ── */}
      <section
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}
      >
        <StatTile label="커밋" value={grp(totals.commits)} />
        <StatTile label="작성자" value={grp(totals.authors)} />
        <StatTile label="변경 파일" value={grp(totals.files)} />
        <StatTile label="추가 / 삭제" value={`+${kfmt(totals.added)}`} small={`−${kfmt(totals.deleted)}`} />
        {rtmProgress && (
          <TileLink to="/rtm" title="요구사항 추적표(RTM)로 이동">
            <StatTile
              label="RTM 확정 전환 →"
              value={grp(rtmProgress.functionsConfirmed + rtmProgress.scenariosConfirmed + rtmProgress.requirementsConfirmed)}
            />
          </TileLink>
        )}
        {docProgress && (
          <TileLink to="/deliverables" title="산출물(문서)로 이동">
            <StatTile label="문서 승인 →" value={grp(docProgress.approved)} />
          </TileLink>
        )}
      </section>

      {/* ── 2컬럼: 모듈별 변경 / 주간 추이 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]" style={{ gap: 14, marginBottom: 14 }}>
        {/* 좌: 모듈별 변경 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
          <h3 style={H3}>
            모듈별 변경
            <Badge tone="mut">program-inventory 조인</Badge>
          </h3>
          {modulesSorted.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 12 }}>모듈 변경 데이터 없음</p>
          ) : (
            modulesSorted.map((m) => (
              <div key={m.key} style={{ padding: "7px 0", borderTop: "1px solid var(--color-border-subtle)" }}>
                <div className="grid items-center" style={{ gridTemplateColumns: "minmax(96px,150px) 1fr auto", gap: 10 }}>
                  <span className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
                    <span className="text-text-secondary tabular-nums truncate" style={{ fontSize: 12 }} title={m.key}>
                      {m.key}
                    </span>
                    {m.source === "program-inventory" ? (
                      <Badge tone="ok" title="program-inventory 조인으로 도메인 귀속(근거 확보)">근거확보</Badge>
                    ) : (
                      <Badge tone="warn" title="디렉터리 폴백 귀속(근거 부족 · 추정)">추정</Badge>
                    )}
                  </span>
                  <div
                    role="img"
                    aria-label={`${m.key} 변경 ${grp(m.linesChanged)}줄`}
                    style={{
                      height: 14,
                      borderRadius: "0 4px 4px 0",
                      background: "var(--color-accent)",
                      opacity: 0.8,
                      width: `${Math.max(1, Math.round((m.linesChanged / maxLines) * 100))}%`,
                      minWidth: m.linesChanged > 0 ? 3 : 0,
                    }}
                  />
                  <span className="flex items-center text-text-muted tabular-nums" style={{ gap: 12, fontSize: 12, justifyContent: "flex-end" }}>
                    <span style={{ fontFamily: "var(--font-mono)" }} title="변경 줄 수">{grp(m.linesChanged)}줄</span>
                    <span title="커밋 수">커밋 {grp(m.commits)}</span>
                    <span title="파일 수">파일 {grp(m.files)}</span>
                  </span>
                </div>
                {m.topFiles.length > 0 && (
                  <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 5, paddingLeft: 2 }}>
                    <span className="text-text-muted" style={{ fontSize: 10.5 }}>상위 파일:</span>
                    {m.topFiles.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => openCodeViewerAt(f, 1)}
                        title={f}
                        className="border border-border-subtle rounded-md hover:bg-elevated cursor-pointer"
                        style={{ fontSize: 10.5, padding: "2px 7px", fontFamily: "var(--font-mono)", color: "var(--color-status-info)", background: "transparent" }}
                      >
                        {baseName(f)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            단위: 변경 줄 수 · 출처: {moduleSourceSummary(modules)}
            {meta && ` · 귀속 기준: ${meta.moduleSource}`}
          </p>
        </div>

        {/* 우: 주간 추이 + 진척 이벤트 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
          <h3 style={H3}>주간 추이 — 커밋</h3>
          {weeks.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 12 }}>주간 데이터 없음</p>
          ) : (
            <div role="img" aria-label={weeklyAxisLabel} className="flex items-end" style={{ gap: 6, height: 72, paddingTop: 8 }}>
              {weeks.map((w, i) => {
                const cur = i === weeks.length - 1;
                return (
                  <div key={w.monday} className="flex flex-col items-center justify-end" style={{ flex: 1, height: "100%", gap: 4 }}>
                    <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 650, color: "var(--color-text-secondary)" }}>
                      {w.count}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 46,
                        borderRadius: "4px 4px 0 0",
                        background: "var(--color-accent)",
                        opacity: cur ? 1 : 0.55,
                        height: `${Math.round((w.count / maxWeek) * 100)}%`,
                      }}
                    />
                    <span className="text-text-muted" style={{ fontSize: 10.5 }}>{w.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {previous && (
            <p className="text-text-muted" style={{ fontSize: 11, marginTop: 8 }}>
              직전 기간 커밋 {grp(previous.totals.commits)}건 ({dayOf(previous.fromIso)} ~ {dayOf(previous.toIso)})
            </p>
          )}

          <h3 style={{ ...H3, marginTop: 16 }}>진척 이벤트 (원장 audit)</h3>
          {!rtmProgress && !docProgress ? (
            <div className="text-text-muted" style={{ fontSize: 12.5, padding: "9px 2px", borderTop: "1px solid var(--color-border-subtle)" }}>
              원장 이벤트 미수집 — RTM/문서 확정 데이터 없음
            </div>
          ) : (
            <>
              {rtmProgress && (
                <>
                  <ProgressRow name="RTM 기능 확정" value={`${grp(rtmProgress.functionsConfirmed)}`} unit="건" />
                  <ProgressRow name="시나리오 확정" value={`${grp(rtmProgress.scenariosConfirmed)}`} unit="건" />
                  <ProgressRow name="요구사항 확정" value={`${grp(rtmProgress.requirementsConfirmed)}`} unit="건" />
                </>
              )}
              {docProgress && (
                <ProgressRow name="문서 제출 → 승인" value={`${grp(docProgress.submitted)} → ${grp(docProgress.approved)}`} unit="건" />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 커밋 이력 테이블 ── */}
      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
        <h3 style={H3}>
          커밋 이력
          <Badge tone="mut">{grp(visibleCommits.length)} / {grp(data.commits.length)}건</Badge>
        </h3>

        {/* 필터 — 작성자/메시지(URL 이관) */}
        <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 10 }} data-report-noprint>
          <select
            value={authorFilter}
            onChange={(e) => setParam("author", e.target.value || null)}
            aria-label="작성자 필터"
            className="rounded-lg border border-border-medium bg-panel text-text-primary"
            style={{ padding: "6px 10px", fontSize: 12.5 }}
          >
            <option value="">작성자 전체 ({authors.length})</option>
            {authors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <input
            type="search"
            value={cq}
            onChange={(e) => setParam("q", e.target.value || null)}
            placeholder="메시지·sha 검색"
            aria-label="커밋 메시지 검색"
            className="rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
            style={{ padding: "6px 12px", fontSize: 12.5, flex: "1 1 200px", minWidth: 160 }}
          />
          {(authorFilter || cq) && (
            <BtnOutline
              sm
              onClick={() =>
                setSearchParams(
                  (prev) => {
                    prev.delete("author");
                    prev.delete("q");
                    return prev;
                  },
                  { replace: true },
                )
              }
              title="필터 초기화"
            >
              필터 해제
            </BtnOutline>
          )}
        </div>

        {visibleCommits.length === 0 ? (
          <p className="text-text-muted" style={{ fontSize: 12.5, padding: "10px 2px" }}>
            {data.commits.length === 0 ? "커밋 없음" : "필터에 해당하는 커밋 없음"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <ColHead label="sha" />
                  <ColHead label="날짜" active={sortKey === "date"} dir={sortDir} onClick={() => toggleSort("date")} />
                  <ColHead label="작성자" active={sortKey === "author"} dir={sortDir} onClick={() => toggleSort("author")} />
                  <ColHead label="제목" grow />
                  <ColHead label="파일" active={sortKey === "files"} dir={sortDir} onClick={() => toggleSort("files")} align="right" />
                </tr>
              </thead>
              <tbody>
                {visibleCommits.map((c) => {
                  const isOpen = openShas.has(c.sha);
                  return (
                    <FragmentRow
                      key={c.sha}
                      commit={c}
                      isOpen={isOpen}
                      onToggle={() => toggleOpen(c.sha)}
                      onOpenFile={openCodeViewerAt}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 하단 각주 ── */}
      <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>
        모든 문장은 결정론 템플릿으로 조립(LLM 산문 없음) · 생성물 변경 {grp(totals.generated.files)}파일은 별도 집계(+{grp(totals.generated.added)} / −{grp(totals.generated.deleted)}).
        {meta && ` · 수집 상태: git ${meta.gitStatus}`}
      </p>
    </div>
  );
}

/* ── 델타 칩(prev→cur(±d)) ── */
function TrendChip({ label, d }: { label: string; d: Delta }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 6, fontSize: 12 }}>
      <span className="text-text-muted">{label}</span>
      <b className="tabular-nums" style={{ color: deltaColor(d.sign) }}>{d.text}</b>
    </span>
  );
}

/* ── StatTile 을 Link 로 감싸는 래퍼(근거 점프) ── */
function TileLink({ to, title, children }: { to: string; title: string; children: React.ReactNode }) {
  return (
    <Link to={to} title={title} className="block transition-opacity hover:opacity-80" style={{ textDecoration: "none" }}>
      {children}
    </Link>
  );
}

/* ── 커밋 테이블 열 헤더(정렬 토글) ── */
function ColHead({
  label,
  active,
  dir,
  onClick,
  grow,
  align,
}: {
  label: string;
  active?: boolean;
  dir?: SortDir;
  onClick?: () => void;
  grow?: boolean;
  align?: "right";
}) {
  const arrow = active ? (dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--color-panel)",
        textAlign: align ?? "left",
        padding: "7px 8px",
        borderBottom: "1px solid var(--color-border-subtle)",
        fontSize: 11.5,
        fontWeight: 650,
        color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
        whiteSpace: "nowrap",
        width: grow ? "auto" : 1,
      }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${label} 기준 정렬`}
          className="cursor-pointer bg-transparent border-0"
          style={{ font: "inherit", color: "inherit", padding: 0 }}
        >
          {label}
          {arrow}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

/* ── 커밋 행 + 펼침(파일 목록) ── */
function FragmentRow({
  commit,
  isOpen,
  onToggle,
  onOpenFile,
}: {
  commit: WorkCommit;
  isOpen: boolean;
  onToggle: () => void;
  onOpenFile: (filePath: string, line: number) => void;
}) {
  const td: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-subtle)", verticalAlign: "top" };
  return (
    <>
      <tr className="hover:bg-elevated/40 cursor-pointer" onClick={onToggle}>
        <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
          <span className="text-text-muted" style={{ marginRight: 4 }}>{isOpen ? "▾" : "▸"}</span>
          {commit.sha.slice(0, 7)}
        </td>
        <td style={{ ...td, whiteSpace: "nowrap" }} className="text-text-muted tabular-nums">{dayOf(commit.dateIso)}</td>
        <td style={{ ...td, whiteSpace: "nowrap" }} className="text-text-secondary">{commit.author}</td>
        <td style={td}>
          <span className="flex items-center" style={{ gap: 6 }}>
            {commit.isMerge && <Badge tone="info">머지</Badge>}
            <span className="text-text-primary">{commit.subject}</span>
          </span>
        </td>
        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} className="text-text-muted tabular-nums">
          {grp(commit.files.length)}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={5} style={{ padding: "2px 8px 10px 30px", borderBottom: "1px solid var(--color-border-subtle)", background: "color-mix(in srgb, var(--color-elevated) 40%, transparent)" }}>
            {commit.files.length === 0 ? (
              <span className="text-text-muted" style={{ fontSize: 11.5 }}>
                파일 통계 없음{commit.isMerge ? " (머지 커밋)" : ""}
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 6 }}>
                {commit.files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => onOpenFile(f.path, 1)}
                    title={`${f.path} 열기`}
                    className="text-left hover:bg-elevated rounded cursor-pointer bg-transparent border-0 flex items-center"
                    style={{ gap: 10, padding: "2px 4px", fontSize: 11.5 }}
                  >
                    <span className="tabular-nums" style={{ minWidth: 74, color: "var(--color-status-ok)" }}>
                      +{grp(f.added)} <span className="text-text-muted">/</span> −{grp(f.deleted)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-status-info)", wordBreak: "break-all" }}>{f.path}</span>
                  </button>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ProgressRow({ name, value, unit }: { name: string; value: string; unit: string }) {
  return (
    <div className="flex items-center" style={{ gap: 10, padding: "9px 2px", borderTop: "1px solid var(--color-border-subtle)", fontSize: 13 }}>
      <span style={{ fontWeight: 550 }}>{name}</span>
      <div className="flex items-center" style={{ marginLeft: "auto", gap: 6 }}>
        <b className="text-text-primary tabular-nums">{value}</b>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{unit}</span>
      </div>
    </div>
  );
}

/* ── 로딩 스켈레톤(StatTile/카드 골격) ── */
function ReportSkeleton() {
  const bar: CSSProperties = {
    background: "color-mix(in srgb, var(--color-text-muted) 14%, transparent)",
    borderRadius: 6,
  };
  return (
    <div aria-hidden style={{ opacity: 0.7 }}>
      <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ ...bar, height: 13, width: 120, marginBottom: 12 }} />
        <div style={{ ...bar, height: 11, width: "90%", marginBottom: 7 }} />
        <div style={{ ...bar, height: 11, width: "72%" }} />
      </div>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "14px 16px" }}>
            <div style={{ ...bar, height: 10, width: 56, marginBottom: 10 }} />
            <div style={{ ...bar, height: 22, width: 80 }} />
          </div>
        ))}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]" style={{ gap: 14 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px", height: 200 }}>
            <div style={{ ...bar, height: 13, width: 110, marginBottom: 14 }} />
            <div style={{ ...bar, height: 11, width: "100%", marginBottom: 8 }} />
            <div style={{ ...bar, height: 11, width: "88%", marginBottom: 8 }} />
            <div style={{ ...bar, height: 11, width: "94%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
