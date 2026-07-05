/**
 * 실적 요약 조립 단위테스트(W6) — 고정 WorkLogResult/원장 주입(순수 함수 검증).
 * 검증 축: 기간 반개구간 경계·range 모드 원장 null·모듈 귀속(인벤토리/디렉터리)·
 * 최초확정 vs 재확정·auditless 폴백·unparsableAt 표면화·byte 결정론.
 */
import { describe, it, expect } from 'vitest'
import type { ProgramInventory } from '../program-inventory/index.js'
import type { WorkLogResult } from './collect.js'
import {
  buildWorkSummary,
  makeWindow,
  resolveRange,
  scanDocProgress,
  scanRtmProgress,
} from './index.js'

const HEAD = 'aaaa000000000000000000000000000000000000'

function commit(
  sha: string,
  dateIso: string,
  files: Array<[string, number, number]>,
  opts?: { author?: string; isMerge?: boolean; subject?: string },
) {
  return {
    sha,
    dateIso,
    author: opts?.author ?? 'tester',
    subject: opts?.subject ?? sha.slice(0, 4),
    isMerge: opts?.isMerge ?? false,
    files: files.map(([path, added, deleted]) => ({ path, added, deleted })),
  }
}

/** HEAD=2026-06-30T12:00Z, 1주 윈도 = (2026-06-23T12:00Z, 2026-06-30T12:00Z]. */
function fixtureLog(): WorkLogResult {
  return {
    kind: 'ok',
    headSha: HEAD,
    headDateIso: '2026-06-30T12:00:00Z',
    prefix: '',
    commits: [
      commit(HEAD, '2026-06-30T12:00:00Z', [['src/a.java', 5, 1]]),
      commit('bbbb1', '2026-06-25T09:00:00Z', [
        ['src/a.java', 2, 2],
        ['docs/readme.md', 10, 0],
      ]),
      // 경계: 하한과 정확히 동시각 — 개구간이라 제외.
      commit('cccc2', '2026-06-23T12:00:00Z', [['src/b.java', 1, 0]]),
      // 윈도 밖(과거).
      commit('dddd3', '2026-06-01T00:00:00Z', [['src/a.java', 100, 0]]),
    ],
  }
}

const emptyLedgers = { rtmOverlay: null, docStates: null, programInventory: null }

describe('resolveRange / makeWindow', () => {
  it('weeks: HEAD committer date 앵커, 반개구간 (from, to]', () => {
    const r = resolveRange({ mode: 'weeks', weeks: 1 }, { sha: HEAD, dateIso: '2026-06-30T12:00:00Z' })
    expect(r.anchorSha).toBe(HEAD)
    expect(r.fromIso).toBe('2026-06-23T12:00:00.000Z')
    expect(r.toIso).toBe('2026-06-30T12:00:00.000Z')
    const w = makeWindow(r)!
    expect(w('2026-06-23T12:00:00Z')).toBe(false) // 하한 미포함
    expect(w('2026-06-23T12:00:01Z')).toBe(true)
    expect(w('2026-06-30T12:00:00Z')).toBe(true) // 상한(앵커) 포함
    expect(w('2026-06-30T12:00:01Z')).toBe(false)
  })

  it('month: [1일, 익월 1일) 반개구간', () => {
    const r = resolveRange({ mode: 'month', month: '2026-06' }, null)
    expect(r.fromIso).toBe('2026-06-01T00:00:00.000Z')
    expect(r.toIso).toBe('2026-07-01T00:00:00.000Z')
    const w = makeWindow(r)!
    expect(w('2026-06-01T00:00:00Z')).toBe(true) // 하한 포함
    expect(w('2026-07-01T00:00:00Z')).toBe(false) // 상한 미포함
  })

  it('range: 시각 윈도 없음(null) — 원장 진척은 [미확인] degrade', () => {
    const r = resolveRange({ mode: 'range', range: 'A..B' }, null)
    expect(makeWindow(r)).toBeNull()
  })

  it('불량 인자는 명시 오류(월 형식/주 수)', () => {
    expect(() => resolveRange({ mode: 'month', month: '2026-13' }, null)).toThrow()
    expect(() => resolveRange({ mode: 'month', month: '202606' }, null)).toThrow()
    expect(() => resolveRange({ mode: 'weeks', weeks: 0 }, null)).toThrow()
  })
})

