import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useDashboardStore } from "../store";
import { dataUrl } from "../shared/api/client";
import { Badge, BtnAccent, ConfBadge, PageHead, ProtoTabs, StatTile } from "./proto/Proto";
import type { BadgeTone, ConfKind } from "./proto/Proto";
import CitationChip from "./CitationChip";

/**
 * 정책서 뷰(신설, pmpl-proto pg-policy 1416~1512행) — 정적 추출한 정책 "신호"를
 * 카테고리별/도메인/대조 3탭으로 검증한다. 코드가 진실의 원천이며, 규범 서술(정책 문장)은
 * LLM 2단계 산출물이라 이 화면은 목업 문장을 합성하지 않는다 — 신호·근거·대조만 실데이터로 노출.
 *
 * 카테고리 탭의 관점은 "구조가 아니라 규범": 테이블·컬럼·관계는 데이터 메뉴 소관이므로
 * DDL 무결성 신호(PK/NOT NULL/FK)는 요약 카운트 + 데이터 메뉴 링크로 접고, 이 탭은
 * ERD 가 보여주지 못하는 것 — 정책서 문서 · 검증/권한 코드 신호 · 용어 사전 — 을 중심에 둔다.
 *
 * 데이터: policy-signals.json({signals[]}) · policy-reconcile.json({entries[]}) · doc-list.json.
 * dataUrl()로 demo/live 를 흡수(HomePage·ScreenSpecView 관례). 신호가 없으면 화면 전체 빈 상태.
 * 탭·검색(?q)·대조 상태 필터(?status)를 URL 로 이관 — 딥링크·새로고침·뒤로가기 동작.
 */

interface Anchor {
  file: string;
  line: number;
}
interface PolicySignal {
  /** legacy-core PolicyCategory — 1단계 추출기가 현재 내는 것은 data·glossary·validation·authz 4종. */
  category: string;
  kind: string;
  subject: string;
  detail: string;
  confidence: string;
  anchor: Anchor;
}
interface SignalsFile {
  gitCommit?: string;
  signals?: PolicySignal[];
}
interface ReconcileEntry {
  category: string;
  subject: string;
  signalDetail: string;
  docStatement: string | null;
  status: string;
  note: string;
  anchor: Anchor;
}
interface ReconcileFile {
  entries?: ReconcileEntry[];
}
/** doc-list.json 항목(DocsView와 동일 스키마) — 여기선 policy-* 문서(카테고리 4종 + 도메인)만 소비. */
interface DocListItem {
  docId: string;
  title: string;
  confirmed?: boolean;
  approver?: string | null;
}
interface DocListFile {
  docs?: DocListItem[];
}

type PolicyTab = "cat" | "dom" | "rec";
const TAB_KEYS: PolicyTab[] = ["cat", "dom", "rec"];

/** file:line 근거 라벨(검색 매칭용) — 긴 경로는 파일명만. */
function anchorLabel(anchor: Anchor): string {
  const base = anchor.file.split("/").pop() ?? anchor.file;
  return `${base}:${anchor.line}`;
}

