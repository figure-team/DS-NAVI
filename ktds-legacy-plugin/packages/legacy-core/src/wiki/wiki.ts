/**
 * wiki vault (P4.4) — GeneratedDoc 집합을 Obsidian 스타일 마크다운 vault 로 묶는다.
 *
 * - 문서 1건당 .md 1개(renderMarkdown 으로 결정론 직렬화, meta 는 호출자 주입).
 * - index.md(허브) — 방법론별 그룹 + "여기부터(start here)" 섹션 + [[docId]] 위키링크.
 * - 관계 위키링크 — feature-spec [[api-spec]] 처럼 관계가 존재할 때만 결정론적으로 부가.
 *
 * 결정론(§2.2): Date.now() 미사용, 모든 배열 정렬, 동일 입력 -> byte-identical.
 * meta 는 호출자가 주입(sourceCommit/evidenceRate/status) — 산출물에 timestamp 없음.
 */
import { renderMarkdown } from '../doc-generator/render.js'
import type { DocMeta, GeneratedDoc } from '../doc-generator/types.js'

/** vault 한 파일 — 상대 경로(.spec/wiki/ 기준) + 마크다운 본문. */
export interface WikiFile {
  path: string
  content: string
}

/** wiki vault — 정렬된 파일 목록(문서 .md + index.md). */
export interface WikiVault {
  files: WikiFile[]
}

/**
 * docId -> DocMeta 를 주입하는 콜백(결정론: 호출자가 sourceCommit/evidenceRate/status 공급).
 * meta 가 없으면 문서 자체에서 최소 meta(status=DRAFT, sourceCommit=null, evidenceRate=0)를 합성한다.
 */
export type MetaResolver = (doc: GeneratedDoc) => DocMeta

/** 문서에서 최소 DocMeta 합성(meta 미주입 시 폴백) — timestamp 없음, 결정론. */
function fallbackMeta(doc: GeneratedDoc): DocMeta {
  return {
    docId: doc.docId,
    title: doc.title,
    methodology: doc.methodology,
    status: 'DRAFT',
    sourceCommit: null,
    evidenceRate: 0,
  }
}

/** docId ASC 안정 정렬(결정론 tie-break). */
function sortDocs(docs: GeneratedDoc[]): GeneratedDoc[] {
  return [...docs].sort((a, b) => (a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0))
}

/**
 * docId -> 관련 docId 위키링크 목록(관계가 존재할 때만). 결정론·정렬.
 * 관계는 docId 의 의미 접미사로 판정한다(합성 금지 — 실제 vault 에 존재하는 문서만 링크).
 *  - feature-spec -> api-spec(기능이 API 를 사용), api-spec -> db-spec(API 가 DB 를 사용),
 *  - architecture -> tech-stack(아키텍처가 기술스택 위에 선다).
 */
const RELATED_SUFFIX: Record<string, string[]> = {
  'feature-spec': ['api-spec'],
  'api-spec': ['db-spec'],
  architecture: ['tech-stack'],
}

/** docId('04_api-spec')에서 의미 접미사('api-spec') 추출 — 숫자 접두 제거. */
function semanticKey(docId: string): string {
  const m = docId.match(/^\d+_(.+)$/)
  return m ? m[1] : docId
}

/** 한 문서의 관련 문서 docId 목록 — 실제 vault 에 존재하는 문서만, 정렬. */
function relatedDocIds(doc: GeneratedDoc, byKey: Map<string, GeneratedDoc>): string[] {
  const wants = RELATED_SUFFIX[semanticKey(doc.docId)] ?? []
  const ids: string[] = []
  for (const key of wants) {
    const target = byKey.get(key)
    if (target && target.docId !== doc.docId) ids.push(target.docId)
  }
  return ids.slice().sort()
}

/** 관련 문서 위키링크 블록(없으면 빈 배열) — 문서 .md 말미에 부가. */
function relatedBlock(ids: string[]): string[] {
  if (ids.length === 0) return []
  return ['', '## 관련 문서', '', ...ids.map((id) => `- [[${id}]]`)]
}

/**
 * index.md(허브) 본문 — "여기부터(start here)" + 방법론별 그룹 위키링크.
 * 방법론 키/문서 docId 모두 정렬(결정론).
 */
function renderIndex(docs: GeneratedDoc[]): string {
  const sorted = sortDocs(docs)
  const byMethodology = new Map<string, GeneratedDoc[]>()
  for (const doc of sorted) {
    const list = byMethodology.get(doc.methodology) ?? []
    list.push(doc)
    byMethodology.set(doc.methodology, list)
  }
  const lines: string[] = ['# 위키 인덱스 (Wiki Index)', '']
  lines.push('## 여기부터(start here)', '')
  if (sorted.length === 0) {
    lines.push('_(문서 없음)_', '')
  } else {
    lines.push(`먼저 [[${sorted[0].docId}]] 부터 보세요.`, '')
  }
  for (const methodology of [...byMethodology.keys()].sort()) {
    lines.push(`## ${methodology}`, '')
    for (const doc of byMethodology.get(methodology) ?? []) {
      lines.push(`- [[${doc.docId}]] — ${doc.title}`)
    }
    lines.push('')
  }
  return lines.join('\n').replace(/\n+$/, '\n')
}

/**
 * GeneratedDoc[] -> WikiVault. 문서 1건당 `<docId>.md`(renderMarkdown + 관련 위키링크) +
 * `index.md` 허브. files 는 path 정렬(결정론). resolveMeta 미지정 시 최소 meta 폴백.
 */
export function buildWikiVault(docs: GeneratedDoc[], resolveMeta?: MetaResolver): WikiVault {
  const sorted = sortDocs(docs)
  const byKey = new Map<string, GeneratedDoc>()
  for (const doc of sorted) byKey.set(semanticKey(doc.docId), doc)
  const resolver = resolveMeta ?? fallbackMeta
  const files: WikiFile[] = []
  for (const doc of sorted) {
    const meta = resolver(doc)
    const body = renderMarkdown(doc, meta)
    const related = relatedBlock(relatedDocIds(doc, byKey))
    const content =
      related.length === 0
        ? body
        : `${body.replace(/\n+$/, '\n')}${related.join('\n')}\n`
    files.push({ path: `${doc.docId}.md`, content })
  }
  files.push({ path: 'index.md', content: renderIndex(sorted) })
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files }
}