describe('buildWorkSummary', () => {
  it('weeks 윈도 필터 + 합계 + 정렬(dateIso DESC, sha ASC)', () => {
    const report = buildWorkSummary({
      spec: { mode: 'weeks', weeks: 1 },
      collected: fixtureLog(),
      ...emptyLedgers,
    })
    expect(report.commits.map((c) => c.sha)).toEqual([HEAD, 'bbbb1'])
    expect(report.totals).toEqual({
      commits: 2,
      mergeCommits: 0,
      authors: 1,
      files: 2,
      added: 17,
      deleted: 3,
    })
    // 원장 파일 없음 → null(0 과 구분).
    expect(report.rtmProgress).toBeNull()
    expect(report.docProgress).toBeNull()
    expect(report.meta).toEqual({
      gitAvailable: true,
      gitStatus: 'ok',
      prefix: '',
      moduleSource: 'dir',
    })
  })

  it('모듈 귀속: 디렉터리 폴백 — 최상위 세그먼트, linesChanged DESC', () => {
    const report = buildWorkSummary({
      spec: { mode: 'weeks', weeks: 1 },
      collected: fixtureLog(),
      ...emptyLedgers,
    })
    expect(report.modules).toEqual([
      { key: 'docs', source: 'dir', commits: 1, files: 1, linesChanged: 10, topFiles: ['docs/readme.md'] },
      { key: 'src', source: 'dir', commits: 2, files: 1, linesChanged: 10, topFiles: ['src/a.java'] },
    ])
  })

  it('모듈 귀속: program-inventory 도메인 조인 우선, 미포함 파일은 dir 폴백', () => {
    const inventory = {
      programs: [
        { filePath: 'src/a.java', domain: 'order' },
        { filePath: 'src/b.java', domain: null },
      ],
    } as unknown as ProgramInventory
    const report = buildWorkSummary({
      spec: { mode: 'weeks', weeks: 1 },
      collected: fixtureLog(),
      rtmOverlay: null,
      docStates: null,
      programInventory: inventory,
    })
    expect(report.meta.moduleSource).toBe('program-inventory')
    // 동점(linesChanged) tie-break = key ASC.
    expect(report.modules).toEqual([
      { key: 'docs', source: 'dir', commits: 1, files: 1, linesChanged: 10, topFiles: ['docs/readme.md'] },
      { key: 'order', source: 'program-inventory', commits: 2, files: 1, linesChanged: 10, topFiles: ['src/a.java'] },
    ])
  })

  it('range 모드: 수집 집합 그대로 + 원장 진척 null([미확인] — 시각 축 교차 불가)', () => {
    const report = buildWorkSummary({
      spec: { mode: 'range', range: 'X..Y' },
      collected: fixtureLog(),
      rtmOverlay: {}, // 원장이 있어도
      docStates: [],
      programInventory: null,
    })
    expect(report.commits).toHaveLength(4)
    expect(report.rtmProgress).toBeNull()
    expect(report.docProgress).toBeNull()
  })

  it('git 불가: 빈 실적 + gitStatus 사유 구분(no-git/shallow) + 진척 null', () => {
    for (const kind of ['no-git', 'shallow'] as const) {
      const report = buildWorkSummary({
        spec: { mode: 'weeks', weeks: 1 },
        collected: { kind },
        rtmOverlay: {},
        docStates: [],
        programInventory: null,
      })
      expect(report.gitCommit).toBeNull()
      expect(report.commits).toEqual([])
      expect(report.meta.gitAvailable).toBe(false)
      expect(report.meta.gitStatus).toBe(kind)
      // weeks 앵커 미해석 → 원장이 있어도 윈도가 없어 집계 불가.
      expect(report.rtmProgress).toBeNull()
    }
  })

  it('month 모드는 git 불가여도 달력 윈도로 원장 집계 가능', () => {
    const report = buildWorkSummary({
      spec: { mode: 'month', month: '2026-06' },
      collected: { kind: 'no-git' },
      rtmOverlay: {
        'FN-1': { at: '2026-06-10T00:00:00Z', audit: [{ event: 'CONFIRMED', by: 'u', at: '2026-06-10T00:00:00Z' }] },
      },
      docStates: [],
      programInventory: null,
    })
    expect(report.rtmProgress?.functionsConfirmed).toBe(1)
  })

  it('byte 결정론 — 동일 입력 2회 직렬화 동일', () => {
    const a = JSON.stringify(
      buildWorkSummary({ spec: { mode: 'weeks', weeks: 1 }, collected: fixtureLog(), ...emptyLedgers }),
    )
    const b = JSON.stringify(
      buildWorkSummary({ spec: { mode: 'weeks', weeks: 1 }, collected: fixtureLog(), ...emptyLedgers }),
    )
    expect(a).toBe(b)
  })
})

