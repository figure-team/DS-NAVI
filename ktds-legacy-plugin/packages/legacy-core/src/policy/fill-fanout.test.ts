import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  prepPolicyFill,
  auditPolicyFillFragments,
  mergePolicyFillFragments,
  readPolicyFillChunkIndex,
  policyFillFragDir,
  PolicyFillChunkSchema,
  PolicyFillFragmentSchema,
  FILL_SECTION_START,
  FILL_SECTION_END,
  type PolicyFillFragment,
} from './fill-fanout.js'
import type { PolicySignal, PolicySignalSet } from './types.js'

// fill-fanout.ts(정책서 채움 팬아웃) — 청크 분해의 결정론(문서 우선·행 상한 자름),
// pre-cite 의 기계 검증 통과, 감사 커버리지/확정-무근거 판정, 병합의 앵커 보존(본체
// 불변) + 덧붙임 멱등 + 조작 인용 강등 + 선언 밖 드랍을 검증한다.

const SRC_MEMBER = `package shop.domain;
public class Member {
  // 이메일은 로그인 식별자다
  private String email;
  private String password;
}
`

/** 결정론 정책 신호 골격. */
function signal(over: Partial<PolicySignal> & Pick<PolicySignal, 'category' | 'subject'>): PolicySignal {
  return {
    category: over.category,
    kind: over.kind ?? 'column-comment',
    subject: over.subject,
    detail: over.detail ?? `${over.subject} 신호`,
    anchor: over.anchor ?? { file: 'src/main/java/shop/domain/Member.java', line: 4 },
    confidence: over.confidence ?? 'CONFIRMED',
  }
}

async function seedSignals(root: string, signals: PolicySignal[]): Promise<void> {
  const set: PolicySignalSet = { schemaVersion: 1, gitCommit: 'deadbeef', signals, unresolved: [] }
  await mkdir(join(root, '.spec/map'), { recursive: true })
  await writeFile(join(root, '.spec/map/policy-signals.json'), JSON.stringify(set), 'utf8')
}

async function seedSource(root: string): Promise<void> {
  await mkdir(join(root, 'src/main/java/shop/domain'), { recursive: true })
  await writeFile(join(root, 'src/main/java/shop/domain/Member.java'), SRC_MEMBER, 'utf8')
}

/** 카테고리별 doc-output md 를 앵커 표만 있는 최소 본체로 시드(병합 대상 존재). */
async function seedDoc(root: string, docId: string, body = `# ${docId}\n\n| 대상 | 근거 |\n| --- | --- |\n| x | \`f:1\` |\n`): Promise<void> {
  await mkdir(join(root, '.understand-anything/doc-output'), { recursive: true })
  await writeFile(join(root, '.understand-anything/doc-output', `${docId}.md`), body, 'utf8')
}

/** 청크 전수를 만족하는 유효 조각 — [추정]으로 채워 인용 의무 면제(커버리지만 검증). */
async function fakeFragmentsFromChunks(root: string): Promise<void> {
  const index = await readPolicyFillChunkIndex(root)
  await mkdir(policyFillFragDir(root), { recursive: true })
  for (const entry of index.chunks) {
    const chunk = PolicyFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map/policy-fill-prep', `${entry.chunkId}.json`), 'utf8')),
    )
    const frag: PolicyFillFragment = {
      schemaVersion: 1,
      chunkId: entry.chunkId,
      rows: chunk.rows.map((r) => ({
        rowKey: r.rowKey,
        statement: `${r.subject} 규범 진술`,
        confidence: '추정' as const,
        citations: [],
      })),
    }
    await writeFile(
      join(policyFillFragDir(root), `${entry.chunkId}.json`),
      JSON.stringify(PolicyFillFragmentSchema.parse(frag)),
      'utf8',
    )
  }
}