/** subject → 소속 테이블(그룹 키). "ORDERS.userid"·"PRODUCT(category)"·"ORDERS" 모두 앞부분. */
function tableOf(subject: string): string {
  return subject.split(/[.(]/)[0] || subject;
}

/** 신호 통합 검색 매칭(대상·종류 상세·근거) — q 는 소문자 정규화 상태로 받는다. */
function signalMatch(s: PolicySignal, q: string): boolean {
  return (
    !q ||
    s.subject.toLowerCase().includes(q) ||
    s.detail.toLowerCase().includes(q) ||
    anchorLabel(s.anchor).toLowerCase().includes(q)
  );
}

/** 신뢰도 → ConfBadge 종류. CONFIRMED(DDL 확정)만 fix, 그 외(INFERRED 등)는 추정. */
function confKind(confidence: string): ConfKind {
  return confidence === "CONFIRMED" ? "fix" : "est";
}

/** 데이터 신호 kind → 한글 라벨 + 배지 톤. */
const DATA_KIND: Record<string, { label: string; tone: BadgeTone }> = {
  "not-null": { label: "NOT NULL", tone: "mut" },
  "primary-key": { label: "기본키", tone: "info" },
  fk: { label: "외래키", tone: "warn" },
  table: { label: "테이블", tone: "mut" },
};
function kindOf(kind: string): { label: string; tone: BadgeTone } {
  return DATA_KIND[kind] ?? { label: kind, tone: "mut" };
}

/** 대조 상태 → 배지 톤 + 색 + 글리프(StatTile·배지 강화). */
const STATUS_META: Record<string, { tone: BadgeTone; color: string; icon: string }> = {
  준수: { tone: "ok", color: "var(--color-status-ok)", icon: "✓" },
  위반: { tone: "err", color: "var(--color-status-error)", icon: "✕" },
  미정의: { tone: "warn", color: "var(--color-status-warn)", icon: "△" },
  문서에만: { tone: "info", color: "var(--color-status-info)", icon: "◇" },
};
const STATUS_ORDER = ["준수", "위반", "미정의", "문서에만"] as const;

/**
 * 1단계 결정론 추출이 아직 다루지 못하는 정책 카테고리(legacy-core PolicyCategory 중
 * status/account/billing/integration/security) — 신호 0 이 "없다"가 아니라 "추출 범위 밖"임을 명시.
 * 검증·권한은 추출기가 지원하므로 여기가 아니라 코드 신호 섹션에서 0건 사유(미발견)를 다룬다.
 */
const NOT_EXTRACTED_CATEGORIES = ["상태값", "계정", "과금", "연계", "보안"] as const;

/** 검증·권한 코드 신호 kind → 한글 라벨 + 배지 톤(추출기 kind: bean-validation·class-authz·method-authz). */
const CODE_KIND: Record<string, { label: string; tone: BadgeTone }> = {
  "bean-validation": { label: "검증", tone: "info" },
  "class-authz": { label: "권한(클래스)", tone: "warn" },
  "method-authz": { label: "권한(메서드)", tone: "warn" },
};

/** 용어 신호에 실제 정의(DDL 주석)가 있는지 — 추출기는 주석 부재를 "(주석 없음)" 원문으로 남긴다. */
function hasDefinition(s: PolicySignal): boolean {
  const d = s.detail.trim();
  return d.length > 0 && !d.includes("주석 없음");
}

/** 검색어 하이라이트 — 첫 매치만 mark 로 감싼다(대소문자 무시). */
function highlight(text: string, q: string): ReactNode {
  const query = q.trim();
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "color-mix(in srgb, var(--color-accent) 22%, transparent)",
          color: "inherit",
          borderRadius: 3,
          padding: "0 1px",
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** fl-grp — 카드 내부 그룹 라벨(프로토 .fl-grp). */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-text-muted"
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", padding: "12px 4px 6px" }}
    >
      {children}
    </div>
  );
}

/** chips 한 칸(프로토 .chip). on=강조, muted=신호 없음. */
function Chip({ children, on, muted }: { children: ReactNode; on?: boolean; muted?: boolean }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        fontSize: 12,
        fontWeight: on ? 650 : 500,
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid var(--color-border-subtle)",
        color: on ? "var(--color-accent)" : "var(--color-text-muted)",
        background: on ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-panel)",
        opacity: muted ? 0.7 : 1,
      }}
    >
      {children}
    </span>
  );
}

const CARD = "rounded-[10px] border border-border-subtle bg-panel card-shadow";
const TH_STICKY: CSSProperties = { position: "sticky", top: 0, background: "var(--color-panel)" };

/** 검색 입력(통합) — 신호·대조 공통. */
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
      style={{ padding: "7px 12px", fontSize: 13, marginBottom: 14, maxWidth: 420 }}
    />
  );
}

/** 정직한 부재/오류 안내 카드. */
function NoticeCard({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className={CARD} style={{ padding: "28px 24px", textAlign: "center" }}>
      <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>
        {title}
      </p>
      {children && (
        <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {children}
        </p>
      )}
    </div>
  );
}

