import type { PolicyItem, PolicySignal, ReconcileResult } from './types.js';
/** 문서 항목 × 신호 → 대조 결과(순수, 결정론). */
export declare function reconcilePolicy(items: PolicyItem[], signals: PolicySignal[], gitCommit?: string | null, seedUnresolved?: Array<{
    ref: string;
    reason: string;
}>): ReconcileResult;
/**
 * `.understand-anything/policy-input/*.md` 의 기존 정책서를 ingest·대조(IO 래퍼).
 * 입력 디렉터리가 없으면 빈 결과(대조 대상 없음 — "없을 때" 경로).
 */
export declare function scanPolicyReconcile(projectRoot: string, signals: PolicySignal[]): ReconcileResult;
//# sourceMappingURL=reconcile.d.ts.map