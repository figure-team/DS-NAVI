/**
 * si-standard 방법론 모듈 — 한국 SI 제출용 정형 문서 3종(보완 C, template §2).
 *
 * as-built 노드·엣지 데이터를 정형 표(table) 양식으로 재구성한다. 새 사실을 지어내지
 * 않는다(grounding 보존, §3.4): 표의 각 행 = 1 claim(§3.2)이며, CONFIRMED 행은 근거
 * (file:line) ≥1 을 보유한다. 경로/메서드/핸들러 등 코드 추출 사실은 CONFIRMED,
 * 요청/응답/인증 등 추론 셀은 셀 텍스트에 `[추정]` 태그를 단다(§2 인터페이스정의서).
 *
 * 표 모델 선택: GeneratedDoc Section.table(컬럼/행) 확장을 택했다(claim 텍스트에 셀을
 * 인코딩하는 대신). 렌더러가 신뢰도/근거 열을 자동 부가하므로 columns 는 도메인 열만
 * 담는다(template §2 열 순서와 1:1). 신뢰도/근거는 행의 confidence/evidence 로 분리.
 *
 * P6 확장 지점(정직성): si-테이블정의서의 컬럼 단위 enrichment(JPA @Table/@Column,
 * MyBatis Mapper XML SQL 슬라이스)는 P6 에서 reads_from/writes_to·컬럼 추출 결과를
 * 주입하는 형태로 확장한다. 현재 그래프 모델(UaGraphNode)에는 컬럼 정보가 없으므로
 * 테이블 단위 행만 산출하고 컬럼 셀은 `[추정]`(미상)으로 표기한다(합성 금지).
 */
import type { UaGraphNode } from '../../domain-map/types.js'
import type { DocInput } from '../builders/index.js'
import {
  displayName,
  metaList,
  nodeEvidence,
  nodesOfType,
  nodesWithTag,
  sortedRoutes,
} from '../builders/index.js'
import type { Confidence } from '../../types.js'
import type { Evidence, GeneratedDoc, TableRow } from '../types.js'
import type { MethodologyModule } from './types.js'

/** 추론(미상) 셀 표기 — template §2 인터페이스정의서 `[추정]` 규약. */
const INFERRED_CELL = '[추정]'

/** 빈 셀 표기 — 도메인 메타가 없을 때(끼워맞춤 금지). */
const EMPTY_CELL = ''

/** 노드 근거 보유 시 CONFIRMED, 아니면 INFERRED(grounding 보존, shared.nodeClaim 과 동일 규약). */
function nodeRowConfidence(node: UaGraphNode): { confidence: Confidence; evidence: Evidence[] } {
  const ev = nodeEvidence(node)
  return ev.length > 0
    ? { confidence: 'CONFIRMED', evidence: ev }
    : { confidence: 'INFERRED', evidence: [] }
}

/**
 * 도메인 행 근거 — 도메인 노드는 filePath 가 없으므로(추상 묶음) domainMeta.ktdsClaims 의
 * fill citation(file:line, 기계검증됨)을 행 근거로 승계한다. 인용 보유 → CONFIRMED.
 * 합성 금지: ktdsClaims 도 없으면 INFERRED.
 */
function domainRowConfidence(node: UaGraphNode): { confidence: Confidence; evidence: Evidence[] } {
  const direct = nodeEvidence(node)
  if (direct.length > 0) return { confidence: 'CONFIRMED', evidence: direct }
  const claims = (node.domainMeta?.ktdsClaims as Array<{ citations?: unknown }> | undefined) ?? []
  for (const c of claims) {
    const cits = Array.isArray(c?.citations) ? c.citations : []
    const ev: Evidence[] = cits
      .filter((x): x is { filePath: string; line?: unknown } => typeof (x as { filePath?: unknown })?.filePath === 'string')
      .map((x) => ({ file: x.filePath, line: typeof x.line === 'number' ? x.line : null }))
    if (ev.length > 0) return { confidence: 'CONFIRMED', evidence: ev.slice(0, 3) }
  }
  return { confidence: 'INFERRED', evidence: [] }
}

