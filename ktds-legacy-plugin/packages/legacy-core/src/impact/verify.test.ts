import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyImpactClaims, verifyOneCitation, verifyAnchorExists, type ImpactClaimItem } from './verify.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-impact-verify-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  // 효력 있는 식별자성 라인.
  writeFileSync(
    join(dir, 'src', 'AccountServiceImpl.java'),
    ['package com.petstore;', 'public class AccountServiceImpl {', '  private AccountMapper accountMapper;', '}'].join('\n'),
    'utf8',
  )
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function item(citations: Array<{ filePath: string; line: number; snippet?: string }>): ImpactClaimItem {
  return { kind: 'upstream', ref: 'r', text: 't', citations }
}

describe('verifyImpactClaims — 4종 체크 + trivial', () => {
  it('ok: 경로 실존 + 라인 범위 + 텍스트 일치', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/AccountServiceImpl.java', line: 3, snippet: 'private AccountMapper accountMapper;' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('ok')
    expect(rep.items[0].verdict).toBe('GROUNDED')
  })

  it('text-mismatch: 라인은 있으나 스니펫 불일치', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/AccountServiceImpl.java', line: 3, snippet: 'private ProductMapper productMapper;' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('text-mismatch')
    expect(rep.items[0].verdict).toBe('NEEDS_REVIEW')
  })

  it('line-out-of-range', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/AccountServiceImpl.java', line: 999, snippet: 'public class AccountServiceImpl {' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('line-out-of-range')
  })

  it('no-file: 실존하지 않는 파일', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/Missing.java', line: 1, snippet: 'public class Missing {}' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('no-file')
  })

  it('path-escape: 프로젝트 루트 밖', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: '../../../etc/passwd', line: 1, snippet: 'root:x:0:0 something here' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('path-escape')
  })

  it('trivial-snippet: 너무 사소한 스니펫(게이밍 차단)', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/AccountServiceImpl.java', line: 4, snippet: '}' }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('trivial-snippet')
  })

  it('빈 snippet → trivial-snippet 자연 강등', () => {
    const rep = verifyImpactClaims(
      dir,
      [item([{ filePath: 'src/AccountServiceImpl.java', line: 3 }])],
      null,
    )
    expect(rep.items[0].citations[0].status).toBe('trivial-snippet')
  })

  it('근거율: 인용 없는 항목은 분모 제외, uncitedClaims 로 노출', () => {
    const rep = verifyImpactClaims(
      dir,
      [
        item([{ filePath: 'src/AccountServiceImpl.java', line: 3, snippet: 'private AccountMapper accountMapper;' }]),
        { kind: 'flow', ref: 'flow:x', text: 't', citations: [] },
      ],
      null,
    )
    expect(rep.overall.uncitedClaims).toBe(1)
    expect(rep.overall.groundedPct).toBe(100) // 인용 보유 1건 모두 grounded
  })

  it('결정론: 항목 (kind,ref) 정렬', () => {
    const rep = verifyImpactClaims(
      dir,
      [
        { kind: 'upstream', ref: 'z', text: 't', citations: [] },
        { kind: 'upstream', ref: 'a', text: 't', citations: [] },
      ],
      null,
    )
    expect(rep.items.map((i) => i.ref)).toEqual(['a', 'z'])
  })
})

describe('verifyOneCitation — supplement A 앵커 실존 재사용', () => {
  it('실존 앵커 → ok', () => {
    expect(
      verifyOneCitation(dir, {
        filePath: 'src/AccountServiceImpl.java',
        line: 2,
        snippet: 'public class AccountServiceImpl {',
      }),
    ).toBe('ok')
  })
  it('가공된 net-new 파일 → no-file', () => {
    expect(
      verifyOneCitation(dir, { filePath: 'src/KakaoLoginController.java', line: 1, snippet: 'public class KakaoLoginController {}' }),
    ).toBe('no-file')
  })
})

describe('verifyAnchorExists — 실존(경로+라인)만, 텍스트 무관', () => {
  it('실존 파일 + 라인범위 → ok', () => {
    expect(verifyAnchorExists(dir, { filePath: 'src/AccountServiceImpl.java', line: 1 })).toBe('ok')
  })
  it('라인 초과 → line-out-of-range', () => {
    expect(verifyAnchorExists(dir, { filePath: 'src/AccountServiceImpl.java', line: 999 })).toBe('line-out-of-range')
  })
  it('미실존 파일 → no-file', () => {
    expect(verifyAnchorExists(dir, { filePath: 'src/Ghost.java', line: 1 })).toBe('no-file')
  })
  it('루트 밖 → path-escape', () => {
    expect(verifyAnchorExists(dir, { filePath: '../../../etc/hosts', line: 1 })).toBe('path-escape')
  })
  it('전부 공백인 파일 → no-file(빈 파일 line 1 위양성 grounding 방지)', () => {
    mkdirSync(join(dir, 'blank'), { recursive: true })
    writeFileSync(join(dir, 'blank', 'Empty.java'), '\n  \n\n', 'utf8')
    expect(verifyAnchorExists(dir, { filePath: 'blank/Empty.java', line: 1 })).toBe('no-file')
  })
})
