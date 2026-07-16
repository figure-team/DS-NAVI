/**
 * intake-types — RTM 단계화(절차 A)의 누적 중간산출 `identified.json` 스키마.
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §4.1. 2계층 ID(요청 REQ → 요구사항 SFR…)를 담는
 * 단일 진실원본으로, ① 식별이 골격을 쓰고 ③ 정의서·④ 명세서 단계가 필드를 점진 보강한다.
 * 따라서 ③④ 보강 필드는 default 로 둬 ①-only 산출도 검증을 통과한다(후방호환).
 *
 * 이 파일은 **문서 단계(②③④) 산출의 데이터 소스**다. rtm.json 정식 스키마(types.ts)와 별개이며,
 * ⑤ 단계가 이 산출을 rtm-requirements.json 으로 투영한다(P5). 기존 zod 서브스키마를 재사용한다.
 */
import { z } from 'zod';
import { confidenceTag } from '../doc-generator/claims.js';
import { EvidenceSchema } from '../doc-generator/types.js';
import { PrioritySchema, RequirementTypeSchema, NfrCategorySchema, AcceptanceCriterionSchema, RtmChangesetSchema, } from './types.js';
/** 요구사항 구분코드(분류) — 목록표 §3 분류 코드. id 접두와 일치해야 한다. */
export const RequirementCategorySchema = z.enum([
    'SFR', // 기능
    'PER', // 성능
    'SIR', // 인터페이스
    'DAR', // 데이터
    'SER', // 보안
    'QUR', // 품질
    'COR', // 제약
]);
// ── P2 근거 스키마(C4) — 인용 + 화면·정책 축 ──────────────────────────────────
/**
 * ★ 인용(citation) 모양 = `EvidenceSchema`(`{file, line, snippet?}`) 재사용.
 *
 * 후보가 둘이었다(설계: RTM_IMPACT_GATE_DESIGN.md §6.4).
 *  - `doc-generator/types.ts` `EvidenceSchema` `{file, line: nullable, snippet?}`
 *  - `domain-map/fill.ts` `CitationSchema` `{filePath, line: positive, snippet: min(8)}`
 *
 * **EvidenceSchema 를 고른 이유 — RTM 계열의 기존 관례이기 때문이다.**
 *  1) 이 파일이 이미 재사용하는 `types.ts`(rtm.json 정식 스키마)가 셀 근거(`evidence: [{file,line}]`,
 *     types.ts:25)·테스트 시나리오 근거(types.ts:145)를 전부 EvidenceSchema 로 쓴다. ⑤ 단계가
 *     identified.json → rtm-requirements.json 으로 **투영**(P5)하므로 두 쪽 모양이 같아야 변환이
 *     무손실이다. CitationSchema 를 쓰면 투영 지점마다 `filePath`↔`file` 매핑이 생긴다.
 *  2) `line` 이 **nullable** 이어야 한다. 인테이크는 TO-BE 설계라 "이 파일 근처"까지만 아는 근거가
 *     정상이다(동적/불명 → null). CitationSchema 의 `line: positive` 는 이를 표현할 수 없다.
 *  3) CitationSchema 의 `snippet: min(8)` 강제는 **검증기가 실파일과 대조**하는 domain-map fill
 *     파이프라인 전용 계약이다(fill.ts:28-30). 인테이크엔 그 대조기가 없어 지킬 수 없는 약속이 된다.
 *
 * 필드명도 같은 이유로 `citations` 가 아닌 **`evidence`** 다(RTM 계열 어휘 = evidence).
 */
