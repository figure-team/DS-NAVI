import { displayName, metaList, nodeEvidence, nodesOfType, nodesWithTag, sortedRoutes, } from '../builders/index.js';
/** 추론(미상) 셀 표기 — template §2 인터페이스정의서 `[추정]` 규약. */
const INFERRED_CELL = '[추정]';
/** 빈 셀 표기 — 도메인 메타가 없을 때(끼워맞춤 금지). */
const EMPTY_CELL = '';
/** 노드 근거 보유 시 CONFIRMED, 아니면 INFERRED(grounding 보존, shared.nodeClaim 과 동일 규약). */
function nodeRowConfidence(node) {
    const ev = nodeEvidence(node);
    return ev.length > 0
        ? { confidence: 'CONFIRMED', evidence: ev }
        : { confidence: 'INFERRED', evidence: [] };
}
/**
 * 도메인 행 근거 — 도메인 노드는 filePath 가 없으므로(추상 묶음) domainMeta.ktdsClaims 의
 * fill citation(file:line, 기계검증됨)을 행 근거로 승계한다. 인용 보유 → CONFIRMED.
 * 합성 금지: ktdsClaims 도 없으면 INFERRED.
 */
function domainRowConfidence(node) {
    const direct = nodeEvidence(node);
    if (direct.length > 0)
        return { confidence: 'CONFIRMED', evidence: direct };
    const claims = node.domainMeta?.ktdsClaims ?? [];
    for (const c of claims) {
        const cits = Array.isArray(c?.citations) ? c.citations : [];
        const ev = cits
            .filter((x) => typeof x?.filePath === 'string')
            .map((x) => ({ file: x.filePath, line: typeof x.line === 'number' ? x.line : null }));
        if (ev.length > 0)
            return { confidence: 'CONFIRMED', evidence: ev.slice(0, 3) };
    }
    return { confidence: 'INFERRED', evidence: [] };
}
/** domainMeta 의 단일 문자열 필드(entryPoint 등) — 없으면 `[추정]`. */
function metaScalar(meta, key) {
    const v = meta?.[key];
    return typeof v === 'string' && v.length > 0 ? v : INFERRED_CELL;
}
/** 정렬된 표시 목록을 셀 텍스트로 합친다(없으면 빈 셀). */
function joinCell(values) {
    return values.length > 0 ? values.join(', ') : EMPTY_CELL;
}
// ──────────────────────────────────────────────────────────────────────────
// si-기능명세서 (← 03_feature-spec 재구성). template §2 열 순서:
// 기능ID | 기능명 | 설명 | 진입점 | 관련 API | 관련 테이블 | 업무규칙 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────
const FN_COLUMNS = ['기능ID', '기능명', '설명', '진입점', '관련 API', '관련 테이블', '업무규칙'];
/** 기능 ID 생성 — FN-001.. (도메인 순서 결정론, 1-기반 zero-pad). */
function featureId(index) {
    return `FN-${String(index + 1).padStart(3, '0')}`;
}
/**
 * si-기능명세서 — 도메인별 섹션. 각 도메인 노드 1개 = 표 1행(§3.2).
 * 설명=summary, 진입점=domainMeta.entryPoint, 업무규칙=domainMeta.businessRules.
 * 관련 API/테이블은 현 그래프 모델에 도메인↔라우트/테이블 연결 종류가 없어 `[추정]`
 * (합성 금지, grounding 보존). 컬럼 enrichment 는 P6 확장 지점.
 */
function buildSiFeatureSpec(input) {
    const domains = nodesOfType(input.nodes, 'domain');
    const rows = domains.map((n, i) => {
        const { confidence, evidence } = domainRowConfidence(n);
        const rules = metaList(n.domainMeta, 'businessRules');
        return {
            cells: [
                featureId(i),
                displayName(n),
                n.summary.length > 0 ? n.summary : EMPTY_CELL,
                metaScalar(n.domainMeta, 'entryPoint'),
                INFERRED_CELL,
                INFERRED_CELL,
                rules.length > 0 ? joinCell(rules) : INFERRED_CELL,
            ],
            confidence,
            evidence,
        };
    });
    return {
        docId: 'si-기능명세서',
        title: 'SI 기능명세서',
        methodology: 'si-standard',
        sections: [{ heading: '기능 목록', key: 'feature-list', claims: [], table: { columns: FN_COLUMNS, rows } }],
    };
}
// ──────────────────────────────────────────────────────────────────────────
// si-인터페이스정의서 (← 04_api-spec/routes 재구성). template §2 열 순서:
// API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────
const API_COLUMNS = ['API_ID', 'HTTP', '경로', '컨트롤러·핸들러', '요청', '응답', '인증'];
/** API ID 생성 — API-001.. (routeId 정렬 순서 결정론). */
function apiId(index) {
    return `API-${String(index + 1).padStart(3, '0')}`;
}
/**
 * si-인터페이스정의서 — 라우트 1건 = 표 1행(§3.2). 경로/메서드/핸들러는 라우트 추출
 * 사실 -> CONFIRMED + 근거(file:line). 요청/응답/인증은 그래프에 없어 추론 -> `[추정]`.
 */
/** §2 대외 연계(송신) 열 — template outbound-list 와 1:1. */
const OUTBOUND_COLUMNS = [
    'IF_ID',
    '인터페이스명',
    '프로토콜',
    '방향',
    '연계방식',
    '대상시스템',
    '엔드포인트',
    '데이터',
    '해석',
];
/** endpoint 셀 — 해석값 우선, 실패 시 raw, 둘 다 없으면 [미확인]. */
const UNRESOLVED_CELL = '[미확인]';
/** 프로토콜 → 연계방식 분류(파생 추론이므로 셀에 [추정] 마킹). */
const LINK_MODE = {
    http: '실시간(온라인)',
    ws: '실시간(온라인)',
    socket: '실시간(소켓)',
    mq: '비동기(MQ)',
    file: '파일 송수신',
    mail: '메일',
    'db-link': 'DB 링크',
};
/**
 * §2 송신/라우트 외 수신 행 — interfaces.json(W1, 결정론 스캔) 승계.
 * - 탐지·엔드포인트·호출지점: 결정론 사실 → CONFIRMED(callSite file:line 근거).
 * - 인터페이스명: 첫 호출 심볼 기반 초안 → [추정](사람이 업무명으로 교체).
 * - 연계방식: 프로토콜 파생 분류 → [추정]. 대상시스템: 그래프에 없음 → [추정](T3).
 * - '해석' 열은 endpoint 정적 해석 여부만 뜻한다(연계 검증/운영 여부 아님 — 감리 오독 방지,
 *   해석됨/[미확인]). endpoint 미해석은 [미확인] 셀로 표면화(침묵 누락 금지).
 */
