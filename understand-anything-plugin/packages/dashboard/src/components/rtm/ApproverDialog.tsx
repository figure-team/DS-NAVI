import { useState } from "react";

import { useEscClose } from "./shared";

/**
 * 확정자 입력 다이얼로그 — window.prompt 대체(gap9).
 * resolveApprover() 가 저장된 값이 없을 때 띄우고, 확인/취소로 Promise 를 resolve 한다.
 */
export default function ApproverDialog({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  useEscClose(onCancel);
  const submit = () => { const v = name.trim(); if (v) onSubmit(v); };
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-root/80 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label="확정자 입력" className="glass-heavy rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div style={{ padding: "16px 20px" }}>
          <h2 className="text-text-primary" style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>확정자 입력</h2>
          <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>확정·검수 기록에 남길 이름/핸들을 입력하세요(브라우저에 저장됩니다).</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="예) 홍길동 / hong.gd"
            className="w-full rounded-lg bg-elevated border border-border-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            style={{ fontSize: 13, padding: "8px 11px" }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle" style={{ padding: "10px 16px" }}>
          <button type="button" onClick={onCancel} className="rounded-lg text-text-secondary hover:text-text-primary" style={{ padding: "6px 12px", fontSize: 12.5 }}>취소</button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="rounded-lg font-medium bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40" style={{ padding: "6px 14px", fontSize: 12.5 }}>확인</button>
        </div>
      </div>
    </div>
  );
}
