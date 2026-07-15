import { useDashboardStore } from "../../store";

/**
 * 공용 근거 링크 — "file:line → 코드 뷰어" 평문 mono 버튼(2026-07-15).
 * 구 EvLink(TablesTab)·EvBtn(ProgramsView)·EvidenceLink(rtm/shared) 3중복 통합.
 * 밀집 테이블/목록용이라 CitationChip(알약형) 대신 평문 텍스트 스타일을 유지한다
 * (CitationChip 은 흐름·정책 카드처럼 강조가 필요한 문맥 전용으로 남긴다).
 */
export default function EvidenceLink({
  file,
  line,
  showLine = true,
  basename,
  stopPropagation,
}: {
  file: string;
  line: number;
  /** false 면 파일만 표기(라인 생략) — 구 EvBtn showLine=false */
  showLine?: boolean;
  /** true 면 경로 대신 파일명만 — 구 EvLink(밀집 테이블 행) */
  basename?: boolean;
  /** 클릭 가능한 행 안에 있을 때 상위 onClick 억제 — 구 rtm EvidenceLink */
  stopPropagation?: boolean;
}) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const shown = basename ? file.split("/").pop() ?? file : file;
  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        openCodeViewerAt(file, line);
      }}
      title={`코드 열기 — ${file}:${line}`}
      className="cursor-pointer bg-transparent border-0 text-text-muted hover:text-accent transition-colors"
      style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: 0, textAlign: "left", wordBreak: "break-all" }}
    >
      {showLine ? `${shown}:${line}` : shown}
    </button>
  );
}
