import { confidenceTag } from '../doc-generator/claims.js';
/** TableRow evidence → 엑셀 근거 셀(`f:l, f2:l2` — md 백틱 제거판). */
function evidenceCell(row) {
    return row.evidence
        .map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`))
        .join(', ');
}
/** 집계 행 판별(W3 si-프로그램목록 규약) — 강조행으로 구분. */
function isAggregateRow(row) {
    return row.confidence === 'INFERRED' && (row.cells[0] ?? '').startsWith('집계');
}
/**
 * '문서정보' 표지 시트 — 발주처 서식 관례 + 오독 방지 안내 3종:
 * ① 본 파일의 지위(스캔 스냅샷 원천 데이터 — 대시보드 확정 편집 미반영),
 * ② 신뢰도 [확정] = 정적 분석 근거 보유(사람 검수·사인오프 아님),
 * ③ 재생성 경로. 소스 커밋으로 시점 식별(타임스탬프 대신 — 결정론 유지).
 */
function infoSheet(title, methodology, meta) {
    return {
        name: '문서정보',
        rows: [
            { cells: ['항목', '내용'], style: 'header' },
            { cells: ['문서명', title] },
            { cells: ['방법론', methodology ?? ''] },
            { cells: ['소스 커밋', meta?.sourceCommit ?? '[미확인]'] },
            { cells: ['작성자 / 버전 / 작성일', '[미확인] — 제출 전 사람이 채움'] },
            {
                cells: [
                    '본 파일의 지위',
                    '정적 스캔 스냅샷(원천 데이터) — 대시보드에서의 확정 편집은 반영되지 않음. 최신화는 /understand-docs 재실행.',
                ],
                style: 'bold',
            },
            {
                cells: [
                    '신뢰도 표기',
                    '[확정]=정적 분석 근거(file:line) 보유, [추정]=추론, [미확인]=사람 채움 대상 — 사람 검수/사인오프 여부와 무관.',
                ],
                style: 'bold',
            },
        ],
    };
}
/** GeneratedDoc → 시트 목록(문서정보 + 표 보유 섹션당 1시트). 표 섹션 없으면 빈 배열. */
export function docToSheets(doc, meta) {
    const sheets = [];
    for (const section of doc.sections) {
        const table = section.table;
        if (!table)
            continue;
        const rows = [
            { cells: [...table.columns, '신뢰도', '근거'], style: 'header' },
            ...table.rows.map((r) => ({
                cells: [...r.cells, confidenceTag(r.confidence), evidenceCell(r)],
                ...(isAggregateRow(r) ? { style: 'bold' } : {}),
            })),
        ];
        sheets.push({ name: section.heading, rows });
    }
    // 표 섹션이 하나라도 있어야 xlsx 실익 — 있으면 문서정보 표지를 맨 앞에.
    return sheets.length > 0 ? [infoSheet(doc.title, doc.methodology, meta), ...sheets] : [];
}
function groundedCell(g) {
    return g?.value ?? '';
}
function groundedEvidence(g) {
    return (g?.evidence ?? [])
        .map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`))
        .join(', ');
}
/**
 * RTM 원장 → 시트 5개(문서정보 + §1 요구사항 원장 + §2 기능(AS-IS) 원장 + §3 테스트
 * 시나리오(W5) + §4 커버리지 현황). 기능 원장에는 R7 사용자 정의 필드가 동적 열로 붙는다.
 * 검증 스파인(검수 signoff·시험 test)을 열로 승계 — 감리의 "검수 근거" 질의에 xlsx 로
 * 답할 수 있어야 한다(W7 비평 반영). 빈 원장도 헤더는 출력(빈 원장 결정과 정합).
 * 주: 대시보드 행단위 오버레이(rtm-overrides)는 미반영 — 문서정보 시트에 지위 명시,
 * 오버레이 병합은 백로그(설계 §10).
 */
