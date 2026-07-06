import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../store";
import { Badge, BtnOutline, PageHead, StatTile } from "./proto/Proto";

/**
 * ktds-fork (메뉴 개편 2차): 실적 보고서 뷰 — pmpl-proto pg-report 재현.
 * 데이터: work-summary.json(/understand-report 생성물). 모든 문장·수치는 결정론
 * 템플릿으로 조립한다(LLM 산문 0 · 날조 0). 존재하는 값만 문장화하고, 원장(RTM/문서)
 * 진척이 null 이면 문장을 합성하지 않고 "미수집"으로 정직하게 표기한다.
 * 주간 추이는 commits[].dateIso 를 ISO 주(월요일 시작) 버킷으로 집계 — range 밖 주는
 * 지어내지 않는다.
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
interface WorkSummary {
  range: ResolvedRange;
  commits: WorkCommit[];
  totals: WorkTotals;
  previous: PreviousWindow | null;
  modules: WorkModule[];
  rtmProgress: RtmProgress | null;
  docProgress: DocProgress | null;
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

const H3: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  marginBottom: 12,
};

export default function ReportView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const navigate = useNavigate();

  const [data, setData] = useState<WorkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
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
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <PageHead title="실적 보고서" meta="work-summary · git + 원장(audit) 수집 사실만 — 날조 0 원칙" />
      </div>
    );
  }

  const { totals, range, modules, rtmProgress, docProgress, previous } = data;
  const top3 = modulesSorted.slice(0, 3).map((m) => m.key);
  const maxLines = Math.max(1, ...modules.map((m) => m.linesChanged));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const periodText =
    range.fromIso && range.toIso ? `기간 ${dayOf(range.fromIso)} ~ ${dayOf(range.toIso)}` : "기간 미해석";
  const anchorText = range.anchorSha ? ` · anchor ${range.anchorSha.slice(0, 7)}` : "";

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="실적 보고서"
        meta="work-summary · git + 원장(audit) 수집 사실만 — 날조 0 원칙"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="mut" title="직접 범위는 /understand-report 재실행">
              {rangeLabel(range)}
            </Badge>
            <BtnOutline
              onClick={() => navigate(`/deliverables/${encodeURIComponent("si-실적요약보고서")}`)}
              title="산출물의 실적 요약 보고서(md · xlsx 병기)로 이동"
            >
              md
            </BtnOutline>
          </div>
        }
      />

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
          <StatTile
            label="RTM 확정 전환"
            value={grp(rtmProgress.functionsConfirmed + rtmProgress.scenariosConfirmed + rtmProgress.requirementsConfirmed)}
          />
        )}
        {docProgress && <StatTile label="문서 승인" value={grp(docProgress.approved)} />}
      </section>

      {/* ── 2컬럼: 모듈별 변경 / 주간 추이 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]" style={{ gap: 14 }}>
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
              <div
                key={m.key}
                title={m.topFiles.length > 0 ? `상위 파일: ${m.topFiles.join(", ")}` : undefined}
                className="grid items-center"
                style={{ gridTemplateColumns: "72px 1fr 56px", gap: 10, padding: "4px 0" }}
              >
                <span className="text-text-muted tabular-nums" style={{ fontSize: 12, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.key}
                </span>
                <div
                  style={{
                    height: 14,
                    borderRadius: "0 4px 4px 0",
                    background: "var(--color-accent)",
                    opacity: 0.8,
                    width: `${Math.max(1, Math.round((m.linesChanged / maxLines) * 100))}%`,
                    minWidth: m.linesChanged > 0 ? 3 : 0,
                  }}
                />
                <span className="text-text-muted tabular-nums" style={{ fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {grp(m.linesChanged)}
                </span>
              </div>
            ))
          )}
          <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            단위: 변경 줄 수 · 출처: {moduleSourceSummary(modules)}
          </p>
        </div>

        {/* 우: 주간 추이 + 진척 이벤트 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "16px 18px" }}>
          <h3 style={H3}>주간 추이 — 커밋</h3>
          {weeks.length === 0 ? (
            <p className="text-text-muted" style={{ fontSize: 12 }}>주간 데이터 없음</p>
          ) : (
            <div className="flex items-end" style={{ gap: 6, height: 72, paddingTop: 8 }}>
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
              직전 기간 {grp(previous.totals.commits)}건
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

      {/* ── 하단 각주 ── */}
      <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>
        모든 문장은 결정론 템플릿으로 조립(LLM 산문 없음) · 생성물 변경 {grp(totals.generated.files)}파일은 별도 집계.
      </p>
    </div>
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
