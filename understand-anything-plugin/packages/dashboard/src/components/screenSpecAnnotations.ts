/**
 * ktds-fork: 화면설계서 항목표의 순수 판정 로직 — 표시 라벨 유도와 공통 네비게이션 판정.
 * 뷰(ScreenSpecView.tsx)에서 분리해 테스트로 고정한다(flowSpineLayout.ts 관례).
 */

export interface BBox { x: number; y: number; width: number; height: number }
export interface Handler {
  target: string | null;
  chain: string[];
  evidence: Array<{ file: string; line: number }>;
  confidence: "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
}
export interface Annotation {
  no: number;
  kind: "field" | "action" | "link" | "region";
  selector: string;
  bbox: BBox;
  label: string;
  eventType: string;
  mechanical: { name: string | null; href: string | null; formAction: string | null; required: boolean };
  handler: Handler | null;
  description: string | null;
  note: string | null;
  /** 앱 셸 공통 크롬 region 태그(캡처가 el.closest 로 기록) — 있으면 화면 고유 사양에서 접는다. */
  region?: string | null;
}
export interface Screen {
  id: string;
  title: string;
  url: string;
  jspFile: string | null;
  domain: string | null;
  scenario: string | null;
  openedFrom: string | null;
  /** routes census 보조 시드로만 도달한 화면(메뉴 링크 없음) — 구버전 산출물엔 없다. */
  seededFrom?: "routes-census" | null;
  graphNodeId: string | null;
  capture: { path: string; width: number; height: number; capturedAt: string };
  summary: { text: string; confidence: string } | null;
  annotations: Annotation[];
}

/**
 * 라벨 추출 실패 표식 — 캡처 파서가 앵커의 텍스트를 못 찾으면 태그명("a")이나
 * 아이콘 글리프("?")가 그대로 올라온다(jpetstore 실측: 링크 260건 중 165건 = 45%).
 * 이런 행은 표에서 정보값이 0이라 href 에서 이름을 유도해 대체한다.
 */
const LABEL_JUNK = new Set(["a", "?", "img", "span", "div", "button", ""]);
export const isJunkLabel = (s: string) => LABEL_JUNK.has(s.trim().toLowerCase());

/**
 * href 에서 읽을 수 있는 이름을 유도한다 —
 *   "…/Cart.action?viewCart="          → "viewCart"
 *   "…?viewCategory=&categoryId=FISH"  → "viewCategory (FISH)"
 *   "../help.html"                     → "help.html"
 * 값 없는 쿼리 파라미터가 이벤트 이름(Stripes/Struts 관례), 값 있는 첫 파라미터가 인자.
 * 유도 실패는 null — 호출부가 원래 라벨을 그대로 쓴다(침묵 대체 금지).
 */