export const IntakeEvidenceSchema = EvidenceSchema;
/**
 * 화면 축(P2) — `screens.json` 의 화면/주석을 가리킨다.
 *
 * 실측(examples/jpetstore-6): `screens[].id` = `screen:actions/Account.action__signonForm`,
 * 그 안에 `annotations[]` 16건이 `no`(1-based, 화면 내 안정 키)·`selector`·`bbox`·
 * `handler.evidence[{file,line,snippet}]` 를 갖는다.
 *
 * **참조만 담고 복제하지 않는다.** `selector`·`bbox`·`handler.evidence` 는 screens.json 이 원본이고
 * 재생성마다 바뀐다 — 여기 베끼면 즉시 낡는다. (screenId, annotationNo) 조인 키만 들고,
 * 나머지는 소비처가 screens.json 에서 조회한다(도메인·데이터 축이 id 로만 가리키는 관례와 동일).
 *
 * `annotationNo: null` = 화면 전체 참조(특정 요소 아님). 이 축이 §1.2 의 마지막 결함
 * — AC-1 "로그인 폼에 '카카오로 로그인' 버튼을 노출한다"가 어느 화면인지 못 가리킴 — 을 푼다.
 */
export const IntakeScreenRefSchema = z.object({
    /** `screens[].id` (예: `screen:actions/Account.action__signonForm`). */
    screenId: z.string().min(1),
    /** `annotations[].no` (1-based). 화면 전체를 가리키면 null. */
    annotationNo: z.number().int().positive().nullable().default(null),
    /** 사람이 읽는 메모(예: "여기 아래에 카카오 버튼 추가"). */
    note: z.string().default(''),
});
/**
 * 정책 축(P2) — `doc-output/policy-*.md` 의 절/규칙 행을 가리킨다.
 *
 * 실측(policy-domain-account.md): §4 의사결정 테이블이 행마다 `정책 ID`(`PL-001`)·`신뢰도`·`근거`
 * (`AccountActionBean.java:163`) 를 갖고, §8 같은 산문 절도 참조 대상이다(설계서 §1.2 가 지목한
 * "SIGNON.PASSWORD 평문" 쟁점이 §8 에 있다).
 *
 * → **절 단위(section) + 행 단위(ruleId) 둘 다** 필요하다. ruleId 가 null 이면 절 전체 참조.
 * 정책 md 는 `.understand-anything/doc-output/` 상대 파일명으로 가리킨다(md 는 파일이 곧 도메인).
 */
export const IntakePolicyRefSchema = z.object({
    /** doc-output 상대 파일명(예: `policy-domain-account.md`). */
    doc: z.string().min(1),
    /** 절 번호(예: `4`, `8`). 문서 전체면 ''. */
    section: z.string().default(''),
    /** §4 의사결정 테이블의 `정책 ID`(예: `PL-001`). 절 전체 참조면 null. */
    ruleId: z.string().nullable().default(null),
    /** 사람이 읽는 메모. */
    note: z.string().default(''),
});
/**
 * ★ 인용 필드의 optional 여부 — **`.optional()`(default 없음)** 이다. 이유는 하위호환이다.
 *
 * `.default([])` 로 두면 파싱 후 **"필드 부재"와 "빈 배열"이 구별 불가**해진다(둘 다 `[]`).
 * 기존 `identified.json` 은 인용이 전부 없으므로(P2 이전 스키마), default 를 주는 순간
 * 근거↔신뢰도 불변식이 **기존 데이터의 모든 CONFIRMED AC 를 일괄 error** 로 만든다 — 금지다.
 *
 * 그래서 3상태로 읽는다:
 *  - `undefined`(필드 부재) = "인용을 안 적는 스키마 시대의 산출" → 불변식 **생략**(하위호환).
 *  - `[]`(명시적 빈 배열)   = "찾아봤는데 근거가 없다" → CONFIRMED 단언 시 **error**.
 *  - `[{file,line}, …]`     = 근거 있음 → 통과.
 *
 * P5(① 배선)가 생산자를 인용 기록으로 바꾸면 `undefined` 는 자연 소멸한다. 그때까지 이 필드의
 * 부재는 "미확인"이지 "위반"이 아니다(설계서 §7 C8 "게이트는 코드로" — 못 지킬 약속은 안 한다).
 */
