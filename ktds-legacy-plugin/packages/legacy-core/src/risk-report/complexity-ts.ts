/**
 * 순환복잡도 근사(TS/TSX, P5) — complexity.ts(java)의 counting 철학을 TS 노드타입으로 이식.
 *
 * 파일 복잡도 = 함수 단위 수(function_declaration/arrow_function/method_definition/
 * function_expression) + 결정 포인트 총수(if/for/for-in·for-of/while/do/catch/삼항/
 * switch case(default 제외)/&&/||/??). Java 판과 동일하게 함수 밖 결정포인트(필드
 * 초기화의 삼항 등)도 계상되며, 함수 0개 파일은 자연히 0.
 */
import type { Node } from 'web-tree-sitter'
import { parseSource } from '../domain-map/tree-sitter.js'

/** 그 자체로 결정 포인트 1 인 노드 타입. */
const DECISION_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement', // for-in 과 for-of 모두 이 노드타입(anon 'in'/'of' 로만 구분).
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'switch_case', // default 는 별개 노드타입(switch_default) — 자연히 미계상.
])

/** McCabe 기저 1 을 더하는 단위(함수/메서드/화살표함수/함수식). */
const METHOD_TYPES = new Set([
  'function_declaration',
  'arrow_function',
  'method_definition',
  'function_expression',
])

/** 파싱된 TS/TSX 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export function countTsComplexity(root: Node): number {
  let functions = 0
  let decisions = 0
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const n = stack.pop()
    if (!n) continue
    if (METHOD_TYPES.has(n.type)) {
      functions++
    } else if (DECISION_TYPES.has(n.type)) {
      decisions++
    } else if (n.type === 'binary_expression') {
      // 연산자는 무명 child — namedChildren 순회에 안 잡히므로 전 child 를 본다.
      for (let i = 0; i < n.childCount; i++) {
        const t = n.child(i)?.type
        if (t === '&&' || t === '||' || t === '??') {
          decisions++
          break
        }
      }
    }
    for (const c of n.namedChildren) if (c) stack.push(c)
  }
  return functions + decisions
}

/** TS/TSX 소스 -> 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리 — java 판과 동일 관례). */
export async function measureTsComplexity(
  source: string,
  lang: 'typescript' | 'tsx' = 'typescript',
): Promise<number> {
  return countTsComplexity(await parseSource(lang, source))
}