function outboundRows(input) {
    const items = input.interfaces?.items ?? [];
    return items.map((it) => {
        const endpoint = it.endpoint.resolved ?? it.endpoint.raw ?? UNRESOLVED_CELL;
        const nameDraft = `${it.callSites[0]?.symbol ?? it.clientType} ${INFERRED_CELL}`;
        const linkMode = `${LINK_MODE[it.protocol] ?? it.protocol} ${INFERRED_CELL}`;
        return {
            cells: [
                it.id,
                nameDraft,
                it.protocol,
                it.direction === 'outbound' ? '송신' : '수신',
                linkMode,
                INFERRED_CELL,
                endpoint,
                it.dataHint ?? EMPTY_CELL,
                it.unresolved ? UNRESOLVED_CELL : '해석됨',
            ],
            confidence: 'CONFIRMED',
            evidence: it.callSites.map((c) => ({ file: c.file, line: c.line })),
        };
    });
}
/** si-프로그램목록 §1 열 — template program-list-si 와 1:1. */
const PGM_COLUMNS = ['PGM_ID', '프로그램명', '업무명', '소속도메인', '유형', '계층', 'LOC'];
/** si-프로그램목록 §2 열 — template fp-basis 와 1:1. */
const FP_COLUMNS = ['구분', '대상', '상세'];
/** 프로그램 유형 → 한국어 표기. */
const PGM_TYPE_KO = {
    screen: '화면',
    api: 'API',
    batch: '배치',
    service: '서비스',
    dao: 'DAO',
    db: 'DB',
    'mapper-xml': 'SQL매퍼',
    common: '공통/기타',
    test: '테스트',
};
/**
 * si-프로그램목록(W3) — program-inventory.json 승계.
 * §1 프로그램 목록: 파일·유형·계층·LOC 는 결정론 사실 → CONFIRMED(filePath:1 근거).
 *   업무명은 정적 분석 불가 — [미확인] 사람 채움(W2 교훈: 생략 대신 표면화).
 * §2 규모산정(FP) 기초: 후보 구분(EI/EQ/ILF/EIF)은 method/출처 기반 잠정 → 셀에 [추정].
 *   집계 행(잠정 FP)은 간이법 평균복잡도 미조정치 — 범례에 가중치·EO 재분류 안내.
 */
function buildSiProgramList(input) {
    const inv = input.programInventory;
    const pgmRows = (inv?.programs ?? []).map((p) => {
        // 소속도메인 — candidates 조인. reachability=확정 신호, directory/prefix=[추정],
        // common/ambiguous 는 그 사실 자체를 표기(도메인 확정은 사람 몫).
        const domainCell = p.domain === null
            ? UNRESOLVED_CELL
            : p.domainVia === 'reachability'
                ? p.domain
                : p.domainVia === 'common'
                    ? `공용(${p.domain})`
                    : p.domainVia === 'ambiguous'
                        ? `모호(${p.domain}) ${INFERRED_CELL}`
                        : `${p.domain} ${INFERRED_CELL}`;
        return {
            cells: [
                p.id,
                p.name,
                UNRESOLVED_CELL,
                domainCell,
                PGM_TYPE_KO[p.type] ?? p.type,
                p.layer,
                String(p.loc),
            ],
            confidence: 'CONFIRMED',
            evidence: [{ file: p.filePath, line: 1 }],
        };
    });
    const fpRows = [];
    for (const t of inv?.fp.transactions ?? []) {
        const kindCell = t.kind === 'UNCLASSIFIED' ? `미분류(method 미상) ${INFERRED_CELL}` : `${t.kind} ${INFERRED_CELL}`;
        fpRows.push({
            cells: [kindCell, t.routeId, `${t.method} ${t.path}`],
            confidence: 'CONFIRMED',
            evidence: [{ file: t.evidence.file, line: t.evidence.line }],
        });
    }
    for (const d of inv?.fp.dataFunctions ?? []) {
        fpRows.push({
            cells: [`${d.kind} ${INFERRED_CELL}`, d.name, d.kind === 'ILF' ? '자체 테이블' : 'DB링크 참조'],
            confidence: 'CONFIRMED',
            evidence: [{ file: d.evidence.file, line: d.evidence.line }],
        });
    }
    if (inv) {
        const s = inv.fp.summary;
        // 하한 표기 — 숫자만 복사돼도 "미반영분 존재"가 따라가게 셀 안에 명시(정밀 착시 방지).
        fpRows.push({
            cells: [
                `집계 ${INFERRED_CELL}`,
                `EI ${s.ei} · EQ ${s.eq} · 미분류 ${s.unclassified} · EO 미산출 · ILF ${s.ilf} · EIF ${s.eif}`,
                `잠정 FP ≥ ${s.unadjustedFp} (미조정 하한 — 미분류 ${s.unclassified}건·EO 재분류 시 상향)`,
            ],
            confidence: 'INFERRED',
            evidence: [],
        });
    }
    return {
        docId: 'si-프로그램목록',
        title: 'SI 프로그램목록',
        methodology: 'si-standard',
        sections: [
            { heading: '프로그램 목록', key: 'program-list-si', claims: [], table: { columns: PGM_COLUMNS, rows: pgmRows } },
            { heading: '규모산정(FP) 기초', key: 'fp-basis', claims: [], table: { columns: FP_COLUMNS, rows: fpRows } },
        ],
    };
}
/** SI 배치정의서 열 — template batch-list-si 와 1:1. */
const BATCH_COLUMNS = [
    'BAT_ID',
    '배치명',
    '트리거',
    '스케줄',
    '핸들러',
    '데이터대상',
    '선행/후행',
    '수행서버',
    '재기동/실패처리',
    '도달범위(파일)',
    '해석',
];
/**
 * si-배치정의서(W2) — batch-jobs.json 승계. 탐지·스케줄·핸들러·도달범위는 결정론 사실
 * → CONFIRMED(evidence file:line). 배치명은 초안 [추정](사람이 업무명으로 교체).
 * 운영 축 4열(데이터대상·선행/후행·수행서버·재기동)은 정적 분석 불가 — [미확인]으로
 * 표면화해 사람이 운영 지식으로 채운다(생략하면 그 필드가 기대된다는 것조차 안 보인다).
 * '해석' = 잡 구현 파일 해석 여부(해석됨/[미확인]) — shell/crontab 은 프로젝트 밖이라 '외부'.
 * 도달범위는 미해석 행에서 [미확인](루트=XML 인 카운트 1 이 "사소한 배치"로 오독되는 것 방지).
 */
