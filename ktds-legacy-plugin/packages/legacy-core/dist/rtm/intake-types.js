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
    acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
    changeset: RtmChangesetSchema.default({ added: [], modified: [], removed: [], revived: [] }),
});
/** identified.json — 한 요청의 누적 중간산출(2계층). */
export const IdentifiedIntakeSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    request: IntakeRequestSchema,
    requirements: z.array(IntakeRequirementSchema).default([]),
    /** ① [확인필요] — 모호점 질문 목록(사용자가 컨펌 게이트에서 답한다). */
    questions: z.array(z.string()).default([]),
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
 * 비치명 일관성 진단(조용한 손실 금지) — 스키마는 통과하지만 의미상 어긋난 것을 표면화한다.
 * 반환 배열이 비면 깨끗. 강제하지 않고 가시화만 한다(critic 규약).
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