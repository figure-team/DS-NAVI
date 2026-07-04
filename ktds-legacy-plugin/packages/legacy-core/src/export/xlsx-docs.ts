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

/** GeneratedDoc → 시트 목록(표 보유 섹션당 1시트). 표 섹션 없으면 빈 배열. */
export function docToSheets(doc: GeneratedDoc): XlsxSheet[] {
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
  return sheets
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
}

/** rtm.json 의 기능 1건(내보내기 필드만). entryPoint/implementation 은 grounded 값. */
interface RtmGroundedLike {
  value?: string | null
  confidence?: string
  evidence?: Array<{ file: string; line: number | null }>
}

interface RtmFunctionLike {
  featureId?: string
  name?: string
  domainName?: string
  entryPoint?: RtmGroundedLike | null
  implementation?: RtmGroundedLike | null
  state?: string
  requirementHistory?: string[]
}

export interface RtmLike {
  requirements?: RtmRequirementLike[]
  functions?: RtmFunctionLike[]
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
 * RTM 원장 → 시트 2개(§1 요구사항 원장, §2 기능(AS-IS) 원장 — 요구↔기능 추적은
 * functions[].requirementHistory 승계). 빈 원장도 헤더는 출력(빈 원장 결정과 정합).
 */
export function rtmToSheets(rtm: RtmLike): XlsxSheet[] {
  const reqRows: XlsxRow[] = [
    {
      cells: ['REQ_ID', '요구사항', '유형', 'NFR', '우선순위', '수명주기', '상태', '선행요구', '출처', '수용기준 수'],
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
      ],
    })),
  ]

  const fnRows: XlsxRow[] = [
    {
      cells: ['FN_ID', '기능명', '도메인', '진입점', '구현', '상태', '연관 요구', '근거'],
      style: 'header',
    },
    ...(rtm.functions ?? []).map((f): XlsxRow => ({
      cells: [
        f.featureId ?? '',
        f.name ?? '',
        f.domainName ?? '',
        groundedCell(f.entryPoint),
        groundedCell(f.implementation),
        f.state ?? '',
        (f.requirementHistory ?? []).join(', '),
        groundedEvidence(f.entryPoint) || groundedEvidence(f.implementation),
      ],
    })),
  ]

  return [
    { name: '요구사항 원장', rows: reqRows },
    { name: '기능(AS-IS) 원장', rows: fnRows },
  ]
}
