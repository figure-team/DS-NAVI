/**
 * 분기 스캐너(PD1) — Java 소스의 결정 지점(if/else if/switch/삼항) + 조건식 추출.
 *
 * tree-sitter Java AST 를 순회하며 소속 클래스/메서드를 추적하고, 각 분기 노드의
 * 조건식 원문(공백 정규화·바깥 괄호 제거)을 file:line 과 함께 수집한다. 합성 없음 —
 * 소스에 있는 분기만. 도메인 귀속은 상위(PD3: skeleton.stepSources → relPath 매핑)에서.
 *
 * 결정론: AST 소스 순서 순회 후 (relPath,line,kind,condition) 정렬.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Node } from 'web-tree-sitter'
import { parseSource, startLine } from '../domain-map/tree-sitter.js'
import { gitCommitHash } from '../domain-map/persist.js'
import { BranchSignalSetSchema } from './types.js'
import type { BranchSignal, BranchSignalSet } from './types.js'

const CLASS_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
])
const METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration'])

function nameField(node: Node): string | null {
  const n = node.childForFieldName('name')
  return n ? n.text : null
}

/** 조건식 텍스트 정규화 — 공백 1칸, 바깥 괄호 1겹 제거(parenthesized_expression). */
function condText(node: Node | null): string {
  if (!node) return ''
  let t = node.text
  if (node.type === 'parenthesized_expression' && t.startsWith('(') && t.endsWith(')')) {
    t = t.slice(1, -1)
  }
  return t.replace(/\s+/g, ' ').trim()
}

/** if/switch 의 조건 — field 'condition'(parenthesized_expression), 없으면 첫 괄호식 폴백. */
function parenCond(node: Node): string {
  const c = node.childForFieldName('condition')
  if (c) return condText(c)
  for (const ch of node.namedChildren) {
    if (ch && ch.type === 'parenthesized_expression') return condText(ch)
  }
  return ''
}

/** 삼항의 조건 — field 'condition', 없으면 첫 named child 폴백. */
function ternaryCond(node: Node): string {
  const c = node.childForFieldName('condition')
  if (c) return condText(c)
  const first = node.namedChildren.find((x): x is Node => x !== null)
  return condText(first ?? null)
}

/**
 * 한 Java 파일에서 분기 신호를 추출한다(순수, 파싱 포함). 소스 순서 보존.
 */
export async function extractBranches(relPath: string, src: string): Promise<BranchSignal[]> {
  const root = await parseSource('java', src)
  const out: BranchSignal[] = []

  const walk = (node: Node, className: string | null, methodName: string | null): void => {
    let cls = className
    let mth = methodName
    if (CLASS_TYPES.has(node.type)) {
      cls = nameField(node) ?? className
    } else if (METHOD_TYPES.has(node.type)) {
      mth = nameField(node) ?? (node.type === 'constructor_declaration' ? '<init>' : methodName)
    }

    if (node.type === 'if_statement') {
      out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'if', condition: parenCond(node) })
    } else if (node.type === 'switch_expression') {
      out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'switch', condition: parenCond(node) })
    } else if (node.type === 'ternary_expression') {
      out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'ternary', condition: ternaryCond(node) })
    }

    for (const c of node.namedChildren) {
      if (c) walk(c, cls, mth)
    }
  }

  walk(root, null, null)
  return out
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 여러 Java 파일(relPaths)을 스캔해 분기 신호 집합을 만든다(IO).
 * 호출자가 대상 파일을 한정(PD3: 도메인 경계 = skeleton.stepSources 의 클래스 파일).
 * 읽기 실패는 조용히 건너뛰되(파일 누락 방어) fileCount 에는 미포함.
 */
export async function scanBranches(projectRoot: string, relPaths: string[]): Promise<BranchSignalSet> {
  const signals: BranchSignal[] = []
  let fileCount = 0
  // 중복 제거 + 정렬(결정론).
  const uniq = [...new Set(relPaths)].sort(cmp)
  for (const rel of uniq) {
    let src: string
    try {
      src = readFileSync(join(projectRoot, rel), 'utf8')
    } catch {
      continue
    }
    fileCount++
    signals.push(...(await extractBranches(rel, src)))
  }
  signals.sort(
    (a, b) => cmp(a.relPath, b.relPath) || a.line - b.line || cmp(a.kind, b.kind) || cmp(a.condition, b.condition),
  )
  return BranchSignalSetSchema.parse({
    schemaVersion: 1,
    gitCommit: gitCommitHash(projectRoot),
    fileCount,
    signals,
  })
}
