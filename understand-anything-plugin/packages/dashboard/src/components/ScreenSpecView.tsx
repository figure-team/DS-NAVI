import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useDashboardStore } from "../store";
import { parseBusinessFlows } from "../utils/businessFlow";
import TrustBadge from "./TrustBadge";
import { Badge, BtnAccent, BtnOutline, ConfBadge, Ev, PageHead, type ConfKind } from "./proto/Proto";

/**
 * ktds-fork (S4): 화면설계서 뷰 — SI 화면설계서 슬라이드 재현.
 * 좌: 도메인별 화면 목록(통합 검색) / 우: 캡처 + 번호 배지 오버레이(①②③=입력, ⓐⓑⓒ=이벤트/링크)
 * + 하단 범례 표(항목/이벤트/동작/설명/근거/신뢰도).
 * 데이터: screens.json(생성물, 불변) + screen-overrides.json(사람 편집) 클라이언트 병합.
 * 배지는 PNG 에 굽지 않고 bbox(문서 좌표)를 %로 환산해 오버레이한다.
 * 선택·검색은 URL(?screen=&q=)로 이관 — 딥링크·새로고침·뒤로가기 동작(데이터 맵 관례).
 */

interface BBox { x: number; y: number; width: number; height: number }
interface Handler {
  target: string | null;
  chain: string[];
  evidence: Array<{ file: string; line: number }>;
  confidence: "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";
}
interface Annotation {
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
}
interface Screen {
  id: string;
  title: string;
  url: string;
  jspFile: string | null;
  domain: string | null;
  scenario: string | null;
  openedFrom: string | null;
  graphNodeId: string | null;
  capture: { path: string; width: number; height: number; capturedAt: string };
  summary: { text: string; confidence: string } | null;
  annotations: Annotation[];
}
interface ScreensFile {
  baseUrl: string;
  screens: Screen[];
  unmatchedJsps: string[];
  fragments: string[];
  missing: Array<{ url: string; reason: string }>;
}
interface AnnOverride { description?: string; label?: string; note?: string; hidden?: boolean }
interface ScreenOverride {
  approver: string;
  at: string;
  titleOverride?: string;
  annotations?: Record<string, AnnOverride>;
  confirmed: boolean;
}

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";
const CIRCLED_LETTERS = "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ";
const CIRCLED_UPPER = "ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ";
function glyphTable(kind: Annotation["kind"]): string {
  return kind === "field" || kind === "region"
    ? CIRCLED_DIGITS
    : kind === "action"
      ? CIRCLED_LETTERS
      : CIRCLED_UPPER;
}
function badgeGlyph(kind: Annotation["kind"], no: number): string {
  return [...glyphTable(kind)][no - 1] ?? `(${no})`;
}
const annKey = (a: Annotation) => `${a.kind}:${a.no}`;

/** 종류별 배지 색상 — 입력=남색 / 버튼·이벤트=금색 / 링크=회색. 캡처(bg-white) 위 오버레이 전용 고정색. */
type KindStyle = { bg: string; fg: string; border: string };
const KIND_STYLE: Record<string, KindStyle> = {
  field: { bg: "#2f5d8a", fg: "#ffffff", border: "#2f5d8a" },
  region: { bg: "#2f5d8a", fg: "#ffffff", border: "#2f5d8a" },
  action: { bg: "var(--color-accent)", fg: "#141414", border: "var(--color-accent)" },
  link: { bg: "#55585c", fg: "#ececec", border: "#8a8d92" },
};
const kindStyle = (kind: string): KindStyle => KIND_STYLE[kind] ?? KIND_STYLE.link;
/** 패널(테마 적응) 위 스와치·번호 색 — 캡처 밖이라 고정 hex 대신 시맨틱 토큰으로 보정. */
const KIND_SWATCH_TOKEN: Record<string, string> = {
  field: "var(--color-status-info)",
  region: "var(--color-status-info)",
  action: "var(--color-accent)",
  link: "var(--color-text-muted)",
};
const kindSwatch = (kind: string): string => KIND_SWATCH_TOKEN[kind] ?? KIND_SWATCH_TOKEN.link;
/** 범례 섹션 순서 — 입력 → 버튼·이벤트 → 링크. */
const KIND_ORDER: Array<Annotation["kind"]> = ["field", "region", "action", "link"];
/** 배지 토글 단위 — region 은 색·글리프를 field 와 공유하므로 같이 묶는다. */
const kindGroup = (k: string): string => (k === "region" ? "field" : k);
const KIND_SECTION: Record<string, string> = {
  field: "입력 항목",
  region: "영역",
  action: "버튼·이벤트",
  link: "링크(이동)",
};

const DOMAIN_LABEL: Record<string, string> = {
  account: "계정(account)",
  cart: "장바구니(cart)",
  catalog: "카탈로그(catalog)",
  order: "주문(order)",
  common: "공통(common)",
};
/**
 * 신뢰도 표시 — 전부 정적 분석 자동 판정(사람 확정 아님)이라 "확정" 계열 라벨을 피한다.
 * 사람 확정은 selOv.confirmed / TrustBadge 로 시각·문구를 분리한다(데이터 맵 CrudTab 관례).
 */
const MECH_CONF: Record<string, { kind: ConfKind; label: string; title: string }> = {
  CONFIRMED: { kind: "fix", label: "근거확보", title: "결정적 정적 분석이 코드에서 근거(file:line)를 직접 추적함 — 규칙 기반이라 재현 가능" },
  CONFIRMED_AI: { kind: "ai", label: "근거확보(AI)", title: "정적 분석이 잇지 못한 연결을 AI가 코드를 읽어 보완 판정한 근거 — file:line 은 있으나 검토 권장" },
  INFERRED: { kind: "est", label: "추정", title: "핸들러 미검출 또는 메서드명 추론 — 기계 판정" },
  UNVERIFIED: { kind: "chk", label: "확인 필요", title: "근거 없음 — 확인 필요" },
};
const mechConf = (c: string) => MECH_CONF[c] ?? MECH_CONF.INFERRED;
/** 신뢰도 카운트 요약 순서. */
const CONF_ORDER = ["CONFIRMED", "CONFIRMED_AI", "INFERRED", "UNVERIFIED"];
const KIND_LABEL: Record<string, string> = {
  field: "입력",
  action: "이벤트",
  link: "링크",
  region: "영역",
};
const APPROVER_LS_KEY = "ktds.approver";