describe('scanRtmProgress', () => {
  const w = makeWindow(
    resolveRange({ mode: 'weeks', weeks: 1 }, { sha: HEAD, dateIso: '2026-06-30T12:00:00Z' }),
  )!

  it('전환 = 최초 확정이 윈도 안 — 재확정만 윈도 안이면 전환 아님(이벤트로만 집계)', () => {
    const p = scanRtmProgress(
      {
        // 최초 확정이 윈도 안 → 전환 1.
        'FN-a': {
          at: '2026-06-25T00:00:00Z',
          audit: [{ event: 'CONFIRMED', by: 'u', at: '2026-06-25T00:00:00Z' }],
        },
        // 최초 확정은 윈도 밖(6/1), 윈도 안은 재확정 — 전환 0, confirmEvents 1.
        'FN-b': {
          at: '2026-06-26T00:00:00Z',
          audit: [
            { event: 'CONFIRMED', by: 'u', at: '2026-06-01T00:00:00Z' },
            { event: 'CONFIRMED', by: 'u', at: '2026-06-26T00:00:00Z' },
          ],
        },
        _fields: { 'custom:x': { at: '2026-06-25T00:00:00Z' } }, // 예약 섹션 — 집계 제외.
        _scenarios: {
          'TS-1': {
            at: '2026-06-27T00:00:00Z',
            audit: [
              { event: 'EDITED', by: 'u', at: '2026-06-24T00:00:00Z' },
              { event: 'CONFIRMED_NO_EDIT', by: 'u', at: '2026-06-27T00:00:00Z' },
            ],
          },
        },
        _requirements: {
          'REQ-1': {
            at: '2026-05-01T00:00:00Z',
            audit: [{ event: 'CONFIRMED', by: 'u', at: '2026-05-01T00:00:00Z' }],
          },
        },
      },
      w,
    )
    expect(p.functionsConfirmed).toBe(1)
    expect(p.scenariosConfirmed).toBe(1) // CONFIRMED_NO_EDIT 도 확정 어휘.
    expect(p.requirementsConfirmed).toBe(0) // 윈도 밖.
    expect(p.confirmEvents).toBe(3) // FN-a + FN-b 재확정 + TS-1.
    expect(p.editEvents).toBe(1)
    expect(p.auditlessEntities).toBe(0)
    expect(p.unparsableAt).toBe(0)
  })

  it('audit 없는 구원장은 at 폴백 + auditless 표면화, 불량 at 은 unparsableAt', () => {
    const p = scanRtmProgress(
      {
        'FN-old': { at: '2026-06-28T00:00:00Z', audit: [] },
        'FN-bad': { at: 'not-a-date', audit: [] },
        'FN-badevt': {
          at: '2026-06-28T00:00:00Z',
          audit: [{ event: 'CONFIRMED', by: 'u', at: 'garbage' }],
        },
      },
      w,
    )
    expect(p.functionsConfirmed).toBe(1) // FN-old 폴백 집계.
    expect(p.auditlessEntities).toBe(2)
    expect(p.unparsableAt).toBe(2) // FN-bad(at) + FN-badevt(event at).
  })
})

describe('scanDocProgress', () => {
  const w = makeWindow(resolveRange({ mode: 'month', month: '2026-06' }, null))!

  it('SUBMITTED/APPROVED/RETURNED 윈도 집계 + approvedDocs ASC', () => {
    const p = scanDocProgress(
      [
        {
          docId: 'si-b',
          raw: {
            audit: [
              { event: 'SUBMITTED', by: 'u', at: '2026-06-02T00:00:00Z' },
              { event: 'APPROVED', by: 'u', at: '2026-06-03T00:00:00Z' },
            ],
          },
        },
        {
          docId: 'si-a',
          raw: {
            audit: [
              { event: 'APPROVED', by: 'u', at: '2026-06-04T00:00:00Z' },
              { event: 'RETURNED', by: 'u', at: '2026-07-01T00:00:00Z' }, // 윈도 밖.
            ],
          },
        },
        { docId: 'si-c', raw: { audit: [{ event: 'APPROVED', by: 'u', at: 'bad' }] } },
      ],
      w,
    )
    expect(p).toEqual({
      submitted: 1,
      approved: 2,
      returned: 0,
      approvedDocs: ['si-a', 'si-b'],
      unparsableAt: 1,
    })
  })
})
