import { describe, it, expect } from 'vitest'
import type { GeneratedDoc, DocMeta } from '../doc-generator/types.js'
import { exportHtml, exportVaultHtml, escapeHtml } from './html.js'
import { buildWikiVault } from '../wiki/wiki.js'

function doc(): GeneratedDoc {
  return {
    docId: '04_api-spec',
    title: 'API & <Spec>',
    methodology: 'as-built',
    sections: [
      {
        heading: 'Endpoints',
        prose: 'a & b < c',
        claims: [
          {
            text: 'GET /users returns <list>',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/api.ts', line: 42 }],
            requiresHumanReview: false,
          },
          {
            text: 'inferred behaviour',
            confidence: 'INFERRED',
            evidence: [],
            requiresHumanReview: true,
          },
        ],
      },
      {
        heading: 'Tabled',
        claims: [],
        table: {
          columns: ['Name', 'Type'],
          rows: [
            {
              cells: ['id', 'int & big'],
              confidence: 'CONFIRMED',
              evidence: [{ file: 'src/db.ts', line: 7 }],
            },
          ],
        },
      },
    ],
  }
}

function meta(): DocMeta {
  return {
    docId: '04_api-spec',
    title: 'API & <Spec>',
    methodology: 'as-built',
    status: 'APPROVED',
    sourceCommit: 'deadbeef',
    evidenceRate: 0.5,
  }
}

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &#39; f',
    )
  })
})

describe('exportHtml', () => {
  it('is deterministic (byte-identical) for the same input', () => {
    expect(exportHtml(doc(), meta())).toBe(exportHtml(doc(), meta()))
  })

  it('escapes HTML in title, prose, and claim text', () => {
    const html = exportHtml(doc(), meta())
    expect(html).toContain('<title>API &amp; &lt;Spec&gt;</title>')
    expect(html).toContain('GET /users returns &lt;list&gt;')
    expect(html).toContain('a &amp; b &lt; c')
    // raw unescaped angle brackets from content never appear
    expect(html).not.toContain('returns <list>')
  })

  it('includes confidence tags and file:line evidence', () => {
    const html = exportHtml(doc(), meta())
    expect(html).toContain('[확정]')
    expect(html).toContain('[추정]')
    expect(html).toContain('<code>src/api.ts:42</code>')
    expect(html).toContain('<code>src/db.ts:7</code>')
  })

  it('renders tables with 신뢰도 + 근거 columns', () => {
    const html = exportHtml(doc(), meta())
    expect(html).toContain('<table>')
    expect(html).toContain('<th>신뢰도</th>')
    expect(html).toContain('<th>근거</th>')
    expect(html).toContain('<td>int &amp; big</td>')
  })

  it('contains no timestamp markers (meta-injected only)', () => {
    const html = exportHtml(doc(), meta())
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    expect(html).not.toMatch(/\b20\d{2}\b/)
    expect(html).toContain('sourceCommit: deadbeef')
  })
})

describe('exportVaultHtml', () => {
  it('maps vault .md files to deterministic .html files', () => {
    const vault = buildWikiVault([doc()], meta)
    const htmlVault = exportVaultHtml(vault)
    const paths = htmlVault.files.map((f) => f.path).sort()
    expect(paths).toContain('04_api-spec.html')
    expect(paths).toContain('index.html')
    expect(JSON.stringify(exportVaultHtml(vault))).toBe(
      JSON.stringify(exportVaultHtml(vault)),
    )
  })
})
