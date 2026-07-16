import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useRtm } from "./context";
import DataCompareModal from "./DataCompareModal";
import FlowCompareModal from "./FlowCompareModal";
import { Axis, REF_GAP, REF_ROW } from "./shared";
import { BAD, BORDER, FAINT, VERB, WARN, impactAbsenceOf } from "./types";
import EvidenceLink from "../ui/EvidenceLink";

// ── ② 영향분석 템플릿 (2026-07-17) — 종전 IntakePanel.ImpactInline 의 후신 ────
//
// 축 나열 한 덩어리였던 산출을 **조건별 영역**으로 가른다(사용자 결정):
//   시드(무엇을 바꾸나) → 상류 영향(흔드는 것) → 하류 의존(기대는 것) → 계산 제외.
// 업무 흐름·데이터에는 비포·에프터 모달이 붙는다 — "에프터"는 확정 전 도식을 창작하지
// 않고 **영향 도달의 투영**(현행 도식 + 표식)만 그린다(§4.1 정직성 규약의 연장).
//
// 데이터 계약은 종전과 동일: 세션 포인터(impact-run.json)와 원장 스냅샷
// (impact-history/<jobId>/impact.json)을 /change 와 공유한다 — 두 표면이 갈라질 수 없다.

/** 라우트·흐름 id → 사람이 읽는 표기("flow:ANY /x" · "route:ANY /x" → "/x"). ChangeImpactView:177 동형. */
const shortRef = (id: string): string => id.replace(/^(?:flow|route):/, "").replace(/^ANY\s+/, "");
/** 목록 상한 — ②는 열람이 아니라 **컨펌 직전 스캔**이라 다 쏟지 않는다. 전체는 /change 에서 본다. */
const CAP = 8;
/** 상한 초과분 표기 — 침묵 누락 금지(FileGroups "외 n건" 과 같은 규약). */
function Over({ n }: { n: number }) {
  if (n <= CAP) return null;
  return <span title={`${n - CAP}건 더 — 전체는 '변경·영향에서 열기'로 봅니다.`} style={{ fontSize: 10, color: FAINT }}>+{n - CAP}</span>;
}
/** 계산된 축의 3상태 — `undefined`(구 스냅샷이 안 적음) / `[]`(0건) / `[…]`. Axis 주석과 같은 축. */
const axisState = (xs: unknown[] | undefined): "filled" | "none" | "omitted" =>
  xs === undefined ? "omitted" : xs.length === 0 ? "none" : "filled";
const NONE_T = "엔진이 계산했고 영향받는 항목이 0건입니다 — '생략됨'(안 적음)과 다릅니다.";

