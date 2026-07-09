import { verifyAnchorExists } from './verify.js';
import { classifyRole } from './precedents.js';
import { cmp } from '../utils/cmp.js';
export class CreationL1Error extends Error {
    violations;
    constructor(violations) {
        super(`생성예측 L1 게이트 위반: ${violations.join(' | ')}`);
        this.violations = violations;
        this.name = 'CreationL1Error';
    }
}
/** 역할별 클래스 접미사(자바) / 파일 접미사. */
const ROLE_SUFFIX = {
    controller: 'Controller',
    service: 'Service',
    repository: 'Mapper',
    entity: '',
    xml: 'Mapper',
    other: '',
};
const ROLE_LABEL_KO = {
    controller: '컨트롤러(진입점)',
    service: '서비스(업무 로직)',
    repository: '매퍼/리포지토리(영속성)',
    entity: '도메인/엔티티',
    xml: '매퍼 XML(SQL)',
    other: '기타',
};
/** PascalCase 정규화(엔티티 힌트). 영숫자만 남기고 첫 글자 대문자. */
function pascal(hint) {
    const cleaned = hint.replace(/[^A-Za-z0-9]+/g, ' ').trim();
    return cleaned
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
        .join('');
}
/** 선례 파일 + 역할 + 엔티티 힌트 → 신규 analog 경로(같은 디렉터리). 구체 경로 = 선례 강/부분에서만. */
function deriveAnalogPath(precedentFile, role, entity) {
    const slash = precedentFile.lastIndexOf('/');
    const dir = slash >= 0 ? precedentFile.slice(0, slash + 1) : '';
    const ext = role === 'xml' ? '.xml' : '.java';
    const base = pascal(entity) + (ROLE_SUFFIX[role] ?? '');
    return `${dir}${base}${ext}`;
}
function toAnchor(projectRoot, file, line) {
    const status = verifyAnchorExists(projectRoot, { filePath: file, line });
    return { file, line, status, confirmed: status === 'ok' };
}
const DEFAULT_SCAFFOLD_ROLES = ['controller', 'service', 'repository'];
const PRECEDENT_ROLE_ORDER = ['controller', 'service', 'repository', 'entity', 'xml'];
/**
 * 3분류 생성예측 제안을 결정론으로 조립한다. confidence 규칙은 위 모듈 주석 참조.
 * L1 위반은 throw 하지 않고 l1Violations 로 수집한다(게이트는 assertCreationL1).
 */