/** domainMeta 의 단일 문자열 필드(entryPoint 등) — 없으면 `[추정]`. */
function metaScalar(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' && v.length > 0 ? v : INFERRED_CELL
}

/** 정렬된 표시 목록을 셀 텍스트로 합친다(없으면 빈 셀). */
function joinCell(values: string[]): string {
  return values.length > 0 ? values.join(', ') : EMPTY_CELL
}

// ──────────────────────────────────────────────────────────────────────────
// si-기능명세서 (← 03_feature-spec 재구성). template §2 열 순서:
// 기능ID | 기능명 | 설명 | 진입점 | 관련 API | 관련 테이블 | 업무규칙 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────

const FN_COLUMNS = ['기능ID', '기능명', '설명', '진입점', '관련 API', '관련 테이블', '업무규칙']

/** 기능 ID 생성 — FN-001.. (도메인 순서 결정론, 1-기반 zero-pad). */
function featureId(index: number): string {
  return `FN-${String(index + 1).padStart(3, '0')}`
}

/**
 * si-기능명세서 — 도메인별 섹션. 각 도메인 노드 1개 = 표 1행(§3.2).
 * 설명=summary, 진입점=domainMeta.entryPoint, 업무규칙=domainMeta.businessRules.
 * 관련 API/테이블은 현 그래프 모델에 도메인↔라우트/테이블 연결 종류가 없어 `[추정]`
 * (합성 금지, grounding 보존). 컬럼 enrichment 는 P6 확장 지점.
 */
function buildSiFeatureSpec(input: DocInput): GeneratedDoc {
  const domains = nodesOfType(input.nodes, 'domain')
  const rows: TableRow[] = domains.map((n, i): TableRow => {
    const { confidence, evidence } = domainRowConfidence(n)
    const rules = metaList(n.domainMeta, 'businessRules')
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
    }
  })

  return {
    docId: 'si-기능명세서',
    title: 'SI 기능명세서',
    methodology: 'si-standard',
    sections: [{ heading: '기능 목록', key: 'feature-list', claims: [], table: { columns: FN_COLUMNS, rows } }],
  }
}

// ──────────────────────────────────────────────────────────────────────────
// si-인터페이스정의서 (← 04_api-spec/routes 재구성). template §2 열 순서:
// API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────

const API_COLUMNS = ['API_ID', 'HTTP', '경로', '컨트롤러·핸들러', '요청', '응답', '인증']

/** API ID 생성 — API-001.. (routeId 정렬 순서 결정론). */
function apiId(index: number): string {
  return `API-${String(index + 1).padStart(3, '0')}`
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
]

/** endpoint 셀 — 해석값 우선, 실패 시 raw, 둘 다 없으면 [미확인]. */
const UNRESOLVED_CELL = '[미확인]'

/** 프로토콜 → 연계방식 분류(파생 추론이므로 셀에 [추정] 마킹). */
const LINK_MODE: Record<string, string> = {
  http: '실시간(온라인)',
  ws: '실시간(온라인)',
  socket: '실시간(소켓)',
  mq: '비동기(MQ)',
  file: '파일 송수신',
  mail: '메일',
  'db-link': 'DB 링크',
}

/**
 * §2 송신/라우트 외 수신 행 — interfaces.json(W1, 결정론 스캔) 승계.
 * - 탐지·엔드포인트·호출지점: 결정론 사실 → CONFIRMED(callSite file:line 근거).
 * - 인터페이스명: 첫 호출 심볼 기반 초안 → [추정](사람이 업무명으로 교체).
 * - 연계방식: 프로토콜 파생 분류 → [추정]. 대상시스템: 그래프에 없음 → [추정](T3).
 * - '해석' 열은 endpoint 정적 해석 여부만 뜻한다(연계 검증/운영 여부 아님 — 감리 오독 방지,
 *   해석됨/[미확인]). endpoint 미해석은 [미확인] 셀로 표면화(침묵 누락 금지).
 */
