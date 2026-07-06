import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

import { useDashboardStore } from "../store";
import { Badge, BtnAccent, Ev, PageHead, StatTile } from "./proto/Proto";

/**
 * 변경 · 영향 분석 뷰(pmpl-proto pg-change 정합) — impact.json 을 CR 단위 화면으로 승격한다.
 * 구조 그래프의 색칠 오버레이로만 소비되던 상·하류 도달성(seeds·needsReview·viaKinds 분해)을
 * 그대로 노출하고 변경영향분석서(05)/구조 오버레이로 연결한다.
 *
 * 데이터: dev 서버 GET /impact.json (토큰 게이트). 이 파일은 CR 원장이 아니라 최신 분석 1건이므로
 * 좌측 트리는 "분석 결과 (1)" 만 정직하게 표기한다. 404 → 빈 상태 카드.
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
}

interface ImpactData {
  gitCommit: string;
  depthCap: number;
  fanInThreshold: number;
  edgeKinds: string[];
  seeds: Seed[];
  upstream: { files: ImpactFile[] };
  downstream: { files: ImpactFile[] };
  needsReview: NeedsReviewItem[];
}

type Status = "loading" | "ready" | "empty";

/** relPath 를 마지막 2세그먼트로 축약(전체는 title 로). */
const short2 = (p: string): string => p.split("/").slice(-2).join("/");
/** citation 근거는 파일명만 노출. */
const baseName = (p: string): string => p.split("/").pop() ?? p;

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

function FileRow({ f }: { f: ImpactFile }) {
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
        <Ev style={{ flex: "none" }}>
          근거 {baseName(f.citation.filePath)}:{f.citation.line}
        </Ev>
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
function FileGroups({ files, limit }: { files: ImpactFile[]; limit: number }) {
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
          <FileRow key={f.relPath} f={f} />
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
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";

  const [data, setData] = useState<ImpactData | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetch(`${dataBase}impact.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ImpactData) => {
        if (!alive) return;
        if (d && Array.isArray(d.seeds) && d.downstream && d.upstream) {
          setData(d);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      })
      .catch(() => {
        if (alive) setStatus("empty");
      });
    return () => {
      alive = false;
    };
  }, [dataBase, tokenQ]);

  const head = (
    <PageHead
      title="변경 · 영향 분석"
      meta="impact.json · CR 단위 상·하류 도달성 — 변경영향분석서(05)의 원천"
      actions={<BtnAccent onClick={openImpactModal}>자연어 영향 분석</BtnAccent>}
    />
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
          <div className={CARD} style={{ padding: "28px", textAlign: "center" }}>
            <p className="text-text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              영향 분석 결과 없음 — <code>/understand-impact</code> 또는 RTM 인테이크에서 분석을 실행하면 여기 나타납니다
            </p>
          </div>
        )}
      </div>
    );
  }

  const sha7 = data.gitCommit.slice(0, 7);
  const upFiles = data.upstream.files;
  const downFiles = data.downstream.files;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {head}

      {/* 프로토 .docs — 좌 260px 트리 카드 + 우 콘텐츠 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]" style={{ gap: 14 }}>
        {/* 좌 트리 — CR 원장이 아니라 최신 분석 1건이므로 정직하게 (1) */}
        <div className={`${CARD} proto-tree`}>
          <div className="fold">분석 결과 (1)</div>
          <div className="doc on">
            <span className="truncate" style={{ minWidth: 0 }}>
              영향 분석 · {sha7}
            </span>
            <span className="st">
              <Badge tone="info">분석 완료</Badge>
            </span>
          </div>
          <div className="fold">안내</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "6px 8px", lineHeight: 1.5 }}>
            RTM 새 요청 인테이크 또는 자연어 영향 분석으로 새 분석을 시작합니다.
          </div>
        </div>

        {/* 우 콘텐츠 */}
        <div style={{ minWidth: 0 }}>
          {/* 헤더 카드 — 앵커 commit + 액션 + seeds 칩 */}
          <div className={CARD} style={{ padding: "16px 20px", marginBottom: 14 }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <b style={{ fontSize: 15 }}>
                영향 분석 — 앵커 commit <span style={{ fontFamily: "var(--font-mono)" }}>{sha7}</span>
              </b>
              <Badge tone="ok">분석 완료</Badge>
              <div className="flex-1" />
              <LinkBtn to="/deliverables/09_impact-analysis">변경영향분석서(05) 보기</LinkBtn>
              <LinkBtn to="/structure">그래프 오버레이 →</LinkBtn>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                변경 기점 (seeds {data.seeds.length})
              </div>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {data.seeds.map((s) => {
                  const fixed = s.confidence === "CONFIRMED";
                  return (
                    <span
                      key={s.relPath}
                      title={s.relPath}
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
                          color: fixed ? "var(--color-status-ok)" : "var(--color-status-warn)",
                        }}
                      >
                        [{fixed ? "확정" : "추정"}]
                      </span>
                    </span>
                  );
                })}
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

          {/* 2컬럼 패널 */}
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14 }}>
            {/* 좌 — 영향 분해 (하류 + 상류, viaKinds 그룹) */}
            <div className={CARD} style={{ padding: "16px 18px" }}>
              <h3 style={PANEL_H3}>영향 분해</h3>
              {downFiles.length === 0 && upFiles.length === 0 ? (
                <p className="text-text-muted" style={{ fontSize: 12.5, padding: "4px 2px" }}>
                  영향 파일 없음
                </p>
              ) : (
                <>
                  {downFiles.length > 0 && <FileGroups files={downFiles} limit={12} />}
                  {upFiles.length > 0 && (
                    <>
                      <div style={GRP_LABEL}>상류 ({upFiles.length})</div>
                      <FileGroups files={upFiles} limit={12} />
                    </>
                  )}
                </>
              )}
            </div>

            {/* 우 — 확인 필요 · 후속 조치 */}
            <div className={CARD} style={{ padding: "16px 18px" }}>
              <h3 style={PANEL_H3}>확인 필요 · 후속 조치</h3>
              {data.needsReview.length === 0 ? (
                <p className="text-text-muted" style={{ fontSize: 12.5, padding: "4px 2px" }}>
                  확인 필요 항목 없음
                </p>
              ) : (
                data.needsReview.map((nr, i) => (
                  <div
                    key={`${nr.ref}-${i}`}
                    className="flex items-start gap-2"
                    style={{
                      padding: "8px 10px",
                      marginBottom: 8,
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--color-status-warn) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-status-warn) 25%, transparent)",
                    }}
                  >
                    <Badge tone="warn" style={{ flex: "none", marginTop: 1 }}>
                      needsReview
                    </Badge>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                        {nr.reason}
                      </div>
                      <Ev>{nr.ref}</Ev>
                    </div>
                  </div>
                ))
              )}

              <div style={GRP_LABEL}>영향 산출물</div>
              <div className="flex items-center gap-2" style={ROW}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", flex: "1 1 auto" }}>
                  변경영향분석서(05)
                </span>
                <Link to="/deliverables/09_impact-analysis" style={LINK_TEXT}>
                  보기 →
                </Link>
              </div>
              <div className="flex items-center gap-2" style={ROW}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", flex: "1 1 auto" }}>
                  구조 그래프 오버레이
                </span>
                <Link to="/structure" style={LINK_TEXT}>
                  열기 →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