const CitationField = z.array(IntakeEvidenceSchema).optional();
/** 요구사항 유효성 상태 — 유효(ACTIVE) / 폐기(WITHDRAWN, 절차 B). */
export const IntakeReqStatusSchema = z.enum(['ACTIVE', 'WITHDRAWN']);
/** 고객 요청(요청ID 레벨) — 1건이 N개 요구사항으로 분해된다. */
export const IntakeRequestSchema = z.object({
    id: z.string(), // REQ-003
    name: z.string(),
    raw: z.string(), // 고객 원문 그대로
    source: z.string().default(''), // 고객 메일/회의 등
    requestedAt: z.string().nullable().default(null),
});
/** ④ 명세서 상세 — ① 식별엔 비어 있고 ④ 단계에서 채운다. */
export const IntakeSpecSchema = z.object({
    details: z.array(z.string()).default([]), // 상세 기능 ①②③…
    inputs: z.string().default(''),
    outputs: z.string().default(''),
    flow: z.string().default(''), // 처리 흐름
    preceding: z.array(z.string()).default([]), // 선행 요구사항ID
    exceptions: z.array(z.string()).default([]), // 예외/제약
    acceptance: z.array(z.string()).default([]), // 인수 기준(정량 권장)
    verify: z.string().default(''), // 검증 방법
});
/**
 * 인테이크 AC(P2 확장) — rtm.json 정식 AC(`AcceptanceCriterionSchema`)에 인용·화면·정책 축을 얹는다.
 *
 * **`types.ts` 원본을 건드리지 않고 여기서 `.extend()` 하는 이유**: 인테이크는 TO-BE 중간산출이고
 * rtm.json 은 AS-IS 정식 스키마다. 원본에 필드를 더하면 28개 기능 행 전량과 대시보드 소비처가
 * 함께 흔들린다 — P2 범위(identified.json 스키마)를 넘는다. 투영(P5) 시점에 정식 스키마의
 * `evidence`(모양 동일)로 그대로 흘려보낼 수 있다.
 */
export const IntakeAcceptanceCriterionSchema = AcceptanceCriterionSchema.extend({
    /** 이 AC 의 근거 앵커. 부재(undefined)=미확인 / `[]`=근거 없음 → CitationField 주석 참조. */
    evidence: CitationField,
    /** 화면 축 — 이 AC 가 걸리는 화면/주석(§1.3 "적을 자리가 없다"의 해소). */
    screenRefs: z.array(IntakeScreenRefSchema).default([]),
    /** 정책 축 — 이 AC 가 근거·충돌하는 정책 절/규칙. */
    policyRefs: z.array(IntakePolicyRefSchema).default([]),
});
/**
 * 인테이크 changeset(P2 확장) — 변경 묶음을 그렇게 가른 근거.
 *
 * 인용은 **묶음 단위 1개**다(항목별이 아니라). `added/modified/removed/revived` 는 문자열 배열이라
 * 항목별 인용을 달려면 배열 원소를 객체로 바꿔야 하는데, 그건 `RtmChangesetSchema` 와 모양이
 * 갈라져 투영(P5)을 깨는 **파괴적 변경**이다. 항목 단위 근거가 필요하면 AC(`fnIds` + `evidence`)가
 * 이미 그 자리다 — AC 가 요구사항↔기능 N:M 다리라는 원설계(types.ts:50)와 일치한다.
 */
export const IntakeChangesetSchema = RtmChangesetSchema.extend({
    /** 이 묶음 도출의 근거 앵커. 부재/`[]` 구분은 CitationField 주석 참조. */
    evidence: CitationField,
});
/**
 * 개별 요구사항(요구사항ID 레벨). ① 골격(id/category/name/priority/type/AC/changeset) →
 * ③ 보강(definition/scope/origin) → ④ 보강(spec). 전부 TO-BE 라 근거는 [추정].
 */
