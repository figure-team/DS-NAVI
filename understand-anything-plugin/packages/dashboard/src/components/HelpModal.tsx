import { useI18n } from "../contexts/I18nContext";

/**
 * 도움말 모달 껍데기 — 단축키 은퇴(2026-07-18)로 KeyboardShortcutsHelp 를 대체.
 * TopBar 의 도움말 버튼(ⓘ 옆 물음표)만 진입점으로 남겼다. 본문은 비워 두었고,
 * 다음 작업에서 "메뉴별 사용법 안내"로 채울 예정(사용자 확정).
 */
export default function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="glass rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 glass-heavy border-b border-border-subtle px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-heading text-text-primary">{t.drawer.help}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-text-muted">메뉴별 사용법 안내가 준비 중입니다.</p>
        </div>
      </div>
    </div>
  );
}
