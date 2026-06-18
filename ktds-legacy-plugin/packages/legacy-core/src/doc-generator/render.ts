/**
 * doc-generator 렌더러(template §0/§3) — 결정론 Markdown 직렬화.
 *
 * renderMarkdown: YAML 프런트매터(DocMeta) + 제목 + 상태문 + 섹션(선택 prose +
 *   claim 펜스). renderSkeleton: 펜스 내 claim 라인만(prose/프런트매터 제외) —
 *   GOLDEN 스냅샷 대상(§3.3 "골든 스냅샷은 skeleton(펜스 내)만").
 *
 * 결정론(§2.2): Date.now() 미사용. sourceCommit/evidenceRate 는 DocMeta 로 주입.
 * prose 는 host(Claude)가 채우는 골든 비대상이므로 skeleton 에서 제거한다.
 */
import { confidenceTag } from './claims.js'
import type { Claim, DocMeta, GeneratedDoc, Section, Table, TableRow } from './types.js'

/** claim 펜스 열기/닫기 마커(template §0) — prose 불릿과 claim 영역을 구분. */
export const CLAIMS_FENCE_OPEN = '<!-- claims:FENCE:OPEN -->'
export const CLAIMS_FENCE_CLOSE = '<!-- claims:FENCE:CLOSE -->'

/** 빈 섹션 표기(template §0). */
export const EMPTY_SECTION = '_(항목 없음)_'

/** Evidence[] -> " 근거: `f:l`, `f2:l2`"(없으면 빈 문자열). line 미상이면 file 만. */
function evidenceSuffix(claim: Claim): string {
  if (claim.evidence.length === 0) return ''
  const anchors = claim.evidence.map((e) =>
    e.line === null ? `\`${e.file}\`` : `\`${e.file}:${e.line}\``,
  )
  return ` 근거: ${anchors.join(', ')}`
}

/** 단일 claim 라인 — `- [tag] text.근거: ...`(template §0). */
function renderClaim(claim: Claim): string {
  return `- ${confidenceTag(claim.confidence)} ${claim.text}.${evidenceSuffix(claim)}`
}

/** 한 섹션의 claim 펜스 블록(헤딩 + 펜스 + 라인 / 빈 표기). */
function renderClaimsBlock(claims: Claim[]): string[] {
  if (claims.length === 0) return [EMPTY_SECTION]
  return [CLAIMS_FENCE_OPEN, ...claims.map(renderClaim), CLAIMS_FENCE_CLOSE]
}

/** GFM 표 셀 이스케이프 — `|` 는 행 구분자이므로 이스케이프(결정론 렌더 보장). */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** TableRow 의 evidence -> 근거 셀 텍스트(없으면 빈 문자열). renderClaim 과 동일 규약. */
function rowEvidenceCell(row: TableRow): string {
  if (row.evidence.length === 0) return ''
  return row.evidence
    .map((e) => (e.line === null ? `\`${e.file}\`` : `\`${e.file}:${e.line}\``))
    .join(', ')
}

/**
 * 표(Table) 렌더 — 도메인 열 + 신뢰도 + 근거 열(template §2). 행마다 신뢰도 태그와
 * 근거(path:line)를 전용 열로 부가한다. 헤더/구분선/행 모두 결정론적이다.
 */
function renderTable(table: Table): string[] {
  const header = [...table.columns, '신뢰도', '근거']
  const lines: string[] = [
    `| ${header.map(escapeCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ]
  for (const row of table.rows) {
    const cells = [...row.cells, confidenceTag(row.confidence), rowEvidenceCell(row)]
    lines.push(`| ${cells.map(escapeCell).join(' | ')} |`)
  }
  return lines
}

/** 섹션 본문(claim 펜스 또는 표) — 표가 있으면 표를, 없으면 claim 펜스를 방출. */
function renderSectionBody(section: Section): string[] {
  if (section.table) return renderTable(section.table)
  return renderClaimsBlock(section.claims)
}

/** YAML 프런트매터(DocMeta) — 키 고정 순서로 직렬화(결정론). */
function renderFrontmatter(meta: DocMeta): string[] {
  return [
    '---',
    `docId: ${meta.docId}`,
    `title: ${meta.title}`,
    `methodology: ${meta.methodology}`,
    `status: ${meta.status}`,
    `sourceCommit: ${meta.sourceCommit ?? 'null'}`,
    `evidenceRate: ${meta.evidenceRate}`,
    '---',
  ]
}

/**
 * GeneratedDoc + DocMeta -> 발행용 Markdown.
 * 프런트매터 + 제목 + 상태문 + 섹션(선택 prose + claim 펜스). prose 는 claim 펜스
 * 밖(§3.3)이며 골든 비대상이다.
 */
export function renderMarkdown(doc: GeneratedDoc, meta: DocMeta): string {
  const lines: string[] = [
    ...renderFrontmatter(meta),
    '',
    `# ${doc.title}`,
    '',
    `> 상태: ${meta.status} · ktds doc-generator · 근거 기반 자동 생성`,
    '',
  ]
  for (const s of doc.sections) {
    lines.push(`## ${s.heading}`, '')
    if (typeof s.prose === 'string' && s.prose.trim().length > 0) {
      lines.push(s.prose.trim(), '')
    }
    lines.push(...renderSectionBody(s), '')
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}

/**
 * 결정론 skeleton 렌더 — 펜스 내 claim 내용만(헤딩 + claim 라인). prose/프런트매터
 * 없음. GOLDEN 스냅샷 대상(§3.3): 동일 입력 -> byte-identical.
 */
export function renderSkeleton(doc: GeneratedDoc): string {
  const lines: string[] = []
  for (const s of doc.sections) {
    lines.push(`## ${s.heading}`, '')
    lines.push(...renderSectionBody(s), '')
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}