export function rtmToSheets(rtm, meta) {
    const reqRows = [
        {
            cells: ['REQ_ID', '요구사항', '유형', 'NFR', '우선순위', '수명주기', '상태', '선행요구', '출처', '수용기준 수', '검수'],
            style: 'header',
        },
        ...(rtm.requirements ?? []).map((r) => ({
            cells: [
                r.id,
                r.text,
                r.type ?? '',
                r.nfrCategory ?? '',
                r.priority ?? '',
                r.lifecycle ?? '',
                r.status ?? '',
                (r.dependsOn ?? []).join(', '),
                r.source?.kind ? `${r.source.kind}${r.source.raw ? `: ${r.source.raw}` : ''}` : '',
                String((r.acceptanceCriteria ?? []).length),
                r.signoff ? `검수(${r.signoff.approver ?? ''}${r.signoff.at ? ` @ ${r.signoff.at}` : ''})` : '미검수',
            ],
        })),
    ];
    // R7: 사용자 정의 필드 → 기능 원장 동적 열(정의 순 — applyOverlay 가 id ASC 정렬).
    const customFields = (rtm.customFields ?? []).filter((f) => typeof f.id === 'string');
    const fnRows = [
        {
            cells: [
                'FN_ID', '기능명', '도메인', '진입점', '구현', '시험', '상태', '연관 요구',
                ...customFields.map((f) => f.label ?? f.id ?? ''),
                '근거',
            ],
            style: 'header',
        },
        ...(rtm.functions ?? []).map((f) => ({
            cells: [
                f.featureId ?? '',
                f.name ?? '',
                f.domainName ?? '',
                groundedCell(f.entryPoint),
                groundedCell(f.implementation),
                groundedCell(f.test) || '미시험',
                f.state ?? '',
                (f.requirementHistory ?? []).join(', '),
                ...customFields.map((cf) => f.custom?.[cf.id ?? ''] ?? ''),
                groundedEvidence(f.entryPoint) || groundedEvidence(f.implementation),
            ],
        })),
    ];
    // W5: 테스트 시나리오 원장 — 초안 [추정]/확정 구분, 기능/요구/AC 추적선 승계.
    const TS_KIND_KO = { normal: '정상', exception: '예외', boundary: '경계' };
    const fnByIdForTs = new Map((rtm.functions ?? []).map((f) => [f.id ?? '', f]));
    const tsRows = [
        {
            cells: ['TS_ID', 'FN_ID', '기능명', '요구ID', 'AC', '구분', '제목', 'Given', 'When', 'Then', '상태', '비고', '근거'],
            style: 'header',
        },
        ...(rtm.testScenarios ?? []).map((s) => {
            const fn = fnByIdForTs.get(s.fnId ?? '');
            return {
                cells: [
                    s.id ?? '',
                    fn?.featureId ?? '',
                    fn?.name ?? '',
                    s.reqId ?? '',
                    s.acId ?? '',
                    TS_KIND_KO[s.kind ?? ''] ?? (s.kind ?? ''),
                    s.title ?? '',
                    s.given ?? '',
                    s.when ?? '',
                    s.then ?? '',
                    s.confidence === 'CONFIRMED' ? '확정' : '초안 [추정]',
                    (s.notes ?? []).join(' / '),
                    (s.evidence ?? []).map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`)).join(', '),
                ],
            };
        }),
    ];
    // §3 커버리지 현황 — 요약 객체를 (구분, 항목, 값) 3열로 평탄화(추적표 '현황' 뷰 대응).
    const covRows = [{ cells: ['구분', '항목', '값'], style: 'header' }];
    const cov = rtm.coverage ?? {};
    for (const [group, obj] of Object.entries(cov)) {
        if (!obj || typeof obj !== 'object')
            continue;
        for (const [k, v] of Object.entries(obj)) {
            covRows.push({
                cells: [group, k, Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)],
            });
        }
    }
    return [
        infoSheet('요구사항 추적표(RTM)', 'rtm', meta),
        { name: '요구사항 원장', rows: reqRows },
        { name: '기능(AS-IS) 원장', rows: fnRows },
        { name: '테스트 시나리오', rows: tsRows },
        { name: '커버리지 현황', rows: covRows },
    ];
}
//# sourceMappingURL=xlsx-docs.js.map