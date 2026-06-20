/**
 * 06_program-list.md — 프로그램 목록 빌더(D2).
 *
 * flow/step 노드의 filePath 를 파일 단위로 dedup 해 프로그램(소스 파일) 인벤토리를 만든다.
 * 파일 경로·라인은 노드 사실 → CONFIRMED + 근거(file:line). 클래스=파일 basename,
 * 레이어=노드 layer, 책임 요약=노드 summary. PG-001.. (파일 경로 정렬).
 *
 * grounding 보존(§3.4): filePath 없는 노드는 제외(근거 없는 행 금지).
 */
import type { UaGraphNode } from '../../domain-map/types.js'
import type { GeneratedDoc, TableRow } from '../types.js'
import { type DocInput, nodesOfType } from './shared.js'

const COLUMNS = ['프로그램ID', '파일 경로', '클래스', '레이어', '책임 요약']

/** 파일 경로 → 클래스명(basename, 확장자 제거). */
function classOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

export function buildProgramList(input: DocInput): GeneratedDoc {
  // 파일 단위 dedup — 대표 노드 = filePath 별 첫 노드(id 정렬). flow=진입 컨트롤러, step=구성요소.
  const byFile = new Map<string, UaGraphNode>()
  for (const n of nodesOfType(input.nodes, 'flow', 'step')) {
    if (typeof n.filePath === 'string' && !byFile.has(n.filePath)) byFile.set(n.filePath, n)
  }
  const files = [...byFile.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const rows: TableRow[] = files.map((fp, i): TableRow => {
    const n = byFile.get(fp)!
    return {
      cells: [
        `PG-${String(i + 1).padStart(3, '0')}`,
        fp,
        classOf(fp),
        n.layer ?? '',
        n.summary.length > 0 ? n.summary : '',
      ],
      confidence: 'CONFIRMED',
      evidence: [{ file: fp, line: n.lineRange ? n.lineRange[0] : null }],
    }
  })

  return {
    docId: '06_program-list',
    title: '프로그램 목록',
    methodology: 'as-built',
    sections: [{ heading: '프로그램 목록', key: 'program-list', claims: [], table: { columns: COLUMNS, rows } }],
  }
}