function buildSiBatchSpec(input) {
    const jobs = input.batchJobs?.jobs ?? [];
    const rows = jobs.map((j) => {
        const external = j.trigger === 'shell' || j.trigger === 'crontab';
        return {
            cells: [
                j.id,
                `${j.name} ${INFERRED_CELL}`,
                j.trigger,
                j.schedule ?? UNRESOLVED_CELL,
                j.handler ?? UNRESOLVED_CELL,
                UNRESOLVED_CELL,
                UNRESOLVED_CELL,
                UNRESOLVED_CELL,
                UNRESOLVED_CELL,
                j.unresolvedHandler ? UNRESOLVED_CELL : String(j.reachableFiles),
                external ? '외부' : j.unresolvedHandler ? UNRESOLVED_CELL : '해석됨',
            ],
            confidence: 'CONFIRMED',
            evidence: [{ file: j.evidence.file, line: j.evidence.line }],
        };
    });
    return {
        docId: 'si-배치정의서',
        title: 'SI 배치정의서',
        methodology: 'si-standard',
        sections: [
            { heading: '배치 목록', key: 'batch-list-si', claims: [], table: { columns: BATCH_COLUMNS, rows } },
        ],
    };
}
function buildSiInterfaceSpec(input) {
    const rows = sortedRoutes(input).map((r, i) => {
        const handler = typeof r.handler === 'string' && r.handler.length > 0 ? r.handler : INFERRED_CELL;
        return {
            cells: [apiId(i), r.method, r.path, handler, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL],
            confidence: 'CONFIRMED',
            evidence: [{ file: r.filePath, line: r.line }],
        };
    });
    return {
        docId: 'si-인터페이스정의서',
        title: 'SI 인터페이스정의서',
        methodology: 'si-standard',
        sections: [
            { heading: 'API 목록', key: 'api-list', claims: [], table: { columns: API_COLUMNS, rows } },
            {
                heading: '대외 연계(송신·라우트 외 수신)',
                key: 'outbound-list',
                claims: [],
                table: { columns: OUTBOUND_COLUMNS, rows: outboundRows(input) },
            },
        ],
    };
}
// ──────────────────────────────────────────────────────────────────────────
// si-테이블정의서 (← 05_db-spec 재구성). template §2 열 순서:
// 컬럼 | 타입 | PK | FK | NULL | 설명 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────
const TBL_COLUMNS = ['컬럼', '타입', 'PK', 'FK', 'NULL', '설명'];
/**
 * si-테이블정의서 — 테이블별 섹션. 테이블 노드 근거(file:line) 승계.
 * 현 그래프 모델에는 컬럼 정보가 없으므로 테이블당 단일 행을 컬럼=`[추정]`(미상)으로
 * 표기한다(컬럼 단위 enrichment = P6: JPA @Table/@Column·MyBatis Mapper XML SQL
 * 슬라이스 주입). 설명=summary. 행 신뢰도는 노드 근거 보유 여부로 결정(grounding).
 */
/**
 * MyBatis 모델 기반 테이블 섹션 — 테이블별 컬럼(INSERT/UPDATE 문에서 추출)을 행으로.
 * 컬럼 존재는 SQL 근거(Mapper XML file:line) → CONFIRMED. 타입/PK/FK/NULL 은 SQL 에 없어
 * [추정]. SELECT 전용 테이블은 컬럼 미추출(행 0) — 합성 금지.
 */