export const IntakeRequirementSchema = z.object({
    id: z.string(), // SFR-010 (접두 = category)
    category: RequirementCategorySchema,
    name: z.string(),
    type: RequirementTypeSchema.default('functional'),
    nfrCategory: NfrCategorySchema.nullable().default(null),
    priority: PrioritySchema.default('MEDIUM'),
    status: IntakeReqStatusSchema.default('ACTIVE'),
    /** 파생 원천(선행) 요구사항ID. 예: SIR-002 derivedFrom SFR-010. 주요구는 null. */
    derivedFrom: z.string().nullable().default(null),
    // ③ 정의서 보강 ──
    definition: z.string().default(''),
    scope: z.string().default(''),
    origin: z.string().default(''), // 출처/관련
    // ④ 명세서 보강 ── (absent → 내부 default 가 채워진 완전체. 빈 {} 를 그대로 저장하지 않도록 parse)
    spec: IntakeSpecSchema.default(() => IntakeSpecSchema.parse({})),
    // ① 식별 골격 ──
    acceptanceCriteria: z.array(IntakeAcceptanceCriterionSchema).default([]),
    changeset: IntakeChangesetSchema.default({ added: [], modified: [], removed: [], revived: [] }),
    // P2 근거 축(요구사항 레벨) ──
    /**
     * 화면 축 — AC 하나로 좁혀지지 않는 화면 영향(예: 요구사항 전체가 로그인 폼 계열을 건드림).
     * AC 레벨(`acceptanceCriteria[].screenRefs`)과 **둘 다** 두는 건 기존 코드 축의 대칭이다:
     * 코드 축도 요구사항 레벨(`changeset`)과 AC 레벨(`fnIds`)에 각각 있다.
     */
    screenRefs: z.array(IntakeScreenRefSchema).default([]),
    /** 정책 축 — 요구사항 전체가 근거·충돌하는 정책 절(예: §8 평문 비밀번호 쟁점). */
    policyRefs: z.array(IntakePolicyRefSchema).default([]),
});
// ── A1 질문 스키마(RTM_INTAKE_ANSWER_DESIGN.md §3.1) ─────────────────────────
/**
 * 질문이 걸린 축 — 어느 근거 축의 모호함인가. 번들 6축(`intake-input`)과 같은 어휘를 쓰되
 * `general`(축에 안 걸리는 요청 자체의 모호함, 예: "병행인가 대체인가")을 더한다.
 * **분류는 선택**이다(`null` 허용) — 못 고르면 안 고르는 게 맞지, 억지 귀속은 오히려 오독시킨다.
 */
export const IntakeQuestionAxisSchema = z.enum([
    'screen',
    'policy',
    'domain',
    'data',
    'code',
    'rtm',
    'general',
]);
/**
 * ① `[확인필요]` 질문 1건 — **답을 받을 자리가 있는** 질문(A1).
 *
 * 종전엔 `questions: z.array(z.string())` 이라 답변 필드도 귀속도 없었다. 가이드(①=PM/PL 인터뷰로
 * 모호함 제거)가 규정한 ①의 본질이 여기 걸려 있었는데(설계서 §0), 화면이 표시만 하고 끝났다.
 *
 * `answer` 3상태가 아니라 **2상태**인 이유: 인용(`CitationField`)과 달리 여기엔 하위호환 딜레마가
 * 없다. 구형 문자열 질문은 정규화 시 `answer: null`(미답)이 **정확한 사실**이다 — 답할 자리가
 * 없었으니 안 답한 게 맞다. "안 물어봤다"와 "물었는데 답 안 함"을 가를 이유가 없다.
 */
