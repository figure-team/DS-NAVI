import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useDashboardStore } from "../../store";
import { Badge, BtnOutline } from "../proto/Proto";
import type { BadgeTone } from "../proto/Proto";
import type { CrudEvidence, CrudMatrix, CrudRow } from "./types";
import SearchInput from "../ui/SearchInput";

/**
 * CRUD 매트릭스 탭(개편 ③) — 빈 행 접기 · 기능 검색 · 테이블 필터 · 전치(테이블 기준) ·
 * sticky 헤더/첫열 · 신뢰도 라벨 정직화(기계 판정 명시) · 근거 클릭 → 코드 뷰어.
 * URL: ?crudq=&crudTable=&pivot=table (crud-matrix.json 계약 불변, 전부 클라이언트 가공).
 */

/** CRUD 셀 문자 → 배지 톤(C 생성 / R 조회 / U 수정 / D 삭제 / ○ 접근확인). */
const CELL_TONE: Record<string, BadgeTone> = { C: "ok", R: "info", U: "warn", D: "err", "○": "mut" };

/**
 * 행 단위 신뢰도 표시 — 전부 정적 분석 자동 판정(사람 확정 아님)이라 "확정" 계열 라벨을 쓰지 않는다.
 * CONFIRMED = SQL 문 근거(file:line) 추적됨, INFERRED = DB 접근 미검출/메서드명 추론.
 */
const CONF_DISPLAY: Record<string, { label: string; tone: BadgeTone; title: string }> = {
  CONFIRMED: { label: "근거확보", tone: "ok", title: "SQL 문 근거(file:line)가 호출그래프로 추적됨 — 기계 판정" },
  INFERRED: { label: "추정", tone: "warn", title: "DB 접근 미검출 또는 메서드명 추론 — 기계 판정" },
  UNVERIFIED: { label: "확인 필요", tone: "err", title: "근거 없음 — 확인 필요" },
};

const rowIsEmpty = (r: CrudRow): boolean => r.evidence.length === 0 && r.cells.slice(1).every((c) => !c);

function CrudLetters({ v }: { v: string }) {
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {[...v].map((ch, i) => (
        <Badge key={i} tone={CELL_TONE[ch] ?? "mut"}>
          {ch}
        </Badge>
      ))}
    </span>
  );
}

/* ── sticky 스타일(스크롤 컨테이너 내부 기준) ── */
const STICKY_HEAD: React.CSSProperties = { position: "sticky", top: 0, background: "var(--color-panel)", zIndex: 2 };
const STICKY_COL: React.CSSProperties = { position: "sticky", left: 0, background: "var(--color-panel)", zIndex: 1 };
const STICKY_CORNER: React.CSSProperties = { ...STICKY_HEAD, left: 0, zIndex: 3 };

interface EvPopover {
  key: string;
  evidence: CrudEvidence[];
  right: number;
  top: number;
}