function buildSiTableSpecFromMyBatis(input) {
    const model = input.mybatisModel;
    // 테이블 → 컬럼 → 근거(첫 출현). C/U 문의 컬럼만 해당 테이블로 귀속(단일 테이블).
    const byTable = new Map();
    for (const m of model.mappers) {
        for (const s of m.statements) {
            if ((s.crud !== 'C' && s.crud !== 'U') || s.tables.length !== 1)
                continue;
            const table = s.tables[0];
            const colMap = byTable.get(table) ?? new Map();
            for (const c of s.columns) {
                if (!colMap.has(c))
                    colMap.set(c, { file: m.relPath, line: s.line });
            }
            byTable.set(table, colMap);
        }
    }
    const sections = model.tables.map((table) => {
        const colMap = byTable.get(table) ?? new Map();
        const rows = [...colMap.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((col) => ({
            cells: [col, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL, EMPTY_CELL],
            confidence: 'CONFIRMED',
            evidence: [colMap.get(col)],
        }));
        return { heading: `${table} 테이블`, key: 'table-list', claims: [], table: { columns: TBL_COLUMNS, rows } };
    });
    return { docId: 'si-테이블정의서', title: 'SI 테이블정의서', methodology: 'si-standard', sections };
}
/**
 * db-schema(DDL) 기반 테이블 섹션 — PA3. 권위 소스(.sql DDL)로 컬럼/타입/PK/FK/NULL/설명을
 * 모두 채운다. 모든 행은 컬럼 선언 file:line 근거(CONFIRMED). MyBatis(컬럼만, 나머지 추정)나
 * 노드(단일 추정 행)보다 정밀하므로 dbSchema 가 있으면 최우선.
 */
function buildSiTableSpecFromDbSchema(input) {
    const m = input.dbSchema;
    const sections = m.tables.map((t) => {
        const pkSet = new Set(t.primaryKey);
        // col → "refTable(refCol)" (복합 FK 는 컬럼 위치 매칭).
        const fkByCol = new Map();
        for (const fk of t.foreignKeys) {
            fk.columns.forEach((c, i) => fkByCol.set(c, `${fk.refTable}(${fk.refColumns[i] ?? fk.refColumns[0] ?? ''})`));
        }
        const rows = t.columns.map((c) => ({
            cells: [
                c.name,
                c.type,
                pkSet.has(c.name) || c.primaryKey ? 'PK' : EMPTY_CELL,
                fkByCol.has(c.name) ? `→ ${fkByCol.get(c.name)}` : EMPTY_CELL,
                c.nullable ? 'NULL' : 'NOT NULL',
                c.comment ?? EMPTY_CELL,
            ],
            confidence: 'CONFIRMED',
            evidence: [{ file: t.relPath, line: c.line }],
        }));
        const heading = `${t.name} 테이블${t.comment ? ` — ${t.comment}` : ''}`;
        return { heading, key: 'table-list', claims: [], table: { columns: TBL_COLUMNS, rows } };
    });
    return { docId: 'si-테이블정의서', title: 'SI 테이블정의서', methodology: 'si-standard', sections };
}
function buildSiTableSpec(input) {
    // 우선순위: db-schema(DDL, 권위·전 컬럼 확정) > MyBatis(컬럼만) > 노드(단일 추정).
    if (input.dbSchema && input.dbSchema.tables.length > 0) {
        return buildSiTableSpecFromDbSchema(input);
    }
    if (input.mybatisModel && input.mybatisModel.tables.length > 0) {
        return buildSiTableSpecFromMyBatis(input);
    }
    const tables = nodesWithTag(input.nodes, 'table', 'schema');
    const sections = tables.map((n) => {
        const { confidence, evidence } = nodeRowConfidence(n);
        const row = {
            // 컬럼/타입/PK/FK/NULL 은 P6 enrichment 전까지 미상(`[추정]`). 설명=summary.
            cells: [
                INFERRED_CELL,
                INFERRED_CELL,
                INFERRED_CELL,
                INFERRED_CELL,
                INFERRED_CELL,
                n.summary.length > 0 ? n.summary : EMPTY_CELL,
            ],
            confidence,
            evidence,
        };
        return {
            heading: `${displayName(n)} 테이블`,
            key: 'table-list',
            claims: [],
            table: { columns: TBL_COLUMNS, rows: [row] },
        };
    });
    return {
        docId: 'si-테이블정의서',
        title: 'SI 테이블정의서',
        methodology: 'si-standard',
        sections,
    };
}
// ──────────────────────────────────────────────────────────────────────────
// si-위험모듈리포트 (W4) — risk-report.json 승계. PM 주간보고용 위험 Top N.
// ──────────────────────────────────────────────────────────────────────────
/** §1 산정 기준 열 — template risk-criteria 와 1:1. */
const RISK_CRITERIA_COLUMNS = ['항목', '산정 방법', '가중치'];
/** §2 위험 Top N 열 — template risk-top 과 1:1. */
const RISK_TOP_COLUMNS = [
    '순위',
    'PGM_ID',
    '프로그램명',
    '유형',
    '소속도메인',
    '위험점수',
    '등급',
    '복잡도',
    'LOC',
    '변경(커밋)',
    '팬인',
    '팬아웃',
    '미도달',
    '주요요인',
];
/** §3 지표 커버리지 열 — template risk-coverage 와 1:1. */
const RISK_COVERAGE_COLUMNS = ['항목', '값', '비고'];
/** 지표 키 → 한국어 표기(주요요인 셀). */
const RISK_METRIC_KO = {
    complexity: '복잡도',
    churn: '변경빈도',
    loc: 'LOC',
    fanIn: '팬인',
    fanOut: '팬아웃',
    unreached: '미도달',
};
/** 지표 키 → 산정 방법 설명(§1 — 수용기준 "계산 근거 문서화"의 사용자 노출면). */
const RISK_METHOD_DESC = {
    complexity: '순환복잡도 근사(java AST): 메서드 수 + 결정포인트(if/for/while/do/catch/삼항/case/&&/||). 비 java 는 미측정 [미확인] — 백분위는 측정(java) 집합 내 순위',
    churn: 'git 전체 이력에서 파일별 변경 커밋 수(git log --numstat, rename 미추적·shallow clone 은 미측정 처리). 변경 라인은 참고치',
    loc: '파일 라인 수(wc -l 관례, 프로그램목록 승계)',
    fanIn: '이 파일에 의존하는 서로 다른 파일 수(강신호 엣지: 주입/필드/상속/구현/매퍼 — import 제외)',
    fanOut: '이 파일이 의존하는 서로 다른 파일 수(동일 강신호 엣지)',
    unreached: '진입점(라우트·배치)에서 도달 불가 여부(slices 도달성 — 이진). 점수 비반영 플래그: 뷰 forward(JSP 등) 미추적 한계로 오탐 가능 — 데드코드 판정은 사람 확인',
};
/**
 * si-위험모듈리포트(W4) — risk-report.json 승계.
 * §1 산정 기준: 지표 정의·가중치·정규화/등급 규칙(방법론 서술 — INFERRED, 근거 없음).
 * §2 위험 Top N: 전 지표 측정 행만 CONFIRMED, 미측정 지표 포함 행은 INFERRED(설계 §5,
 *   리뷰 C4). 미측정 셀은 [미확인]. 점수는 백분위 가중 합산 — **프로젝트 내 상대
 *   순위**이지 절대 품질 판정이 아님(§1 에 명시, 오독 방지). 미도달은 비점수 플래그.
 * §3 지표 커버리지: 측정/미측정(언어별 분해)·무분산·등급 분포·제외 카운트 표면화
 *   (침묵 누락 금지, W3 대칭 + 리뷰 C1/C2/C8).
 * 행 단위 사람 재분류(override 원장)는 범위 외 — 문서 편집·확정(D3)으로 커버, 백로그.
 */
function buildSiRiskReport(input) {
    const rr = input.riskReport;
    const weights = rr?.meta.weights;
    const criteriaRows = ['complexity', 'churn', 'loc', 'fanIn', 'fanOut'].map((k) => ({
        cells: [RISK_METRIC_KO[k], RISK_METHOD_DESC[k], weights ? String(weights[k]) : EMPTY_CELL],
        confidence: 'INFERRED',
        evidence: [],
    }));
    criteriaRows.push({
        cells: ['미도달', RISK_METHOD_DESC.unreached, '플래그(비점수)'],
        confidence: 'INFERRED',
        evidence: [],
    });
    criteriaRows.push({
        cells: [
            '정규화·합산',
            '지표별 프로젝트 내 백분위(0~1, 동점 평균) → 가중 합산(가중치는 휴리스틱 — 점수는 순위로만 해석). 미측정 지표는 가중치 재정규화(미측정 파일 과소평가 방지), 무분산 지표(전 파일 동일값)는 변별 기여가 없어 제외. 점수는 프로젝트 내 상대 순위이며 절대 품질 판정이 아님',
            EMPTY_CELL,
        ],
        confidence: 'INFERRED',
        evidence: [],
    });
    criteriaRows.push({
        cells: [
            '등급',
            '프로젝트 내 상대 밴드 — 상 = 점수 상위 10%(최소 1본, 동점 상향) · 중 = 상위 30% · 하 = 나머지. 절대 품질 판정 아님',
            EMPTY_CELL,
        ],
        confidence: 'INFERRED',
        evidence: [],
    });
    const topN = rr?.meta.topN ?? 20;
    const topRows = (rr?.items ?? []).slice(0, topN).map((it, i) => {
        // 설계 §5: 전 지표 측정 행만 [확정], 미측정 지표 포함 행은 [추정](리뷰 C4 —
        // 서로 다른 지표집합으로 매긴 점수의 통약 한계도 이 강등으로 표면화).
        const allMeasured = it.metrics.complexity !== null && it.metrics.churnCommits !== null;
        return {
            cells: [
                String(i + 1),
                it.programId,
                it.name,
                PGM_TYPE_KO[it.type] ?? it.type,
                it.domain ?? UNRESOLVED_CELL,
                it.score.toFixed(2),
                it.grade,
                it.metrics.complexity === null ? UNRESOLVED_CELL : String(it.metrics.complexity),
                String(it.metrics.loc),
                it.metrics.churnCommits === null ? UNRESOLVED_CELL : String(it.metrics.churnCommits),
                String(it.metrics.fanIn),
                String(it.metrics.fanOut),
                it.metrics.unreached ? '미도달' : EMPTY_CELL,
                it.factors.map((f) => RISK_METRIC_KO[f] ?? f).join(', '),
            ],
            confidence: allMeasured ? 'CONFIRMED' : 'INFERRED',
            evidence: [{ file: it.filePath, line: 1 }],
        };
    });
    const gradeDist = { 상: 0, 중: 0, 하: 0 };
    for (const it of rr?.items ?? [])
        gradeDist[it.grade]++;
    const cxBreakdown = (rr?.stats.complexityUnmeasured ?? [])
        .map((e) => `${e.ext} ${e.count}`)
        .join(', ');
    const hasKotlinGap = (rr?.stats.complexityUnmeasured ?? []).some((e) => e.ext === 'kt' || e.ext === 'kts');
    const coverageRows = rr
        ? [
            { cells: ['랭킹 대상', String(rr.stats.programs), '프로그램목록 승계(test 유형 제외)'] },
            { cells: ['제외(테스트)', String(rr.stats.excluded.test), '위험 랭킹 오염 방지 — 분리 계상'] },
            {
                cells: [
                    '등급 분포',
                    `상 ${gradeDist['상']} · 중 ${gradeDist['중']} · 하 ${gradeDist['하']}`,
                    '상대 밴드(상위 10%/30%) — 절대 판정 아님',
                ],
            },
            {
                cells: [
                    '복잡도 측정',
                    `${rr.stats.measured.complexity}/${rr.stats.programs}`,
                    `미측정(확장자별): ${cxBreakdown || '없음'}${hasKotlinGap ? ' — kotlin 은 문법 미탑재(지원 백로그, 침묵 누락 아님을 명시)' : ''}`,
                ],
            },
            {
                cells: [
                    '변경빈도 측정',
                    `${rr.stats.measured.churn}/${rr.stats.programs}`,
                    rr.meta.churnAvailable ? `git 이력 기준(앵커 ${rr.gitCommit ?? '[미확인]'})` : 'git 이력 없음/shallow clone — 전 항목 [미확인]',
                ],
            },
            ...(rr.meta.degenerateMetrics.length > 0
                ? [
                    {
                        cells: [
                            '무분산 지표',
                            rr.meta.degenerateMetrics.map((k) => RISK_METRIC_KO[k] ?? k).join(', '),
                            '전 파일 동일값 — 랭킹 변별 기여 없음(가중합 제외). 예: 단일 벤더링 커밋의 변경빈도',
                        ],
                    },
                ]
                : []),
            {
                cells: [
                    '미도달',
                    `${rr.stats.unreached}/${rr.stats.programs}`,
                    '점수 비반영 플래그 — 뷰 forward(JSP) 미추적 한계로 오탐 가능, 데드코드 판정은 사람 확인',
                ],
            },
        ].map((r) => ({ ...r, confidence: 'INFERRED', evidence: [] }))
        : [];
    return {
        docId: 'si-위험모듈리포트',
        title: 'SI 위험모듈리포트',
        methodology: 'si-standard',
        sections: [
            { heading: '산정 기준', key: 'risk-criteria', claims: [], table: { columns: RISK_CRITERIA_COLUMNS, rows: criteriaRows } },
            // heading 은 정적 'Top N' — 템플릿 라운드트립 불변(doc-set.test) + 사람 편집 라벨 존중.
            { heading: '위험 Top N', key: 'risk-top', claims: [], table: { columns: RISK_TOP_COLUMNS, rows: topRows } },
            { heading: '지표 커버리지', key: 'risk-coverage', claims: [], table: { columns: RISK_COVERAGE_COLUMNS, rows: coverageRows } },
        ],
    };
}
// ──────────────────────────────────────────────────────────────────────────
// si-단위테스트시나리오 (W5) — rtm.json testScenarios 승계. 요구↔테스트 추적성.
// ──────────────────────────────────────────────────────────────────────────
/** §1 작성 기준 열 — template ts-criteria 와 1:1. */
const TS_CRITERIA_COLUMNS = ['항목', '내용'];
/** §2 시나리오 원장 열 — template ts-ledger 와 1:1. */
const TS_LEDGER_COLUMNS = ['시나리오ID', '기능ID', '기능명', '요구ID', 'AC', '구분', '제목', 'Given', 'When', 'Then', '상태'];
/** §3 커버리지 열 — template ts-coverage 와 1:1. */
const TS_COVERAGE_COLUMNS = ['항목', '값', '비고'];
const TS_KIND_KO = { normal: '정상', exception: '예외', boundary: '경계' };
/**
 * si-단위테스트시나리오(W5) — rtm.json testScenarios[] 승계(결정론 템플릿 생성 초안).
 * §1 작성 기준: 종류별 생성 규칙 + 초안/확정 지위 + TestRef(수행 기록) 연결 안내(INFERRED).
 * §2 원장: 시나리오 confidence 그대로 승계(초안 INFERRED [추정] / 대시보드 확정 CONFIRMED),
 *   근거는 원천 셀 evidence 승계분. 미확정 셀 텍스트에 상태 표기(오독 방지).
 * §3 커버리지: 종류별/확정/축소 생성([미확인] 노트 보유) 카운트 표면화.
 */
function buildSiTestScenarios(input) {
    const rtm = input.rtm;
    const scenarios = rtm?.testScenarios ?? [];
    const fnById = new Map((rtm?.functions ?? []).map((f) => [f.id, f]));
    // 최상단 현황 행(리뷰 C6) — 84행 완결형 표 외형이 "테스트 설계 완료"로 읽히는 것 차단.
    const scnAll = rtm?.testScenarios ?? [];
    const statusRow = {
        cells: [
            '현황',
            rtm
                ? `확정 ${scnAll.filter((s) => s.confidence === 'CONFIRMED').length}/${scnAll.length} · 축소 생성 ${scnAll.filter((s) => s.notes.some((n) => n.includes('[미확인]'))).length}/${scnAll.length} · 시험 수행결과 미연결 — 본 문서는 초안 스켈레톤(검토·보강 전제)`
                : 'rtm.json 없음 — understand-rtm 실행 필요',
        ],
        confidence: 'INFERRED',
        evidence: [],
    };
    const criteriaRows = [
        statusRow,
        ...[
            ['정상', '기능 행의 진입점(라우트)·데이터(테이블×CRUD) 시드로 정상 흐름 1건 생성'],
            ['예외', '요구사항 인수조건(AC) 중 exception 유형당 1건(AC 문장 인용, 요구/AC 추적선 보존). 없으면 일반형 1건 + [미확인]'],
            ['경계', '데이터 시드(0건·최대치) 기준 1건. 데이터 근거 없으면 일반형 + [미확인]'],
            ['지위', '전부 결정론 템플릿 생성 초안([추정]) — 대시보드 시험 탭에서 편집·확정하면 [확정] 승격(재생성에도 오버레이 유지)'],
            ['수행 기록', '시나리오는 설계 초안 — 시험 수행 결과는 요구사항 AC 의 시험결과(TestRef)에 기록(확정 후 caseId 연결은 사람 몫)'],
        ].map((cells) => ({ cells, confidence: 'INFERRED', evidence: [] })),
    ];
    const ledgerRows = scenarios.map((s) => {
        const fn = fnById.get(s.fnId);
        return {
            cells: [
                s.id,
                fn?.featureId ?? UNRESOLVED_CELL,
                fn?.name ?? UNRESOLVED_CELL,
                s.reqId ?? EMPTY_CELL,
                s.acId ?? EMPTY_CELL,
                TS_KIND_KO[s.kind] ?? s.kind,
                s.title,
                s.given,
                s.when,
                s.then,
                s.confidence === 'CONFIRMED' ? '확정' : `초안 ${INFERRED_CELL}`,
            ],
            confidence: s.confidence === 'CONFIRMED' ? 'CONFIRMED' : 'INFERRED',
            evidence: s.evidence,
        };
    });
    const reduced = scenarios.filter((s) => s.notes.some((n) => n.includes('[미확인]'))).length;
    const kindCount = (k) => scenarios.filter((s) => s.kind === k).length;
    const coverageRows = rtm
        ? [
            { cells: ['시나리오 총계', String(scenarios.length), `기능 ${rtm.functions.length}본 × 정상/예외/경계(예외는 AC 수만큼)`] },
            { cells: ['종류별', `정상 ${kindCount('normal')} · 예외 ${kindCount('exception')} · 경계 ${kindCount('boundary')}`, EMPTY_CELL] },
            { cells: ['확정', `${scenarios.filter((s) => s.confidence === 'CONFIRMED').length}/${scenarios.length}`, '대시보드 시험 탭 확정 반영분'] },
            { cells: ['축소 생성', String(reduced), '시드 부족([미확인] 노트 보유) — 사람 보강 대상'] },
        ].map((r) => ({ ...r, confidence: 'INFERRED', evidence: [] }))
        : [];
    return {
        docId: 'si-단위테스트시나리오',
        title: 'SI 단위테스트시나리오',
        methodology: 'si-standard',
        sections: [
            { heading: '작성 기준', key: 'ts-criteria', claims: [], table: { columns: TS_CRITERIA_COLUMNS, rows: criteriaRows } },
            { heading: '시나리오 원장', key: 'ts-ledger', claims: [], table: { columns: TS_LEDGER_COLUMNS, rows: ledgerRows } },
            { heading: '시나리오 커버리지', key: 'ts-coverage', claims: [], table: { columns: TS_COVERAGE_COLUMNS, rows: coverageRows } },
        ],
    };
}
// ──────────────────────────────────────────────────────────────────────────
// si-실적요약보고서 (W6) — work-summary.json 승계. 기간 실적·모듈·진척.
// ──────────────────────────────────────────────────────────────────────────
/** §1 하이라이트 / §2 산정 기준 열 — template ws-highlight / ws-criteria 와 1:1. */
const WS_TEXT_COLUMNS = ['항목', '내용'];
/** §3 커밋 이력 열 — template ws-commits 와 1:1. */
const WS_COMMIT_COLUMNS = ['순번', '커밋', '일시', '작성자', '제목', '구분', '파일', '추가', '삭제'];
/** §4 모듈별 변경 열 — template ws-modules 와 1:1. */
const WS_MODULE_COLUMNS = ['모듈', '귀속 근거', '커밋', '파일', '변경라인'];
/** §5 진척 열 — template ws-progress 와 1:1. */
const WS_PROGRESS_COLUMNS = ['항목', '값', '비고'];
/** RTM 확정 원장 경로 — 진척 행의 근거 파일(수치의 원천). */
const RTM_OVERLAY_FILE = '.understand-anything/rtm-overrides.json';
/**
 * 다주 추이 행(W6-b, 설계 §13) — 직전 기간 대비 증감을 수집 수치에서 파생 계산.
 * previous 가 없으면(커밋 범위 모드/git 불가) 행 자체를 내지 않는다(§2 기준에 사유 명기).
 */
function trendRows(ws) {
    const p = ws.previous;
    // 구버전 산출물(zod 미경유 raw 로드)은 previous 가 undefined — null 과 동일하게
    // 행 생략으로 degrade(리뷰 T1: 크래시가 문서셋 전체 생성을 중단시키는 경로 차단).
    if (!p)
        return [];
    const delta = (cur, prev) => {
        const d = cur - prev;
        return `${prev}→${cur}(${d >= 0 ? '+' : ''}${d})`;
    };
    const parts = [
        `커밋 ${delta(ws.totals.commits, p.totals.commits)}`,
        `실적 라인 ${delta(ws.totals.added + ws.totals.deleted, p.totals.added + p.totals.deleted)}`,
    ];
    if (ws.rtmProgress !== null && p.rtmProgress !== null) {
        const cur = ws.rtmProgress.functionsConfirmed + ws.rtmProgress.scenariosConfirmed + ws.rtmProgress.requirementsConfirmed;
        const prev = p.rtmProgress.functionsConfirmed + p.rtmProgress.scenariosConfirmed + p.rtmProgress.requirementsConfirmed;
        parts.push(`RTM 전환 ${delta(cur, prev)}`);
    }
    if (ws.docProgress !== null && p.docProgress !== null) {
        parts.push(`문서 승인 ${delta(ws.docProgress.approved, p.docProgress.approved)}`);
    }
    // 반개구간 표기는 양끝 모두 모드별(리뷰 T2) — weeks (from,to] · month [from,to).
    const open = ws.range.mode === 'weeks' ? '(' : '[';
    const close = ws.range.mode === 'weeks' ? ']' : ')';
    return [
        {
            cells: ['직전 기간 대비', `${parts.join(' · ')} — 직전 ${open}${p.fromIso} ~ ${p.toIso}${close}`],
            confidence: 'INFERRED',
            evidence: [],
        },
    ];
}
/** 기간 서술(§3.5 결정론 문형) — 수집 meta 의 해석 결과만 재배열(날조 금지). */
function wsRangeText(ws) {
    const r = ws.range;
    if (r.mode === 'range')
        return `커밋 범위 ${r.rawArg} — rev-list 집합(시각 윈도 없음)`;
    if (r.mode === 'month')
        return `${r.rawArg} 달력 월 [${r.fromIso ?? UNRESOLVED_CELL} ~ ${r.toIso ?? UNRESOLVED_CELL})`;
    return `최근 ${r.rawArg}주 (${r.fromIso ?? UNRESOLVED_CELL} ~ ${r.toIso ?? UNRESOLVED_CELL}] — 앵커 = HEAD 커밋 시각(벽시계 아님)`;
}
/**
 * si-실적요약보고서(W6) — work-summary.json 승계(결정론 수집·집계).
 * §1 하이라이트: 수집 수치를 고정 문형에 끼운 사람 말 요약 — LLM 산문 불개입(날조 0 의
 *   구조적 보장). 수치 재배열 서술이라 INFERRED 로 두되 원천 표(§3~§5)가 확정을 진다.
 * §3 커밋 이력: 파일 근거 보유 행 CONFIRMED(변경 파일 상위 3개 승계), 머지 등 파일
 *   근거 없는 행은 INFERRED(file:line 근거 체계의 한계 — §2 명기, 날조 대신 강등).
 * §4 모듈: 집계 행(단일 file:line 없음) — inventory 조인은 도메인 근거, dir 폴백은 [추정].
 * §5 진척: 원장 파일 자체를 근거로 승계(수치의 원천). 원장 없음/기간 축 없음(range)은
 *   [미확인] — 0(이벤트 없음)과 구분.
 */
function buildSiWorkSummary(input) {
    const ws = input.workSummary;
    const textRow = (cells) => ({ cells, confidence: 'INFERRED', evidence: [] });
    const gitUnavailable = ws !== undefined && ws !== null && !ws.meta.gitAvailable;
    const highlightRows = !ws
        ? [textRow(['현황', 'work-summary.json 없음 — understand-report 실행 필요'])]
        : [
            textRow(['기간', wsRangeText(ws)]),
            gitUnavailable
                ? textRow([
                    '실적',
                    `${UNRESOLVED_CELL} git 이력 수집 불가(${ws.meta.gitStatus === 'shallow'
                        ? 'shallow clone — 잘린 이력은 결정론 불가'
                        : ws.meta.gitStatus === 'too-large'
                            ? '이력 출력 256MB 초과 — 짧은 기간(--weeks)으로 재시도'
                            : 'git 레포 아님/이력 없음'})`,
                ])
                : textRow([
                    '실적',
                    `커밋 ${ws.totals.commits}건(작성자 ${ws.totals.authors}명, 머지 ${ws.totals.mergeCommits}건), 파일 ${ws.totals.files}개 변경(+${ws.totals.added}/−${ws.totals.deleted})` +
                        (ws.totals.generated.files > 0
                            ? ` · 생성물/산출물 별도 ${ws.totals.generated.files}개(+${ws.totals.generated.added}/−${ws.totals.generated.deleted}) — 실적 아님`
                            : ''),
                ]),
            textRow([
                '변경 상위 모듈',
                ws.modules.length === 0
                    ? gitUnavailable
                        ? UNRESOLVED_CELL
                        : '변경 없음'
                    : ws.modules
                        .slice(0, 3)
                        .map((m) => `${m.key}(±${m.linesChanged})`)
                        .join(', '),
            ]),
            // 다주 추이(W6-b) — 증감은 여기서 파생 계산(산출물에 저장하지 않음, 설계 §13).
            ...trendRows(ws),
            textRow([
                'RTM 진척',
                ws.rtmProgress === null
                    ? `${UNRESOLVED_CELL} ${ws.range.mode === 'range' ? '커밋 범위 모드는 시각 윈도가 없어 원장 집계 불가' : '확정 원장(rtm-overrides.json) 없음 또는 기간 미해석'}`
                    : `추정→확정 전환 ${ws.rtmProgress.functionsConfirmed + ws.rtmProgress.scenariosConfirmed + ws.rtmProgress.requirementsConfirmed}건(기능 ${ws.rtmProgress.functionsConfirmed} · 시나리오 ${ws.rtmProgress.scenariosConfirmed} · 요구사항 ${ws.rtmProgress.requirementsConfirmed})`,
            ]),
            textRow([
                '문서 진척',
                ws.docProgress === null
                    ? `${UNRESOLVED_CELL} ${ws.range.mode === 'range' ? '커밋 범위 모드는 시각 윈도가 없어 원장 집계 불가' : '문서 상태 원장(.spec/docs) 없음 또는 기간 미해석'}`
                    : `제출 ${ws.docProgress.submitted} · 승인 ${ws.docProgress.approved} · 반려 ${ws.docProgress.returned}`,
            ]),
        ];
    const criteriaRows = [
        ['날짜 축', '커밋의 committer date — cherry-pick/rebase 후에도 "이 기간에 랜딩됐다"가 실적 기준(author date 는 원 작성 시점)'],
        ['기간 해석', '주간 = HEAD 커밋 시각 앵커 반개구간 (from, to] · 월간 = 달력 월 [1일, 익월 1일) **UTC 경계**(로컬 자정 아님 — 월초 인접 커밋은 오프셋만큼 이전 달로 귀속될 수 있음) · 커밋 범위 = rev-list 집합(시각 윈도 없음). 벽시계 미사용 — 같은 HEAD 면 언제 실행해도 동일'],
        ['실적 vs 생성물', '분석 산출물·lock 파일 등 생성물 경로(meta.generatedPatterns)는 파일/라인 합계·모듈 귀속에서 분리 — churn 은 사실이지만 실적이 아니다. 분리분은 하이라이트에 별도 표기(침묵 제외 아님)'],
        ['커밋 행 신뢰도', '변경 파일 근거 보유 행 [확정](상위 3개 파일 승계) · 머지 등 파일 근거 없는 행 [추정](file:line 근거 체계의 한계, 커밋 해시로 검증 가능)'],
        ['작성자 표기', '커밋 표의 작성자 열은 이력 투명성 목적(git 공개 정보) — 작성자별 실적 집계·분해는 제공하지 않는다(개인 평가 오용 방지, 설계 §9)'],
        ['모듈 귀속', '프로그램목록(W3) 도메인 조인 우선, 미포함 파일은 최상위 디렉터리 버킷 [추정]'],
        ['진척 원장', 'RTM = rtm-overrides.json audit[](확정 이벤트 CONFIRMED/CONFIRMED_NO_EDIT, 엔티티별 최초 확정만 전환으로 집계 — 재확정 중복 방지) · 문서 = .spec/docs/*.state.json audit[]. 원장은 작업트리의 현재 상태 — 과거 시점 스냅샷 복원은 하지 않음'],
        ['추이 산정', '직전 기간 = 현재 윈도와 동일 길이·인접(주간 (from−길이, from] · 월간 직전 달력 월) — 경계 커밋은 정확히 한쪽에만 귀속(이중 계상 0). 증감은 두 윈도 수집치의 파생 계산이며, RTM/문서 진척 추이도 현재 원장 상태에서 두 윈도를 각각 집계한 것(재현 경계 동일). 커밋 범위 모드는 추이 없음'],
        ['재현', 'git 실적(커밋/파일/모듈)은 동일 커밋(HEAD)·동일 인자 재실행 시 byte 동일. **RTM/문서 진척은 원장의 현재 상태 기준** — 원장이 그새 자랐으면(확정 추가) 재실행 값이 달라진다(재현 경계, 설계 §3.4)'],
        ...(ws && ws.meta.prefix.length > 0
            ? [['하위 디렉터리 모드', `프로젝트가 레포 하위 경로(${ws.meta.prefix}) — git 경로 단순화로 머지 커밋이 과소 집계될 수 있음`]]
            : []),
    ].map(textRow);
    const commitRows = (ws?.commits ?? []).map((c, i) => {
        const files = c.files;
        const added = files.reduce((s, f) => s + f.added, 0);
        const deleted = files.reduce((s, f) => s + f.deleted, 0);
        const evidence = files.slice(0, 3).map((f) => ({ file: f.path, line: null }));
        return {
            cells: [
                String(i + 1),
                c.sha.slice(0, 8),
                c.dateIso,
                c.author,
                c.subject,
                c.isMerge ? '머지' : EMPTY_CELL,
                String(files.length),
                String(added),
                String(deleted),
            ],
            confidence: evidence.length > 0 ? 'CONFIRMED' : 'INFERRED',
            evidence,
        };
    });
    const moduleRows = (ws?.modules ?? []).map((m) => {
        // 변경 상위 파일을 근거로 승계 — 도메인 조인 행은 실측 귀속(CONFIRMED),
        // 디렉터리 버킷은 귀속 자체가 관례 추정이라 파일 근거가 있어도 INFERRED.
        const evidence = m.topFiles.map((f) => ({ file: f, line: null }));
        return {
            cells: [
                m.key,
                m.source === 'program-inventory' ? '프로그램목록 도메인 조인' : `최상위 디렉터리 ${INFERRED_CELL}`,
                String(m.commits),
                String(m.files),
                String(m.linesChanged),
            ],
            confidence: m.source === 'program-inventory' && evidence.length > 0 ? 'CONFIRMED' : 'INFERRED',
            evidence,
        };
    });
    const progressRows = [];
    if (ws) {
        if (ws.rtmProgress === null) {
            progressRows.push(textRow(['RTM 진척', UNRESOLVED_CELL, ws.range.mode === 'range' ? '시각 윈도 없음(커밋 범위 모드)' : '원장 없음 또는 기간 미해석 — 0 과 구분']));
        }
        else {
            const p = ws.rtmProgress;
            const rtmEv = [{ file: RTM_OVERLAY_FILE, line: null }];
            // "무엇이 확정됐나" — 전환 id 나열(리뷰 C4, approvedDocs 대칭). 상한 초과분은 count 로.
            const idNote = (count, ids, lead) => {
                if (count === 0)
                    return lead;
                const listed = ids.join(', ');
                const rest = count - ids.length;
                return `${lead ? `${lead} — ` : ''}${listed}${rest > 0 ? ` 외 ${rest}건` : ''}`;
            };
            const notes = [
                p.auditlessEntities > 0 ? `구원장(audit 없음) ${p.auditlessEntities}건은 at 폴백 — 확정 여부 자체 구분 불가(편집도 전환 계상 가능)` : '',
                p.suspectEntities > 0 ? `최초 확정 시각 미상 ${p.suspectEntities}건은 전환에서 보수적 제외` : '',
                p.unparsableAt > 0 ? `시각 파싱 실패 ${p.unparsableAt}건(집계 제외, 표면화)` : '',
            ].filter((s) => s.length > 0);
            progressRows.push({ cells: ['RTM 확정 전환(기능)', String(p.functionsConfirmed), idNote(p.functionsConfirmed, p.functionsConfirmedIds, '엔티티별 최초 확정만')], confidence: 'CONFIRMED', evidence: rtmEv }, { cells: ['RTM 확정 전환(시나리오)', String(p.scenariosConfirmed), idNote(p.scenariosConfirmed, p.scenariosConfirmedIds, EMPTY_CELL)], confidence: 'CONFIRMED', evidence: rtmEv }, { cells: ['RTM 확정 전환(요구사항)', String(p.requirementsConfirmed), idNote(p.requirementsConfirmed, p.requirementsConfirmedIds, EMPTY_CELL)], confidence: 'CONFIRMED', evidence: rtmEv }, { cells: ['RTM 이벤트(확정/편집)', `${p.confirmEvents}/${p.editEvents}`, notes.join(' · ') || '재확정 포함 총수'], confidence: 'CONFIRMED', evidence: rtmEv });
        }
        if (ws.docProgress === null) {
            progressRows.push(textRow(['문서 진척', UNRESOLVED_CELL, ws.range.mode === 'range' ? '시각 윈도 없음(커밋 범위 모드)' : '문서 상태 원장 없음 — 0 과 구분']));
        }
        else {
            const d = ws.docProgress;
            const docEv = d.approvedDocs.slice(0, 3).map((id) => ({ file: `.spec/docs/${id}.state.json`, line: null }));
            progressRows.push({
                cells: [
                    '문서 제출/승인/반려',
                    `${d.submitted}/${d.approved}/${d.returned}`,
                    [d.approvedDocs.length > 0 ? `승인: ${d.approvedDocs.join(', ')}` : '', d.unparsableAt > 0 ? `시각 파싱 실패 ${d.unparsableAt}건` : ''].filter((s) => s.length > 0).join(' · ') || EMPTY_CELL,
                ],
                confidence: docEv.length > 0 ? 'CONFIRMED' : 'INFERRED',
                evidence: docEv,
            });
        }
    }
    return {
        docId: 'si-실적요약보고서',
        title: 'SI 실적요약보고서',
        methodology: 'si-standard',
        sections: [
            { heading: '실적 하이라이트', key: 'ws-highlight', claims: [], table: { columns: WS_TEXT_COLUMNS, rows: highlightRows } },
            { heading: '산정 기준', key: 'ws-criteria', claims: [], table: { columns: WS_TEXT_COLUMNS, rows: criteriaRows } },
            { heading: '커밋 이력', key: 'ws-commits', claims: [], table: { columns: WS_COMMIT_COLUMNS, rows: commitRows } },
            { heading: '모듈별 변경', key: 'ws-modules', claims: [], table: { columns: WS_MODULE_COLUMNS, rows: moduleRows } },
            { heading: 'RTM·문서 진척', key: 'ws-progress', claims: [], table: { columns: WS_PROGRESS_COLUMNS, rows: progressRows } },
        ],
    };
}
// 개별 빌더 export — 템플릿 기반 문서 세트(doc-set) 레지스트리가 docId 단위로 호출.
export { buildSiFeatureSpec, buildSiInterfaceSpec, buildSiTableSpec, buildSiBatchSpec, buildSiProgramList, buildSiRiskReport, buildSiTestScenarios, buildSiWorkSummary };
/** si-standard 모듈 — SI 정형 문서를 docId 순서로 산출(기능 → 인터페이스 → 테이블 → 배치 → 프로그램 → 위험 → 시나리오 → 실적). */
export const siStandardMethodology = {
    id: 'si-standard',
    title: 'SI 표준(정형 제출 서식)',
    buildDocSet(input) {
        return [buildSiFeatureSpec(input), buildSiInterfaceSpec(input), buildSiTableSpec(input), buildSiBatchSpec(input), buildSiProgramList(input), buildSiRiskReport(input), buildSiTestScenarios(input), buildSiWorkSummary(input)];
    },
};
//# sourceMappingURL=si-standard.js.map