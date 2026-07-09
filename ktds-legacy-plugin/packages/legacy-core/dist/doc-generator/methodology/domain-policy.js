import { inferred } from '../builders/shared.js';
import { claim } from '../claims.js';
/**
 * 스캐폴드 표기 규약:
 *  - S(`《 》`)        = 순수 빈칸(도구가 제안할 근거 없음 → 사람 입력).
 *  - DATE             = 형식만 안내하는 빈칸(사람이 날짜 입력).
 *  - 제안값           = `《 》` 없이 일반 텍스트 + 신뢰도 [추정](도구/LLM 제안).
 *  - HINT(text)       = 형식/내용 안내가 필요한 빈칸(`《 …》`).
 */
const S = '《 》';
const DATE = '《YYYY-MM-DD》';
function hint(text) {
    return `《${text}》`;
}
/** evidence 헬퍼 — null 이면 빈 배열(스캐폴드). */
function ev(e) {
    return e ? [{ file: e.file, line: e.line }] : [];
}
/** 스캐폴드 행(근거 없음 → INFERRED, 채움 유도). */
function scaffoldRow(cells) {
    return { cells, confidence: 'INFERRED', evidence: [] };
}
// ── §0 문서 정보 ─────────────────────────────────────────────────────────────
function docControlSections(d) {
    const artifacts = d.classes.map((c) => c.relPath).slice(0, 8).join(', ') || S;
    const info = [
        { cells: ['문서명', `${d.name} 정책 정의서`], confidence: 'INFERRED', evidence: [] }, // 제안값(파생)
        scaffoldRow(['문서 버전', 'v0.1 (자동 초안)']), // 제안값
        scaffoldRow(['작성일', DATE]), // 형식 안내 빈칸
        scaffoldRow(['작성자 / 검토자 / 승인자', S]), // 순수 빈칸
        {
            cells: ['관련 산출물', artifacts],
            confidence: d.classes.length > 0 ? 'CONFIRMED' : 'INFERRED',
            evidence: d.classes.slice(0, 8).map((c) => ({ file: c.relPath, line: null })),
        },
    ];
    const revision = [scaffoldRow(['v0.1', DATE, '최초 자동 초안(코드 추출)', '자동', S])];
    return [
        { heading: '문서 정보', key: 'doc-control', claims: [], table: { columns: ['항목', '내용'], rows: info } },
        {
            heading: '개정 이력',
            key: 'revision-history',
            claims: [],
            table: { columns: ['버전', '일자', '변경 내용', '작성자', '승인자'], rows: revision },
        },
    ];
}
// ── §1 개요 ─────────────────────────────────────────────────────────────────
function overviewSection(d) {
    const scope = d.classes.map((c) => c.className).slice(0, 8).join(', ') || S;
    const rows = [
        scaffoldRow(['목적', hint('서비스 전략과 연결된 목적 기술')]),
        {
            cells: ['적용 범위', scope],
            confidence: d.classes.length > 0 ? 'CONFIRMED' : 'INFERRED',
            evidence: d.classes.slice(0, 8).map((c) => ({ file: c.relPath, line: null })),
        },
        scaffoldRow(['적용 제외', S]),
        scaffoldRow(['정책 소유 부서', S]),
    ];
    return { heading: '개요', key: 'overview', claims: [], table: { columns: ['항목', '내용'], rows } };
}
// ── §2 용어 정의 ─────────────────────────────────────────────────────────────
function glossarySection(d) {
    const rows = (d.terms ?? []).map((t) => ({
        cells: [t.term, t.definition, t.note],
        confidence: t.evidence ? 'CONFIRMED' : 'INFERRED',
        evidence: ev(t.evidence),
    }));
    return {
        heading: '용어 정의',
        key: 'glossary',
        claims: rows.length === 0 ? [inferred('도메인 용어가 추출되지 않음(DB 주석/enum 부재) — 보강 대상.')] : [],
        table: { columns: ['용어', '정의', '비고'], rows },
    };
}
// ── §3 상태값 정의 ───────────────────────────────────────────────────────────
function statusSection(d) {
    const rows = (d.statusCodes ?? []).map((s) => ({
        cells: [s.group, s.code, s.name, s.desc],
        confidence: s.evidence ? 'CONFIRMED' : 'INFERRED',
        evidence: ev(s.evidence),
    }));
    return {
        heading: '상태값 정의',
        key: 'status-codes',
        claims: rows.length === 0
            ? [inferred('상태값 코드 그룹/enum 미발견 [확인 필요] — 분기 조건의 상태값을 코드로 명문화 필요.')]
            : [],
        table: { columns: ['코드 그룹', '코드값', '명칭', '설명'], rows },
    };
}
// ── §4 정책 규칙 — 의사결정 테이블 ★핵심★ ────────────────────────────────────
function pid(i) {
    return `PL-${String(i + 1).padStart(3, '0')}`;
}
function decisionTableSection(d) {
    const rows = d.branches.map((b, i) => ({
        // 정책 ID·IF·THEN·근거 = 결정론. 정책명·우선순위(시드=순서)·예외/비고 = 보강.
        cells: [
            pid(i),
            S, // 정책명 [추정]
            b.condition,
            b.then.length > 0 ? b.then : S,
            String(i + 1), // 우선순위 시드(if/else-if 순서) [추정]
            b.methodName ? `${b.methodName}() · ${b.kind}` : b.kind,
        ],
        confidence: 'CONFIRMED', // 행 존재 근거 = 분기(file:line)
        evidence: [{ file: b.relPath, line: b.line }],
    }));
    return {
        heading: '정책 규칙 — 의사결정 테이블',
        key: 'decision-table',
        claims: rows.length === 0
            ? [inferred('조건 분기 없음 — 무조건 처리(조건부 정책 부재). 분기 없음을 코드 근거로 단정.')]
            : [inferred('정책명·우선순위·예외/비고는 [추정](보강). 적용 조건(IF)·처리(THEN)·근거는 [확정].')],
        table: {
            columns: ['정책 ID', '정책명', '적용 조건 (IF)', '처리 내용 (THEN)', '우선순위', '예외/비고'],
            rows,
        },
    };
}
// ── §5 예외 및 엣지 케이스 ───────────────────────────────────────────────────
function exceptionsSection() {
    return {
        heading: '예외 및 엣지 케이스',
        key: 'exceptions',
        claims: [],
        table: { columns: ['No', '상황', '처리 방침', '담당'], rows: [scaffoldRow(['1', S, S, S])] },
    };
}
// ── §6 처리 흐름 (의사코드) ──────────────────────────────────────────────────
function processFlowSection(d) {
    // 메서드별로 IF 조건 → THEN 한 줄. 결정론(분기 순서). 근거 동반.
    const byMethod = new Map();
    for (const b of d.branches) {
        const k = b.methodName ?? '(unknown)';
        const list = byMethod.get(k) ?? [];
        list.push(b);
        byMethod.set(k, list);
    }
    const claims = [];
    for (const [method, brs] of byMethod) {
        for (const b of brs) {
            const then = b.then.length > 0 ? b.then : '…';
            claims.push(claim(`${method}(): IF ${b.condition} → ${then}`, 'CONFIRMED', [{ file: b.relPath, line: b.line }]));
        }
    }
    return {
        heading: '처리 흐름 (의사코드)',
        key: 'process-flow',
        claims: claims.length > 0 ? claims : [inferred('흐름 내 결정 지점이 없습니다(단순 흐름).')],
    };
}
// ── §7 검증 시나리오 ─────────────────────────────────────────────────────────
function validationSection(d) {
    // 분기가 있으면 PL-ID 참조 스캐폴드 행을, 없으면 빈 스캐폴드.
    const rows = d.branches.slice(0, 3).map((_, i) => scaffoldRow([`TC-${String(i + 1).padStart(2, '0')}`, S, S, pid(i)]));
    return {
        heading: '검증 시나리오',
        key: 'validation',
        claims: [],
        table: { columns: ['TC ID', '입력 조건', '기대 결과', '적용 정책'], rows: rows.length > 0 ? rows : [scaffoldRow(['TC-01', S, S, S])] },
    };
}
// ── §8 미결 사항 ─────────────────────────────────────────────────────────────
function openIssuesSection(d) {
    const rows = [];
    // 정직한 갭을 미결로 자동 시드.
    if ((d.statusCodes ?? []).length === 0) {
        rows.push(scaffoldRow(['1', '상태값 코드 그룹/enum 미정의(분기 조건의 상태값)', '미정', S]));
    }
    rows.push(scaffoldRow([String(rows.length + 1), S, S, S]));
    return {
        heading: '미결 사항',
        key: 'open-issues',
        claims: [],
        table: { columns: ['No', '이슈', '상태', '결정 필요일'], rows },
    };
}
/** 한 도메인(정책 토픽)의 정책 정의서를 §0~§8 양식으로 조립한다. */
export function buildDomainPolicyDoc(d) {
    return {
        docId: `policy-domain-${d.key}`,
        title: `${d.name} 정책 정의서`,
        methodology: 'domain-policy',
        sections: [
            ...docControlSections(d),
            overviewSection(d),
            glossarySection(d),
            statusSection(d),
            decisionTableSection(d),
            exceptionsSection(),
            processFlowSection(d),
            validationSection(d),
            openIssuesSection(d),
        ],
    };
}
/** domain-policy 모듈 — 도메인(토픽)당 1문서를 동적 산출. */
export const domainPolicyMethodology = {
    id: 'domain-policy',
    title: '도메인 정책서(domain-policy)',
    buildDocSet(input) {
        return (input.domainPolicies ?? []).map(buildDomainPolicyDoc);
    },
};
//# sourceMappingURL=domain-policy.js.map