function outboundRows(input: DocInput): TableRow[] {
  const items = input.interfaces?.items ?? []
  return items.map((it): TableRow => {
    const endpoint = it.endpoint.resolved ?? it.endpoint.raw ?? UNRESOLVED_CELL
    const nameDraft = `${it.callSites[0]?.symbol ?? it.clientType} ${INFERRED_CELL}`
    const linkMode = `${LINK_MODE[it.protocol] ?? it.protocol} ${INFERRED_CELL}`
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
    }
  })
}

/** si-프로그램목록 §1 열 — template program-list-si 와 1:1. */
const PGM_COLUMNS = ['PGM_ID', '프로그램명', '업무명', '소속도메인', '유형', '계층', 'LOC']
/** si-프로그램목록 §2 열 — template fp-basis 와 1:1. */
const FP_COLUMNS = ['구분', '대상', '상세']

/** 프로그램 유형 → 한국어 표기. */
const PGM_TYPE_KO: Record<string, string> = {
  screen: '화면',
  api: 'API',
  batch: '배치',
  service: '서비스',
  dao: 'DAO',
  db: 'DB',
  'mapper-xml': 'SQL매퍼',
  common: '공통/기타',
  test: '테스트',
}

/**
 * si-프로그램목록(W3) — program-inventory.json 승계.
 * §1 프로그램 목록: 파일·유형·계층·LOC 는 결정론 사실 → CONFIRMED(filePath:1 근거).
 *   업무명은 정적 분석 불가 — [미확인] 사람 채움(W2 교훈: 생략 대신 표면화).
 * §2 규모산정(FP) 기초: 후보 구분(EI/EQ/ILF/EIF)은 method/출처 기반 잠정 → 셀에 [추정].
 *   집계 행(잠정 FP)은 간이법 평균복잡도 미조정치 — 범례에 가중치·EO 재분류 안내.
 */
function buildSiProgramList(input: DocInput): GeneratedDoc {
  const inv = input.programInventory
  const pgmRows: TableRow[] = (inv?.programs ?? []).map((p): TableRow => {
    // 소속도메인 — candidates 조인. reachability=확정 신호, directory/prefix=[추정],
    // common/ambiguous 는 그 사실 자체를 표기(도메인 확정은 사람 몫).
    const domainCell =
      p.domain === null
        ? UNRESOLVED_CELL
        : p.domainVia === 'reachability'
          ? p.domain
          : p.domainVia === 'common'
            ? `공용(${p.domain})`
            : p.domainVia === 'ambiguous'
              ? `모호(${p.domain}) ${INFERRED_CELL}`
              : `${p.domain} ${INFERRED_CELL}`
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
    }
  })

  const fpRows: TableRow[] = []
  for (const t of inv?.fp.transactions ?? []) {
    const kindCell =
      t.kind === 'UNCLASSIFIED' ? `미분류(method 미상) ${INFERRED_CELL}` : `${t.kind} ${INFERRED_CELL}`
    fpRows.push({
      cells: [kindCell, t.routeId, `${t.method} ${t.path}`],
      confidence: 'CONFIRMED',
      evidence: [{ file: t.evidence.file, line: t.evidence.line }],
    })
  }
  for (const d of inv?.fp.dataFunctions ?? []) {
    fpRows.push({
      cells: [`${d.kind} ${INFERRED_CELL}`, d.name, d.kind === 'ILF' ? '자체 테이블' : 'DB링크 참조'],
      confidence: 'CONFIRMED',
      evidence: [{ file: d.evidence.file, line: d.evidence.line }],
    })
  }
  if (inv) {
    const s = inv.fp.summary
    // 하한 표기 — 숫자만 복사돼도 "미반영분 존재"가 따라가게 셀 안에 명시(정밀 착시 방지).
    fpRows.push({
      cells: [
        `집계 ${INFERRED_CELL}`,
        `EI ${s.ei} · EQ ${s.eq} · 미분류 ${s.unclassified} · EO 미산출 · ILF ${s.ilf} · EIF ${s.eif}`,
        `잠정 FP ≥ ${s.unadjustedFp} (미조정 하한 — 미분류 ${s.unclassified}건·EO 재분류 시 상향)`,
      ],
      confidence: 'INFERRED',
      evidence: [],
    })
  }

  return {
    docId: 'si-프로그램목록',
    title: 'SI 프로그램목록',
    methodology: 'si-standard',
    sections: [
      { heading: '프로그램 목록', key: 'program-list-si', claims: [], table: { columns: PGM_COLUMNS, rows: pgmRows } },
      { heading: '규모산정(FP) 기초', key: 'fp-basis', claims: [], table: { columns: FP_COLUMNS, rows: fpRows } },
    ],
  }
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
]