export function labelFromHref(href: string): string | null {
  const raw = href.trim().replace(/;jsessionid=[^/?#]*/i, "");
  if (!raw) return null;
  const q = raw.indexOf("?");
  if (q < 0) {
    // 쿼리 없는 정적 링크 — 경로 끝(파일명/호스트)이 사실상 이름.
    const base = raw.replace(/#.*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
    return base && !/^https?:$/i.test(base) ? base : null;
  }
  const params = raw
    .slice(q + 1)
    .split("&")
    .map((kv) => kv.split("="));
  const event = params.find(([k, v]) => k && !v)?.[0];
  if (!event) return null;
  const arg = params.find(([k, v]) => k && v)?.[1];
  if (!arg) return event;
  try {
    return `${event} (${decodeURIComponent(arg)})`;
  } catch {
    return `${event} (${arg})`;
  }
}

/**
 * 표시된 항목명의 출처 — 뷰가 이걸로 표기를 가른다.
 *   override = 사람이 확정한 이름 / parser = 캡처가 읽은 화면 텍스트
 *   name     = 입력 파라미터명(정식 식별자) / href = 링크 주소에서 유도(검토 권장)
 */
export type LabelSource = "override" | "parser" | "name" | "href";
export interface DisplayLabel { text: string; source: LabelSource }

/**
 * 표시용 항목명 — 사람 override > (입력 항목) mechanical.name > 파서 라벨 > href 유도.
 *
 * 입력 항목에서 name 을 파서 라벨보다 앞세우는 이유: 캡처 파서는 input 에 값이 있으면
 * 그 값을 라벨로 올린다 — jpetstore Account 편집 화면의 입력 17개 중 14개가 "ABC",
 * "Palo Alto", "true" 처럼 항목명이 아니라 입력값이었다. mechanical.name 은
 * account.firstName 처럼 정식 파라미터명이고, SI 화면설계서의 "항목" 열 관례와도 맞는다.
 * region 은 입력이 아니므로 대상 밖.
 */
export function displayLabel(a: Annotation, override: string | undefined): DisplayLabel {
  if (override !== undefined) return { text: override, source: "override" };
  if (a.kind === "field" && a.mechanical.name) return { text: a.mechanical.name, source: "name" };
  if (!isJunkLabel(a.label)) return { text: a.label, source: "parser" };
  const from = a.mechanical.href ? labelFromHref(a.mechanical.href) : null;
  return from ? { text: from, source: "href" } : { text: a.label, source: "parser" };
}

/** 공통 판정 임계값 — 전체 화면의 25%, 최소 3화면. */
export const commonNavThreshold = (screenCount: number) => Math.max(3, Math.ceil(screenCount * 0.25));

/**
 * 공통 네비게이션(GNB·푸터) 판정 — 같은 href 링크가 전체 화면의 25% 이상(최소 3화면)에
 * 등장하면 화면 고유 정보가 아니라고 보고 표에서 접는다. jpetstore 실측으로 링크 260건 중
 * 219건(84%)이 전 화면 반복분이라, 접기 전까지는 표의 절반이 같은 헤더 링크로 채워진다.
 * SI 화면설계서가 공통 영역을 화면마다 반복 기술하지 않는 관례와 같은 취급.
 * field/action 은 반복돼도 그 화면의 고유 사양이므로 대상 밖 — 링크에만 적용한다.
 */
export function computeCommonHrefs(screens: Screen[]): ReadonlySet<string> {
  const byHref = new Map<string, Set<string>>();
  for (const s of screens) {
    for (const a of s.annotations) {
      if (a.kind !== "link") continue;
      const h = a.mechanical.href;
      if (!h) continue;
      let ids = byHref.get(h);
      if (!ids) byHref.set(h, (ids = new Set()));
      ids.add(s.id);
    }
  }
  const threshold = commonNavThreshold(screens.length);
  const common = new Set<string>();
  for (const [h, ids] of byHref) if (ids.size >= threshold) common.add(h);
  return common;
}

/**
 * 비링크(버튼·입력) 공통 판정 임계 — 전체 화면의 80%, 최소 3화면(결함 2).
 * 링크(25%)보다 훨씬 높다: 버튼·입력은 반복돼도 대체로 그 화면의 고유 사양이라
 * (기존 test 가 못박은 원칙) 거의 전 화면 반복(상단바 로그아웃·저장·⌘K)일 때만 접는다.
 * 구조 신호(region 태그)가 있으면 임계와 무관하게 접으므로, 이 빈도 축은 region 이
 * 없는(구버전 산출물·커스텀 셸) 경우의 폴백이다.
 */
export const commonChromeThreshold = (screenCount: number) => Math.max(3, Math.ceil(screenCount * 0.8));

/** 비링크 공통 판정 키 — 같은 종류+라벨(정규화). href 없는 상태 버튼·입력의 반복 식별. */
const chromeKeyOf = (a: Annotation): string => `${a.kind}|${(a.label ?? "").replace(/\s+/g, " ").trim()}`;

export interface CommonChrome {
  /** 공통 링크 href(25% 임계) — 기존 computeCommonHrefs 와 동일. */
  linkHrefs: ReadonlySet<string>;
  /** 공통 버튼·입력 키(kind|label, 80% 임계). */
  chromeKeys: ReadonlySet<string>;
}

/**
 * 공통 크롬(앱 셸) 판정 재료(결함 2) — 좌측 내비·상단바처럼 전 화면 반복되는 요소를
 * 화면 고유 사양에서 접기 위한 빈도 집계. 링크는 href 25%, 비링크는 kind|label 80%.
 * region 태그(구조 신호)는 isCommonChrome 이 별도로 최우선 반영한다.
 */
export function computeCommonChrome(screens: Screen[]): CommonChrome {
  const linkHrefs = computeCommonHrefs(screens);
  const byKey = new Map<string, Set<string>>();
  for (const s of screens) {
    for (const a of s.annotations) {
      if (a.kind === "link") continue; // 링크는 href 축이 담당
      const k = chromeKeyOf(a);
      let ids = byKey.get(k);
      if (!ids) byKey.set(k, (ids = new Set()));
      ids.add(s.id);
    }
  }
  const threshold = commonChromeThreshold(screens.length);
  const chromeKeys = new Set<string>();
  for (const [k, ids] of byKey) if (ids.size >= threshold) chromeKeys.add(k);
  return { linkHrefs, chromeKeys };
}

/**
 * 이 주석이 앱 셸 공통 크롬인가(결함 2) — 화면 고유 사양이 아니라 접기 대상.
 *  1) 구조 신호 최우선: region 태그가 있으면 무조건 공통(캡처가 nav/header 안에서 관측).
 *  2) 빈도 폴백: 링크는 공통 href, 비링크는 공통 kind|label(region 없는 산출물 대비).
 */
export function isCommonChrome(a: Annotation, common: CommonChrome): boolean {
  if (a.region) return true;
  if (a.kind === "link") return !!a.mechanical.href && common.linkHrefs.has(a.mechanical.href);
  return common.chromeKeys.has(chromeKeyOf(a));
}
