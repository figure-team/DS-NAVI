import { describe, it, expect } from 'vitest'
import { parseSource, startLine, firstDescendantOfType, childrenOfType } from './tree-sitter.js'

describe('tree-sitter loader', () => {
  it('parses Java and exposes the AST (annotations, classes)', async () => {
    const src = [
      'package com.acme;',
      '@RestController',
      'public class FooController {',
      '  @GetMapping("/x")',
      '  public String hi() { return svc.go(); }',
      '}',
    ].join('\n')
    const root = await parseSource('java', src)
    expect(root.type).toBe('program')
    const cls = firstDescendantOfType(root, 'class_declaration')
    expect(cls).not.toBeNull()
    // class name is a DIRECT child identifier (the @RestController identifier is nested under modifiers)
    const name = childrenOfType(cls!, 'identifier')[0]
    expect(name.text).toBe('FooController')
  })

  it('startLine is 1-based', async () => {
    const root = await parseSource('java', 'package a;\nclass B {}')
    const cls = firstDescendantOfType(root, 'class_declaration')
    expect(startLine(cls!)).toBe(2)
  })

  it('parses TypeScript (nextjs route handlers)', async () => {
    const src = 'export async function GET() { return Response.json({}); }'
    const root = await parseSource('typescript', src)
    const fn = firstDescendantOfType(root, 'function_declaration')
    expect(fn).not.toBeNull()
  })

  it('childrenOfType returns direct named children only', async () => {
    const root = await parseSource('java', 'import a.B;\nimport c.D;\nclass E {}')
    const imports = childrenOfType(root, 'import_declaration')
    expect(imports.length).toBe(2)
  })
})