export default function CrudTab({ crud }: { crud: CrudMatrix }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const crudq = searchParams.get("crudq") ?? "";
  const crudTable = searchParams.get("crudTable");
  const pivot = searchParams.get("pivot") === "table";
  // 입력값은 로컬 state 가 원본 — searchParams 를 value 로 직결하면 라우터 갱신 리렌더가
  // 한글 IME 조합을 끊는다(조합 중 글자 깨짐). URL 은 필터 계산·딥링크용 사본.
  const [qInput, setQInput] = useState(crudq);
  const [evOpen, setEvOpen] = useState<EvPopover | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const tableCols = useMemo(() => crud.columns.slice(1), [crud.columns]);
  const activeRows = useMemo(() => crud.rows.filter((r) => !rowIsEmpty(r)), [crud.rows]);
  const emptyRows = useMemo(() => crud.rows.filter(rowIsEmpty), [crud.rows]);

  const ql = qInput.trim().toLowerCase();
  const tableFilter = crudTable && tableCols.includes(crudTable) ? crudTable : null;

  // 기능 기준(기본) — 검색은 행(기능), 필터는 열(테이블)+그 테이블 접근 행.
  const viewRows = useMemo(() => {
    let rows = activeRows;
    if (!pivot && ql) rows = rows.filter((r) => (r.cells[0] ?? "").toLowerCase().includes(ql));
    if (tableFilter) rows = rows.filter((r) => r.cells[tableCols.indexOf(tableFilter) + 1]);
    return rows;
  }, [activeRows, pivot, ql, tableFilter, tableCols]);
  const viewCols = tableFilter ? [tableFilter] : tableCols;

  // 테이블 기준(전치) — 행=테이블, 열=접근 있는 기능. 검색도 축 따라 행(테이블) 대상.
  const pivotData = useMemo(() => {
    if (!pivot) return null;
    const feats = activeRows;
    const rows = (tableFilter ? [tableFilter] : tableCols)
      .filter((t) => !ql || t.toLowerCase().includes(ql))
      .map((t) => {
        const ti = tableCols.indexOf(t) + 1;
        return { table: t, cells: feats.map((f) => f.cells[ti] ?? "") };
      });
    return { feats, rows: rows.filter((r) => r.cells.some((c) => c)) };
  }, [pivot, activeRows, ql, tableFilter, tableCols]);

  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set(k, v);
        else prev.delete(k);
        return prev;
      },
      { replace },
    );

  return (
    <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "14px 16px" }}>
      {/* 툴바 — 축 따라가는 검색(기능/테이블) · 테이블 필터 · 전치 토글 */}
      <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
        <SearchInput
          value={qInput}
          onChange={(v) => {
            setQInput(v);
            setParam("crudq", v || null, true);
          }}
          placeholder={pivot ? "테이블 검색" : "기능 검색"}
          width={180}
        />
        <select
          value={tableFilter ?? ""}
          onChange={(e) => setParam("crudTable", e.target.value || null)}
          className="rounded-lg border border-border-medium bg-panel text-text-secondary"
          style={{ padding: "6px 10px", fontSize: 12.5 }}
        >
          <option value="">테이블 전체</option>
          {tableCols.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <BtnOutline
          sm
          onClick={() => {
            // 축이 바뀌면 검색 대상(기능↔테이블)도 바뀌므로 검색어는 초기화.
            setQInput("");
            setSearchParams((prev) => {
              if (pivot) prev.delete("pivot");
              else prev.set("pivot", "table");
              prev.delete("crudq");
              return prev;
            });
          }}
        >
          {pivot ? "기능 기준으로" : "테이블 기준으로"}
        </BtnOutline>
        {(ql || tableFilter) && (
          <span className="text-text-muted" style={{ fontSize: 12 }}>
            {pivot ? `${pivotData?.rows.length ?? 0}테이블` : `${viewRows.length}기능`} 표시 중
          </span>
        )}
      </div>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 340px)" }}>
        {!pivot ? (
          <table className="proto-tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={STICKY_CORNER}>{crud.columns[0] ?? "기능"} ＼ 테이블</th>
                {viewCols.map((t) => (
                  <th key={t} className="font-mono" style={STICKY_HEAD}>
                    {t}
                  </th>
                ))}
                <th style={STICKY_HEAD}>신뢰도</th>
                <th style={STICKY_HEAD}>근거</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map((row, ri) => {
                const conf = CONF_DISPLAY[row.confidence] ?? CONF_DISPLAY.INFERRED;
                const rowKey = `${row.cells[0] ?? ri}`;
                return (
                  <tr key={rowKey}>
                    <td style={STICKY_COL}>
                      <b className="text-text-primary">{row.cells[0]}</b>
                    </td>
                    {viewCols.map((t) => {
                      const v = row.cells[tableCols.indexOf(t) + 1] ?? "";
                      return (
                        <td key={t} className={v ? undefined : "text-text-muted"}>
                          {v ? <CrudLetters v={v} /> : "—"}
                        </td>
                      );
                    })}
                    <td>
                      <Badge tone={conf.tone} title={conf.title}>
                        {conf.label}
                      </Badge>
                    </td>
                    <td>
                      {row.evidence.length > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setEvOpen(
                              evOpen?.key === rowKey
                                ? null
                                : {
                                    key: rowKey,
                                    evidence: row.evidence,
                                    right: window.innerWidth - rect.right,
                                    top: rect.bottom + 4,
                                  },
                            );
                          }}
                          className="cursor-pointer bg-transparent border-0 text-text-muted"
                          style={{ font: "inherit", fontFamily: "var(--font-mono)", fontSize: 11, padding: 0 }}
                        >
                          근거 {row.evidence.length}건 ▾
                        </button>
                      ) : (
                        <span className="text-text-muted" style={{ fontSize: 11 }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="proto-tbl" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th style={STICKY_CORNER}>테이블 ＼ 기능</th>
                {pivotData!.feats.map((f) => (
                  <th key={f.cells[0]} style={STICKY_HEAD}>
                    {f.cells[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivotData!.rows.map((r) => (
                <tr key={r.table}>
                  <td className="font-mono" style={STICKY_COL}>
                    <b className="text-text-primary">{r.table}</b>
                  </td>
                  {r.cells.map((v, ci) => (
                    <td key={ci} className={v ? undefined : "text-text-muted"} title={pivotData!.feats[ci].cells[0]}>
                      {v ? <CrudLetters v={v} /> : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 근거 popover — 항목 클릭 시 코드 뷰어(file:line) */}
      {evOpen && (
        <>
          <button
            type="button"
            aria-label="근거 목록 닫기"
            onClick={() => setEvOpen(null)}
            style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent", border: 0, cursor: "default" }}
          />
          <div
            className="rounded-lg border border-border-medium bg-panel card-shadow"
            style={{ position: "fixed", right: evOpen.right, top: evOpen.top, zIndex: 31, padding: 6, maxWidth: 420 }}
          >
            {evOpen.evidence.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  openCodeViewerAt(e.file, e.line);
                  setEvOpen(null);
                }}
                className="block w-full text-left cursor-pointer bg-transparent border-0 hover:bg-elevated rounded-md"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  padding: "5px 8px",
                  color: "var(--color-status-info)",
                  whiteSpace: "normal",
                  wordBreak: "break-all",
                }}
              >
                {e.file}:{e.line}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 빈 행 접기 — DB 접근 미검출 기능(노이즈 분리, 침묵 누락 금지) */}
      {emptyRows.length > 0 && (
        <div
          className="rounded-lg border border-border-subtle"
          style={{ marginTop: 12, padding: "8px 12px" }}
        >
          <button
            type="button"
            onClick={() => setEmptyOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-0"
            style={{ font: "inherit" }}
          >
            <span style={{ fontSize: 9, width: 10 }}>{emptyOpen ? "▾" : "▸"}</span>
            <span className="text-text-secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
              DB 접근 미검출 기능 {emptyRows.length}건
            </span>
            <span className="text-text-muted" style={{ fontSize: 11.5 }}>
              — 화면 진입·세션 조작 등 매퍼 호출이 잡히지 않은 흐름
            </span>
          </button>
          {emptyOpen && (
            <div className="flex flex-wrap" style={{ gap: 6, margin: "8px 0 2px", paddingLeft: 18 }}>
              {emptyRows.map((r, i) => (
                <span
                  key={i}
                  className="border border-border-subtle text-text-muted rounded-md"
                  style={{ fontSize: 11.5, padding: "3px 9px" }}
                >
                  {r.cells[0]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="flex items-center flex-wrap text-text-muted"
        style={{ gap: 14, fontSize: 12, padding: "12px 4px 0" }}
      >
        <span>
          <Badge tone="ok">C</Badge> 생성
        </span>
        <span>
          <Badge tone="info">R</Badge> 조회
        </span>
        <span>
          <Badge tone="warn">U</Badge> 수정
        </span>
        <span>
          <Badge tone="err">D</Badge> 삭제
        </span>
        <span>· 신뢰도는 정적 분석 자동 판정(사람 확정 아님) — 근거(file:line) 클릭 시 코드 열람</span>
        <span>
          · 접근 {activeRows.length}기능 × {tableCols.length}테이블
        </span>
      </div>
    </div>
  );
}
