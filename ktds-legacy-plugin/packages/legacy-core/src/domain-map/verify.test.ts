import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { verifyFills, writeVerifyReport, VerifyReportSchema } from './verify.js'
import type { DomainFill } from './fill.js'

// verify.ts — 인용 실존/라인범위/텍스트 일치 + 강등 + 결정론.

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ktds-verify-'))
  const file = join(root, 'src/OrderService.java')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    [
      'package shop;',
      '',
      'public class OrderService {',
      '  /** 주문은 회원만 생성할 수 있다. */',
      '  public void create(Order order) {}',
      '}',
    ].join('\n'),
    'utf8',
  )
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function fillWith(citations: Array<{ filePath: string; line: number; snippet: string }>): DomainFill {
  return {
    schemaVersion: 1,
    domainId: 'domain:order',
    name: '주문',
    summary: { text: '주문 처리', citations },
    entities: [],
    businessRules: [],
    crossDomainInteractions: [],
    flows: [],
    steps: [],
  }
}

describe('verify — 기계 인용 검증', () => {
  it('정상 인용: 공백 정규화 후 라인 텍스트 포함이면 ok', async () => {
    const report = await verifyFills(
      root,
      [
        fillWith([
          { filePath: 'src/OrderService.java', line: 5, snippet: 'public void create(Order order)' },
          { filePath: 'src/OrderService.java', line: 4, snippet: '주문은   회원만 생성할' },
        ]),
      ],
      null,
    )
    const item = report.domains[0].items[0]
    expect(item.citations.map((c) => c.status)).toEqual(['ok', 'ok'])
    expect(item.verdict).toBe('GROUNDED')
    expect(report.overall.groundedPct).toBe(100)
  })

  it('환각 인용 4종 전부 검출(no-file/line-out-of-range/text-mismatch/path-escape)', async () => {
    const report = await verifyFills(
      root,
      [
        fillWith([
          { filePath: 'src/Ghost.java', line: 1, snippet: 'anything here' },
          { filePath: 'src/OrderService.java', line: 999, snippet: 'public class' },
          { filePath: 'src/OrderService.java', line: 3, snippet: '회원 등급 할인 70%' },
          { filePath: '../../etc/passwd', line: 1, snippet: 'root entry' },
        ]),
      ],
      null,
    )
    const statuses = report.domains[0].items[0].citations.map((c) => c.status)
    expect(statuses).toEqual(['no-file', 'line-out-of-range', 'text-mismatch', 'path-escape'])
    expect(statuses.filter((s) => s === 'ok')).toHaveLength(0)
    expect(report.domains[0].items[0].verdict).toBe('NEEDS_REVIEW')
    expect(report.overall.citationOk).toBe(0)
  })

  it('사소 스니펫은 실재해도 trivial-snippet(게이밍 차단), 한글 2자 단어는 ok', async () => {
    const report = await verifyFills(
      root,
      [
        fillWith([
          { filePath: 'src/OrderService.java', line: 6, snippet: '}       ' },
          { filePath: 'src/OrderService.java', line: 5, snippet: ') {} ( ) ;' },
          { filePath: 'src/OrderService.java', line: 4, snippet: '주문은 회원만' },
        ]),
      ],
      null,
    )
    const statuses = report.domains[0].items[0].citations.map((c) => c.status)
    expect(statuses[0]).toBe('trivial-snippet')
    expect(statuses[1]).toBe('trivial-snippet')
    expect(statuses[2]).toBe('ok')
  })

  it('강등 규칙: ok 인용 1개라도 있으면 GROUNDED(텍스트 보존), 0개면 NEEDS_REVIEW', async () => {
    const report = await verifyFills(
      root,
      [
        fillWith([
          { filePath: 'src/Ghost.java', line: 1, snippet: 'hallucinated' },
          { filePath: 'src/OrderService.java', line: 3, snippet: 'public class OrderService' },
        ]),
      ],
      null,
    )
    const item = report.domains[0].items[0]
    expect(item.verdict).toBe('GROUNDED')
    expect(item.text).toBe('주문 처리')
    expect(report.overall).toMatchObject({ citationTotal: 2, citationOk: 1 })
  })

  it('writeVerifyReport: .spec/map/verify-report.json 영속 + 스키마 통과', async () => {
    const report = await verifyFills(
      root,
      [fillWith([{ filePath: 'src/OrderService.java', line: 3, snippet: 'OrderService' }])],
      'x'.repeat(40),
    )
    const path = writeVerifyReport(root, report)
    expect(path.endsWith('verify-report.json')).toBe(true)
    const onDisk = JSON.parse(await readFile(path, 'utf8'))
    expect(() => VerifyReportSchema.parse(onDisk)).not.toThrow()
    expect(onDisk.gitCommit).toBe('x'.repeat(40))
  })

  it('결정론: 도메인 정렬 + 동일 입력 동일 출력', async () => {
    const fills = [fillWith([{ filePath: 'src/OrderService.java', line: 3, snippet: 'OrderService' }])]
    const a = JSON.stringify(await verifyFills(root, fills, 'x'.repeat(40)))
    const b = JSON.stringify(await verifyFills(root, fills, 'x'.repeat(40)))
    expect(a).toBe(b)
  })
})

