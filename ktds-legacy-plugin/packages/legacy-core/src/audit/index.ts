/**
 * audit (P4.2) — doc-state 전이가 남기는 감사 이벤트의 단일 소스.
 *
 * append-only(추가 전용) · chronological(추가 순서 = 시간 순서, `at`이 호출자
 * 공급이라 같은 입력 -> 같은 로그). engine 안에서 Date.now()/new Date() 미사용.
 * zod 스키마로 손편집/버전 스큐를 조용히 통과시키지 않는다.
 */
import { z } from 'zod'

/** 감사 이벤트 종류 — doc-state 전이 3종(승인/반려/제출). */
export const AuditEventTypeSchema = z.enum(['SUBMITTED', 'APPROVED', 'RETURNED'])
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>

/**
 * 감사 이벤트 — event/by/at(필수) + detail(선택).
 * `at`은 호출자 공급 ISO 문자열(결정론: engine 내부에서 시간 생성 금지).
 */
export const AuditEventSchema = z.object({
  event: AuditEventTypeSchema,
  by: z.string(),
  at: z.string(),
  detail: z.string().optional(),
})
export type AuditEvent = z.infer<typeof AuditEventSchema>

/**
 * 감사 로그에 이벤트를 추가한 **새 배열**을 반환(입력 불변 — append-only).
 * 호출자 공급 `at`을 그대로 보존해 결정론을 유지한다.
 */
export function appendAudit(audit: readonly AuditEvent[], event: AuditEvent): AuditEvent[] {
  return [...audit, event]
}

/** 감사 이벤트 1건을 한 줄 텍스트로 렌더(detail 있으면 ` — detail` 접미). */
function renderEvent(e: AuditEvent): string {
  const head = `${e.at} ${e.event} by ${e.by}`
  return e.detail ? `${head} — ${e.detail}` : head
}

/**
 * 감사 로그를 결정론 텍스트로 렌더 — 한 줄/이벤트, 후행 개행.
 * 입력 순서(append 순서)를 유지한다. 이벤트가 없으면 빈 문자열.
 */
export function renderAuditLog(audit: readonly AuditEvent[]): string {
  if (audit.length === 0) return ''
  return audit.map(renderEvent).join('\n') + '\n'
}
