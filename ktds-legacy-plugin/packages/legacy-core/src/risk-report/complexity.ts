/**
 * 순환복잡도 근사(java) — tree-sitter AST 결정 포인트 카운트(W4).
 *
 * 파일 복잡도 = 메서드/생성자 수 + 결정 포인트 총수
 * (= Σ 메서드별 McCabe(1 + 결정포인트) 근사 — 필드 초기화의 삼항 등 메서드 밖
 * 결정포인트도 계상된다. 파일 단위 위험 랭킹 용도라 메서드 귀속 정밀도는 요구하지
 * 않으며, 메서드 0개인 인터페이스/상수 클래스는 자연히 0).
 * 결정 포인트: if / for / enhanced-for / while / do / catch / 삼항 /
 * switch case 라벨(default 제외) / && / ||.
 *
 * 비 java 파일(jsp/kotlin/xml/sql)은 문법 미탑재로 **미측정(null)** — 호출자
 * (buildRiskReport)가 notes `[미확인]` + stats.measured 로 표면화한다(침묵 누락 금지).
 */
import type { Node } from 'web-tree-sitter'
import { parseSource } from '../domain-map/tree-sitter.js'

/** 그 자체로 결정 포인트 1 인 노드 타입. */
const DECISION_TYPES = new Set([
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
])

/** McCabe 기저 1 을 더하는 단위(메서드/생성자). */
const METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration'])

/** 파싱된 java 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export function countJavaComplexity(root: Node): number {
  let methods = 0
  let decisions = 0
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const n = stack.pop()
    if (!n) continue
    if (METHOD_TYPES.has(n.type)) {
      methods++
    } else if (DECISION_TYPES.has(n.type)) {
      decisions++
    } else if (n.type === 'switch_label') {
      // `case …`(신형 화살표 다중 라벨 포함)만 — default 는 분기 수에 안 센다.
      if (!n.text.trimStart().startsWith('default')) decisions++
    } else if (n.type === 'binary_expression') {
      // 연산자는 무명 child — namedChildren 순회에 안 잡히므로 전 child 를 본다.
      for (let i = 0; i < n.childCount; i++) {
        const t = n.child(i)?.type
        if (t === '&&' || t === '||') {
          decisions++
          break
        }
      }
    }
    for (const c of n.namedChildren) if (c) stack.push(c)
  }
  return methods + decisions
}

/** java 소스 → 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리). */
export async function measureJavaComplexity(source: string): Promise<number> {
  return countJavaComplexity(await parseSource('java', source))
}