export const IntakeQuestionSchema = z.object({
    /** `Q-1` — 재실행(개정)을 넘어 답을 붙잡는 **안정 키**. 개정 시 보존해야 한다(SKILL §B --revise). */
    id: z.string().min(1),
    text: z.string().min(1),
    /** 이 질문이 걸린 요구사항 id. 요청 전체에 걸리는 모호함이면 null. */
    targetReqId: z.string().nullable().default(null),
    /** 어느 축의 모호함인가(선택 — 못 고르면 null). */
    axis: IntakeQuestionAxisSchema.nullable().default(null),
    /** 사용자 답변. null=미답. 미답이 컨펌을 막지는 않는다(설계 D2 — 차단 아닌 경고). */
    answer: z.string().nullable().default(null),
    answeredAt: z.string().nullable().default(null),
});
/**
 * ★ 하위호환 — **구형 문자열 배열과 신형 객체 배열을 둘 다 받는다.**
 *
 * 기존 산출(P5 e2e 가 만든 `questions: ["…", "…"]`)이 디스크에 실재한다. union 으로 받아 문자열을
 * `{id, text}` 로 **정규화**하므로 소비처(UI·개정 LLM)는 항상 객체만 본다 — 스키마 시대를 소비처가
 * 알 필요가 없다(`schemaVersion` 마이그레이션과 동형: 읽을 때 변환, 다음 write 가 신형으로 굳힌다).
 *
 * `id` 합성은 **인덱스 기반**(`Q-1`…)이다. 구형엔 안정 키가 없어 이것 말고 고를 게 없다.
 * 다만 이 합성 id 로 답이 붙은 뒤엔 개정이 id 를 보존하므로(SKILL 지시), 흔들리는 건 최초 1회뿐이다.
 * id 누락 객체(LLM 실수)도 같은 규칙으로 메운다 — 없는 키 때문에 파싱을 통째로 튕기는 것보다 낫다.
 */
const QuestionsField = z.preprocess((v) => {
    if (!Array.isArray(v))
        return v; // 배열이 아니면 그대로 흘려 zod 가 정직하게 튕기게 둔다
    return v.map((q, i) => {
        const id = `Q-${i + 1}`;
        if (typeof q === 'string')
            return { id, text: q };
        if (q && typeof q === 'object' && !Array.isArray(q)) {
            const o = q;
            return o.id === undefined || o.id === null || o.id === '' ? { ...o, id } : o;
        }
        return q;
    });
}, z.array(IntakeQuestionSchema).default([]));
/** identified.json — 한 요청의 누적 중간산출(2계층). */
export const IdentifiedIntakeSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    request: IntakeRequestSchema,
    requirements: z.array(IntakeRequirementSchema).default([]),
    /**
     * ① `[확인필요]` — 모호점 질문. **사용자가 ① 컨펌 전에 답한다**(A1 이 그 자리를 지었다).
     * 답변은 재실행 트리거다 — 답이 changeset·AC 를 실제로 바꾼다(설계 D1·§4.2).
     */
    questions: QuestionsField,
}).superRefine((v, ctx) => {
    // ★ 질문 id 유일성 — **코드로** 강제한다(§7 C8 "게이트는 코드로").
    //
    // id 는 답을 붙잡는 키다(`qa-history.json` 의 `qid`). 중복이면 화면이 원장에서 답을 끌어올 때
    // **먼저 나온 질문이 남의 답을 주워** "답함"으로 렌더되고 입력칸이 사라진다 — 사용자가 그 질문에
    // 영영 답할 수 없다. 조용한 실패라 validate 를 통과해버리면 아무도 모른다.
    //
    // SKILL 의 "안정 키 — 재발번 금지"는 **산문**이라 LLM 이 어기면 그만이다. 실제로 어길 수 있는
    // 경로가 있다: id 누락 객체는 인덱스로 메워지므로(`QuestionsField`), 명시 id `Q-1` 과 합성 id
    // `Q-1` 이 충돌한다. 요구사항 id 중복은 `diagnoseIntake` 가 이미 잡는다 — 그 대칭이다.
    const seen = new Set();
    v.questions.forEach((q, i) => {
        if (seen.has(q.id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['questions', i, 'id'],
                message: `중복 질문ID: ${q.id} — 답변이 엉뚱한 질문에 붙습니다(id 는 답을 붙잡는 안정 키입니다)`,
            });
        }
        seen.add(q.id);
    });
});
/**
 * identified.json 파싱(검증). 실패하면 사람이 읽을 수 있는 메시지로 throw(조용한 null드롭 방지).
 * default 가 채워진 정규화 객체를 돌려준다.
 */