export function buildCreationSuggestion(projectRoot, params) {
    const { intent, entityHint, precedent, impact, census } = params;
    const strength = precedent ? precedent.matchStrength : 'none';
    const opHints = (intent.operationHints ?? []).filter(Boolean);
    const opSymbol = opHints.length > 0 ? pascal(opHints[0]).charAt(0).toLowerCase() + pascal(opHints[0]).slice(1) : null;
    // ── [변경] 기존 파일 ───────────────────────────────────────────────────────
    const change = (params.changeTargets ?? [])
        .map((t) => {
        const anchor = toAnchor(projectRoot, t.relPath, t.line);
        // 앵커 실존 → 기존 코드 기계검증 통과 → CONFIRMED. 미실존 → UNVERIFIED 강등.
        const confidence = anchor.status === 'ok' ? 'CONFIRMED' : 'UNVERIFIED';
        return { relPath: t.relPath, symbols: [...(t.symbols ?? [])], anchor, confidence };
    })
        .sort((a, b) => cmp(a.relPath, b.relPath) || cmp(a.anchor.line, b.anchor.line));
    // ── [생성] 신규 파일 ───────────────────────────────────────────────────────
    const create = [];
    if (precedent) {
        for (const role of PRECEDENT_ROLE_ORDER) {
            const files = precedent.filesByRole[role];
            if (!files || files.length === 0)
                continue;
            const precedentFile = [...files].sort(cmp)[0];
            // 컨트롤러는 진입 라우트 라인을 앵커로, 그 외엔 파일 첫 라인(실존 기준).
            const anchorLine = role === 'controller' && precedent.entryLine ? precedent.entryLine : 1;
            const className = pascal(entityHint) + (ROLE_SUFFIX[role] ?? '');
            const symbols = role === 'controller' && opSymbol ? [`${className}.${opSymbol}()`] : [className];
            create.push({
                role,
                suggestedPath: deriveAnalogPath(precedentFile, role, entityHint),
                symbols,
                precedentAnchors: [toAnchor(projectRoot, precedentFile, anchorLine)],
                conventionAnchors: [],
                confidence: 'INFERRED', // net-new — 절대 CONFIRMED 아님
                strength,
            });
        }
    }
    else {
        // 선례 없음(A-A3): 역할 단위 스캐폴드 + 관례 앵커. 구체 파일명 없음(suggestedPath=null).
        const byRole = new Map();
        for (const f of [...census.files].sort((a, b) => cmp(a.relPath, b.relPath))) {
            const role = classifyRole(f.relPath);
            if (!byRole.has(role))
                byRole.set(role, f.relPath);
        }
        for (const role of params.scaffoldRoles ?? DEFAULT_SCAFFOLD_ROLES) {
            const conventionFile = byRole.get(role);
            const conventionAnchors = conventionFile ? [toAnchor(projectRoot, conventionFile, 1)] : [];
            create.push({
                role: ROLE_LABEL_KO[role] ?? role,
                suggestedPath: null, // 구체 파일명을 지어내지 않는다(AC-13b)
                symbols: [`역할: ${ROLE_LABEL_KO[role] ?? role}`],
                precedentAnchors: [],
                conventionAnchors,
                confidence: 'UNVERIFIED', // 선례 없음 — [확인 필요]
                strength: 'none',
            });
        }
    }
    // ── [영향] reachability(impact 재사용) ──────────────────────────────────────
    const impactItems = [];
    for (const f of impact.upstream.files) {
        impactItems.push({ ref: f.relPath, kind: 'upstream', confidence: f.citation ? 'CONFIRMED_AI' : 'INFERRED' });
    }
    for (const a of impact.upstream.api) {
        impactItems.push({ ref: a.id, kind: 'api', confidence: a.confidence });
    }
    for (const fl of impact.upstream.flows) {
        impactItems.push({ ref: fl.flowId, kind: 'flow', confidence: fl.confidence });
    }
    for (const d of impact.upstream.domains) {
        impactItems.push({ ref: d.key, kind: 'domain', confidence: d.confidence });
    }
    impactItems.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.ref, b.ref));
    const suggestion = {
        intent,
        entityHint,
        strength,
        precedentFlowId: precedent?.flowId ?? null,
        change,
        create,
        impact: impactItems,
        l1Violations: [],
    };
    suggestion.l1Violations = checkCreationL1(suggestion);
    return suggestion;
}
/**
 * L1 하드게이트 검사 — 위반 사유 배열(빈 배열 = 통과). CI 가 이 게이트를 하드로 건다.
 *  1) net-new(`[생성]`) 항목은 CONFIRMED 금지(최대 INFERRED).
 *  2) 모든 선례/관례 앵커는 실존(ok)해야 한다(환각 앵커 차단).
 *  3) 선례 없음 강등 항목은 구체 파일명(suggestedPath) 금지.
 *  4) 3버킷(change/create/impact)이 구조적으로 존재.
 */
export function checkCreationL1(s) {
    const violations = [];
    if (!Array.isArray(s.change) || !Array.isArray(s.create) || !Array.isArray(s.impact)) {
        violations.push('3버킷 구조 누락');
    }
    // [변경]=CONFIRMED 는 반드시 실존 앵커(ok)여야 한다 — 게이트가 공개 계약으로 재확인
    // (외부 호출자가 미실존 앵커로 CONFIRMED 를 위조하지 못하게).
    for (const c of s.change) {
        if (c.confidence === 'CONFIRMED' && c.anchor.status !== 'ok') {
            violations.push(`[변경] CONFIRMED 인데 앵커 미실존(${c.anchor.status}): ${c.relPath}:${c.anchor.line}`);
        }
    }
    for (const c of s.create) {
        if (c.confidence === 'CONFIRMED') {
            violations.push(`net-new CONFIRMED 위반: ${c.suggestedPath ?? c.role}`);
        }
        for (const a of [...c.precedentAnchors, ...c.conventionAnchors]) {
            if (a.status !== 'ok')
                violations.push(`앵커 미실존(${a.status}): ${a.file}:${a.line}`);
        }
        if (c.strength === 'none' && c.suggestedPath !== null) {
            violations.push(`선례없음인데 구체 파일명 생성: ${c.suggestedPath}`);
        }
    }
    return violations;
}
/** L1 위반이 있으면 throw(fail-closed) — 하드 게이트가 필요한 발행 경로에서 호출. */
export function assertCreationL1(s) {
    if (s.l1Violations.length > 0)
        throw new CreationL1Error(s.l1Violations);
}
//# sourceMappingURL=supplement-a.js.map