/** 조건 영역 카드 — 색 스트라이프 헤더(아이콘·제목·카운트) + 우측 액션 슬롯. */
function SectionCard({ tone, icon, title, sub, count, action, children }: {
  tone: string; icon: string; title: string; sub?: string; count?: number; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-border-subtle bg-panel card-shadow flex flex-col" style={{ overflow: "hidden", minWidth: 0 }}>
      <div className="flex items-center flex-wrap border-b border-border-subtle" style={{ gap: 7, padding: "7px 12px", background: `color-mix(in srgb, ${tone} 6%, transparent)`, rowGap: 4 }}>
        <span aria-hidden style={{ color: tone, fontSize: 12, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>{title}</span>
        {count != null && (
          <span className="tabular-nums" style={{ fontSize: 10, fontWeight: 700, color: tone, border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`, borderRadius: 999, padding: "0 7px", lineHeight: 1.6 }}>{count}</span>
        )}
        {sub && <span className="text-text-muted" style={{ fontSize: 10.5 }}>{sub}</span>}
        {action && <span className="ml-auto flex items-center" style={{ gap: 6 }}>{action}</span>}
      </div>
      <div className="flex flex-col" style={{ padding: "8px 12px", gap: 3 }}>{children}</div>
    </section>
  );
}

/** 비포·에프터 모달 여는 버튼 — 두 카드 헤더 공용. */
function CompareBtn({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-border-medium bg-panel text-text-secondary hover:text-accent hover:border-accent transition-colors disabled:opacity-40 cursor-pointer font-semibold whitespace-nowrap"
      style={{ padding: "3px 9px", fontSize: 10.5 }}
    >
      ⇄ {label}
    </button>
  );
}

export default function ImpactStepView() {
  const { identified, impactRun, impactData, impactLoaded } = useRtm();
  const [flowCompare, setFlowCompare] = useState(false);
  const [dataCompare, setDataCompare] = useState(false);
  const up = impactData?.upstream;
  const mappers = up?.persistence?.mappers;
  const downFiles = impactData?.downstream?.files;
  const modified = (identified?.requirements ?? []).flatMap((r) => r.changeset?.modified ?? []);
  // 신규 후보(위치 미정) — 에프터 도식에 창작해 넣지 않고 칩으로만 정직하게 표기한다.
  const addedNames = [...new Set((identified?.requirements ?? []).flatMap((r) => r.changeset?.added ?? []))];

  // 부재 3갈래(미실행 / 해당없음 / 스냅샷 없음) — 종전 문구·판정 그대로(§4.1).
  const absence = !impactLoaded ? (
    <span style={{ fontSize: 10.5, color: FAINT }}>불러오는 중…</span>
  ) : !impactRun ? (
    impactAbsenceOf(identified) === "notApplicable" ? (
      <span title="changeset.modified 가 없거나 전부 신규(to-be)입니다 — 바꿀 기존 코드가 없으면 도달성을 계산할 시드가 없습니다. 신규 생성예측은 1차 범위 밖입니다." style={{ fontSize: 11, color: FAINT }}>
        해당없음 — 기존 기능을 바꾸지 않는 요청(신규만)이라 계산할 시드가 없습니다.
      </span>
    ) : (
      <span title="변경 대상 기능(changeset.modified)이 있는데 검증 산출이 없습니다 — ①의 코드영향 검증을 아직 돌리지 않았습니다. '영향 없음'이 아닙니다." style={{ fontSize: 11, color: WARN }}>
        미실행 — 변경 대상이 있으나 아직 코드영향을 검증하지 않았습니다.
      </span>
    )
  ) : !impactData ? (
    <span title="포인터(impact-run.json)는 있으나 원장 스냅샷을 못 읽었습니다 — 원장 상한 초과로 밀렸거나 파일이 유실됐습니다." style={{ fontSize: 11, color: WARN }}>
      스냅샷 없음 — 실행 기록은 있으나 결과를 못 읽었습니다(원장에서 밀렸을 수 있습니다).
    </span>
  ) : null;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 4 }}>
        ①이 분해한 <b style={{ color: "var(--color-text-primary)" }}>변경 대상 {modified.length}</b>건에서
        무엇이 연쇄로 영향받는지 — <b style={{ color: "var(--color-text-primary)" }}>영향도 엔진</b>이 계산한 결과입니다.
      </div>
      {/* ② 가 무엇을 근거로 말하는지 못 박는다 — 여기 숫자는 산문이 아니라 엔진 출력이다. */}
      <div className="text-text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 10 }}>
        시드는 <b className="text-text-secondary">결정론 조인</b>으로 뽑습니다(changeset.modified → 추적표 진입점 근거).
        <b style={{ color: FAINT }}> 생략됨</b> = 이 산출에 그 축이 기록되지 않음,
        <b style={{ color: WARN }}> 없음</b> = 엔진이 계산했고 영향받는 항목이 0건.
      </div>
      <div className="flex items-baseline flex-wrap" style={{ gap: 8, marginBottom: 10, borderTop: BORDER, paddingTop: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-secondary)" }}>코드영향 검증</span>
        {/* §2.3 "한 번 돌리고 두 곳에서 본다" — 같은 jobId 스냅샷을 원장 렌즈에서 연다. */}
        {impactRun && (
          <Link to={`/change?run=${encodeURIComponent(impactRun.jobId)}`} title={`변경·영향 원장에서 이 분석("${impactRun.query}")을 엽니다 — 같은 산출의 전체 열람.`}
            className="ml-auto hover:underline" style={{ fontSize: 10.5, color: "var(--color-status-info)", textDecoration: "none", flex: "none" }}>
            변경·영향에서 열기 →
          </Link>
        )}
      </div>

      {absence ?? (impactRun && (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {/* ── 영역 1: 시드 — 무엇을 바꾸나 ── */}
          <SectionCard tone={VERB.modified.color} icon="~" title="변경 대상 — 시드" sub="무엇을 바꾸나 · 도달성 계산의 출발점" count={impactRun.bySource.length}>
            {impactRun.bySource.length === 0
              ? <span title={NONE_T} style={{ fontSize: 10.5, color: WARN }}>없음</span>
              : impactRun.bySource.map((s) => (
                <div key={s.fnId} className="flex flex-wrap items-baseline" style={{ gap: 5, minWidth: 0, padding: "1px 0" }}>
                  <span title={`${VERB.modified.label} ${s.fnId}`} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: VERB.modified.color }}>{VERB.modified.sym}{shortRef(s.fnId)}</span>
                  <span style={{ fontSize: 10, color: FAINT }}>→</span>
                  {/* 시드는 파일 단위다(라인이 없다) — 라인을 지어내지 않는다(AcRow 의 line=null 과 같은 규약). */}
                  {s.relPaths.map((p) => <EvidenceLink key={p} file={p} line={1} showLine={false} basename />)}
                </div>
              ))}
          </SectionCard>

          {/* ── 영역 2·3: 상류 영향 / 하류 의존 — 나란히(넓을 때) ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2" style={{ gap: 10, alignItems: "start" }}>
            <SectionCard
              tone="var(--color-status-info)" icon="↑" title="상류 영향" sub="이 변경이 흔드는 것"
              action={
                <CompareBtn
                  label="업무흐름도 비포·에프터"
                  onClick={() => setFlowCompare(true)}
                  disabled={(up?.flows ?? []).length === 0}
                  title={(up?.flows ?? []).length === 0 ? "영향받는 업무 흐름이 없어 비교할 도식이 없습니다" : "현행 업무흐름도(비포)와 영향 도달 표식(에프터)을 나란히 봅니다"}
                />
              }
            >
              {/* 상류 = 이 변경이 **영향을 주는** 쪽. API 축만 진짜 file:line 근거를 갖는다. */}
              <Axis label="API" state={axisState(up?.api)} noneLabel="없음" noneTitle={NONE_T}>
                <div className={REF_ROW} style={REF_GAP}>
                  {(up?.api ?? []).slice(0, CAP).map((a) => (
                    <span key={a.id} className="flex items-baseline" style={{ gap: 4, minWidth: 0 }} title={a.handler ? `${a.id} — ${a.handler}` : a.id}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-text-secondary)" }}>{shortRef(a.id)}</span>
                      <EvidenceLink file={a.filePath} line={a.line} basename />
                    </span>
                  ))}
                  <Over n={(up?.api ?? []).length} />
                </div>
              </Axis>
              <Axis label="업무 흐름" state={axisState(up?.flows)} noneLabel="없음" noneTitle={NONE_T}>
                <div className={REF_ROW} style={REF_GAP}>
                  {(up?.flows ?? []).slice(0, CAP).map((f) => (
                    <Link key={f.flowId} to={`/domains/${encodeURIComponent(f.domainId)}?flow=${encodeURIComponent(f.flowId)}`} title={f.flowId}
                      className="hover:underline" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-status-info)", textDecoration: "none" }}>
                      {shortRef(f.flowId)}
                    </Link>
                  ))}
                  <Over n={(up?.flows ?? []).length} />
                </div>
              </Axis>
              <Axis label="도메인" state={axisState(up?.domains)} noneLabel="없음" noneTitle={NONE_T}>
                <div className={REF_ROW} style={REF_GAP}>
                  {(up?.domains ?? []).map((d) => (
                    <Link key={d.domainId} to={`/domains/${encodeURIComponent(d.domainId)}`} title={d.domainId}
                      className="hover:underline" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-status-info)", textDecoration: "none" }}>
                      {d.name || d.key}
                    </Link>
                  ))}
                </div>
              </Axis>
            </SectionCard>

            <SectionCard
              tone="var(--color-layer-dao)" icon="↓" title="하류 의존" sub="이 변경이 기대는 것"
              action={
                <CompareBtn
                  label="데이터 비포·에프터"
                  onClick={() => setDataCompare(true)}
                  disabled={impactRun.bySource.length === 0}
                  title={impactRun.bySource.length === 0 ? "시드가 없어 데이터 도달을 계산할 수 없습니다" : "현행 스키마(비포)와 변경 도달 테이블·CRUD 표식(에프터)을 나란히 봅니다"}
                />
              }
            >
              {/* 하류 = 이 변경이 **기대는** 협력자. 파일·매퍼는 라인 근거가 없어 파일만 연다. */}
              <Axis label="파일" state={axisState(downFiles)} noneLabel="없음" noneTitle={NONE_T}>
                <div className={REF_ROW} style={REF_GAP}>
                  {(downFiles ?? []).slice(0, CAP).map((f) => (
                    <span key={f.relPath} className="flex items-baseline" style={{ gap: 3, minWidth: 0 }} title={f.relPath}>
                      <EvidenceLink file={f.relPath} line={1} showLine={false} basename />
                      {f.minDepth != null && <span title={`시드에서 ${f.minDepth}단계`} style={{ fontSize: 9, color: FAINT }}>d{f.minDepth}</span>}
                    </span>
                  ))}
                  <Over n={(downFiles ?? []).length} />
                </div>
              </Axis>
              <Axis label="매퍼(데이터)" state={axisState(mappers)} noneLabel="없음" noneTitle={NONE_T}>
                <div className={REF_ROW} style={REF_GAP}>
                  {(mappers ?? []).slice(0, CAP).map((m) => (
                    <span key={m.relPath} title={m.namespace}>
                      <EvidenceLink file={m.relPath} line={1} showLine={false} basename />
                    </span>
                  ))}
                  <Over n={(mappers ?? []).length} />
                </div>
              </Axis>
            </SectionCard>
          </div>

          {/* ── 영역 4: 계산 제외 — 정직한 생략(§6.2). 시드가 못 된 기능을 조용히 떨구지 않는다. ── */}
          {(impactRun.skippedToBe.length > 0 || impactRun.ungroundedFnIds.length > 0 || impactRun.unknownFnIds.length > 0) && (
            <SectionCard tone={FAINT} icon="∅" title="계산 제외" sub="도달성 계산에 못 태운 것 — '영향 없음'이 아닙니다"
              count={impactRun.skippedToBe.length + impactRun.ungroundedFnIds.length + impactRun.unknownFnIds.length}>
              {impactRun.skippedToBe.length > 0 && (
                <Axis label="신규" state="filled">
                  <span title={impactRun.skippedToBe.join(" · ")} style={{ fontSize: 10.5, color: FAINT }}>to-be {impactRun.skippedToBe.length}건 — 파일이 아직 없어 시드가 될 수 없습니다</span>
                </Axis>
              )}
              {impactRun.ungroundedFnIds.length > 0 && (
                <Axis label="미근거" state="filled">
                  <span title={impactRun.ungroundedFnIds.join(" · ")} style={{ fontSize: 10.5, color: WARN }}>진입점 근거 0건 {impactRun.ungroundedFnIds.length}건 — 시드를 못 만들었습니다</span>
                </Axis>
              )}
              {impactRun.unknownFnIds.length > 0 && (
                <Axis label="미상" state="filled">
                  <span title={impactRun.unknownFnIds.join(" · ")} style={{ fontSize: 10.5, color: BAD }}>추적표에 없는 기능 {impactRun.unknownFnIds.length}건 — 실재 대조 확인 필요</span>
                </Axis>
              )}
            </SectionCard>
          )}
        </div>
      ))}

      {flowCompare && impactData && (
        <FlowCompareModal flows={up?.flows ?? []} addedNames={addedNames} onClose={() => setFlowCompare(false)} />
      )}
      {dataCompare && impactRun && (
        <DataCompareModal seedFnIds={impactRun.bySource.map((s) => s.fnId)} onClose={() => setDataCompare(false)} />
      )}
    </div>
  );
}
