import type { ConfKind } from "./proto/Proto";

/**
 * 신뢰도(정적분석 자동판정) 단일 소스 — 메뉴별로 4곳에 흩어져 있던 맵 통일(2026-07-15).
 * 라벨 결정(사용자): CONFIRMED = "근거확보"(사람 '확정'과 구분 — 자동판정이라). rtm 의 "확정"도 여기로 승계.
 * 소비처는 kind(ConfBadge 색·톤) + label + title 을 여기서 읽는다. 검증(GROUNDED/NEEDS_REVIEW)·
 * 사람확정(TrustBadge)은 별개 축이라 무관.
 */
export type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";

export interface ConfMeta {
  kind: ConfKind;
  label: string;
  title: string;
}

export const CONFIDENCE: Record<Confidence, ConfMeta> = {
  CONFIRMED: {
    kind: "fix",
    label: "근거확보",
    title: "결정적 정적 분석이 코드에서 근거(file:line)를 직접 추적함 — 규칙 기반이라 재현 가능",
  },
  CONFIRMED_AI: {
    kind: "ai",
    label: "근거확보(추정)",
    title: "정적 분석이 잇지 못한 연결을 AI가 코드를 읽어 보완 판정한 근거 — 파일 위치는 있으나 검토 권장",
  },
  INFERRED: {
    kind: "est",
    label: "추정",
    title: "핸들러 미검출 또는 메서드명 추론 — 기계 판정",
  },
  UNVERIFIED: {
    kind: "chk",
    label: "확인 필요",
    title: "근거 없음 — 확인 필요",
  },
};

/** 상태 문자열 → 메타(미지정/미매핑은 INFERRED 폴백, 기존 관례 유지). */
export function confMeta(status: string | undefined | null): ConfMeta {
  return CONFIDENCE[(status ?? "") as Confidence] ?? CONFIDENCE.INFERRED;
}

/** Badge(tone) 를 쓰는 소비처용 kind→BadgeTone. ConfBadge 를 쓸 수 있으면 그쪽이 우선. */
export function confTone(kind: ConfKind): "ok" | "warn" | "err" {
  return kind === "fix" || kind === "ai" ? "ok" : kind === "est" ? "warn" : "err";
}
