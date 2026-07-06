import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { useDashboardStore } from "../store";
import { dataUrl } from "../shared/api/client";
import { Badge, BtnAccent, BtnOutline, ConfBadge, Ev, PageHead, ProtoTabs, StatTile } from "./proto/Proto";
import type { BadgeTone, ConfKind } from "./proto/Proto";

/**
 * 정책서 뷰(신설, pmpl-proto pg-policy 1416~1512행) — 정적 추출한 정책 "신호"를
 * 카테고리별/도메인/대조 3탭으로 검증한다. 코드가 진실의 원천이며, 규범 서술(정책 문장)은
 * LLM 2단계 산출물이라 이 화면은 목업 문장을 합성하지 않는다 — 신호·근거·대조만 실데이터로 노출.
 *
 * 데이터: policy-signals.json({signals[]}) · policy-reconcile.json({entries[]}) · doc-list.json.
 * dataUrl()로 demo/live 를 흡수(HomePage·ScreenSpecView 관례). 신호가 없으면 화면 전체 빈 상태.
 */

interface Anchor {
  file: string;
  line: number;
}
interface PolicySignal {
  category: "data" | "glossary";
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
/** doc-list.json 항목(DocsView와 동일 스키마) — 여기선 policy-domain-* 문서만 소비. */
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

/** file:line 근거 축약 — 긴 경로는 파일명만. */
function evText(anchor: Anchor): string {
  const base = anchor.file.split("/").pop() ?? anchor.file;
  return `${base}:${anchor.line}`;
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

/** 대조 상태 → 배지 톤. */
const STATUS_TONE: Record<string, BadgeTone> = {
  준수: "ok",
  위반: "err",
  미정의: "warn",
  문서에만: "info",
};

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

export default function PolicyView() {
  const accessToken = useDashboardStore((s) => s.accessToken);

  const [signals, setSignals] = useState<PolicySignal[] | null>(null);
  const [entries, setEntries] = useState<ReconcileEntry[]>([]);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PolicyTab>("cat");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const jsonOrNull = (r: Response) => (r.ok ? r.json() : null);

    Promise.all([
      fetch(dataUrl("policy-signals.json", accessToken)).then(jsonOrNull).catch(() => null),
      fetch(dataUrl("policy-reconcile.json", accessToken)).then(jsonOrNull).catch(() => null),
      fetch(dataUrl("doc-list.json", accessToken)).then(jsonOrNull).catch(() => null),
    ]).then(([sig, rec, dl]: [SignalsFile | null, ReconcileFile | null, DocListFile | null]) => {
      if (!alive) return;
      setSignals(Array.isArray(sig?.signals) ? sig!.signals : null);
      setEntries(Array.isArray(rec?.entries) ? rec!.entries : []);
      setDocs(Array.isArray(dl?.docs) ? dl!.docs : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const dataSignals = useMemo(() => (signals ?? []).filter((s) => s.category === "data"), [signals]);
  const glossary = useMemo(() => (signals ?? []).filter((s) => s.category === "glossary"), [signals]);
  const domainDocs = useMemo(() => docs.filter((d) => d.docId.startsWith("policy-domain-")), [docs]);

  const total = signals?.length ?? 0;

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <p className="text-text-muted" style={{ fontSize: 13 }}>
          정책 신호를 불러오는 중…
        </p>
      </div>
    );
  }

  // 신호 파일 자체가 없으면(404) 화면 전체 빈 상태.
  if (signals === null || total === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
        <PageHead title="정책서" />
        <div className={CARD} style={{ padding: "28px 24px", textAlign: "center" }}>
          <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>
            정책 신호 없음
          </p>
          <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            <code>/understand-policy</code> 1단계(신호 추출)를 먼저 실행하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      <PageHead
        title="정책서"
        meta={
          <>
            policy-signals <b className="text-text-primary tabular-nums">{total}</b>건 (데이터{" "}
            <b className="text-text-primary tabular-nums">{dataSignals.length}</b> · 용어{" "}
            <b className="text-text-primary tabular-nums">{glossary.length}</b>) · 근거 file:line · 규범 서술은
            [추정] 마킹
          </>
        }
        actions={
          <>
            <BtnOutline disabled title="/understand-policy 2단계 — CLI에서 실행">
              정책서 md 생성
            </BtnOutline>
            <BtnAccent disabled title="후속 예정 — 인수 시나리오는 대조 탭 참조">
              기존 정책서 가져오기
            </BtnAccent>
          </>
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
        <CategoryTab dataSignals={dataSignals} glossary={glossary} />
      )}
      {tab === "dom" && <DomainTab docs={domainDocs} />}
      {tab === "rec" && <ReconcileTab entries={entries} />}
    </div>
  );
}

/* ─────────────────────────── 카테고리별 정책 ─────────────────────────── */

function CategoryTab({
  dataSignals,
  glossary,
}: {
  dataSignals: PolicySignal[];
  glossary: PolicySignal[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 14 }}>
        <Chip on>데이터 {dataSignals.length}</Chip>
        <Chip on>용어 {glossary.length}</Chip>
        <Chip muted>권한 · 검증 · 상태값 · 계정 · 과금 · 연계 · 보안 — 0 · 신호 없음/템플릿 예정</Chip>
      </div>

      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,1fr)_320px]" style={{ gap: 14 }}>
        {/* 좌: 데이터 신호 + 용어 사전 */}
        <div className={CARD} style={{ padding: "6px 14px 14px" }}>
          <GroupLabel>데이터 신호 ({dataSignals.length})</GroupLabel>
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            <table className="proto-tbl">
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, background: "var(--color-panel)" }}>대상</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--color-panel)" }}>신호</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--color-panel)" }}>근거</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--color-panel)" }}>신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {dataSignals.map((s, i) => {
                  const k = kindOf(s.kind);
                  const showDetail = s.detail.trim().toLowerCase() !== k.label.toLowerCase();
                  return (
                    <tr key={`${s.subject}-${s.anchor.file}-${s.anchor.line}-${i}`}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.subject}</td>
                      <td>
                        <span className="inline-flex flex-wrap items-center" style={{ gap: 6 }}>
                          <Badge tone={k.tone}>{k.label}</Badge>
                          {showDetail && (
                            <span className="text-text-secondary" style={{ fontSize: 12 }}>
                              {s.detail}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <Ev>{evText(s.anchor)}</Ev>
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

          <GroupLabel>용어 사전 ({glossary.length})</GroupLabel>
          {glossary.map((s, i) => (
            <div
              key={`${s.subject}-${i}`}
              className="flex items-center"
              style={{ gap: 10, padding: "7px 4px", borderBottom: "1px solid var(--color-border-subtle)" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>
                {s.subject}
              </span>
              <span className="text-text-muted" style={{ fontSize: 12 }}>
                {s.detail}
              </span>
              <div className="flex-1" />
              <Ev>{evText(s.anchor)}</Ev>
              <ConfBadge kind={confKind(s.confidence)} />
            </div>
          ))}
        </div>

        {/* 우: 권한 매트릭스 — 신호 0, 정직한 공백 */}
        <div className={CARD} style={{ padding: "16px 18px" }}>
          <h3 className="flex items-center flex-wrap" style={{ gap: 8, fontSize: 14, fontWeight: 700 }}>
            권한 매트릭스
            <Badge tone="mut">신호 0 — 코드 추론 미수행</Badge>
          </h3>
          <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65, marginTop: 10 }}>
            권한(role) 구분 신호가 발견되지 않았습니다. 로그인 세션 체크 등 코드 신호는 도메인 정책서(2단계)에서
            [추정]으로 서술됩니다.
          </p>
          <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
            관리자 기능 부재가 정직하게 드러납니다.
          </p>
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
        <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: 1.65 }}>
          신호 수집(1단계)은 완료되었습니다. <code>/understand-policy</code> 2단계(LLM 규범 서술 + 사람 검증)를
          실행하면 도메인당 1문서가 생성됩니다.
        </p>
        <p className="text-text-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
          파이프라인: 정적 추출(신호) → 근거 수집 → LLM 규범 서술 → 사람 검증. 코드가 진실의 원천이며, 모든 정책
          문장은 file:line 근거를 갖고 불확실하면 [확인필요]로 표기됩니다.
        </p>
      </div>
    );
  }

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

