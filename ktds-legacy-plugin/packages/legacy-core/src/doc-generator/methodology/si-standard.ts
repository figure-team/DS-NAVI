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
    const { confidence, evidence } = nodeRowConfidence(n)
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
    sections: [{ heading: '기능 목록', claims: [], table: { columns: FN_COLUMNS, rows } }],
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
    sections: [{ heading: 'API 목록', claims: [], table: { columns: API_COLUMNS, rows } }],
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
function buildSiTableSpec(input: DocInput): GeneratedDoc {
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

/** si-standard 모듈 — SI 정형 3종을 docId 순서로 산출(기능 → 인터페이스 → 테이블). */
export const siStandardMethodology: MethodologyModule = {
  id: 'si-standard',
  title: 'SI 표준(정형 제출 서식)',
  buildDocSet(input: DocInput): GeneratedDoc[] {
    return [buildSiFeatureSpec(input), buildSiInterfaceSpec(input), buildSiTableSpec(input)]
  },
}