describe('verify — P2 step 상세 섹션(detail) 인용 검증', () => {
  /** step.detail 섹션을 가진 fill. summary 와 detail 둘 다 실파일 인용. */
  function fillWithDetail(detail: DomainFill['steps'][number]['detail']): DomainFill {
    return {
      schemaVersion: 1,
      domainId: 'domain:order',
      name: '주문',
      summary: {
        text: '주문 처리',
        citations: [{ filePath: 'src/OrderService.java', line: 3, snippet: 'public class OrderService' }],
      },
      entities: [],
      businessRules: [],
      crossDomainInteractions: [],
      flows: [],
      steps: [
        {
          stepId: 'step:POST /orders:src/OrderService.java',
          name: '주문 생성',
          summary: {
            text: '주문 생성 서비스',
            citations: [{ filePath: 'src/OrderService.java', line: 5, snippet: 'public void create(Order order)' }],
          },
          detail,
        },
      ],
    }
  }

  it('detail:role 항목을 kind/ref 규칙대로 생성하고 근거 있으면 GROUNDED', async () => {
    const report = await verifyFills(
      root,
      [
        fillWithDetail({
          role: {
            text: '주문 생성을 담당하는 서비스 계층',
            citations: [{ filePath: 'src/OrderService.java', line: 5, snippet: 'public void create(Order order)' }],
          },
        }),
      ],
      'x'.repeat(40),
    )
    const items = report.domains[0].items
    const role = items.find((i) => i.kind === 'detail:role')
    expect(role).toBeDefined()
    expect(role!.ref).toBe('step:POST /orders:src/OrderService.java#detail:role')
    expect(role!.verdict).toBe('GROUNDED')
    // step summary 항목도 그대로 존재(detail 이 summary 를 대체하지 않음).
    expect(items.some((i) => i.kind === 'step')).toBe(true)
  })

  it('근거 없는 detail 은 NEEDS_REVIEW 로 강등(삭제 아님)', async () => {
    const report = await verifyFills(
      root,
      [
        fillWithDetail({
          role: {
            text: '환각 역할',
            citations: [{ filePath: 'src/Ghost.java', line: 1, snippet: 'nonexistent role' }],
          },
        }),
      ],
      'x'.repeat(40),
    )
    const role = report.domains[0].items.find((i) => i.kind === 'detail:role')
    expect(role?.verdict).toBe('NEEDS_REVIEW')
    expect(role?.text).toBe('환각 역할') // 텍스트 보존
  })

  it('detail 미제공 step 은 detail 항목을 만들지 않는다', async () => {
    const report = await verifyFills(root, [fillWithDetail(undefined)], 'x'.repeat(40))
    expect(report.domains[0].items.some((i) => String(i.kind).startsWith('detail:'))).toBe(false)
  })

  it('결정론: detail 섹션 포함 동일 입력 동일 출력', async () => {
    const fills = [
      fillWithDetail({
        role: {
          text: '서비스 역할',
          citations: [{ filePath: 'src/OrderService.java', line: 5, snippet: 'public void create(Order order)' }],
        },
      }),
    ]
    const a = JSON.stringify(await verifyFills(root, fills, 'x'.repeat(40)))
    const b = JSON.stringify(await verifyFills(root, fills, 'x'.repeat(40)))
    expect(a).toBe(b)
  })
})