/* ─────────────────────────── 대조 현황 ─────────────────────────── */

function ReconcileTab({ entries }: { entries: ReconcileEntry[] }) {
  const count = (status: string) => entries.filter((e) => e.status === status).length;
  const allUndocumented = entries.length > 0 && entries.every((e) => e.docStatement === null);
  const shown = entries.slice(0, 20);
  const rest = entries.length - shown.length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 14 }}>
        <StatTile label="준수" value={count("준수")} valueColor="var(--color-status-ok)" />
        <StatTile label="위반" value={count("위반")} valueColor="var(--color-status-error)" />
        <StatTile label="미정의 (코드에만)" value={count("미정의")} valueColor="var(--color-status-warn)" />
        <StatTile label="문서에만" value={count("문서에만")} />
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

        <div style={{ overflowX: "auto" }}>
          <table className="proto-tbl">
            <thead>
              <tr>
                <th>대상</th>
                <th>신호</th>
                <th>상태</th>
                <th>비고</th>
                <th>근거</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={`${e.subject}-${e.anchor.file}-${e.anchor.line}-${i}`}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.subject}</td>
                  <td className="text-text-secondary" style={{ fontSize: 12 }}>
                    {e.signalDetail}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[e.status] ?? "mut"}>{e.status}</Badge>
                  </td>
                  <td className="text-text-muted" style={{ fontSize: 12 }}>
                    {e.note}
                  </td>
                  <td>
                    <Ev>{evText(e.anchor)}</Ev>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rest > 0 && (
          <p className="text-text-muted" style={{ fontSize: 12, paddingTop: 10 }}>
            외 {rest}건
          </p>
        )}
      </div>
    </>
  );
}