/**
 * si-배치정의서(W2) — batch-jobs.json 승계. 탐지·스케줄·핸들러·도달범위는 결정론 사실
 * → CONFIRMED(evidence file:line). 배치명은 초안 [추정](사람이 업무명으로 교체).
 * 운영 축 4열(데이터대상·선행/후행·수행서버·재기동)은 정적 분석 불가 — [미확인]으로
 * 표면화해 사람이 운영 지식으로 채운다(생략하면 그 필드가 기대된다는 것조차 안 보인다).
 * '해석' = 잡 구현 파일 해석 여부(해석됨/[미확인]) — shell/crontab 은 프로젝트 밖이라 '외부'.
 * 도달범위는 미해석 행에서 [미확인](루트=XML 인 카운트 1 이 "사소한 배치"로 오독되는 것 방지).
 */
function buildSiBatchSpec(input: DocInput): GeneratedDoc {
  const jobs = input.batchJobs?.jobs ?? []
  const rows: TableRow[] = jobs.map((j): TableRow => {
    const external = j.trigger === 'shell' || j.trigger === 'crontab'
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
    }
  })
  return {
    docId: 'si-배치정의서',
    title: 'SI 배치정의서',
    methodology: 'si-standard',
    sections: [
      { heading: '배치 목록', key: 'batch-list-si', claims: [], table: { columns: BATCH_COLUMNS, rows } },
    ],
  }
}

function buildSiInterfaceSpec(input: DocInput): GeneratedDoc {
  const rows: TableRow[] = sortedRoutes(input).map((r, i): TableRow => {
    const handler = typeof r.handler === 'string' && r.handler.length > 0 ? r.handler : INFERRED_CELL
    return {
      cells: [apiId(i), r.method, r.path, handler, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL],
      confidence: 'CONFIRMED',
      evidence: [{ file: r.filePath, line: r.line }],
    }
  })

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
  }
}

// ──────────────────────────────────────────────────────────────────────────
// si-테이블정의서 (← 05_db-spec 재구성). template §2 열 순서:
// 컬럼 | 타입 | PK | FK | NULL | 설명 | (신뢰도) | (근거)
// ──────────────────────────────────────────────────────────────────────────