/** 캡처 표시 상한(px) — 원본 크기 그대로 보이되 이 폭을 넘으면 축소. */
const MAX_CAPTURE_WIDTH = 1120;

/** 캡처 여백 자동 제거 결과(문서 좌표). null = 제거 실패/무의미 → 원본 그대로. */
interface CaptureCrop { x: number; y: number; width: number; height: number }
/** 화면 id → 트림 결과 캐시 — 캔버스 스캔은 화면당 1회면 충분하다. */
const TRIM_CACHE = new Map<string, CaptureCrop | null>();
const TRIM_TOLERANCE = 8;
const TRIM_PAD = 10;

/**
 * 고정 뷰포트 캡처(1280×800)의 바깥 여백(브라우저 배경 단색)을 잘라낸다 —
 * 우하단 모서리 픽셀을 배경색으로 보고 네 변에서 배경뿐인 행/열을 걷어낸다.
 * 실패(캔버스 불가·과도 축소)는 null 로 원본 폴백. 같은 오리진 이미지 전용.
 */
function computeTrim(img: HTMLImageElement): CaptureCrop | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 2 || h < 2) return null;
  try {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const c0 = ((h - 1) * w + (w - 1)) * 4;
    const isBg = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return (
        Math.abs(data[i] - data[c0]) <= TRIM_TOLERANCE &&
        Math.abs(data[i + 1] - data[c0 + 1]) <= TRIM_TOLERANCE &&
        Math.abs(data[i + 2] - data[c0 + 2]) <= TRIM_TOLERANCE
      );
    };
    const rowBg = (y: number) => {
      for (let x = 0; x < w; x++) if (!isBg(x, y)) return false;
      return true;
    };
    const colBg = (x: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) if (!isBg(x, y)) return false;
      return true;
    };
    let top = 0;
    let bottom = h - 1;
    let left = 0;
    let right = w - 1;
    while (bottom > top && rowBg(bottom)) bottom--;
    while (top < bottom && rowBg(top)) top++;
    while (right > left && colBg(right, top, bottom)) right--;
    while (left < right && colBg(left, top, bottom)) left++;
    if (right - left < 80 || bottom - top < 60) return null; // 퇴화 — 사실상 빈 캡처
    const x = Math.max(0, left - TRIM_PAD);
    const y = Math.max(0, top - TRIM_PAD);
    const crop: CaptureCrop = {
      x,
      y,
      width: Math.min(w, right + 1 + TRIM_PAD) - x,
      height: Math.min(h, bottom + 1 + TRIM_PAD) - y,
    };
    // 여백이 거의 없으면(<3%) 트림 무의미 — 원본 유지로 레이아웃 흔들림 방지.
    if (crop.width * crop.height > w * h * 0.97) return null;
    return crop;
  } catch {
    return null;
  }
}

/**
 * 설명 문장에 박혀 있는 "근거: File.java:129, 상수 :48" 인용을 분리한다 —
 * 본문은 근거 없이 읽히게 다듬고(빈 괄호·꼬리 쉼표 정리), 인용은 별도 행에서
 * 코드 뷰어 칩으로 렌더한다. 근거 표기가 없으면 원문 그대로.
 */
function extractSummaryEvidence(raw: string): { text: string; evidence: string | null } {
  const m = raw.match(/[,，]?\s*근거\s*[:：]\s*([^)）]*)/);
  if (!m || m.index === undefined) return { text: raw, evidence: null };
  const text = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length))
    .replace(/[(（]\s*[)）]/g, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, evidence: m[1].trim() };
}

/** 근거 세그먼트의 렌더 조각 — ref 는 코드 뷰어 칩, text 는 그대로(예: "ERROR 상수"). */
type EvidencePart =
  | { type: "ref"; display: string; file: string; line: number }
  | { type: "text"; display: string };

/**
 * "CartActionBean.java:137, 상수 :42" / "A.java:125-127 → B.java:151" 를 조각으로.
 * 파일 없는 ":42" 축약은 직전 파일을 상속하고, basename 은 resolve 로 저장소
 * 경로를 찾는다(실패 시 텍스트로 강등 — 침묵 누락 없이 원문 보존).
 */
function parseEvidenceParts(evidence: string, resolve: (base: string) => string | null): EvidencePart[] {
  const parts: EvidencePart[] = [];
  let lastFile: string | null = null;
  for (const t of evidence.split(/([,，→])/)) {
    const tok = t.trim();
    if (!tok) continue;
    if (tok === "," || tok === "，") {
      parts.push({ type: "text", display: ", " });
      continue;
    }
    if (tok === "→") {
      parts.push({ type: "text", display: " → " });
      continue;
    }
    const fm = tok.match(/^(.*?)([\w$.-]+\.[A-Za-z]\w*)\s*:\s*(\d+)(?:\s*-\s*\d+)?$/);
    if (fm) {
      const path = resolve(fm[2]);
      if (path) {
        lastFile = path;
        parts.push({ type: "ref", display: tok, file: path, line: Number(fm[3]) });
        continue;
      }
    }
    const lm = tok.match(/^(.+?)?\s*:\s*(\d+)(?:\s*-\s*\d+)?$/);
    if (!fm && lm && lastFile) {
      parts.push({ type: "ref", display: tok, file: lastFile, line: Number(lm[2]) });
      continue;
    }
    parts.push({ type: "text", display: tok });
  }
  return parts;
}

