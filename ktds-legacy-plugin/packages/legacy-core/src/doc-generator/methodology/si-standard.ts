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

// 개별 빌더 export — 템플릿 기반 문서 세트(doc-set) 레지스트리가 docId 단위로 호출.
export { buildSiFeatureSpec, buildSiInterfaceSpec, buildSiTableSpec, buildSiBatchSpec }

/** si-standard 모듈 — SI 정형 3종을 docId 순서로 산출(기능 → 인터페이스 → 테이블). */
export const siStandardMethodology: MethodologyModule = {
  id: 'si-standard',
  title: 'SI 표준(정형 제출 서식)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return [buildSiFeatureSpec(input), buildSiInterfaceSpec(input), buildSiTableSpec(input), buildSiBatchSpec(input)]
  },
}
