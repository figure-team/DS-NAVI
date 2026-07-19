/**
 * ktds legacy-core — 화면설계서(screen-capture) 스키마.
 *
 * `screens.json`(생성물)과 `screen-overrides.json`(사람 편집 오버레이)의 단일 스키마 지점.
 * 생성물 불변 원칙: Stage A(결정론 캡처)가 기록한 mechanical 사실은 Stage B(LLM 채움)가
 * 수정할 수 없다 — `mechanicalHash` 로 기계 검증한다(assemble.ts).
 */
import { z } from 'zod';
import { CONFIDENCE_VALUES } from '../types.js';
/** screens.json 파일명 — `.understand-anything/` 아래 기록. */
export const SCREENS_FILENAME = 'screens.json';
/** screen-overrides.json 파일명 — 사람 편집 오버레이(rtm-overrides 동형). */
export const SCREEN_OVERRIDES_FILENAME = 'screen-overrides.json';
/** 캡처 PNG 디렉터리명 — `.understand-anything/screens/`. */
export const SCREENS_DIRNAME = 'screens';
/** 문서 좌표(px) 경계 상자 — fullPage 스크린샷과 동일 좌표계(deviceScaleFactor=1). */
export const BBoxSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
});
/**
 * 주석 종류.
 * - field: 입력 요소(input/select/textarea) — ①②③ 배지.
 * - action: 이벤트 유발 요소(submit/button/onclick) — ⓐⓑⓒ 배지.
 * - link: 내비게이션 링크(a[href]) — action 과 같은 ⓐⓑⓒ 카운터 공유.
 * - region: 영역 묶음(후속 확장용, Stage A 는 생성하지 않음) — ①②③ 카운터 공유.
 */
export const AnnotationKindSchema = z.enum(['field', 'action', 'link', 'region']);
export const EventTypeSchema = z.enum(['click', 'submit', 'change', 'link', 'none']);
/** Stage A 기계 사실 — Stage B 수정 금지 대상(mechanicalHash 에 포함). */
export const MechanicalSchema = z.object({
    tag: z.string(),
    inputType: z.string().nullable(),
    name: z.string().nullable(),
    href: z.string().nullable(),
    formAction: z.string().nullable(),
    formMethod: z.string().nullable(),
    onclick: z.string().nullable(),
    required: z.boolean(),
});
export const HandlerEvidenceSchema = z.object({
    file: z.string(),
    line: z.number().int(),
    snippet: z.string().optional(),
});
/**
 * 이벤트 → 핸들러 유추 결과.
 * Stage A 가 routes.json 결정론 조인으로 CONFIRMED 를 선기입하고,
 * Stage B 가 chain(ActionBean→Service→Mapper 심화)과 미조인 건을 채운다.
 * CONFIRMED 주장은 evidence(file:line) ≥ 1 필수 — fail-closed(validate 게이트).
 */
