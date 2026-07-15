import { useEscClose } from "./shared";
import { BAD } from "./types";

/**
 * W4: 세션 폐기 확인 — `ApproverDialog`(중앙 모달, gap9: window.prompt 대체)와 같은 관례를 따른다.
 * `window.confirm` 은 이미 걷어낸 패턴이라(gap9) 여기서도 쓰지 않는다. 폐기는 되돌릴 수 없으므로
 * (discarded tombstone — vite.config.ts handleRtmDiscardPost) 한 번 더 확인을 거친다.
 */
export default function DiscardConfirmDialog({ request, onConfirm, onCancel }: { request: string; onConfirm: () => void; onCancel: () => void }) {
  useEscClose(onCancel);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-label="세션 폐기 확인" className="glass-heavy rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div style={{ padding: "16px 20px" }}>
          <h2 className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>세션을 폐기할까요?</h2>
          <p className="text-text-secondary truncate" style={{ fontSize: 12.5, marginBottom: 8 }} title={request}>{request || "(요청 미상)"}</p>
          <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            되돌릴 수 없습니다 — 원장에 <b className="text-text-secondary">폐기</b>로 남고 더 이상 진행할 수 없습니다.
            산출물 파일은 보존됩니다. 목록으로만 돌아가려면 취소하고 <b className="text-text-secondary">닫기</b>를 쓰세요.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle" style={{ padding: "10px 16px" }}>
          <button type="button" onClick={onCancel} className="rounded-lg text-text-secondary hover:text-text-primary" style={{ padding: "6px 12px", fontSize: 12.5 }}>취소</button>
          <button type="button" onClick={onConfirm} className="rounded-lg font-medium hover:opacity-80" style={{ padding: "6px 14px", fontSize: 12.5, color: BAD, background: "color-mix(in srgb, var(--color-status-error) 14%, transparent)" }}>폐기</button>
        </div>
      </div>
    </div>
  );
}