export function parseIdentifiedIntake(data) {
    const r = IdentifiedIntakeSchema.safeParse(data);
    if (!r.success) {
        const issues = r.error.issues
            .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('\n');
        throw new Error(`identified.json 검증 실패:\n${issues}`);
    }
    return r.data;
}
/**
 * 데이터 귀속 표기에서 테이블명을 추출한다 — `ACCOUNT(CR)` / `OAUTH_ACCOUNT(C)` 형태만.
 *
 * **의도적으로 좁다.** jpetstore 실측에서 LLM 이 쓴 데이터 셀은
 * `"(제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR)"` 이다. 이 `대문자명(CRUD)` 표기는
 * 어휘적으로 모호하지 않아 결정론 추출이 가능하다. 반면 산문 속 맨몸 대문자 토큰
 * (`SIGNON 을 읽는다`, `OAuth`, `API`)까지 테이블로 보면 **오탐이 차단(exit 2)으로 직결**되므로
 * 대조하지 않는다 — 못 잡는 형태가 있음을 인정하고 좁게 간다(설계서 §7 C8 "게이트는 코드로").
 *
 * 이름은 2자 이상(실존 테이블은 전부 2자 이상)이라 `A(C)` 류 잡음을 배제한다.
 */
const TABLE_CRUD_RE = /\b([A-Z][A-Z0-9_]+)\(([CRUD]+)\)/g;
export function extractTableRefs(text) {
    const out = [];
    for (const m of text.matchAll(TABLE_CRUD_RE)) {
        if (m[1])
            out.push(m[1]);
    }
    return out;
}
/**
 * 한 요구사항에서 테이블 표기가 나올 수 있는 자유텍스트 자리(필드경로, 값, 구조 confidence).
 *
 * 구조 confidence 를 갖는 자리는 AC 뿐이다(`AcceptanceCriterionSchema.confidence`). 나머지
 * 요구사항 필드엔 confidence 컬럼이 없어 `null` 이고, 단언 여부는 본문 태그로만 읽는다
 * (이 스키마 머리말: "전부 TO-BE 라 근거는 [추정]").
 */
function textFieldsOf(req) {
    const f = [
        ['name', req.name, null],
        ['definition', req.definition, null],
        ['scope', req.scope, null],
        ['origin', req.origin, null],
        ['spec.inputs', req.spec.inputs, null],
        ['spec.outputs', req.spec.outputs, null],
        ['spec.flow', req.spec.flow, null],
        ['spec.verify', req.spec.verify, null],
    ];
    req.spec.details.forEach((v, i) => f.push([`spec.details[${i}]`, v, null]));
    req.spec.exceptions.forEach((v, i) => f.push([`spec.exceptions[${i}]`, v, null]));
    req.spec.acceptance.forEach((v, i) => f.push([`spec.acceptance[${i}]`, v, null]));
    req.acceptanceCriteria.forEach((ac) => f.push([`acceptanceCriteria.${ac.id}.text`, ac.text, ac.confidence]));
    return f;
}
/**
 * `[확정]` — CONFIRMED 의 표기 태그. claims.ts 단일 소스에서 받아 어휘를 복제하지 않는다.
 * `[확정(AI)]`(CONFIRMED_AI)는 이 부분문자열을 포함하지 않아 걸리지 않는다 — 의도한 대로다.
 */
const CONFIRMED_TAG = confidenceTag('CONFIRMED');
/**
 * 이 자리가 **확정으로 단언**하고 있는가 — 차단 여부를 가르는 유일한 판정.
 *
 * L1 하드게이트(`impact/supplement-a.ts` `checkCreationL1` 의 "net-new CONFIRMED 위반")와
 * 같은 판정이다: 막는 건 신규 제안이 아니라 **신규를 CONFIRMED 로 단언하는 것**. L1 과 동일하게
 * `CONFIRMED` 만 본다(CONFIRMED_AI 는 L1 도 허용 → 여기서도 허용).
 *
 * 신호는 둘이다. ① 구조 confidence(AC 만 보유) ② 본문의 `[확정]` 태그(confidence 컬럼이 없는
 * 자유텍스트가 확정을 단언하는 유일한 방법).
 */
