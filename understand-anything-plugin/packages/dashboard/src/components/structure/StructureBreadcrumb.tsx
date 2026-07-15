import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../../contexts/I18nContext";

export interface StructureCrumb {
  label: string;
  href: string | null; // null = 현재 위치(링크 없음)
}

/**
 * 구조 메뉴 공용 브레드크럼 — 노드 클릭(하향)과 대칭인 상향 내비(설계 §4).
 *
 * 업무 지도(시스템 구성도) 탭도 같은 헤더를 쓴다(2026-07-15 사용자 요청: "구조
 * 헤더와 동일하게") — 그래서 aria-label 만 호출측이 갈아끼울 수 있게 열어 뒀다.
 * 미지정 시 기존 "구조 브레드크럼" 그대로라 구조 메뉴 동작은 불변.
 */
export default function StructureBreadcrumb({
  crumbs,
  label,
  right,
}: {
  crumbs: StructureCrumb[];
  label?: string;
  /** 행 우측 액션 슬롯(업무 지도의 "업무 전체 펼치기"). 미지정이면 슬롯 자체가 없다. */
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <nav
      className="shrink-0 flex items-center flex-wrap"
      // 탭의 헤더(메뉴 헤더 PageHead 와는 다른 층위) — 시각 언어를 나머지 화면과
      // 맞춘다(2026-07-15 사용자 지적): 흰 밴드(bg-panel)+보더를 걷어 루트 배경에
      // 얹는다(흰 면은 둥근 카드 전용). 위 탭 행과의 간격 16px 은 ProtoTabs 의
      // marginBottom 과 같은 리듬 — "탭에 딱 붙는" 문제 해소.
      // 좌우 24px = 탭 행 margin 이자 탭 본문(시스템 박스·그래프 카드) 패딩 — 안쪽
      // 여백을 두지 않아 헤더가 탭 라벨이 아니라 **탭 내용물**과 같은 기준선에 선다
      // (사용자 확정: 탭 헤더는 탭의 다른 영역과 맞춘다).
      style={{ margin: "16px 24px 10px", gap: 6, fontSize: 12.5 }}
      aria-label={label ?? t.structure.breadcrumbLabel}
    >
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center" style={{ gap: 6 }}>
          {i > 0 && <span className="text-text-muted" aria-hidden>›</span>}
          {c.href ? (
            <button
              type="button"
              onClick={() => navigate(c.href!)}
              className="text-text-muted hover:text-accent transition-colors cursor-pointer font-semibold"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-text-primary font-semibold">{c.label}</span>
          )}
        </span>
      ))}
      {right != null && (
        <>
          <div className="flex-1" />
          <div className="flex items-center gap-3">{right}</div>
        </>
      )}
    </nav>
  );
}