describe('policy fill-fanout', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'policy-fanout-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('prep: 문서 우선 그룹핑 + 행 상한 자름 + 앵커 pre-cite 가 실파일과 일치', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedDoc(root, 'policy-validation')
    await seedSignals(root, [
      signal({ category: 'glossary', subject: 'member.email', detail: '이메일', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 3 } }),
      signal({ category: 'glossary', subject: 'member.password', detail: '비밀번호', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 5 } }),
      signal({ category: 'glossary', subject: 'member.name', detail: '이름', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 2 } }),
      signal({ category: 'validation', subject: 'password.size', detail: '@Size(min=8)', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 5 } }),
    ])

    const { index } = await prepPolicyFill(root, { maxRows: 2 })
    // 문서 우선(docId 사전순 glossary → validation). glossary 3행 → maxRows 2 → 2청크.
    expect(index.totals.docs).toBe(2)
    expect(index.totals.rows).toBe(4)
    expect(index.chunks.map((c) => c.docId)).toEqual(['policy-glossary', 'policy-glossary', 'policy-validation'])
    expect(index.chunks[0].rowCount).toBe(2)
    expect(index.chunks[1].rowCount).toBe(1)
    expect(index.totals.chunks).toBe(3)

    // pre-cite 는 실파일에서 결정론 추출 — verbatim 검증.
    const chunk0 = PolicyFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map/policy-fill-prep/pol-000.json'), 'utf8')),
    )
    const emailRow = chunk0.rows.find((r) => r.subject === 'member.email')!
    expect(emailRow.preCite).not.toBeNull()
    const lines = SRC_MEMBER.split('\n')
    expect(emailRow.preCite!.snippet).toBe(lines[emailRow.preCite!.line - 1].trim())
  })

  it('prep: 병합 대상 md 없는 문서는 제외하고 skippedDocs 에 보고', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    // validation md 는 만들지 않는다 → 제외.
    await seedSignals(root, [
      signal({ category: 'glossary', subject: 'member.email' }),
      signal({ category: 'validation', subject: 'password.size' }),
    ])
    const { index } = await prepPolicyFill(root)
    expect(index.totals.docs).toBe(1)
    expect(index.chunks.map((c) => c.docId)).toEqual(['policy-glossary'])
    expect(index.skippedDocs.map((d) => d.docId)).toEqual(['policy-validation'])
  })

  it('audit: 완결 조각은 complete, 행 누락과 [확정]-무근거는 incomplete', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedSignals(root, [
      signal({ category: 'glossary', subject: 'member.email' }),
      signal({ category: 'glossary', subject: 'member.password' }),
    ])
    await prepPolicyFill(root)
    const index = await readPolicyFillChunkIndex(root)
    const keys = index.chunks[0].rowKeys

    // (1) 완결 조각.
    await fakeFragmentsFromChunks(root)
    let audit = await auditPolicyFillFragments(root)
    expect(audit.complete).toEqual(['pol-000'])
    expect(audit.incomplete).toEqual([])

    // (2) 행 누락 → incomplete.
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [{ rowKey: keys[0], statement: 'x', confidence: '추정', citations: [] }],
      }),
      'utf8',
    )
    audit = await auditPolicyFillFragments(root, ['pol-000'])
    expect(audit.complete).toEqual([])
    expect(audit.incomplete[0].reason).toMatch(/coverage/)

    // (3) [확정]인데 인용 비어 있음 → incomplete(fail-closed).
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [
          { rowKey: keys[0], statement: 'x', confidence: '확정', citations: [] },
          { rowKey: keys[1], statement: 'y', confidence: '추정', citations: [] },
        ],
      }),
      'utf8',
    )
    audit = await auditPolicyFillFragments(root)
    expect(audit.incomplete[0].reason).toMatch(/evidence/)
  })

  it('merge: 채움 섹션 덧붙임·본체 앵커 표 불변·선언 밖 드랍', async () => {
    await seedSource(root)
    const body = `# 용어/도메인 사전\n\n## 용어 정의\n\n| 용어 | 정의/주석 | 신뢰도 | 근거 |\n| --- | --- | --- | --- |\n| member.email | 이메일 | CONFIRMED | \`Member.java:3\` |\n`
    await seedDoc(root, 'policy-glossary', body)
    await seedSignals(root, [signal({ category: 'glossary', subject: 'member.email', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 3 } })])
    await prepPolicyFill(root)
    const index = await readPolicyFillChunkIndex(root)
    const key = index.chunks[0].rowKeys[0]

    // 유효 채움 + 선언 밖 rowKey(드랍 검증).
    await mkdir(policyFillFragDir(root), { recursive: true })
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [
          { rowKey: key, statement: '이메일은 로그인 식별자로 필수 입력', confidence: '추정', citations: [] },
          { rowKey: 'ghost::key', statement: '유령 행', confidence: '추정', citations: [] },
        ],
      }),
      'utf8',
    )

    const result = await mergePolicyFillFragments(root)
    expect(result.rowsFilled).toBe(1)
    expect(result.droppedItems).toBe(1)

    const md = await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8')
    // 본체 앵커 표 불변(원문 그대로 포함).
    expect(md).toContain('| member.email | 이메일 | CONFIRMED | `Member.java:3` |')
    // 채움 섹션 덧붙임.
    expect(md).toContain(FILL_SECTION_START)
    expect(md).toContain('이메일은 로그인 식별자로 필수 입력')
    expect(md).toContain('[추정]')
  })

  it('merge: 재실행 멱등 — 같은 조각 재병합 시 md 바이트 동일(중복 덧붙임 없음)', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedSignals(root, [signal({ category: 'glossary', subject: 'member.email' })])
    await prepPolicyFill(root)
    const index = await readPolicyFillChunkIndex(root)
    await mkdir(policyFillFragDir(root), { recursive: true })
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [{ rowKey: index.chunks[0].rowKeys[0], statement: '규범', confidence: '추정', citations: [] }],
      }),
      'utf8',
    )
    await mergePolicyFillFragments(root)
    const first = await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8')
    await mergePolicyFillFragments(root)
    const second = await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8')
    expect(second).toBe(first)
    // 센티넬은 정확히 1쌍.
    expect(second.split(FILL_SECTION_START).length - 1).toBe(1)
    expect(second.split(FILL_SECTION_END).length - 1).toBe(1)
  })

  it('merge: 조작된 인용은 실파일 대조로 제거·[확정]→[추정] 강등, 참 인용은 보존', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedSignals(root, [
      signal({ category: 'glossary', subject: 'member.email', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 3 } }),
      signal({ category: 'glossary', subject: 'member.password', anchor: { file: 'src/main/java/shop/domain/Member.java', line: 5 } }),
    ])
    await prepPolicyFill(root)
    const index = await readPolicyFillChunkIndex(root)
    const chunk = PolicyFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map/policy-fill-prep/pol-000.json'), 'utf8')),
    )
    const emailKey = chunk.rows.find((r) => r.subject === 'member.email')!.rowKey
    const pwKey = chunk.rows.find((r) => r.subject === 'member.password')!.rowKey
    const realLine3 = SRC_MEMBER.split('\n')[2].trim() // "// 이메일은 로그인 식별자다"

    await mkdir(policyFillFragDir(root), { recursive: true })
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [
          // 조작 인용(실파일에 없는 스니펫) → 제거 → 근거 0 → [추정] 강등.
          {
            rowKey: emailKey,
            statement: '이메일 정책',
            confidence: '확정',
            citations: [{ filePath: 'src/main/java/shop/domain/Member.java', line: 3, snippet: '존재하지 않는 스니펫 XYZ 문장' }],
          },
          // 참 인용(실파일 3행 원문) → 보존 → [확정] 유지.
          {
            rowKey: pwKey,
            statement: '비밀번호 정책',
            confidence: '확정',
            citations: [{ filePath: 'src/main/java/shop/domain/Member.java', line: 3, snippet: realLine3 }],
          },
        ],
      }),
      'utf8',
    )

    const result = await mergePolicyFillFragments(root)
    expect(result.citationsRemoved).toBe(1)
    expect(result.tagsDemoted).toBe(1)

    const md = await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8')
    // 조작 행: [추정] 강등, 근거 —.
    expect(md).toMatch(/이메일 정책 \| \[추정\] \| —/)
    // 참 인용 행: [확정] 유지, 근거 살아있음.
    expect(md).toMatch(/비밀번호 정책 \| \[확정\] \| `src\/main\/java\/shop\/domain\/Member\.java:3`/)
  })

  it('merge: 미완결 조각 문서는 미반영(부분 병합)으로 보고', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedDoc(root, 'policy-validation')
    await seedSignals(root, [
      signal({ category: 'glossary', subject: 'member.email' }),
      signal({ category: 'validation', subject: 'password.size' }),
    ])
    await prepPolicyFill(root)
    const index = await readPolicyFillChunkIndex(root)
    const glossaryChunk = index.chunks.find((c) => c.docId === 'policy-glossary')!
    const validationChunk = index.chunks.find((c) => c.docId === 'policy-validation')!

    // glossary 청크만 채운다(validation 은 조각 없음 → missing).
    await mkdir(policyFillFragDir(root), { recursive: true })
    await writeFile(
      join(policyFillFragDir(root), `${glossaryChunk.chunkId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: glossaryChunk.chunkId,
        rows: [{ rowKey: glossaryChunk.rowKeys[0], statement: 'ok', confidence: '추정', citations: [] }],
      }),
      'utf8',
    )
    const result = await mergePolicyFillFragments(root)
    expect(result.rowsFilled).toBe(1)
    expect(result.missingRows).toEqual(validationChunk.rowKeys)
  })

  it('결정론: prep 두 번 실행 시 청크 바이트 동일', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    await seedSignals(root, [signal({ category: 'glossary', subject: 'member.email' })])
    await prepPolicyFill(root)
    const first = await readFile(join(root, '.spec/map/policy-fill-prep/pol-000.json'), 'utf8')
    await prepPolicyFill(root)
    const second = await readFile(join(root, '.spec/map/policy-fill-prep/pol-000.json'), 'utf8')
    expect(second).toBe(first)
  })

  it('merge: 커버리지 소실 시 낡은 채움 섹션 제거(빈 섹션 미부착)', async () => {
    await seedSource(root)
    await seedDoc(root, 'policy-glossary')
    // 1차: subject=member.email(rowKey A) → 채움 섹션 생성.
    await seedSignals(root, [signal({ category: 'glossary', subject: 'member.email' })])
    await prepPolicyFill(root)
    let index = await readPolicyFillChunkIndex(root)
    await mkdir(policyFillFragDir(root), { recursive: true })
    await writeFile(
      join(policyFillFragDir(root), 'pol-000.json'),
      JSON.stringify({
        schemaVersion: 1,
        chunkId: 'pol-000',
        rows: [{ rowKey: index.chunks[0].rowKeys[0], statement: '1차 규범', confidence: '추정', citations: [] }],
      }),
      'utf8',
    )
    await mergePolicyFillFragments(root)
    expect((await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8'))).toContain(FILL_SECTION_START)

    // 2차: subject 변경(rowKey B) 으로 prep 재실행 → 기존 frag(A)는 coverage-fail.
    await seedSignals(root, [signal({ category: 'glossary', subject: 'member.phone' })])
    await prepPolicyFill(root)
    index = await readPolicyFillChunkIndex(root)
    expect(index.chunks[0].rowKeys[0]).not.toBe(undefined)
    const audit = await auditPolicyFillFragments(root)
    expect(audit.incomplete.map((i) => i.chunkId)).toContain('pol-000') // 낡은 frag → 미완결

    const result = await mergePolicyFillFragments(root)
    expect(result.rowsFilled).toBe(0)
    expect(result.staleSectionsCleared).toBe(1)
    // 낡은 섹션이 제거되고 빈 섹션이 새로 붙지 않는다.
    const md = await readFile(join(root, '.understand-anything/doc-output/policy-glossary.md'), 'utf8')
    expect(md).not.toContain(FILL_SECTION_START)
    expect(md).not.toContain(FILL_SECTION_END)
  })

  it('신호 0건: prep 은 빈 index(청크 0), audit/merge 는 빈 결과', async () => {
    await seedSignals(root, [])
    const { index } = await prepPolicyFill(root)
    expect(index.totals.chunks).toBe(0)
    expect(index.totals.docs).toBe(0)
    expect(index.chunks).toEqual([])

    const audit = await auditPolicyFillFragments(root)
    expect(audit).toEqual({ complete: [], incomplete: [] })

    const result = await mergePolicyFillFragments(root)
    expect(result.rowsFilled).toBe(0)
    expect(result.docPaths).toEqual([])
    expect(result.missingRows).toEqual([])
    expect(result.staleSectionsCleared).toBe(0)
  })

  it('domain 모드: candidates 없으면 안내 throw', async () => {
    // candidates.json 없음 → assembleDomainPolicies 가 throw → prep 도 throw(정직 안내).
    await expect(prepPolicyFill(root, { mode: 'domain' })).rejects.toThrow(/candidates\.json/)
  })
})

// 도메인 모드 성공 경로 — candidates + 분기 소스 → §4 행 청크화 → frag → merge.
describe('policy fill-fanout — domain 모드', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'policy-domain-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const ORDER_SRC = `package shop.order;
public class OrderService {
  public String route(int amount) {
    if (amount > 100000) {
      return "free";
    }
    return "paid";
  }
}
`

  async function seedDomain(): Promise<void> {
    await mkdir(join(root, 'src/main/java/shop/order'), { recursive: true })
    await writeFile(join(root, 'src/main/java/shop/order/OrderService.java'), ORDER_SRC, 'utf8')
    await mkdir(join(root, '.spec/map'), { recursive: true })
    const candidates = {
      schemaVersion: 1,
      gitCommit: null,
      directoryDegenerate: null,
      candidates: [
        {
          key: 'order',
          roots: ['shop/order'],
          entryCount: 1,
          files: [{ relPath: 'src/main/java/shop/order/OrderService.java', via: 'directory' }],
        },
      ],
      common: [],
      ambiguous: [],
      unresolved: [],
    }
    await writeFile(join(root, '.spec/map/candidates.json'), JSON.stringify(candidates), 'utf8')
    await mkdir(join(root, '.understand-anything/doc-output'), { recursive: true })
    await writeFile(join(root, '.understand-anything/doc-output/policy-domain-order.md'), '# 주문 정책 정의서\n\n## §4 의사결정 테이블\n\n| 정책 ID | 조건 | 근거 |\n| --- | --- | --- |\n| PL-001 | amount > 100000 | `OrderService.java:4` |\n', 'utf8')
  }

  it('분기 신호 → §4 행 청크화 → merge 로 규범 진술 섹션 덧붙임', async () => {
    await seedDomain()
    const { index } = await prepPolicyFill(root, { mode: 'domain' })
    expect(index.mode).toBe('domain')
    expect(index.totals.docs).toBe(1)
    expect(index.chunks[0].docId).toBe('policy-domain-order')
    expect(index.totals.rows).toBeGreaterThanOrEqual(1)

    // 청크의 각 행에 IF/THEN 원문(detail)과 앵커가 실린다.
    const chunk = PolicyFillChunkSchema.parse(
      JSON.parse(await readFile(join(root, '.spec/map/policy-fill-prep', `${index.chunks[0].chunkId}.json`), 'utf8')),
    )
    expect(chunk.rows[0].detail).toMatch(/^IF /)
    expect(chunk.rows[0].anchor).not.toBeNull()

    // 전 행 채움([추정]) → audit complete → merge.
    await fakeFragmentsFromChunks(root)
    const audit = await auditPolicyFillFragments(root)
    expect(audit.incomplete).toEqual([])
    const result = await mergePolicyFillFragments(root)
    expect(result.rowsFilled).toBe(index.totals.rows)
    const md = await readFile(join(root, '.understand-anything/doc-output/policy-domain-order.md'), 'utf8')
    // 본체 §4 표 불변 + 채움 섹션 덧붙임.
    expect(md).toContain('| PL-001 | amount > 100000 | `OrderService.java:4` |')
    expect(md).toContain(FILL_SECTION_START)
  })
})
