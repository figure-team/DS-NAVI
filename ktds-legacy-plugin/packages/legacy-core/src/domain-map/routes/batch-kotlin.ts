/**
 * 배치/스케줄 진입점 추출 — Kotlin(@Scheduled / top-level fun main).
 *
 * Java판(batch.ts)의 extractJavaBatchEntries 와 산출 형태(BatchEntry)·필드 규칙은
 * 동일하되, 어노테이션 인자는 kotlin-ast.ts 의 `collectDeclAnnotations`(분리형 미스파스
 * 치유 포함)를 소비한다.
 *
 * Kotlin: @Scheduled(cron=.. | fixedRate=.. | fixedDelay=..) -> trigger "scheduled"
 *         (어노테이션당 1엔트리, 중복 @Scheduled 도 각각 1엔트리 — 클래스 소속 메서드+
 *         top-level 함수 모두 스캔),
 *         top-level(=source_file 직속) `fun main` -> trigger "main"
 *         (Kotlin main 은 항상 top-level — Java 의 `public static` 판정에 대응하는
 *         개념이 없다. 클래스 소속 메서드는 main 트리거 대상에서 제외한다).
 * entryId = `batch:<relPath>#<symbol>`. 정렬은 호출측 sortBatchEntries 몫(Java판과 동형).
 */
import type { Node } from 'web-tree-sitter'
import { collectDeclAnnotations, ktChild, ktChildren, ktStringContent, type KtAnnotation } from '../kotlin-ast.js'
import { startLine } from '../tree-sitter.js'
import type { BatchEntry } from '../types.js'

/** @Scheduled 가 받는, schedule 문자열을 구성하는 named 인자(우선순위 순). */
const SCHEDULE_ATTRS = ['cron', 'fixedRate', 'fixedDelay'] as const

/**
 * @Scheduled 어노테이션의 schedule 문자열을 추출한다.
 * cron / fixedRate / fixedDelay 중 첫 매칭 named 인자를 `<attr>=<value>` 로 표기한다.
 * 값이 string_literal 이면 내용을, 아니면(수치 등) 원문 텍스트를 쓴다(Java판 폴백과 동형).
 */
function extractKtScheduleAttr(annot: KtAnnotation): string | null {
  for (const attr of SCHEDULE_ATTRS) {
    const arg = annot.args.find((a) => a.name === attr)
    if (!arg) continue
    const s = ktStringContent(arg.node)
    return `${attr}=${s !== null ? s : arg.node.text}`
  }
  return null
}

/** program 전체에서 class_declaration 들을 재귀 수집(Java판/spring-kotlin판과 동형). */
function findKtClassDeclarations(root: Node): Node[] {
  const out: Node[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const c of node.namedChildren) {
      if (!c) continue
      if (c.type === 'class_declaration') out.push(c)
      stack.push(c)
    }
  }
  return out
}

/** function_declaration 목록 1개(클래스 소속 or top-level)에서 배치 엔트리를 수집. */
function processKtFunctions(fns: Node[], clsName: string | null, filePath: string, out: BatchEntry[]): void {
  for (const fn of fns) {
    const mName = ktChild(fn, 'identifier')?.text ?? '<unknown>'
    const handler = clsName ? `${clsName}#${mName}` : mName

    // @Scheduled(어노테이션당 1엔트리 — 반복 @Scheduled 지원).
    for (const annot of collectDeclAnnotations(fn).filter((a) => a.name === 'Scheduled')) {
      out.push({
        entryId: `batch:${filePath}#${mName}`,
        trigger: 'scheduled',
        schedule: extractKtScheduleAttr(annot),
        filePath,
        line: annot.line,
        handler,
        notes: [],
      })
    }

    // top-level(source_file 직속) fun main.
    if (clsName === null && mName === 'main') {
      out.push({
        entryId: `batch:${filePath}#main`,
        trigger: 'main',
        schedule: null,
        filePath,
        line: startLine(fn),
        handler,
        notes: [],
      })
    }
  }
}

/**
 * 단일 Kotlin 파일에서 배치 진입점을 추출한다.
 * @param root 파싱된 source_file 노드
 * @param filePath census relPath
 */
export function extractKotlinBatchEntries(root: Node, filePath: string): BatchEntry[] {
  const out: BatchEntry[] = []

  // top-level 함수(fun main 대표, 드물게 top-level @Scheduled).
  processKtFunctions(ktChildren(root, 'function_declaration'), null, filePath, out)

  // 클래스 소속 메서드(companion object 는 제외 — class_body 직속만, Java판 스캔 범위와 동형).
  for (const cls of findKtClassDeclarations(root)) {
    const clsName = ktChild(cls, 'identifier')?.text ?? null
    const body = ktChild(cls, 'class_body')
    if (!body) continue
    processKtFunctions(ktChildren(body, 'function_declaration'), clsName, filePath, out)
  }

  return out
}
