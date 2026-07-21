import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../contexts/I18nContext";
import type { DomainCard, DomainClaim } from "../utils/domainData";
import GroundedBar from "./GroundedBar";
import VerdictBadge from "./VerdictBadge";

/**
 * 도메인 카드 인라인 확장 상세 (설계 §4) — 순수 도메인 개요.
 * 요약 / 엔티티 / 업무규칙 / 교차도메인을 각 항목의 인용 칩(근거) + ✓/⚠ 검증 배지와 함께,
 * 헤더엔 근거율 바. NEEDS_REVIEW 항목은 상단 고정 + 좌측 amber 보더로 강조. 긴 목록은
 * top-5 + "+N" 더보기. 기능별 상세·인용은 카드에 두지 않는다(화면2 소관) — "기능 보기"로 이동.
 * 미채움(LLM fill 전) 도메인은 결정론 요약만 + 안내.
 */
export interface DomainCardDetailProps {
  card: DomainCard;
  onViewFeatures: () => void;
}

const MAX_VISIBLE = 5;

function ClaimRow({ claim }: { claim: DomainClaim }) {
  const review = claim.verdict === "NEEDS_REVIEW";
  return (
    <div className={review ? "border-l-2 border-amber-500/50 pl-2" : "pl-[2px]"}>
      <div className="flex items-start gap-1.5">
        <VerdictBadge verdict={claim.verdict} />
        <span className="text-xs text-text-secondary leading-relaxed">{claim.text}</span>
      </div>
      {/* 근거(소스 위치) 칩은 카드 팝업에서 비노출(사용자 결정) — 검증 배지·근거율은
          유지, 소스 단위 근거는 워크스페이스(화면2/3) 소관. */}
    </div>
  );
}

/** 항목군 — NEEDS_REVIEW 우선 정렬, top-5 + "+N" 더보기. action = 헤더 우측 부가 링크(선택). */
function ClaimGroup({ label, claims, action }: { label: string; claims: DomainClaim[]; action?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (claims.length === 0) return null;
  // ⚠(NEEDS_REVIEW)를 상단 고정(신뢰도 우선) — 안정 정렬.
  const sorted = [...claims].sort((a, b) =>
    a.verdict === b.verdict ? 0 : a.verdict === "NEEDS_REVIEW" ? -1 : 1,
  );
  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hidden = sorted.length - visible.length;
  return (
    <div className="space-y-1.5">
      <h4 className="flex items-baseline gap-2 text-[10px] uppercase tracking-wider text-text-muted">
        <span>
          {label} <span className="text-text-muted/70">({claims.length})</span>
        </span>
        {action}
      </h4>
      {visible.map((c, i) => (
        <ClaimRow key={i} claim={c} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] text-accent hover:underline ml-5"
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}

export default function DomainCardDetail({ card, onViewFeatures }: DomainCardDetailProps) {
  const { t } = useI18n();
  const summary = card.claims.find((c) => c.kind === "summary") ?? null;
  const entities = card.claims.filter((c) => c.kind === "entity");
  const rules = card.claims.filter((c) => c.kind === "businessRule");
  const cross = card.claims.filter((c) => c.kind === "crossDomain");
  // 업무 규칙(LLM 하이라이트) → 정책서 도메인 탭(§4 전수 의사결정 테이블) 딥링크.
  // 도메인 key = 노드 id 의 "domain:" 접두 제거 — policy 문서 id(policy-domain-<key>) 규약과 대응.
  const domainKey = card.id.startsWith("domain:") ? card.id.slice("domain:".length) : card.id;

  return (
    <div className="border-t border-border-subtle px-6 py-4 space-y-4">
      {card.filled ? (
        <>
          {card.groundedPct !== null && (
            <GroundedBar pct={card.groundedPct} grounded={card.groundedCount} review={card.reviewCount} />
          )}
          {summary && <ClaimRow claim={summary} />}
          <ClaimGroup label={t.nodeInfo.entities} claims={entities} />
          <ClaimGroup
            label={t.nodeInfo.businessRules}
            claims={rules}
            action={
              <Link
                to={`/policy?tab=dom&dom=${encodeURIComponent(domainKey)}`}
                className="normal-case tracking-normal text-[11px] font-medium text-accent hover:underline"
              >
                {t.domainMap.viewInPolicy} →
              </Link>
            }
          />
          <ClaimGroup label={t.nodeInfo.crossDomain} claims={cross} />
        </>
      ) : (
        // 미채움: 결정론 요약만 — bundle→emit 전. (근거 칩/검증 없음)
        <p className="text-xs text-text-secondary leading-relaxed">{card.desc}</p>
      )}
      <button
        type="button"
        onClick={onViewFeatures}
        className="text-xs font-medium text-accent hover:underline"
      >
        {t.domainMap.viewFeatures} →
      </button>
    </div>
  );
}
