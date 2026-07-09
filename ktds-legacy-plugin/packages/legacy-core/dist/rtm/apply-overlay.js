import { RtmFunctionOverrideSchema, RtmRequirementOverrideSchema, RtmScenarioOverrideSchema, } from './types.js';
import { computeCoverage } from './coverage.js';
import { computeDiagnostics } from './validate.js';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** on-disk 오버레이를 섹션별로 분리(최상위 fnId vs `_requirements`/`_scenarios`/`_fields`). */
function splitOverlay(raw) {
    const functions = {};
    const requirements = {};
    const scenarios = {};
    const fields = [];
    for (const [k, v] of Object.entries(raw)) {
        if (k === '_requirements') {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                for (const [reqId, rv] of Object.entries(v)) {
                    const p = RtmRequirementOverrideSchema.safeParse(rv);
                    if (p.success)
                        requirements[reqId] = p.data;
                }
            }
            continue;
        }
        if (k === '_scenarios') {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                for (const [tsId, sv] of Object.entries(v)) {
                    const p = RtmScenarioOverrideSchema.safeParse(sv);
                    if (p.success)
                        scenarios[tsId] = p.data;
                }
            }
            continue;
        }
        if (k === '_fields') {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                for (const [fieldId, fv] of Object.entries(v)) {
                    if (!fieldId.startsWith('custom:'))
                        continue; // 네임스페이스 강제(코어 키 충돌 방지).
                    if (!fv || typeof fv !== 'object' || typeof fv.label !== 'string')
                        continue;
                    fields.push({
                        id: fieldId,
                        label: fv.label,
                        scope: 'function',
                        createdBy: typeof fv.createdBy === 'string' ? fv.createdBy : '',
                        at: typeof fv.at === 'string' ? fv.at : '',
                    });
                }
            }
            continue;
        }
        if (k.startsWith('_'))
            continue; // 그 외 예약 키 무시(전방호환).
        const p = RtmFunctionOverrideSchema.safeParse(v);
        if (p.success)
            functions[k] = p.data;
    }
    fields.sort((a, b) => cmp(a.id, b.id));
    return { functions, requirements, scenarios, fields };
}
/** editedCells 키 → 기능 셀 적용(값만 덮음). `custom:*` 키는 R7 사용자 필드 값으로 병합. */
function applyFnEdits(f, ov) {
    const e = ov.editedCells;
    const cell = (key) => typeof e[key] === 'string' ? { ...f[key], value: e[key] } : f[key];
    const custom = { ...f.custom };
    for (const [k, v] of Object.entries(e)) {
        if (k.startsWith('custom:') && typeof v === 'string')
            custom[k] = v;
    }
    return {
        ...f,
        name: typeof e.name === 'string' ? e.name : f.name,
        entryPoint: cell('entryPoint'),
        implementation: cell('implementation'),
        data: cell('data'),
        test: cell('test'),
        custom,
    };
}
/**
 * 시나리오 오버레이 적용 — G/W/T·제목 덮기 + 확정(CONFIRMED 승격, W5 설계 §4).
 * 대시보드 확정은 항상 그 시점 G/W/T 전체를 editedCells 에 **스냅샷 박제**한다(리뷰 R1 —
 * 아니면 재생성 시 확정 배지를 단 채 본문이 조용히 바뀐다). editedCells 가 부분/비어
 * 있는 수기 오버레이는 생성 텍스트가 남는다(그 몫은 작성자 책임 — 부분 덮기 허용 유지).
 */
function applyScenarioEdits(s, ov) {
    const e = ov.editedCells;
    const pick = (key) => typeof e[key] === 'string' ? e[key] : s[key];
    return {
        ...s,
        title: pick('title'),
        given: pick('given'),
        when: pick('when'),
        then: pick('then'),
        confidence: 'CONFIRMED',
    };
}
/** 요구사항 오버레이 적용 — lifecycle/signoff 덮기 + AC 시험결과 반영. */
function applyReqEdits(r, ov) {
    const acceptanceCriteria = r.acceptanceCriteria.map((ac) => {
        const tests = ac.tests.map((t) => {
            const key = `${ac.id}::${t.caseId}`;
            const o = ov.tests[key];
            return o ? { ...t, result: o.result, defectId: o.defectId } : t;
        });
        return { ...ac, tests };
    });
    return {
        ...r,
        lifecycle: ov.lifecycle ?? r.lifecycle,
        signoff: ov.signoff !== undefined ? ov.signoff : r.signoff,
        acceptanceCriteria,
    };
}
/**
 * 오버레이를 모델에 적용해 merged 모델 + 재계산된 coverage/diagnostics 를 반환.
 * rawOverlay 가 비었으면(없음) 입력 모델을 그대로(coverage 만 보장) 돌려준다.
 */
export function applyOverlay(model, rawOverlay = {}) {
    const { functions: fnOv, requirements: reqOv, scenarios: scOv, fields } = splitOverlay(rawOverlay);
    const functions = model.functions.map((f) => (fnOv[f.id] ? applyFnEdits(f, fnOv[f.id]) : f));
    const requirements = model.requirements.map((r) => (reqOv[r.id] ? applyReqEdits(r, reqOv[r.id]) : r));
    // 방어적 접근: 구버전 rtm.json/픽스처는 testScenarios 가 없을 수 있다(zod 미경유 로드).
    const testScenarios = (model.testScenarios ?? []).map((s) => scOv[s.id] ? applyScenarioEdits(s, scOv[s.id]) : s);
    const confirmedIds = new Set(Object.keys(fnOv));
    const merged = { ...model, functions, requirements, testScenarios, customFields: fields };
    // 재스캔으로 사라진 대상을 가리키는 오버레이 — 조용한 손실 금지(warn 표면화, 3축 대칭 R7).
    const orphanWarns = (section, live, code, what) => Object.keys(section)
        .filter((id) => !live.has(id))
        .sort(cmp)
        .map((id) => ({
        level: 'warn',
        code,
        message: `${what} 오버레이가 존재하지 않는 대상을 가리킴(재생성으로 소실 가능): ${id}`,
        ref: id,
    }));
    const warns = [
        ...orphanWarns(fnOv, new Set(functions.map((f) => f.id)), 'FN_OVERRIDE_ORPHAN', '기능'),
        ...orphanWarns(reqOv, new Set(requirements.map((r) => r.id)), 'REQ_OVERRIDE_ORPHAN', '요구사항'),
        ...orphanWarns(scOv, new Set(testScenarios.map((s) => s.id)), 'SCENARIO_OVERRIDE_ORPHAN', '시나리오'),
    ];
    return {
        ...merged,
        coverage: computeCoverage(merged, confirmedIds),
        diagnostics: [...computeDiagnostics(merged), ...warns],
    };
}
//# sourceMappingURL=apply-overlay.js.map