const TBL_COLUMNS = ['컬럼', '타입', 'PK', 'FK', 'NULL', '설명']

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
function buildSiTableSpecFromMyBatis(input: DocInput): GeneratedDoc {
  const model = input.mybatisModel!
  // 테이블 → 컬럼 → 근거(첫 출현). C/U 문의 컬럼만 해당 테이블로 귀속(단일 테이블).
  const byTable = new Map<string, Map<string, Evidence>>()
  for (const m of model.mappers) {
    for (const s of m.statements) {
      if ((s.crud !== 'C' && s.crud !== 'U') || s.tables.length !== 1) continue
      const table = s.tables[0]
      const colMap = byTable.get(table) ?? new Map<string, Evidence>()
      for (const c of s.columns) {
        if (!colMap.has(c)) colMap.set(c, { file: m.relPath, line: s.line })
      }
      byTable.set(table, colMap)
    }
  }
  const sections = model.tables.map((table) => {
    const colMap = byTable.get(table) ?? new Map<string, Evidence>()
    const rows: TableRow[] = [...colMap.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(
      (col): TableRow => ({
        cells: [col, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL, INFERRED_CELL, EMPTY_CELL],
        confidence: 'CONFIRMED',
        evidence: [colMap.get(col)!],
      }),
    )
    return { heading: `${table} 테이블`, key: 'table-list', claims: [], table: { columns: TBL_COLUMNS, rows } }
  })
  return { docId: 'si-테이블정의서', title: 'SI 테이블정의서', methodology: 'si-standard', sections }
}

/**
 * db-schema(DDL) 기반 테이블 섹션 — PA3. 권위 소스(.sql DDL)로 컬럼/타입/PK/FK/NULL/설명을
 * 모두 채운다. 모든 행은 컬럼 선언 file:line 근거(CONFIRMED). MyBatis(컬럼만, 나머지 추정)나
 * 노드(단일 추정 행)보다 정밀하므로 dbSchema 가 있으면 최우선.
 */
function buildSiTableSpecFromDbSchema(input: DocInput): GeneratedDoc {
  const m = input.dbSchema!
  const sections = m.tables.map((t) => {
    const pkSet = new Set(t.primaryKey)
    // col → "refTable(refCol)" (복합 FK 는 컬럼 위치 매칭).
    const fkByCol = new Map<string, string>()
    for (const fk of t.foreignKeys) {
      fk.columns.forEach((c, i) => fkByCol.set(c, `${fk.refTable}(${fk.refColumns[i] ?? fk.refColumns[0] ?? ''})`))
    }
    const rows: TableRow[] = t.columns.map(
      (c): TableRow => ({
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
      }),
    )
    const heading = `${t.name} 테이블${t.comment ? ` — ${t.comment}` : ''}`
    return { heading, key: 'table-list', claims: [], table: { columns: TBL_COLUMNS, rows } }
  })
  return { docId: 'si-테이블정의서', title: 'SI 테이블정의서', methodology: 'si-standard', sections }
}

function buildSiTableSpec(input: DocInput): GeneratedDoc {
  // 우선순위: db-schema(DDL, 권위·전 컬럼 확정) > MyBatis(컬럼만) > 노드(단일 추정).
  if (input.dbSchema && input.dbSchema.tables.length > 0) {
    return buildSiTableSpecFromDbSchema(input)
  }
  if (input.mybatisModel && input.mybatisModel.tables.length > 0) {
    return buildSiTableSpecFromMyBatis(input)
  }
  const tables = nodesWithTag(input.nodes, 'table', 'schema')
  const sections = tables.map((n) => {
    const { confidence, evidence } = nodeRowConfidence(n)
    const row: TableRow = {
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
    }
    return {
      heading: `${displayName(n)} 테이블`,
      key: 'table-list',
      claims: [],
      table: { columns: TBL_COLUMNS, rows: [row] },
    }
  })

  return {
    docId: 'si-테이블정의서',
    title: 'SI 테이블정의서',
    methodology: 'si-standard',
    sections,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// si-위험모듈리포트 (W4) — risk-report.json 승계. PM 주간보고용 위험 Top N.
// ──────────────────────────────────────────────────────────────────────────

/** §1 산정 기준 열 — template risk-criteria 와 1:1. */
const RISK_CRITERIA_COLUMNS = ['항목', '산정 방법', '가중치']
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
]
/** §3 지표 커버리지 열 — template risk-coverage 와 1:1. */
const RISK_COVERAGE_COLUMNS = ['항목', '값', '비고']

/** 지표 키 → 한국어 표기(주요요인 셀). */
const RISK_METRIC_KO: Record<string, string> = {
  complexity: '복잡도',
  churn: '변경빈도',
  loc: 'LOC',
  fanIn: '팬인',
  fanOut: '팬아웃',
  unreached: '미도달',
}

/** 지표 키 → 산정 방법 설명(§1 — 수용기준 "계산 근거 문서화"의 사용자 노출면). */
const RISK_METHOD_DESC: Record<string, string> = {
  complexity: '순환복잡도 근사(java AST): 메서드 수 + 결정포인트(if/for/while/do/catch/삼항/case/&&/||). 비 java 는 미측정 [미확인] — 백분위는 측정(java) 집합 내 순위',
  churn: 'git 전체 이력에서 파일별 변경 커밋 수(git log --numstat, rename 미추적·shallow clone 은 미측정 처리). 변경 라인은 참고치',
  loc: '파일 라인 수(wc -l 관례, 프로그램목록 승계)',
  fanIn: '이 파일에 의존하는 서로 다른 파일 수(강신호 엣지: 주입/필드/상속/구현/매퍼 — import 제외)',
  fanOut: '이 파일이 의존하는 서로 다른 파일 수(동일 강신호 엣지)',
  unreached: '진입점(라우트·배치)에서 도달 불가 여부(slices 도달성 — 이진). 점수 비반영 플래그: 뷰 forward(JSP 등) 미추적 한계로 오탐 가능 — 데드코드 판정은 사람 확인',
}

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
function buildSiRiskReport(input: DocInput): GeneratedDoc {
  const rr = input.riskReport
  const weights = rr?.meta.weights

  const criteriaRows: TableRow[] = (
    ['complexity', 'churn', 'loc', 'fanIn', 'fanOut'] as const
  ).map(
    (k): TableRow => ({
      cells: [RISK_METRIC_KO[k], RISK_METHOD_DESC[k], weights ? String(weights[k]) : EMPTY_CELL],
      confidence: 'INFERRED',
      evidence: [],
    }),
  )
  criteriaRows.push({
    cells: ['미도달', RISK_METHOD_DESC.unreached, '플래그(비점수)'],
    confidence: 'INFERRED',
    evidence: [],
  })
  criteriaRows.push({
    cells: [
      '정규화·합산',
      '지표별 프로젝트 내 백분위(0~1, 동점 평균) → 가중 합산(가중치는 휴리스틱 — 점수는 순위로만 해석). 미측정 지표는 가중치 재정규화(미측정 파일 과소평가 방지), 무분산 지표(전 파일 동일값)는 변별 기여가 없어 제외. 점수는 프로젝트 내 상대 순위이며 절대 품질 판정이 아님',
      EMPTY_CELL,
    ],
    confidence: 'INFERRED',
    evidence: [],
  })
  criteriaRows.push({
    cells: [
      '등급',
      '프로젝트 내 상대 밴드 — 상 = 점수 상위 10%(최소 1본, 동점 상향) · 중 = 상위 30% · 하 = 나머지. 절대 품질 판정 아님',
      EMPTY_CELL,
    ],
    confidence: 'INFERRED',
    evidence: [],
  })

  const topN = rr?.meta.topN ?? 20
  const topRows: TableRow[] = (rr?.items ?? []).slice(0, topN).map((it, i): TableRow => {
    // 설계 §5: 전 지표 측정 행만 [확정], 미측정 지표 포함 행은 [추정](리뷰 C4 —
    // 서로 다른 지표집합으로 매긴 점수의 통약 한계도 이 강등으로 표면화).
    const allMeasured = it.metrics.complexity !== null && it.metrics.churnCommits !== null
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
    }
  })

  const gradeDist = { 상: 0, 중: 0, 하: 0 }
  for (const it of rr?.items ?? []) gradeDist[it.grade]++
  const cxBreakdown = (rr?.stats.complexityUnmeasured ?? [])
    .map((e) => `${e.ext} ${e.count}`)
    .join(', ')
  const hasKotlinGap = (rr?.stats.complexityUnmeasured ?? []).some((e) => e.ext === 'kt' || e.ext === 'kts')
  const coverageRows: TableRow[] = rr
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
      ].map((r): TableRow => ({ ...r, confidence: 'INFERRED', evidence: [] }))
    : []

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
  }
}

// 개별 빌더 export — 템플릿 기반 문서 세트(doc-set) 레지스트리가 docId 단위로 호출.
export { buildSiFeatureSpec, buildSiInterfaceSpec, buildSiTableSpec, buildSiBatchSpec, buildSiProgramList, buildSiRiskReport }

/** si-standard 모듈 — SI 정형 문서를 docId 순서로 산출(기능 → 인터페이스 → 테이블 → 배치 → 프로그램 → 위험). */
export const siStandardMethodology: MethodologyModule = {
  id: 'si-standard',
  title: 'SI 표준(정형 제출 서식)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return [buildSiFeatureSpec(input), buildSiInterfaceSpec(input), buildSiTableSpec(input), buildSiBatchSpec(input), buildSiProgramList(input), buildSiRiskReport(input)]
  },
}