export const HandlerSchema = z.object({
    target: z.string().nullable(),
    chain: z.array(z.string()),
    evidence: z.array(HandlerEvidenceSchema),
    confidence: z.enum(CONFIDENCE_VALUES),
});
export const AnnotationSchema = z.object({
    /** kind 그룹별 1-based 순번(field/region 카운터, action/link 카운터 분리). */
    no: z.number().int().min(1),
    kind: AnnotationKindSchema,
    selector: z.string(),
    bbox: BBoxSchema,
    label: z.string(),
    eventType: EventTypeSchema,
    mechanical: MechanicalSchema,
    handler: HandlerSchema.nullable(),
    /** Stage B 한국어 범례 설명. */
    description: z.string().nullable(),
    /** "※ …" 비고. */
    note: z.string().nullable(),
});
export const ScreenCaptureInfoSchema = z.object({
    /** `.understand-anything/` 상대 경로 — `screens/<slug>.png` 고정. */
    path: z.string().regex(/^screens\/[A-Za-z0-9._-]+\.png$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedAt: z.string(),
    /** sha256(png) — staleness 비교용. */
    contentHash: z.string(),
});
export const ScreenSchema = z.object({
    /** 안정 식별자 — `screen:<상대경로>__<이벤트키>` (오버레이 전 과정 불변). */
    id: z.string(),
    title: z.string(),
    /** baseUrl 상대 URL(캡처에 실제 사용한 대표 URL). */
    url: z.string(),
    /** Stage B: ForwardResolution 근거로 매핑한 JSP(프로젝트 상대 경로). */
    jspFile: z.string().nullable(),
    /** jspFile 존재 시 결정론 파생: `file:<jspFile>`. */
    graphNodeId: z.string().nullable(),
    /** JSP 폴더 파생 도메인(account/cart/catalog/order/common). */
    domain: z.string().nullable(),
    /** 이 화면 도달에 사용한 시나리오 id(크롤 도달이면 null). */
    scenario: z.string().nullable(),
    /** window.open/새창으로 이 화면을 연 원 화면 id(팝업이 아니면 null). */
    openedFrom: z.string().nullable(),
    /**
     * 관측 콘텐츠 시그니처 — title+h1+form action 해시.
     * 서버측 forward(URL 불변 로그인 강제 등)로 서로 다른 URL 이 같은 화면을
     * 렌더한 경우를 별칭 의심으로 감지하는 데 쓴다(validate/status 보고).
     */
    contentSignature: z.string().nullable(),
    /**
     * 이 화면을 발견한 보조 시드 출처 — 크롤/시나리오 내비게이션으로 도달한 화면은 미기재.
     * 'routes-census': 메뉴에 링크가 없어 routes.json GET-safe 보조 시드로만 도달(§3).
     */
    seededFrom: z.enum(['routes-census']).nullable().optional(),
    capture: ScreenCaptureInfoSchema,
    /** Stage B 화면 개요. */
    summary: z.object({ text: z.string(), confidence: z.enum(CONFIDENCE_VALUES) }).nullable(),
    annotations: z.array(AnnotationSchema),
});
/**
 * missing 트리아지 분류(SCREENS_MISSING_TRIAGE_DESIGN §2.1) — routes census 교차검증으로
 * 결정론 부여. 위→아래 첫 매치:
 * - param-required: 4xx(400) 인데 요청 URL 이 census 에 실존 — 필수 파라미터 누락 호출.
 * - server-error: http-5xx.
 * - auth-gated: 로그인 경로로 리다이렉트(또는 401/403 + 라우트 실존) — 인증 게이트.
 * - redirect-other: 그 외 리다이렉트.
 * - route-missing-hit: 404 인데 census 에 실존 — 배포 누락/프로파일 미활성 의심.
 * - stale-url: 404 + census 부재 + 같은 디렉터리에 유사 후보 실존 — 낡은 메뉴 URL.
 * - dead-menu: 404 + census 부재 + 후보 없음 — 죽은 메뉴(코드에서 제거된 화면).
 * - unknown: 그 외(goto-failed, scenario-failed 등).
 */
export const MISSING_TRIAGE_CLASSES = [
    'dead-menu',
    'stale-url',
    'param-required',
    'auth-gated',
    'redirect-other',
    'server-error',
    'route-missing-hit',
    'unknown',
];
export const MissingTriageClassSchema = z.enum(MISSING_TRIAGE_CLASSES);
/** stale-url 판정 시 제시하는 현행 라우트 후보(§2.2 결정론 매칭, 오매칭 시 null). */
export const MissingTriageCandidateSchema = z.object({
    path: z.string(),
    handler: z.string().nullable(),
    filePath: z.string().nullable(),
    line: z.number().int().nullable(),
});
export const MissingTriageSchema = z.object({
    class: MissingTriageClassSchema,
    /** 요청 URL 자체가 census 에 있나(있는데 404 면 route-missing-hit). */
    routeExists: z.boolean(),
    candidateRoute: MissingTriageCandidateSchema.nullable(),
});
/** 도달 실패 화면의 정직 보고(조용한 스킵 금지). */
export const MissingScreenSchema = z.object({
    url: z.string(),
    reason: z.string(),
    /** routes census 교차검증 트리아지 — census(routes.json) 없으면 미부여(하위호환). */
    triage: MissingTriageSchema.nullable().optional(),
});
export const ScreensFileSchema = z.object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    gitCommit: z.string().nullable(),
    baseUrl: z.string(),
    viewport: z.object({ width: z.number().int(), height: z.number().int() }),
    /** id ASC 정렬. */
    screens: z.array(ScreenSchema),
    /** 그래프 JSP 중 화면(jspFile)으로 매핑되지 못한 것(fragments 제외) — 정직 보고. */
    unmatchedJsps: z.array(z.string()),
    /** `<html>` 없는 include 조각(화면 아님) — unmatchedJsps 오탐 방지용 분리. */
    fragments: z.array(z.string()),
    /** 시나리오 실패 등으로 캡처하지 못한 화면 보고. */
    missing: z.array(MissingScreenSchema),
    /** Stage A mechanical 사실의 sha256 — Stage B 변조 기계검증(assemble.ts). */
    mechanicalHash: z.string(),
});
/** 오버라이드 annotation 키 — `<kind>:<no>`. */
export const ANNOTATION_KEY_RE = /^(field|action|link|region):\d+$/;
export const ScreenAnnotationOverrideSchema = z.object({
    description: z.string().optional(),
    label: z.string().optional(),
    note: z.string().optional(),
    hidden: z.boolean().optional(),
});
export const ScreenOverrideEntrySchema = z.object({
    approver: z.string(),
    at: z.string(),
    titleOverride: z.string().optional(),
    annotations: z
        .record(z.string().regex(ANNOTATION_KEY_RE), ScreenAnnotationOverrideSchema)
        .optional(),
    confirmed: z.boolean(),
    audit: z.array(z.object({
        event: z.enum(['CONFIRMED', 'EDITED']),
        by: z.string(),
        at: z.string(),
    })),
});
/** screen-overrides.json — screenId → 오버라이드 레코드. */
export const ScreenOverridesSchema = z.record(z.string(), ScreenOverrideEntrySchema);
//# sourceMappingURL=types.js.map