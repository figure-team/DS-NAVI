import { useI18n } from "../contexts/I18nContext";
import { useViewMode } from "../hooks/useViewMode";

/**
 * 도움말 모달 — TopBar 물음표 버튼 전용(단축키 은퇴 후 용도 전환, 2026-07-18).
 * 내용은 현재 메뉴별로 다르다(사용자 확정): 홈(useViewMode null)에서만 CLI 실행 순서
 * +명령별 설명, 나머지 메뉴는 사용법 안내가 채워질 때까지 플레이스홀더.
 * 순서·의존의 단일 참조는 docs/ktds/PIPELINE_ORDER.md — 파이프라인이 바뀌면 함께 갱신.
 */

const STEPS: { cmd: string; label: string; desc: string; menus: string }[] = [
  {
    cmd: "/understand-map scan",
    label: "정적 스캔",
    desc: "소스 코드를 정적 분석해 파일 인벤토리·라우트·의존 관계·DB 접근 등 원자료를 추출합니다. 모든 분석의 뿌리로, 코드가 바뀌면 여기부터 다시 실행합니다.",
    menus: "전 메뉴 공통 기반",
  },
  {
    cmd: "/understand-map plan → confirm",
    label: "도메인 경계 확정",
    desc: "업무 도메인 후보를 산출하고 사람이 검토해 경계·그룹을 확정합니다(사람 게이트). 이 확정본이 이후 모든 재실행의 기준점이 됩니다.",
    menus: "도메인 메뉴의 계층 구조",
  },
  {
    cmd: "/understand-map map",
    label: "지도 생성",
    desc: "확정된 경계로 도메인 지도·구조 골격·시스템 맵·DB 스키마를 생성합니다.",
    menus: "도메인(구성·그래프 탭) · 데이터 · 프로그램 · 품질·위험",
  },
  {
    cmd: "/understand-map bundle → fill → emit",
    label: "도메인 채움",
    desc: "도메인별 업무 프로세스·흐름도·설명을 LLM으로 채우고 코드 근거(file:line)를 검증해 임베드합니다. 카드의 업무 수·근거율이 여기서 나옵니다.",
    menus: "도메인(업무 흐름도·근거율)",
  },
  {
    cmd: "/understand-screens",
    label: "화면설계서",
    desc: "라이브 앱을 구동해 화면을 캡처하고 주석·항목 설명을 채워 화면설계서를 만듭니다. understanding.config.json 의 screens 시나리오가 필요합니다.",
    menus: "화면설계서",
  },
  {
    cmd: "/understand-policy",
    label: "정책서",
    desc: "코드·DB 신호에서 정책 앵커를 추출한 뒤 LLM 이 규범 내용을 보강해 용어/데이터/검증/권한 정책서를 만듭니다.",
    menus: "정책서",
  },
  {
    cmd: "/understand-rtm",
    label: "요구사항 추적표",
    desc: "도메인 그래프에서 AS-IS 요구사항 추적표(RTM)를 생성합니다. 신규 요청 접수는 --intake, 변경 반영은 --change 모드로 이어집니다.",
    menus: "추적표",
  },
  {
    cmd: "/understand-impact",
    label: "변경 영향 분석",
    desc: "변경 요청(자연어)을 받아 영향 범위를 분석합니다. 대시보드 우상단 자연어 영향 분석 버튼으로도 실행됩니다.",
    menus: "변경·영향 · 그래프 탭 오버레이",
  },
  {
    cmd: "/understand-docs",
    label: "SI 산출물 문서",
    desc: "분석 산출물을 SI 표준 문서(테이블정의서·인터페이스정의서 등)로 생성합니다.",
    menus: "산출물",
  },
  {
    cmd: "/understand-report",
    label: "실적 보고서",
    desc: "git 커밋·분석 원장의 사실만 집계해 기간별 작업 실적 보고서를 만듭니다.",
    menus: "보고서",
  },
];

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const isHome = useViewMode() === null;

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
          <div>
            <h2 className="text-xl font-heading text-text-primary">{t.drawer.help}</h2>
            {isHome && (
              <p className="text-xs text-text-muted mt-1">CLI 명령 실행 순서와 각 명령이 채우는 메뉴</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isHome ? (
          // 메뉴별 사용법은 아직 미작성 — 채워질 때까지 플레이스홀더(홈만 1차 완성).
          <div className="p-6">
            <p className="text-sm text-text-muted">이 메뉴의 사용법 안내가 준비 중입니다.</p>
          </div>
        ) : (
        <div className="p-6 space-y-6">
          {/* ① 실행 순서 요약 */}
          <section>
            <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">실행 순서</h3>
            <ol className="space-y-1.5">
              {STEPS.map((s, i) => (
                <li key={s.cmd} className="flex items-baseline gap-2.5 text-sm">
                  <span className="shrink-0 w-5 text-right text-text-muted tabular-nums">{i + 1}.</span>
                  <code className="shrink-0 font-mono text-[12.5px] text-text-primary bg-elevated rounded px-1.5 py-0.5">
                    {s.cmd}
                  </code>
                  <span className="text-text-muted text-[12.5px] truncate">{s.label}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-text-muted mt-3">
              1~4단계가 도메인 분석의 척추입니다 — <code className="font-mono">/understand-onboard</code> 하나로 1~4를
              자동으로 이어 실행할 수 있고, 5단계부터는 필요한 산출물만 골라 실행합니다.
            </p>
          </section>

          {/* ② 명령별 설명 */}
          <section>
            <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">명령별 설명</h3>
            <div className="space-y-4">
              {STEPS.map((s, i) => (
                <div key={s.cmd} className="rounded-lg bg-elevated/50 px-4 py-3">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-text-muted text-xs tabular-nums">{i + 1}</span>
                    <code className="font-mono text-[13px] text-text-primary">{s.cmd}</code>
                    <span className="text-xs text-text-muted">— {s.label}</span>
                  </div>
                  <p className="text-[13px] text-text-secondary leading-relaxed">{s.desc}</p>
                  <p className="text-xs text-text-muted mt-1.5">
                    반영 메뉴 · <span className="text-text-secondary">{s.menus}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
