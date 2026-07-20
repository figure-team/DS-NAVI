/**
 * tree-sitter 그래머 로더 — Java / Kotlin / TypeScript(+TSX).
 *
 * web-tree-sitter(WASM)로 그래머를 1회 로드/캐시하고 소스를 파싱한다.
 * 그래머 .wasm 은 npm 패키지에 동봉되어 별도 빌드가 필요 없다
 * (`tree-sitter-java/tree-sitter-java.wasm` 등). 로드 메커니즘은 UA 코어와 동일.
 */
import { createRequire } from 'node:module'
import type { Language, Node, Parser as TSParser } from 'web-tree-sitter'

const req = createRequire(import.meta.url)

export type LangId = 'java' | 'kotlin' | 'typescript' | 'tsx'

const WASM_FILE: Record<LangId, string> = {
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  kotlin: '@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm',
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
}

interface WtsModule {
  Parser: (new () => TSParser) & { init(): Promise<void> }
  Language: { load(path: string): Promise<Language> }
}

let _modPromise: Promise<WtsModule> | null = null
const _langs = new Map<LangId, Language>()

async function getModule(): Promise<WtsModule> {
  if (!_modPromise) {
    _modPromise = (async () => {
      const mod = (await import('web-tree-sitter')) as unknown as WtsModule
      await mod.Parser.init()
      return mod
    })()
  }
  return _modPromise
}

async function getLanguage(lang: LangId): Promise<Language> {
  const cached = _langs.get(lang)
  if (cached) return cached
  const mod = await getModule()
  const loaded = await mod.Language.load(req.resolve(WASM_FILE[lang]))
  _langs.set(lang, loaded)
  return loaded
}

/**
 * 소스를 파싱해 루트 노드를 반환한다.
 * 호출자는 더 이상 필요 없을 때 `tree.delete()` 로 해제할 수 있다(선택).
 */
export async function parseSource(lang: LangId, source: string): Promise<Node> {
  const mod = await getModule()
  const language = await getLanguage(lang)
  const parser = new mod.Parser()
  parser.setLanguage(language)
  const tree = parser.parse(source)
  if (!tree) throw new Error(`[tree-sitter] parse returned null for lang=${lang}`)
  return tree.rootNode
}

/** 노드의 1-based 시작 줄 번호(에디터/citation 기준). */
export function startLine(node: Node): number {
  return node.startPosition.row + 1
}

/** 첫 번째 자손 중 주어진 타입에 해당하는 노드(깊이우선, 결정론적). */
export function firstDescendantOfType(node: Node, type: string): Node | null {
  for (const child of node.namedChildren) {
    if (!child) continue
    if (child.type === type) return child
    const found = firstDescendantOfType(child, type)
    if (found) return found
  }
  return null
}

/** 직계 named children 중 주어진 타입들에 해당하는 노드 목록(선언 순서 유지). */
export function childrenOfType(node: Node, ...types: string[]): Node[] {
  const want = new Set(types)
  const out: Node[] = []
  for (const child of node.namedChildren) {
    if (child && want.has(child.type)) out.push(child)
  }
  return out
}
