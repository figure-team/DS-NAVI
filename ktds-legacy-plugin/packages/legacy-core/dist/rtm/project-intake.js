/** intake priority(HIGH/MEDIUM/LOW)는 RtmRequirement.priority 와 동일 enum. */
function emptyCell(confidence) {
    return { value: '', confidence, evidence: [] };
}
/**
 * 한 요구사항(SFR…)을 현 스키마 RtmRequirement 로 투영. 신규(TO-BE)라 전부 [추정]·검수/시험 미입력.
 * 요청(REQ)은 source.section 으로 귀속. derivedFrom 은 dependsOn 으로 연결(SIR-002 ← SFR-010).
 */
export function intakeReqToRtmRequirement(req, request) {
    const changesetIds = [
        ...req.changeset.added,
        ...req.changeset.modified,
        ...req.changeset.removed,
        ...req.changeset.revived,
    ];
    return {
        id: req.id,
        text: req.name,
        type: req.type,
        nfrCategory: req.nfrCategory,
        // 비기능은 영향 기능을 횡단 귀속(nfrScope), 기능은 빈 배열.
        nfrScope: req.type === 'nonfunctional' ? Array.from(new Set(changesetIds)) : [],
        priority: req.priority,
        lifecycle: 'RECEIVED',
        // 절차 B: 인테이크 폐기는 rtm.json 에서도 WITHDRAWN(대체 요구 없는 철회). SUPERSEDED 와 구분.
        status: req.status === 'WITHDRAWN' ? 'WITHDRAWN' : 'ACTIVE',
        supersedes: null,
        supersededBy: null,
        dependsOn: req.derivedFrom ? [req.derivedFrom] : [],
        source: {
            kind: 'customer',
            raw: request.raw,
            section: request.id, // 요청ID 그룹핑(요청↔요구사항 연결)
            requestedAt: request.requestedAt ?? undefined,
        },
        changeReq: null,
        signoff: null,
        acceptanceCriteria: req.acceptanceCriteria,
        changeset: req.changeset,
    };
}
/**
 * 신규(TO-BE) 기능 스텁 — changeset.added 의 fnId 1개당 1행. 셀은 코드 부재라 전부 미검증/빈 값.
 * domainId/domainName 과 featureId·requirementHistory 는 파일 맥락을 아는 호출자가 결정해 넘긴다.
 */
export function intakeFnStub(fnId, featureId, domainId, domainName, requirementHistory) {
    // id 마지막 세그먼트(하이픈→공백)를 표시명으로.
    const seg = fnId.split('/').pop() ?? fnId;
    const name = seg.replace(/-/g, ' ');
    return {
        id: fnId,
        featureId,
        name,
        domainId,
        domainName,
        entryPoint: emptyCell('UNVERIFIED'),
        implementation: emptyCell('UNVERIFIED'),
        data: emptyCell('UNVERIFIED'),
        test: emptyCell('UNVERIFIED'),
        origin: 'TO_BE',
        state: 'PLANNED',
        requirementHistory,
        nfrTags: [],
        rules: [],
        deliverableRefs: [],
        custom: {},
    };
}
/** fnId 의 도메인 키 추출 — 'to-be:account/x' / 'domain:account/x' / 'account/x' → 'account'. */
export function fnDomainKey(fnId) {
    const withoutScope = fnId.replace(/^(to-be:|domain:)/, '');
    return withoutScope.split('/')[0] ?? withoutScope;
}
//# sourceMappingURL=project-intake.js.map