import type { CSSProperties } from "react";

// 헤드리스 spawn 3경로(임팩트 분석 / RTM 인테이크 / RTM 변경관리)가 공유하는 컴팩트 모델 셀렉터.
// 규약: 기본="" = 세션 모델(플래그 미전달), 나머지는 whitelist(opus/sonnet/haiku). 선택값을
// 그대로 POST body 의 model 로 보내고, 기본이면 호출측이 필드를 생략한다(서버가 화이트리스트 검증).
export const MODEL_CHOICES = ["opus", "sonnet", "haiku"] as const;
export type ModelChoice = "" | (typeof MODEL_CHOICES)[number];

const MODEL_LABELS: Record<(typeof MODEL_CHOICES)[number], string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};

export function ModelSelect({
  value,
  onChange,
  disabled,
  sessionDefaultLabel,
  ariaLabel,
  className,
  style,
}: {
  value: ModelChoice;
  onChange: (v: ModelChoice) => void;
  disabled?: boolean;
  /** 기본 선택("") 의 라벨 — 예: "세션 모델(기본)". */
  sessionDefaultLabel: string;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <select
      aria-label={ariaLabel}
      title={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ModelChoice)}
      className={className}
      style={style}
    >
      <option value="">{sessionDefaultLabel}</option>
      {MODEL_CHOICES.map((m) => (
        <option key={m} value={m}>
          {MODEL_LABELS[m]}
        </option>
      ))}
    </select>
  );
}
