/**
 * GeneratedDoc / RTM → xlsx 시트 변환(W7 P4-b).
 *
 * 열 구성은 md 렌더(render.ts)와 1:1 — 도메인 열 + 신뢰도 + 근거. 근거 셀은 md 의
 * 백틱 없이 `f:l, f2:l2`(엑셀 가독). 집계 행(INFERRED + '집계' 시작, W3 리뷰 L5)은
 * 강조행 스타일로 데이터 행과 시각 구분. 표 없는 섹션(prose/claims 전용)은 시트를
 * 만들지 않는다. 0행 표도 헤더는 출력(스캔했고 없음의 증거).
 */
import type { GeneratedDoc, TableRow } from '../doc-generator/types.js'
import { confidenceTag } from '../doc-generator/claims.js'
import type { XlsxRow, XlsxSheet } from './xlsx.js'

/** TableRow evidence → 엑셀 근거 셀(`f:l, f2:l2` — md 백틱 제거판). */
function evidenceCell(row: TableRow): string {
  return row.evidence
    .map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`))
    .join(', ')
}

/** 집계 행 판별(W3 si-프로그램목록 규약) — 강조행으로 구분. */
function isAggregateRow(row: TableRow): boolean {
  return row.confidence === 'INFERRED' && (row.cells[0] ?? '').startsWith('집계')
}

/** 문서정보 시트에 실을 메타(W7 비평 반영 — 표지·지위·태그 의미 안내). */
export interface XlsxDocMeta {
  sourceCommit?: string | null
}

/**
 * '문서정보' 표지 시트 — 발주처 서식 관례 + 오독 방지 안내 3종:
 * ① 본 파일의 지위(스캔 스냅샷 원천 데이터 — 대시보드 확정 편집 미반영),
 * ② 신뢰도 [확정] = 정적 분석 근거 보유(사람 검수·사인오프 아님),
 * ③ 재생성 경로. 소스 커밋으로 시점 식별(타임스탬프 대신 — 결정론 유지).
 */
function infoSheet(title: string, methodology: string | undefined, meta?: XlsxDocMeta): XlsxSheet {
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
  }
}

/** GeneratedDoc → 시트 목록(문서정보 + 표 보유 섹션당 1시트). 표 섹션 없으면 빈 배열. */
export function docToSheets(doc: GeneratedDoc, meta?: XlsxDocMeta): XlsxSheet[] {
  const sheets: XlsxSheet[] = []
  for (const section of doc.sections) {
    const table = section.table
    if (!table) continue
    const rows: XlsxRow[] = [
      { cells: [...table.columns, '신뢰도', '근거'], style: 'header' },
      ...table.rows.map(
        (r): XlsxRow => ({
          cells: [...r.cells, confidenceTag(r.confidence), evidenceCell(r)],
          ...(isAggregateRow(r) ? { style: 'bold' as const } : {}),
        }),
      ),
    ]
    sheets.push({ name: section.heading, rows })
  }
  // 표 섹션이 하나라도 있어야 xlsx 실익 — 있으면 문서정보 표지를 맨 앞에.
  return sheets.length > 0 ? [infoSheet(doc.title, doc.methodology, meta), ...sheets] : []
}

// ── RTM ──────────────────────────────────────────────────────────────────

/** rtm.json 의 요구사항 1건(내보내기에 필요한 필드만 — 스키마는 rtm 모듈 소유). */
interface RtmRequirementLike {
  id: string
  text: string
  type?: string | null
  nfrCategory?: string | null
  priority?: string | null
  lifecycle?: string | null
  status?: string | null
  dependsOn?: string[]
  source?: { kind?: string; raw?: string } | null
  acceptanceCriteria?: unknown[]
  /** 검수 사인오프(검증 스파인) — null 이면 미검수. */
  signoff?: { approver?: string | null; at?: string | null } | null
}

/** rtm.json 의 기능 1건(내보내기 필드만). entryPoint/implementation 은 grounded 값. */
interface RtmGroundedLike {
  value?: string | null
  confidence?: string
  evidence?: Array<{ file: string; line: number | null }>
}

interface RtmFunctionLike {
  id?: string
  featureId?: string
  name?: string
  domainName?: string
  entryPoint?: RtmGroundedLike | null
  implementation?: RtmGroundedLike | null
  /** 시험 근거(검증 스파인) — value 비면 미시험. */
  test?: RtmGroundedLike | null
  state?: string
  requirementHistory?: string[]
  /** R7 사용자 정의 필드 값(key = custom:<id>). */
  custom?: Record<string, string>
}

/** W5 테스트 시나리오 1건(내보내기 필드만). */
interface RtmScenarioLike {
  id?: string
  fnId?: string
  reqId?: string | null
  acId?: string | null
  kind?: string
  title?: string
  given?: string
  when?: string
  then?: string
  confidence?: string
  evidence?: Array<{ file: string; line: number | null }>
  notes?: string[]
}

export interface RtmLike {
  requirements?: RtmRequirementLike[]
  functions?: RtmFunctionLike[]
  /** W5 단위테스트 시나리오(있으면 §4 시트). */
  testScenarios?: RtmScenarioLike[]
  /** R7 사용자 정의 필드 정의 — 기능 원장 동적 열. */
  customFields?: Array<{ id?: string; label?: string }>
  /** 커버리지 요약(현황 뷰) — 있는 그대로 §3 시트로 평탄화. */
  coverage?: {
    requirements?: Record<string, unknown>
    functions?: Record<string, unknown>
    tests?: Record<string, unknown>
    gaps?: Record<string, unknown>
  } | null
}

function groundedCell(g: RtmGroundedLike | null | undefined): string {
  return g?.value ?? ''
}

function groundedEvidence(g: RtmGroundedLike | null | undefined): string {
  return (g?.evidence ?? [])
    .map((e) => (e.line === null ? e.file : `${e.file}:${e.line}`))
    .join(', ')
}

/**
 * RTM 원장 → 시트 5개(문서정보 + §1 요구사항 원장 + §2 기능(AS-IS) 원장 + §3 테스트
 * 시나리오(W5) + §4 커버리지 현황). 기능 원장에는 R7 사용자 정의 필드가 동적 열로 붙는다.
 * 검증 스파인(검수 signoff·시험 test)을 열로 승계 — 감리의 "검수 근거" 질의에 xlsx 로
 * 답할 수 있어야 한다(W7 비평 반영). 빈 원장도 헤더는 출력(빈 원장 결정과 정합).
 * 주: 대시보드 행단위 오버레이(rtm-overrides)는 미반영 — 문서정보 시트에 지위 명시,
 * 오버레이 병합은 백로그(설계 §10).
 */
export function rtmToSheets(rtm: RtmLike, meta?: XlsxDocMeta): XlsxSheet[] {
  const reqRows: XlsxRow[] = [
    {
      cells: ['REQ_ID', '요구사항', '유형', 'NFR', '우선순위', '수명주기', '상태', '선행요구', '출처', '수용기준 수', '검수'],
      style: 'header',
    },
    ...(rtm.requirements ?? []).map((r): XlsxRow => ({
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
  ]

  // R7: 사용자 정의 필드 → 기능 원장 동적 열(정의 순 — applyOverlay 가 id ASC 정렬).
  const customFields = (rtm.customFields ?? []).filter((f) => typeof f.id === 'string')
  const fnRows: XlsxRow[] = [
    {
      cells: [
        'FN_ID', '기능명', '도메인', '진입점', '구현', '시험', '상태', '연관 요구',
        ...customFields.map((f) => f.label ?? f.id ?? ''),
        '근거',
      ],
      style: 'header',
    },
    ...(rtm.functions ?? []).map((f): XlsxRow => ({
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
  ]

  // W5: 테스트 시나리오 원장 — 초안 [추정]/확정 구분, 기능/요구/AC 추적선 승계.
  const TS_KIND_KO: Record<string, string> = { normal: '정상', exception: '예외', boundary: '경계' }
  const fnByIdForTs = new Map((rtm.functions ?? []).map((f) => [f.id ?? '', f]))
  const tsRows: XlsxRow[] = [
    {
      cells: ['TS_ID', 'FN_ID', '기능명', '요구ID', 'AC', '구분', '제목', 'Given', 'When', 'Then', '상태', '비고', '근거'],
      style: 'header',
    },
    ...(rtm.testScenarios ?? []).map((s): XlsxRow => {
      const fn = fnByIdForTs.get(s.fnId ?? '')
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
      }
    }),
  ]

  // §3 커버리지 현황 — 요약 객체를 (구분, 항목, 값) 3열로 평탄화(추적표 '현황' 뷰 대응).
  const covRows: XlsxRow[] = [{ cells: ['구분', '항목', '값'], style: 'header' }]
  const cov = rtm.coverage ?? {}
  for (const [group, obj] of Object.entries(cov)) {
    if (!obj || typeof obj !== 'object') continue
    for (const [k, v] of Object.entries(obj)) {
      covRows.push({
        cells: [group, k, Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)],
      })
    }
  }

  return [
    infoSheet('요구사항 추적표(RTM)', 'rtm', meta),
    { name: '요구사항 원장', rows: reqRows },
    { name: '기능(AS-IS) 원장', rows: fnRows },
    { name: '테스트 시나리오', rows: tsRows },
    { name: '커버리지 현황', rows: covRows },
  ]
}