export default function PolicyView() {
  const accessToken = useDashboardStore((s) => s.accessToken);

  const [signals, setSignals] = useState<PolicySignal[] | null>(null);
  const [signalsErr, setSignalsErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReconcileEntry[]>([]);
  const [entriesErr, setEntriesErr] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: PolicyTab = TAB_KEYS.includes(tabParam as PolicyTab) ? (tabParam as PolicyTab) : "cat";
  const query = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status");

  const setQuery = (v: string) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set("q", v);
        else prev.delete("q");
        return prev;
      },
      { replace: true },
    );
  const setTab = (k: PolicyTab) =>
    setSearchParams((prev) => {
      prev.set("tab", k);
      return prev;
    });
  const toggleStatus = (s: string) =>
    setSearchParams((prev) => {
      if (prev.get("status") === s) prev.delete("status");
      else prev.set("status", s);
      return prev;
    });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSignalsErr(null);
    setEntriesErr(null);

    // 실패 사유(HTTP status·파싱·네트워크)를 접지 않고 그대로 노출한다.
    const fetchJson = async <T,>(name: string): Promise<{ data: T | null; err: string | null }> => {
      try {
        const r = await fetch(dataUrl(name, accessToken));
        if (!r.ok) return { data: null, err: `HTTP ${r.status}` };
        return { data: (await r.json()) as T, err: null };
      } catch (e) {
        return { data: null, err: String(e instanceof Error ? e.message : e) };
      }
    };

    Promise.all([
      fetchJson<SignalsFile>("policy-signals.json"),
      fetchJson<ReconcileFile>("policy-reconcile.json"),
      fetchJson<DocListFile>("doc-list.json"),
    ]).then(([sig, rec, dl]) => {
      if (!alive) return;
      setSignals(Array.isArray(sig.data?.signals) ? sig.data!.signals : null);
      setSignalsErr(sig.err);
      setEntries(Array.isArray(rec.data?.entries) ? rec.data!.entries : []);
      setEntriesErr(rec.err);
      setDocs(Array.isArray(dl.data?.docs) ? dl.data!.docs : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const dataSignals = useMemo(() => (signals ?? []).filter((s) => s.category === "data"), [signals]);
  const glossary = useMemo(() => (signals ?? []).filter((s) => s.category === "glossary"), [signals]);
  const codeSignals = useMemo(
    () => (signals ?? []).filter((s) => s.category === "validation" || s.category === "authz"),
    [signals],
  );
  const domainDocs = useMemo(() => docs.filter((d) => d.docId.startsWith("policy-domain-")), [docs]);
  // 카테고리 정책서 4종(policy-glossary/data/validation/authz) — LLM 보강까지 거친 산출물.
  const categoryDocs = useMemo(
    () => docs.filter((d) => d.docId.startsWith("policy-") && !d.docId.startsWith("policy-domain-")),
    [docs],
  );

  const total = signals?.length ?? 0;

  // 게이팅 우선순위: 로딩 → 에러(사유) → 빈 → 탭.
  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <p className="text-text-muted" style={{ fontSize: 13 }}>
          정책 신호를 불러오는 중…
        </p>
      </div>
    );
  }

  if (signals === null) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <PageHead title="정책서" />
        {signalsErr ? (
          <NoticeCard title="정책 신호를 불러오지 못했습니다">
            <code>policy-signals.json</code> 응답 오류 ({signalsErr}). understand-map 스캔·dev 서버 상태를 확인하세요.
          </NoticeCard>
        ) : (
          <NoticeCard title="정책 신호 없음">
            CLI에서 <code>/understand-policy</code>를 실행해 신호를 먼저 추출하세요.
          </NoticeCard>
        )}
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <PageHead title="정책서" />
        <NoticeCard title="정책 신호 없음">
          CLI에서 <code>/understand-policy</code>를 실행해 신호를 먼저 추출하세요.
        </NoticeCard>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="정책서"
        meta={
          <>
            policy-signals <b className="text-text-primary tabular-nums">{total}</b>건 (검증·권한{" "}
            <b className="text-text-primary tabular-nums">{codeSignals.length}</b> · 용어{" "}
            <b className="text-text-primary tabular-nums">{glossary.length}</b> · 데이터 무결성{" "}
            <b className="text-text-primary tabular-nums">{dataSignals.length}</b>) · 근거 file:line · 규범 서술은
            [추정] 마킹
          </>
        }
        actions={
          <BtnAccent disabled title="후속 예정 — 인수 시나리오는 대조 탭 참조">
            기존 정책서 가져오기
          </BtnAccent>
        }
      />

      <ProtoTabs<PolicyTab>
        tabs={[
          { key: "cat", label: "카테고리별 정책", count: total },
          { key: "dom", label: "도메인 정책" },
          { key: "rec", label: "대조 현황", count: entries.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "cat" && (
        <CategoryTab
          dataSignals={dataSignals}
          glossary={glossary}
          codeSignals={codeSignals}
          catDocs={categoryDocs}
          query={query}
          onQuery={setQuery}
        />
      )}
      {tab === "dom" && <DomainTab docs={domainDocs} />}
      {tab === "rec" && (
        <ReconcileTab
          entries={entries}
          entriesErr={entriesErr}
          query={query}
          onQuery={setQuery}
          statusFilter={statusFilter}
          onToggleStatus={toggleStatus}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── 카테고리별 정책 ─────────────────────────── */

/** policy-* 문서 카드 그리드 — 카테고리 정책서·도메인 정책서 공용(산출물 뷰어로 링크). */
function DocCards({ docs }: { docs: DocListItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 12 }}>
      {docs.map((d) => (
        <div key={d.docId} className={CARD} style={{ padding: "14px 16px" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
            <b className="text-text-primary truncate" style={{ fontSize: 13.5, minWidth: 0 }}>
              {d.title}
            </b>
            <Badge tone={d.confirmed ? "ok" : "info"}>{d.confirmed ? "확정" : "초안"}</Badge>
          </div>
          <Link
            to={`/deliverables/${encodeURIComponent(d.docId)}`}
            className="text-accent"
            style={{ fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
          >
            문서 보기 →
          </Link>
        </div>
      ))}
    </div>
  );
}

function CategoryTab({
  dataSignals,
  glossary,
  codeSignals,
  catDocs,
  query,
  onQuery,
}: {
  dataSignals: PolicySignal[];
  glossary: PolicySignal[];
  codeSignals: PolicySignal[];
  catDocs: DocListItem[];
  query: string;
  onQuery: (v: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filteredCode = useMemo(() => codeSignals.filter((s) => signalMatch(s, q)), [codeSignals, q]);
  const filteredGloss = useMemo(() => glossary.filter((s) => signalMatch(s, q)), [glossary, q]);
  const definedGloss = useMemo(() => glossary.filter(hasDefinition).length, [glossary]);

  // DDL 무결성(PK/NOT NULL/FK)은 데이터 메뉴가 원본 — 여기선 재나열하지 않고 kind별 요약만.
  const dataCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of dataSignals) {
      const l = kindOf(s.kind).label;
      m.set(l, (m.get(l) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count }));
  }, [dataSignals]);
  const dataTables = useMemo(() => new Set(dataSignals.map((s) => tableOf(s.subject))).size, [dataSignals]);

  return (
    <>
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 12 }}>
        <Chip on>검증·권한 {codeSignals.length}</Chip>
        <Chip on>용어 {glossary.length}</Chip>
        <Chip muted>데이터 무결성 {dataSignals.length}</Chip>
        <span className="text-text-muted inline-flex items-center flex-wrap" style={{ gap: 8, fontSize: 12 }}>
          <span className="inline-flex items-center" style={{ gap: 5 }}>
            <ConfBadge kind="fix" /> 근거확보 = 코드/DDL 원문
          </span>
          <span className="inline-flex items-center" style={{ gap: 5 }}>
            <ConfBadge kind="est" /> 추정 = 기계 판정
          </span>
        </span>
      </div>

      <SearchBar value={query} onChange={onQuery} placeholder="신호 검색 (대상·내용·근거)" />

      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,1fr)_320px]" style={{ gap: 14 }}>
        {/* 좌: 카테고리 정책서(LLM 보강 산출물) → 검증·권한 코드 신호 → 용어 사전 */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          {catDocs.length > 0 ? (
            <div>
              <GroupLabel>카테고리 정책서 ({catDocs.length})</GroupLabel>
              <DocCards docs={catDocs} />
            </div>
          ) : (
            <div className={CARD} style={{ padding: "16px 18px" }}>
              <p className="text-text-primary" style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 6 }}>
                카테고리 정책서(.md) 미생성
              </p>
              <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.65, marginBottom: 8 }}>
                아래 신호는 정책서의 원재료입니다. CLI에서 <code>/understand-policy</code>(기본 모드)를 실행하면
                결정론 추출이 용어/데이터/검증/권한 4종 문서를 앵커 표 골격으로 만듭니다.
              </p>
              <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                이어지는 LLM 보강이 앵커 소스를 읽어 규범 서술을 [확정]/[추정] 표기로 채웁니다.
              </p>
            </div>
          )}

          <div className={CARD} style={{ padding: "6px 14px 14px" }}>
            <GroupLabel>
              검증·권한 코드 신호 ({filteredCode.length}
              {q && ` / ${codeSignals.length}`})
            </GroupLabel>
            {codeSignals.length === 0 ? (
              <div style={{ padding: "2px 4px 8px" }}>
                <p className="text-text-secondary" style={{ fontSize: 12.5, lineHeight: 1.65, marginBottom: 8 }}>
                  검증(Bean Validation)·권한(Security 어노테이션) 신호{" "}
                  <b>0건 — 추출은 수행됐고 코드에서 미발견</b>입니다.
                </p>
                <p className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                  어노테이션 없이 코드 분기로 구현된 검증·권한 규칙은 도메인 정책서(domain 모드)가 의사결정
                  테이블로 서술합니다.
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                <table className="proto-tbl">
                  <thead>
                    <tr>
                      <th scope="col" style={TH_STICKY}>
                        대상
                      </th>
                      <th scope="col" style={TH_STICKY}>
                        신호
                      </th>
                      <th scope="col" style={TH_STICKY}>
                        근거
                      </th>
                      <th scope="col" style={TH_STICKY}>
                        신뢰도
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCode.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-text-muted" style={{ padding: "14px 8px", fontSize: 12.5 }}>
                          검색 결과 없음
                        </td>
                      </tr>
                    )}
                    {filteredCode.map((s, i) => {
                      const k = CODE_KIND[s.kind] ?? { label: s.kind, tone: "mut" as BadgeTone };
                      return (
                        <tr key={`${s.subject}-${s.anchor.file}-${s.anchor.line}-${i}`}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                            {highlight(s.subject, query)}
                          </td>
                          <td>
                            <span className="inline-flex flex-wrap items-center" style={{ gap: 6 }}>
                              <Badge tone={k.tone}>{k.label}</Badge>
                              <span className="text-text-secondary" style={{ fontSize: 12 }}>
                                {highlight(s.detail, query)}
                              </span>
                            </span>
                          </td>
                          <td>
                            <CitationChip filePath={s.anchor.file} line={s.anchor.line} />
                          </td>
                          <td>
                            <ConfBadge kind={confKind(s.confidence)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={CARD} style={{ padding: "6px 14px 14px" }}>
            <GroupLabel>
              용어 사전 ({filteredGloss.length}
              {q && ` / ${glossary.length}`}) · 정의 채움 {definedGloss}/{glossary.length}
            </GroupLabel>
            {definedGloss === 0 && glossary.length > 0 && !q && (
              <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, padding: "0 4px 6px" }}>
                DDL에 테이블·컬럼 주석이 없어 이름만 수집된 상태 — 정의는 LLM 보강(용어 정책서)이 사용처를 읽어
                [추정]으로 채웁니다.
              </p>
            )}
            {filteredGloss.length === 0 && (
              <div className="text-text-muted" style={{ padding: "7px 4px", fontSize: 12.5 }}>
                {q ? "검색 결과 없음" : "용어 신호 없음"}
              </div>
            )}
            {filteredGloss.map((s, i) => (
              <div
                key={`${s.subject}-${i}`}
                className="flex items-center"
                style={{ gap: 10, padding: "7px 4px", borderBottom: "1px solid var(--color-border-subtle)" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>
                  {highlight(s.subject, query)}
                </span>
                <span
                  className="text-text-muted"
                  style={{ fontSize: 12, opacity: hasDefinition(s) ? 1 : 0.6, fontStyle: hasDefinition(s) ? undefined : "italic" }}
                >
                  {highlight(s.detail, query)}
                </span>
                <div className="flex-1" />
                <CitationChip filePath={s.anchor.file} line={s.anchor.line} />
                <ConfBadge kind={confKind(s.confidence)} />
              </div>
            ))}
          </div>
        </div>

        {/* 우: 데이터 무결성 요약(원본은 데이터 메뉴) + 미해석 카테고리 사유 */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          <div className={CARD} style={{ padding: "16px 18px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>데이터 무결성 요약</h3>
            <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
              DDL 제약 {dataSignals.length}건 · 테이블 {dataTables}개 — 컬럼 구조·관계·근거 원본은 데이터
              메뉴(테이블·ERD)에서 봅니다.
            </p>
            <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
              {dataCounts.map((c) => (
                <Chip key={c.label}>
                  {c.label} {c.count}
                </Chip>
              ))}
            </div>
            <Link
              to="/data"
              className="text-accent"
              style={{ fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
            >
              데이터 메뉴에서 보기 →
            </Link>
          </div>

          <div className={CARD} style={{ padding: "16px 18px" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>미해석 카테고리</h3>
            <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
              결정론 추출 범위 밖(미구현) — 신호 0이 &ldquo;정책 없음&rdquo;을 뜻하지 않습니다.
            </p>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {NOT_EXTRACTED_CATEGORIES.map((c) => (
                <Chip key={c} muted>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── 도메인 정책 ─────────────────────────── */

function DomainTab({ docs }: { docs: DocListItem[] }) {
  if (docs.length === 0) {
    return (
      <div className={CARD} style={{ padding: "20px 22px" }}>
        <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>
          도메인 정책서 미생성
        </p>
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 8 }}>
          신호 수집은 완료되었습니다. CLI에서 <code>/understand-policy &lt;root&gt; domain</code>(도메인 모드)을
          실행하면 결정론 추출이 도메인당 1문서(§0~§8, 의사결정 테이블 시드)를 만듭니다.
        </p>
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65 }}>
          이어지는 LLM 보강 + 사람 검증이 정책명·업무 언어를 채웁니다.
        </p>
        <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
          파이프라인: 정적 추출(신호) → 근거 수집 → LLM 규범 서술 → 사람 검증. 코드가 진실의 원천이며, 모든 정책
          문장은 file:line 근거를 갖고 불확실하면 [확인필요]로 표기됩니다.
        </p>
      </div>
    );
  }

  return <DocCards docs={docs} />;
}

/* ─────────────────────────── 대조 현황 ─────────────────────────── */

/** 클릭형 상태 통계 타일(?status= 필터 토글). */
function StatFilter({
  status,
  value,
  active,
  onClick,
}: {
  status: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[status];
  const label = status === "미정의" ? "미정의 (코드에만)" : status;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${status} 필터`}
      className="text-left cursor-pointer bg-transparent"
      style={{ border: "none", padding: 0, borderRadius: 10, outline: active ? "2px solid var(--color-accent)" : "none", outlineOffset: 1 }}
    >
      <StatTile label={`${meta?.icon ?? "•"} ${label}`} value={value} valueColor={meta?.color} />
    </button>
  );
}

function ReconcileTab({
  entries,
  entriesErr,
  query,
  onQuery,
  statusFilter,
  onToggleStatus,
}: {
  entries: ReconcileEntry[];
  entriesErr: string | null;
  query: string;
  onQuery: (v: string) => void;
  statusFilter: string | null;
  onToggleStatus: (s: string) => void;
}) {
  const count = (status: string) => entries.filter((e) => e.status === status).length;
  const allUndocumented = entries.length > 0 && entries.every((e) => e.docStatement === null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!statusFilter || e.status === statusFilter) &&
          (!q || e.subject.toLowerCase().includes(q) || e.signalDetail.toLowerCase().includes(q)),
      ),
    [entries, statusFilter, q],
  );

  if (entries.length === 0) {
    return (
      <div className={CARD} style={{ padding: "20px 22px" }}>
        <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>
          대조 데이터 없음
        </p>
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65 }}>
          {entriesErr ? (
            <>
              <code>policy-reconcile.json</code> 응답 오류 ({entriesErr}).
            </>
          ) : (
            <>
              <code>policy-reconcile.json</code> 이 없습니다. 기존 정책서를 입수해 코드 신호와 대조하면 준수/위반/미정의
              원장이 생성됩니다.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 14 }}>
        {STATUS_ORDER.map((s) => (
          <StatFilter
            key={s}
            status={s}
            value={count(s)}
            active={statusFilter === s}
            onClick={() => onToggleStatus(s)}
          />
        ))}
      </div>

      <div className={CARD} style={{ padding: "16px 18px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          3-way 대조 — 기존 정책서 ↔ 코드 ↔ Gap
        </h3>

        {allUndocumented && (
          <div
            className="flex flex-col"
            style={{
              gap: 4,
              background: "var(--color-elevated)",
              borderLeft: "3px solid var(--color-status-warn)",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 12,
            }}
          >
            <span className="text-text-primary" style={{ fontSize: 13.5, fontWeight: 700 }}>
              기존 정책서 미입수
            </span>
            <span className="text-text-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              코드에서 추출한 {entries.length}건 신호가 전부 &lsquo;미정의&rsquo; — 발주처 정책서 입수 시
              준수/위반/문서에만으로 재분류됩니다.
            </span>
          </div>
        )}

        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 14 }}>
          인수 시나리오: ① 기존 정책서(hwp/md) 가져오기 → ② 문장 단위 파싱 → ③ 코드 신호와 매칭 → ④ 위반·공백
          목록을 변경요청(CR) 후보로 추적표에 연결.
        </p>

        <SearchBar value={query} onChange={onQuery} placeholder="대조 검색 (대상·신호)" />

        <div className="flex flex-wrap items-center" style={{ gap: 10, marginBottom: 10 }}>
          <span className="text-text-muted tabular-nums" style={{ fontSize: 12 }}>
            총 {entries.length}건{(statusFilter || q) && ` 중 ${filtered.length}건 표시`}
          </span>
          {statusFilter && (
            <button
              type="button"
              onClick={() => onToggleStatus(statusFilter)}
              className="text-accent cursor-pointer bg-transparent"
              style={{ border: "none", padding: 0, fontSize: 12, fontWeight: 600 }}
            >
              {statusFilter} 필터 해제 ✕
            </button>
          )}
        </div>

        <div style={{ maxHeight: 460, overflowY: "auto" }}>
          <table className="proto-tbl">
            <thead>
              <tr>
                <th scope="col" style={TH_STICKY}>
                  대상
                </th>
                <th scope="col" style={TH_STICKY}>
                  신호
                </th>
                <th scope="col" style={TH_STICKY}>
                  상태
                </th>
                <th scope="col" style={TH_STICKY}>
                  비고
                </th>
                <th scope="col" style={TH_STICKY}>
                  근거
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-text-muted" style={{ padding: "14px 8px", fontSize: 12.5 }}>
                    조건에 맞는 대조 항목 없음
                  </td>
                </tr>
              )}
              {filtered.map((e, i) => (
                <tr key={`${e.subject}-${e.anchor.file}-${e.anchor.line}-${i}`}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{highlight(e.subject, query)}</td>
                  <td className="text-text-secondary" style={{ fontSize: 12 }}>
                    {highlight(e.signalDetail, query)}
                  </td>
                  <td>
                    <Badge tone={STATUS_META[e.status]?.tone ?? "mut"}>
                      {STATUS_META[e.status]?.icon ?? ""} {e.status}
                    </Badge>
                  </td>
                  <td className="text-text-muted" style={{ fontSize: 12 }}>
                    {e.note}
                  </td>
                  <td>
                    <CitationChip filePath={e.anchor.file} line={e.anchor.line} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