function assertsConfirmed(text, confidence) {
    return confidence === 'CONFIRMED' || text.includes(CONFIRMED_TAG);
}
/**
 * ★ 실재 대조(P1, P1b 교정) — 인테이크의 기능·테이블 참조를 분석 산출물과 결정론 대조한다.
 *
 * - **fnId**(전건 `error`): `changeset.modified/removed/revived` 는 이미 존재해야 한다(바꾸려면
 *   있어야 하니까 — 없는 걸 modified 라 하는 건 명백한 오류). `added` 는 신규라 `to-be:` 접두
 *   항목을 **면제**한다. 접두 없는 `added` 는 "기존 것을 추가한다"는 모순이므로 대조 대상이다.
 * - **테이블**(등급 분기): 자유텍스트의 `이름(CRUD)` 표기만(`extractTableRefs` 의 좁은 계약).
 *   db-schema 에 없으면 **신규 제안**이다 — 그 자체는 정당하므로 `info`. 단 `[확정]`/CONFIRMED 로
 *   **단언**하면 `error`(L1 `checkCreationL1` 의 "net-new CONFIRMED 금지"와 동일 판정).
 *
 * - **근거↔신뢰도**(P2, 전건 `error`): 인용이 **명시적으로 비었는데**(`evidence: []`) `[확정]`/
 *   CONFIRMED 로 단언하면 위반이다. 저장소 핵심 불변식("CONFIRMED 는 근거 0이면 안 된다",
 *   `doc-generator/types.ts:33`)의 인테이크판이고, 위 테이블 규칙과 같은 뿌리다.
 *   인용 필드 **부재(undefined)는 생략**한다 — 하위호환, `CitationField` 주석 참조.
 *
 * 인벤토리 미주입 축은 생략한다(근거↔신뢰도는 인벤토리와 무관하므로 항상 검사한다).
 * 호출자는 **`level === 'error'` 인 건이 있을 때만 차단**하고, `info` 는 표면화만 한다.
 */
export function checkIntakeGrounding(intake, inventory) {
    const out = [];
    // 인벤토리 축은 주입된 것만 대조한다. 미주입(undefined)이어도 아래 근거↔신뢰도 검사는 돈다 —
    // 그 검사는 항목 자신만 보므로 인벤토리를 요구하지 않는다.
    const fnIds = inventory?.fnIds ? new Set(inventory.fnIds) : null;
    const tables = inventory?.tables ? new Set(inventory.tables) : null;
    for (const req of intake.requirements) {
        // ★ 근거↔신뢰도 불변식(P2) — 인용 없는 확정 단언 금지.
        //
        // **AC 에만 적용된다.** 이 검사는 "확정 단언"과 "인용" 두 신호가 한 항목에 다 있어야 성립하는데,
        // 그 교집합은 AC 뿐이다(구조 confidence + evidence). changeset 은 인용을 갖되 confidence 컬럼도
        // 자유텍스트도 없어 **확정을 단언할 방법 자체가 없고**, 요구사항 자유텍스트(definition 등)는
        // `[확정]` 태그는 달 수 있으나 인용을 적을 자리가 없다(→ 인용 부재 = 생략과 같은 결론).
        // 없는 신호를 있는 척 검사하면 오탐이 차단으로 직결된다(§7 C8).
        for (const ac of req.acceptanceCriteria) {
            if (ac.evidence === undefined)
                continue; // 하위호환 — 인용 없는 스키마 시대의 산출
            if (ac.evidence.length > 0)
                continue;
            if (!assertsConfirmed(ac.text, ac.confidence))
                continue;
            out.push({
                kind: 'uncited-confirmed',
                level: 'error',
                reqId: req.id,
                field: `acceptanceCriteria.${ac.id}.evidence`,
                value: ac.id,
                message: `${req.id}/${ac.id} 이 근거 0건인데 ${CONFIRMED_TAG} 으로 단언 — 근거↔신뢰도 위반: ${ac.text}`,
            });
        }
        if (fnIds) {
            const buckets = [
                ['added', req.changeset.added],
                ['modified', req.changeset.modified],
                ['removed', req.changeset.removed],
                ['revived', req.changeset.revived],
            ];
            for (const [bucket, ids] of buckets) {
                for (const fnId of ids) {
                    // 신규(to-be:)를 added 하는 건 정상 — 아직 없는 게 당연하다.
                    if (bucket === 'added' && fnId.startsWith('to-be:'))
                        continue;
                    if (fnIds.has(fnId))
                        continue;
                    out.push({
                        kind: 'unknown-fn',
                        level: 'error',
                        reqId: req.id,
                        field: `changeset.${bucket}`,
                        value: fnId,
                        message: `${req.id} changeset.${bucket} 의 기능이 rtm.json 에 실재하지 않음: ${fnId}`,
                    });
                }
            }
        }
        if (tables) {
            const seen = new Set();
            for (const [field, text, confidence] of textFieldsOf(req)) {
                const confirmed = assertsConfirmed(text, confidence);
                for (const t of extractTableRefs(text)) {
                    if (tables.has(t))
                        continue;
                    const key = `${field} ${t}`;
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    out.push({
                        kind: 'unknown-table',
                        level: confirmed ? 'error' : 'info',
                        reqId: req.id,
                        field,
                        value: t,
                        message: confirmed
                            ? `${req.id} ${field} 의 신규 테이블(db-schema.json 에 없음)을 ${CONFIRMED_TAG} 으로 단언 — net-new CONFIRMED 위반: ${t}`
                            : `${req.id} ${field} 의 테이블이 db-schema.json 에 없음(신규 제안 — 정당할 수 있음, db-schema 를 보고 제안했는지 검토): ${t}`,
                    });
                }
            }
        }
    }
    return out;
}
/**
 * 비치명 일관성 진단(조용한 손실 금지) — 스키마는 통과하지만 의미상 어긋난 것을 표면화한다.
 * 반환 배열이 비면 깨끗. 강제하지 않고 가시화만 한다(critic 규약).
 *
 * ⚠ 여기 담기는 건 **경고**다. 실재 대조(차단)는 `checkIntakeGrounding` 이 따로 맡는다 —
 * 치명/비치명을 한 배열에 섞으면 호출자가 exit 코드를 못 가른다.
 */