/** 화면 식별 메타 한 행 — 라벨은 hover 툴팁으로 뜻을 설명한다(그리드 2열에 펼쳐짐). */
function MetaRow({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <>
      <span
        className="text-text-muted whitespace-nowrap"
        title={help}
        style={{ fontSize: 11, fontWeight: 650, cursor: "help", paddingTop: 1.5, borderBottom: "1px dotted var(--color-border-medium)", alignSelf: "start", justifySelf: "start" }}
      >
        {label}
      </span>
      <span className="text-text-secondary break-all" style={{ fontSize: 12, lineHeight: 1.55 }}>
        {children}
      </span>
    </>
  );
}

/** 검색어 매치 하이라이트 — 첫 매치만 강조(시맨틱 accent). */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent text-accent font-semibold">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/**
 * 미매핑 JSP·도달 실패 배너(데이터 맵 UnresolvedBanner 패턴을 이 파일에 로컬 복제).
 * severity 접이식 카드로 침묵 누락 대신 건수를 항상 표면화한다.
 */
function SpecFold({ title, sub, entries }: { title: string; sub: string; entries: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg border border-border-subtle bg-panel"
      style={{ borderLeft: "3px solid var(--color-status-warn)", padding: "8px 14px", marginBottom: 10 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-0"
        style={{ font: "inherit" }}
      >
        <span style={{ fontSize: 9, width: 10 }}>{open ? "▾" : "▸"}</span>
        <span className="text-text-primary" style={{ fontSize: 13, fontWeight: 650 }}>
          {title}
        </span>
        <span className="text-text-muted" style={{ fontSize: 12 }}>
          {sub}
        </span>
      </button>
      {open && (
        <ul style={{ margin: "8px 0 4px", paddingLeft: 24 }} className="space-y-0.5">
          {entries.map((e) => (
            <li key={e} className="break-all">
              <Ev>{e}</Ev>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScreenSpecView() {
  const accessToken = useDashboardStore((s) => s.accessToken);
  const approverHandle = useDashboardStore((s) => s.approverHandle);
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
  const dataBase = import.meta.env.BASE_URL;
  const tokenQ = accessToken && !DEMO_MODE ? `?token=${encodeURIComponent(accessToken)}` : "";
  const canWrite = Boolean(accessToken) && !DEMO_MODE;

  const [searchParams, setSearchParams] = useSearchParams();
  const selId = searchParams.get("screen");
  const q = searchParams.get("q") ?? "";
  const setParam = (k: string, v: string | null, replace = false) =>
    setSearchParams(
      (prev) => {
        if (v) prev.set(k, v);
        else prev.delete(k);
        return prev;
      },
      { replace },
    );

  const [file, setFile] = useState<ScreensFile | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ScreenOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAnn, setDraftAnn] = useState<Record<string, AnnOverride>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trim, setTrim] = useState<CaptureCrop | null>(null);
  // 좌측 목록 — 도메인 그룹 접기(기본 전부 접힘). 검색 중에는 강제 전개.
  const [openDomains, setOpenDomains] = useState<ReadonlySet<string>>(new Set());
  // 배지 색상 키 토글 — 켜진 종류만 캡처 위에 배지를 그린다(표는 전수 유지).
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(new Set());
  // 캡처 배지 클릭 → 범례 표 해당 행으로 스크롤 + 잠깐 강조(flash).
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  const jumpToRow = (key: string) => {
    setHoverKey(key);
    rowRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 1600);
  };

  // 선택 화면이 바뀌면 편집·hover·캡처 오류 상태를 초기화한다(URL 이관 후 onClick 대체).
  useEffect(() => {
    setEditing(false);
    setHoverKey(null);
    setImgError(false);
    setFlashKey(null);
  }, [selId]);

  const load = useCallback(() => {
    setError(null);
    fetch(`${dataBase}screens.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ScreensFile) => {
        if (Array.isArray(data?.screens)) setFile(data);
        else setError("screens.json 형식 오류");
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
    fetch(`${dataBase}screen-overrides.json${tokenQ}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setOverrides(data as Record<string, ScreenOverride>);
        }
      })
      .catch(() => {});
  }, [dataBase, tokenQ]);
  useEffect(() => {
    load();
  }, [load]);

  const title = (s: Screen) => overrides[s.id]?.titleOverride ?? s.title;

  // 통합 검색 대상 — 제목·URL·JSP·주석 label/target(각 화면 자신의 override 반영).
  const screenHay = useCallback(
    (s: Screen) => {
      const ov = overrides[s.id];
      const parts = [ov?.titleOverride ?? s.title, s.url, s.jspFile ?? ""];
      for (const a of s.annotations) {
        parts.push(ov?.annotations?.[annKey(a)]?.label ?? a.label);
        if (a.handler?.target) parts.push(a.handler.target);
      }
      return parts.join("\n").toLowerCase();
    },
    [overrides],
  );

  const ql = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const byDomain = new Map<string, Screen[]>();
    for (const s of file?.screens ?? []) {
      if (ql && !screenHay(s).includes(ql)) continue;
      const key = s.domain ?? "기타";
      byDomain.set(key, [...(byDomain.get(key) ?? []), s]);
    }
    return [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [file, ql, screenHay]);

  const sel = useMemo(
    () => file?.screens.find((s) => s.id === selId) ?? file?.screens[0] ?? null,
    [file, selId],
  );
  const selOv = sel ? overrides[sel.id] : undefined;
  const merged = useCallback(
    (a: Annotation): { description: string | null; label: string; note: string | null; hidden: boolean } => {
      const o = selOv?.annotations?.[annKey(a)];
      return {
        description: o?.description ?? a.description,
        label: o?.label ?? a.label,
        note: o?.note ?? a.note,
        hidden: o?.hidden ?? false,
      };
    },
    [selOv],
  );

  const imgSrc = (s: Screen) =>
    DEMO_MODE
      ? `${dataBase}${s.capture.path}`
      : `/screen-asset?path=${encodeURIComponent(s.capture.path)}&token=${encodeURIComponent(accessToken ?? "")}`;

  // 화면 전환 시 트림 상태 동기화 — 캐시 히트면 즉시, 아니면 onLoad 에서 채운다.
  useEffect(() => {
    setTrim(sel ? (TRIM_CACHE.get(sel.id) ?? null) : null);
  }, [sel]);

  // ?screen= 딥링크/선택 시 해당 도메인 그룹만 자동 전개(기본은 전부 접힘 유지).
  useEffect(() => {
    if (!selId || !file) return;
    const s = file.screens.find((x) => x.id === selId);
    if (!s) return;
    const key = s.domain ?? "기타";
    setOpenDomains((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, [selId, file]);
  const toggleDomain = (d: string) =>
    setOpenDomains((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  /**
   * 업무 흐름도 딥링크 — 화면 URL(actions/Cart.action?viewCart=)을 domain-graph 의
   * flow 노드 id("flow:<METHOD> <경로>?<이벤트>")와 대조하고, 그 flow 를 flowRef 로
   * 참조하는 업무 프로세스(businessFlows[])까지 찾아 해당 챕터(?view=business&bf=)로
   * 직행한다. 폴백 사다리: 업무 흐름도 챕터 → 기능 흐름도 스파인(?flow=, 어떤
   * 프로세스도 이 flow 를 안 쓸 때) → 도메인 워크스페이스(흐름 미매칭) → 링크 없음.
   */
  const bizLink = useMemo(() => {
    if (!domainGraph || !sel) return null;
    const flowDomain = new Map<string, string>();
    for (const e of domainGraph.edges) {
      if (String(e.source).startsWith("domain:") && String(e.target).startsWith("flow:")) {
        flowDomain.set(String(e.target), String(e.source));
      }
    }
    const byUrl = new Map<string, string>();
    for (const n of domainGraph.nodes) {
      if (n.type !== "flow" || !n.id.startsWith("flow:")) continue;
      const sp = n.id.indexOf(" ");
      if (sp > 0) byUrl.set(n.id.slice(sp + 1), n.id);
    }
    const [pathPart, queryPart] = sel.url.split("?");
    const path = `/${pathPart.replace(/^\//, "")}`;
    // 값 없는 쿼리 파라미터(viewCart= 등)가 이벤트 이름 — 경로 단독은 마지막 후보.
    const candidates = (queryPart ?? "")
      .split("&")
      .map((kv) => kv.split("="))
      .filter(([k, v]) => k && !v)
      .map(([k]) => `${path}?${k}`);
    candidates.push(path);
    for (const c of candidates) {
      const flowId = byUrl.get(c);
      if (!flowId) continue;
      const domainId = flowDomain.get(flowId) ?? (sel.domain ? `domain:${sel.domain}` : null);
      if (!domainId) continue;
      const domainNode = domainGraph.nodes.find((n) => n.id === domainId);
      const bfIdx = parseBusinessFlows(domainNode).findIndex((p) =>
        p.flow.nodes.some((n) => n.flowRef === flowId),
      );
      if (bfIdx >= 0) {
        return {
          to: `/domains/${domainId}?view=business${bfIdx > 0 ? `&bf=${bfIdx}` : ""}`,
          label: "업무 흐름도 →",
          title: "이 화면의 기능이 등장하는 업무 프로세스 순서도로 이동",
        };
      }
      return {
        to: `/domains/${domainId}?view=code&flow=${encodeURIComponent(flowId)}`,
        label: "기능 흐름도 →",
        title: "업무 흐름도에는 이 기능이 없어 기능 탭의 호출 흐름(스파인)으로 이동",
      };
    }
    const domainId = sel.domain ? `domain:${sel.domain}` : null;
    if (domainId && domainGraph.nodes.some((n) => n.id === domainId)) {
      return {
        to: `/domains/${domainId}`,
        label: "업무 지도 →",
        title: "흐름 매칭 실패 — 도메인 워크스페이스로 이동",
      };
    }
    return null;
  }, [domainGraph, sel]);

  // 설명 인용의 basename(AccountActionBean.java) → 저장소 경로 해석 맵 —
  // 전 화면의 핸들러 근거·렌더 JSP 에서 수집(코드 뷰어는 저장소 경로가 필요).
  const evidencePathMap = useMemo(() => {
    const map = new Map<string, string>();
    const add = (p: string | null | undefined) => {
      if (!p) return;
      const base = p.split("/").pop();
      if (base && !map.has(base)) map.set(base, p);
    };
    for (const s of file?.screens ?? []) {
      add(s.jspFile);
      for (const a of s.annotations) for (const ev of a.handler?.evidence ?? []) add(ev.file);
    }
    return map;
  }, [file]);

  // 설명 본문(근거 인용 제거)과 근거 칩 조각 — 인용이 없으면 evidenceParts=null.
  const summaryInfo = useMemo(() => {
    if (!sel?.summary) return null;
    const { text, evidence } = extractSummaryEvidence(sel.summary.text);
    return {
      text,
      confidence: sel.summary.confidence,
      evidenceParts: evidence
        ? parseEvidenceParts(evidence, (base) => evidencePathMap.get(base) ?? null)
        : null,
    };
  }, [sel, evidencePathMap]);

  const startEdit = () => {
    if (!sel) return;
    setDraftTitle(title(sel));
    const d: Record<string, AnnOverride> = {};
    for (const a of sel.annotations) {
      const m = merged(a);
      d[annKey(a)] = {
        description: m.description ?? "",
        note: m.note ?? "",
        hidden: m.hidden,
      };
    }
    setDraftAnn(d);
    setSaveError(null);
    setEditing(true);
  };

  const save = async (confirmOnly: boolean) => {
    if (!sel || !accessToken) return;
    let approver = approverHandle || localStorage.getItem(APPROVER_LS_KEY) || "";
    if (!approver) {
      approver = window.prompt("확정자 핸들(이름/사번)을 입력하세요:")?.trim() ?? "";
      if (!approver) return;
      localStorage.setItem(APPROVER_LS_KEY, approver);
    }
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = { screenId: sel.id, approver };
    if (!confirmOnly) {
      body.titleOverride = draftTitle;
      const ann: Record<string, AnnOverride> = {};
      for (const a of sel.annotations) {
        const d = draftAnn[annKey(a)];
        if (!d) continue;
        const entry: AnnOverride = {};
        if ((d.description ?? "") !== (a.description ?? "")) entry.description = d.description;
        if ((d.note ?? "") !== (a.note ?? "")) entry.note = d.note;
        if (d.hidden) entry.hidden = true;
        if (Object.keys(entry).length > 0) ann[annKey(a)] = entry;
      }
      body.annotations = ann;
    }
    try {
      const res = await fetch(`/screen-override?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      load();
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        화면설계서 데이터를 불러올 수 없습니다: {error} — 먼저 /understand-screens 를 실행하세요.
      </div>
    );
  }
  if (!file || !sel) {
    return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">불러오는 중…</div>;
  }

  const visibleAnns = sel.annotations.filter((a) => !merged(a).hidden);
  // 캡처 위에 실제로 그릴 배지 — 색상 키 토글로 꺼진 종류는 제외(표·통계는 전수 유지).
  const overlayAnns = visibleAnns.filter((a) => !hiddenKinds.has(kindGroup(a.kind)));
  const notes = visibleAnns.filter((a) => merged(a).note);
  // 신뢰도별 카운트(핸들러 있는 주석만) + 핸들러 없음 — 스케일 대비 상단 요약.
  const confCounts = new Map<string, number>();
  for (const a of visibleAnns) {
    if (a.handler) confCounts.set(a.handler.confidence, (confCounts.get(a.handler.confidence) ?? 0) + 1);
  }
  const noHandler = visibleAnns.filter((a) => !a.handler).length;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-root" style={{ padding: "24px 28px 48px" }}>
      {/* pmpl-proto page-head — 미매핑·도달 실패·프래그먼트는 침묵 누락 대신 헤더 메타로 표면화 */}
      <PageHead
        title="화면설계서"
        meta={
          <>
            화면 <b className="text-text-primary tabular-nums">{file.screens.length}</b>
            {" · "}도달 실패 <b className="text-text-primary tabular-nums">{file.missing.length}</b>건
            {" · "}미매핑 <b className="text-text-primary tabular-nums">{file.unmatchedJsps.length}</b>건
            {" · "}프래그먼트 <b className="text-text-primary tabular-nums">{file.fragments?.length ?? 0}</b>건
          </>
        }
      />

      {/* 미매핑 JSP·도달 실패 — severity 접이식 배너(데이터 맵 패턴 로컬 복제) */}
      {(file.unmatchedJsps.length > 0 || file.missing.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          {file.unmatchedJsps.length > 0 && (
            <SpecFold
              title={`미매핑 JSP ${file.unmatchedJsps.length}건`}
              sub="— 화면 URL 로 도달하지 못해 캡처가 없는 JSP"
              entries={file.unmatchedJsps}
            />
          )}
          {file.missing.length > 0 && (
            <SpecFold
              title={`도달 실패 ${file.missing.length}건`}
              sub="— 요청했으나 응답에 실패한 URL"
              entries={file.missing.map((m) => `${m.url} — ${m.reason}`)}
            />
          )}
        </div>
      )}

      {/* 프로토 .scr — 좌 260px 트리 카드 + 우 상세 카드 */}
      <div className="grid items-start grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]" style={{ gap: 14 }}>
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow proto-tree">
          {/* 통합 검색 — 제목·URL·JSP·주석 매칭(?q= 이관, 히스토리 오염 방지 replace) */}
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              type="search"
              value={q}
              onChange={(e) => setParam("q", e.target.value || null, true)}
              placeholder="화면·URL·항목 검색"
              className="w-full rounded-lg border border-border-medium bg-panel text-text-primary placeholder:text-text-muted"
              style={{ padding: "6px 10px", fontSize: 12.5 }}
            />
          </div>
          {groups.map(([domain, screens]) => {
            // 검색 중에는 접힘 상태를 무시하고 매칭 그룹을 전부 펼쳐 보여준다.
            const open = ql !== "" || openDomains.has(domain);
            return (
              <div key={domain} style={{ marginTop: 2 }}>
                {/* 그룹 헤더 — 자식(.doc)과 같은 행 리듬(패딩·라운드·호버), 카운트는 우측 배지 */}
                <button
                  type="button"
                  onClick={() => toggleDomain(domain)}
                  className="flex items-center w-full text-left cursor-pointer bg-transparent border-0 rounded-[7px] hover:bg-elevated"
                  style={{ padding: "6px 8px", gap: 7, fontFamily: "inherit" }}
                  aria-expanded={open}
                >
                  <span
                    className="inline-flex justify-center text-text-muted"
                    style={{
                      fontSize: 9,
                      width: 10,
                      flex: "none",
                      transition: "transform 0.12s ease",
                      transform: open ? "rotate(90deg)" : "none",
                    }}
                  >
                    ▸
                  </span>
                  <span className="truncate text-text-primary" style={{ fontSize: 12.5, fontWeight: 650 }}>
                    {DOMAIN_LABEL[domain] ?? domain}
                  </span>
                  <span
                    className="tabular-nums text-text-muted bg-elevated rounded-full"
                    style={{ marginLeft: "auto", flex: "none", fontSize: 10.5, fontWeight: 600, padding: "1px 7px" }}
                  >
                    {screens.length}
                  </span>
                </button>
                {/* 자식 목록 — 셰브런 축에 맞춘 가이드 라인으로 그룹 소속을 붙여 보인다 */}
                {open && (
                  <div
                    style={{
                      margin: "2px 0 6px 12px",
                      paddingLeft: 6,
                      borderLeft: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    {screens.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setParam("screen", s.id)}
                        className={`doc ${s.id === sel.id ? "on" : ""}`}
                        title={s.scenario ? `시나리오 ${s.scenario} 로 도달` : undefined}
                      >
                        <span className="truncate" style={{ minWidth: 0 }}>
                          <Highlight text={title(s)} q={ql} />
                        </span>
                        {overrides[s.id]?.confirmed && (
                          <span className="st"><Badge tone="ok">확정</Badge></span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <div className="text-text-muted" style={{ padding: "8px 10px", fontSize: 12 }}>
              검색 결과 없음
            </div>
          )}
        </div>

        {/* 우: 상세 카드 — 제목 + URL + 배지 + 액션 / dmeta / 캡처 + 배지 오버레이 / 범례 표 */}
        <div className="rounded-[10px] border border-border-subtle bg-panel card-shadow" style={{ padding: "18px 22px" }}>
          <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 4 }}>
            {editing ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="bg-elevated border border-border-subtle rounded px-2 py-1 text-text-primary"
                style={{ fontSize: 15, fontWeight: 700, minWidth: 240 }}
              />
            ) : (
              <b className="text-text-primary" style={{ fontSize: 15 }}>{title(sel)}</b>
            )}
            {bizLink && (
              <Link
                to={bizLink.to}
                className="whitespace-nowrap font-semibold hover:underline"
                style={{ fontSize: 11.5, color: "var(--color-status-info)", textDecoration: "none" }}
                title={bizLink.title}
              >
                {bizLink.label}
              </Link>
            )}
            {selOv?.confirmed ? <TrustBadge confirmedBy={selOv.approver} /> : <Badge tone="info">초안</Badge>}
            <div className="flex-1" />
            {saveError && <span style={{ fontSize: 11, color: "var(--color-status-warn)" }}>저장 실패: {saveError}</span>}
            {canWrite && (
              editing ? (
                <>
                  <BtnOutline sm onClick={() => setEditing(false)}>취소</BtnOutline>
                  <BtnAccent sm onClick={() => void save(false)} disabled={saving}>{saving ? "저장 중…" : "저장·확정"}</BtnAccent>
                </>
              ) : (
                <>
                  <BtnOutline sm onClick={startEdit}>편집</BtnOutline>
                  {!selOv?.confirmed && (
                    <BtnAccent sm onClick={() => void save(true)} disabled={saving}>확정</BtnAccent>
                  )}
                </>
              )
            )}
          </div>
          {/* 화면 식별 메타 카드 — 호출 URL·렌더 JSP·시나리오·진입 경로를 라벨:값으로 정리.
              라벨 hover 시 각 값의 뜻을 설명한다(기존 타이틀 옆 URL·dmeta 한 줄을 대체). */}
          <div
            className="rounded-lg bg-elevated"
            style={{
              padding: "9px 12px",
              marginBottom: 12,
              display: "grid",
              gridTemplateColumns: "max-content minmax(0,1fr)",
              rowGap: 4,
              columnGap: 14,
              maxWidth: MAX_CAPTURE_WIDTH,
            }}
          >
            <MetaRow label="호출 URL" help="캡처 시점에 브라우저로 연 주소 — 분석 대상 서버(baseUrl) 기준 상대경로. 화면의 식별 주소이며 코드 근거가 아님">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{sel.url || "/ (루트)"}</span>
            </MetaRow>
            {sel.jspFile && (
              <MetaRow label="렌더 JSP" help="위 URL 요청을 서버가 최종적으로 그려낸 JSP 템플릿 파일 — 클릭하면 코드 뷰어로 엽니다">
                <button
                  type="button"
                  onClick={() => openCodeViewerAt(sel.jspFile!, 1)}
                  className="px-1 rounded bg-panel break-all cursor-pointer border-0 text-left"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-status-info)" }}
                  title="코드 뷰어에서 열기"
                >
                  {sel.jspFile}
                </button>
              </MetaRow>
            )}
            {sel.scenario && (
              <MetaRow label="도달 시나리오" help="캡처 봇이 이 화면에 도달하려고 먼저 수행한 사전 절차(예: signon=로그인 후, order-flow=주문 진행 중, error=오류 유도)">
                {sel.scenario}
              </MetaRow>
            )}
            {sel.openedFrom && (
              <MetaRow label="진입 경로" help="캡처 봇이 직전에 어느 화면/링크에서 이동해 왔는지 — 실제 사용자 동선의 재현 경로">
                {sel.openedFrom}
              </MetaRow>
            )}
            {summaryInfo?.evidenceParts && (
              <MetaRow label="근거" help="설명 판단이 나온 코드 위치 — 클릭하면 코드 뷰어로 엽니다. 배지: 근거확보=결정적 정적 분석 추적 / 근거확보(AI)=AI 가 코드를 읽어 보완 판정(검토 권장)">
                {summaryInfo.evidenceParts.map((p, i) =>
                  p.type === "ref" ? (
                    <button
                      key={`${p.file}:${p.line}:${i}`}
                      type="button"
                      onClick={() => openCodeViewerAt(p.file, p.line)}
                      title={`코드 뷰어에서 열기 — ${p.file}:${p.line}`}
                      className="inline-block mr-1 px-1 rounded bg-panel break-all cursor-pointer border-0"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-status-info)" }}
                    >
                      {p.display}
                    </button>
                  ) : (
                    <span key={`t:${i}`} className="text-text-muted" style={{ marginRight: p.display === ", " ? 0 : 4 }}>
                      {p.display}
                    </span>
                  ),
                )}
                <span style={{ marginLeft: 4 }}>
                  <ConfBadge
                    kind={mechConf(summaryInfo.confidence).kind}
                    label={mechConf(summaryInfo.confidence).label}
                    title={mechConf(summaryInfo.confidence).title}
                  />
                </span>
              </MetaRow>
            )}
            {summaryInfo && (
              <MetaRow label="설명" help="정적 분석이 요약한 화면의 역할 — 판단의 코드 출처는 위 근거 행">
                {summaryInfo.text}
                {/* 근거 인용이 없는 화면(정적 페이지 등)은 신뢰도 배지를 설명 옆에 유지 */}
                {!summaryInfo.evidenceParts && (
                  <span style={{ marginLeft: 6 }}>
                    <ConfBadge
                      kind={mechConf(summaryInfo.confidence).kind}
                      label={mechConf(summaryInfo.confidence).label}
                      title={mechConf(summaryInfo.confidence).title}
                    />
                  </span>
                )}
              </MetaRow>
            )}
          </div>

          {/* 배지 색상 키 = 표시 토글 — 클릭한 종류만 캡처 위 배지를 끄고 켠다(표는 전수 유지) */}
          <div className="flex items-center gap-3 text-text-muted" style={{ fontSize: 11, marginBottom: 10 }}>
            {KIND_ORDER.filter((k) => k !== "region").map((k) => {
              const off = hiddenKinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={!off}
                  onClick={() =>
                    setHiddenKinds((prev) => {
                      const next = new Set(prev);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      return next;
                    })
                  }
                  className="inline-flex items-center gap-1.5 cursor-pointer bg-transparent rounded-full"
                  style={{
                    font: "inherit",
                    color: "inherit",
                    padding: "2px 8px 2px 3px",
                    border: `1px solid ${off ? "transparent" : "var(--color-border-subtle)"}`,
                    opacity: off ? 0.4 : 1,
                    textDecoration: off ? "line-through" : "none",
                    transition: "opacity 0.12s ease",
                  }}
                  title={`클릭 — 캡처 위 ${KIND_SECTION[k] ?? k} 배지 ${off ? "표시" : "숨김"}`}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full font-bold"
                    style={{
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      background: kindStyle(k).bg,
                      color: kindStyle(k).fg,
                      border: `1px solid ${kindStyle(k).border}`,
                    }}
                  >
                    {badgeGlyph(k, 1)}
                  </span>
                  {KIND_SECTION[k] ?? k}
                </button>
              );
            })}
          </div>

          {/* 신뢰도 카운트 요약 — 스케일 대비 상단 집계(전부 기계 판정) */}
          <div className="flex items-center flex-wrap gap-2 text-text-muted" style={{ fontSize: 11, marginBottom: 12 }}>
            <span>동작 신뢰도</span>
            {CONF_ORDER.filter((c) => (confCounts.get(c) ?? 0) > 0).map((c) => {
              const mc = mechConf(c);
              return (
                <span key={c} className="inline-flex items-center gap-1">
                  <ConfBadge kind={mc.kind} label={mc.label} title={mc.title} />
                  <b className="text-text-secondary tabular-nums">{confCounts.get(c)}</b>
                </span>
              );
            })}
            {confCounts.size === 0 && <span>—</span>}
            {noHandler > 0 && (
              <span className="inline-flex items-center gap-1" title="핸들러가 없는 항목(입력 필드 등)">
                · 핸들러 없음 <b className="text-text-secondary tabular-nums">{noHandler}</b>
              </span>
            )}
          </div>

          {/* 캡처 + 배지 오버레이 (로드 실패 시 경로 폴백 카드) */}
          {imgError ? (
            <div
              className="rounded-lg border border-border-medium bg-panel text-text-muted"
              style={{ padding: "24px 20px", fontSize: 12.5, lineHeight: 1.7 }}
            >
              캡처 이미지를 불러올 수 없습니다.
              <div className="break-all" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, marginTop: 6 }}>
                {sel.capture.path}
              </div>
            </div>
          ) : (
            /*
             * 캡처 표시 — 고정 뷰포트의 회색 여백을 트림해 실제 내용 크기(1:1)로,
             * MAX_CAPTURE_WIDTH 초과·장신 캡처는 축소/내부 스크롤로 상한을 건다.
             * bbox 는 문서 좌표 그대로 두고 크롭 원점만 빼서 %를 다시 잡는다.
             */
            (() => {
              const cropX = trim?.x ?? 0;
              const cropY = trim?.y ?? 0;
              const cropW = trim?.width ?? sel.capture.width;
              const cropH = trim?.height ?? sel.capture.height;
              return (
                <div
                  className="border border-border-medium rounded-lg overflow-auto bg-white"
                  style={{ maxWidth: Math.min(cropW, MAX_CAPTURE_WIDTH), maxHeight: "75vh" }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: `${cropW} / ${cropH}` }}>
                    <img
                      src={imgSrc(sel)}
                      alt={title(sel)}
                      className="absolute select-none"
                      style={{
                        left: `${(-cropX / cropW) * 100}%`,
                        top: `${(-cropY / cropH) * 100}%`,
                        width: `${(sel.capture.width / cropW) * 100}%`,
                        maxWidth: "none",
                      }}
                      draggable={false}
                      onLoad={(e) => {
                        if (!TRIM_CACHE.has(sel.id)) TRIM_CACHE.set(sel.id, computeTrim(e.currentTarget));
                        setTrim(TRIM_CACHE.get(sel.id) ?? null);
                      }}
                      onError={() => setImgError(true)}
                    />
                    {overlayAnns.map((a) => {
                      const key = annKey(a);
                      const active = hoverKey === key;
                      const st = kindStyle(a.kind);
                      const m = merged(a);
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseEnter={() => setHoverKey(key)}
                          onMouseLeave={() => setHoverKey(null)}
                          onFocus={() => setHoverKey(key)}
                          onBlur={() => setHoverKey(null)}
                          onClick={() => jumpToRow(key)}
                          aria-label={`${badgeGlyph(a.kind, a.no)} ${m.label}${m.description ? ` — ${m.description}` : ""}`}
                          title={`${m.label} — ${m.description ?? ""} (클릭: 아래 표에서 보기)`}
                          className="absolute flex items-center justify-center rounded-full font-bold cursor-pointer transition-transform p-0"
                          style={{
                            left: `${((a.bbox.x + a.bbox.width - cropX) / cropW) * 100}%`,
                            top: `${((a.bbox.y - cropY) / cropH) * 100}%`,
                      transform: `translate(-50%, -50%) scale(${active ? 1.4 : 1})`,
                      width: 20,
                      height: 20,
                      fontSize: 13,
                      lineHeight: "20px",
                      background: st.bg,
                      color: st.fg,
                      border: `1.5px solid ${st.border}`,
                      boxShadow: active ? "0 0 0 2px #fff, 0 0 6px rgba(0,0,0,0.5)" : "0 0 2px rgba(0,0,0,0.6)",
                      zIndex: active ? 10 : 1,
                    }}
                        >
                          {badgeGlyph(a.kind, a.no)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}

          {/* 범례 표 — 프로토 .tbl */}
          <div className="overflow-x-auto" style={{ marginTop: 14 }}>
            <table className="proto-tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>번호</th>
                  <th style={{ width: 48 }}>구분</th>
                  <th>항목</th>
                  <th style={{ width: 56 }}>이벤트</th>
                  <th>동작(핸들러)</th>
                  <th>설명</th>
                  <th style={{ width: 72 }}>신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {KIND_ORDER.flatMap((kind) => {
                  const rows = visibleAnns.filter((a) => a.kind === kind);
                  if (rows.length === 0) return [];
                  const header = (
                    <tr key={`sec:${kind}`}>
                      <td colSpan={7} style={{ paddingTop: 12, paddingBottom: 4, borderBottom: "none" }}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-text-secondary" style={{ fontSize: 11 }}>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ background: kindSwatch(kind) }}
                          />
                          {KIND_SECTION[kind] ?? kind} ({rows.length})
                        </span>
                      </td>
                    </tr>
                  );
                  const items = rows.map((a) => {
                    const key = annKey(a);
                    const m = merged(a);
                    const d = draftAnn[key];
                    return (
                      <tr
                        key={key}
                        ref={(el) => {
                          if (el) rowRefs.current.set(key, el);
                          else rowRefs.current.delete(key);
                        }}
                        onMouseEnter={() => setHoverKey(key)}
                        onMouseLeave={() => setHoverKey(null)}
                        style={
                          flashKey === key
                            ? { background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", transition: "background 0.3s ease" }
                            : hoverKey === key
                              ? { background: "color-mix(in srgb, var(--color-accent) 7%, transparent)" }
                              : { transition: "background 0.3s ease" }
                        }
                      >
                        <td className="font-semibold" style={{ color: kindSwatch(a.kind) }}>
                          {badgeGlyph(a.kind, a.no)}
                        </td>
                        <td className="text-text-muted">{KIND_LABEL[a.kind] ?? a.kind}</td>
                        <td className="break-all">
                          {m.label}
                          {a.mechanical.required && <span style={{ color: "var(--color-status-error)", marginLeft: 2 }}>*</span>}
                        </td>
                        <td className="text-text-muted">{a.eventType}</td>
                        <td className="text-text-secondary">
                          {a.handler?.target && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{a.handler.target}</div>}
                          {a.handler && a.handler.chain.length > 0 && (
                            <div className="text-text-muted break-all" style={{ fontSize: 10.5 }}>
                              {a.handler.chain.join(" → ")}
                            </div>
                          )}
                          {a.handler?.evidence.map((ev) => (
                            <button
                              key={`${ev.file}:${ev.line}`}
                              type="button"
                              onClick={() => openCodeViewerAt(ev.file, ev.line)}
                              title="코드 뷰어에서 열기"
                              className="inline-block mt-0.5 mr-1 px-1 rounded bg-elevated break-all cursor-pointer border-0"
                              style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--color-status-info)" }}
                            >
                              {ev.file}:{ev.line}
                            </button>
                          ))}
                        </td>
                        <td className="text-text-secondary">
                          {editing ? (
                            <div className="space-y-1">
                              <textarea
                                value={d?.description ?? ""}
                                onChange={(e) =>
                                  setDraftAnn((prev) => ({ ...prev, [key]: { ...prev[key], description: e.target.value } }))
                                }
                                rows={2}
                                className="w-full min-w-40 bg-elevated border border-border-subtle rounded px-1.5 py-1 text-text-primary"
                                style={{ fontSize: 12 }}
                              />
                              <label className="flex items-center gap-1 text-text-muted" style={{ fontSize: 10.5 }}>
                                <input
                                  type="checkbox"
                                  checked={d?.hidden ?? false}
                                  onChange={(e) =>
                                    setDraftAnn((prev) => ({ ...prev, [key]: { ...prev[key], hidden: e.target.checked } }))
                                  }
                                />
                                숨김
                              </label>
                            </div>
                          ) : (
                            m.description
                          )}
                        </td>
                        <td>
                          {a.handler &&
                            (() => {
                              const mc = mechConf(a.handler.confidence);
                              return <ConfBadge kind={mc.kind} label={mc.label} title={mc.title} />;
                            })()}
                        </td>
                      </tr>
                    );
                  });
                  return [header, ...items];
                })}
              </tbody>
            </table>
          </div>

          {/* ※ 비고 */}
          {notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-text-muted" style={{ fontSize: 12 }}>
              {notes.map((a) => (
                <li key={annKey(a)}>
                  <span className="text-accent font-semibold mr-1">{badgeGlyph(a.kind, a.no)}</span>
                  {merged(a).note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