export function diagnoseIntake(intake) {
    const out = [];
    const ids = new Set();
    const changesetIds = new Set();
    for (const req of intake.requirements) {
        // 중복 요구사항ID
        if (ids.has(req.id))
            out.push(`중복 요구사항ID: ${req.id}`);
        ids.add(req.id);
        // id 접두 = category
        const prefix = req.id.split('-')[0];
        if (prefix !== req.category) {
            out.push(`요구사항ID 접두(${prefix})와 구분(${req.category}) 불일치: ${req.id}`);
        }
        // 비기능인데 nfrCategory 누락
        if (req.type === 'nonfunctional' && req.nfrCategory === null) {
            out.push(`비기능 요구사항인데 nfrCategory 미지정: ${req.id}`);
        }
        for (const cs of [
            ...req.changeset.added,
            ...req.changeset.modified,
            ...req.changeset.removed,
            ...req.changeset.revived,
        ]) {
            changesetIds.add(cs);
        }
    }
    // derivedFrom 가 가리키는 요구사항이 같은 산출 안에 있는지(없으면 기존 인벤토리 참조일 수 있음 → warn)
    for (const req of intake.requirements) {
        if (req.derivedFrom && !ids.has(req.derivedFrom)) {
            out.push(`derivedFrom 대상이 이 산출에 없음(기존 요구사항이면 무시 가능): ${req.id} → ${req.derivedFrom}`);
        }
    }
    // AC.fnIds 는 해당 요구사항 changeset 에 등장해야 한다(유령 매핑 금지)
    for (const req of intake.requirements) {
        const local = new Set([
            ...req.changeset.added,
            ...req.changeset.modified,
            ...req.changeset.removed,
            ...req.changeset.revived,
        ]);
        for (const ac of req.acceptanceCriteria) {
            for (const fnId of ac.fnIds) {
                if (!local.has(fnId)) {
                    out.push(`AC fnId 가 changeset 에 없음: ${req.id}/${ac.id} → ${fnId}`);
                }
            }
        }
    }
    return out;
}
//# sourceMappingURL=intake-types.js.map