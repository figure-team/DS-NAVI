import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { extractBranches, scanBranches } from './branch-scanner.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(here, '..', '..', 'fixtures', 'domain-policy')
const rel = 'CheckoutService.java'
const src = readFileSync(join(fixtureDir, rel), 'utf8')

describe('분기 스캐너 (PD1)', () => {
  it('if/else if/switch/삼항 결정 지점 + 조건식 추출', async () => {
    const branches = await extractBranches(rel, src)
    const conds = branches.map((b) => `${b.kind}:${b.condition}`)
    expect(conds).toContain('if:acc == null || !acc.isAuthenticated()')
    expect(conds).toContain('if:cart.isEmpty()') // else if 도 if 노드
    expect(conds).toContain('switch:acc.getGrade()')
    expect(conds).toContain('ternary:acc.isVip()')
    expect(conds).toContain('ternary:amount > 100000')
  })

  it('소속 클래스/메서드 + file:line 귀속', async () => {
    const branches = await extractBranches(rel, src)
    for (const b of branches) {
      expect(b.className).toBe('CheckoutService')
      expect(b.relPath).toBe(rel)
      expect(b.line).toBeGreaterThan(0)
    }
    const feeTernary = branches.find((b) => b.condition === 'amount > 100000')!
    expect(feeTernary.methodName).toBe('fee')
    const authIf = branches.find((b) => b.condition.startsWith('acc == null'))!
    expect(authIf.methodName).toBe('checkout')
  })

  it('scanBranches: 집계 + 결정론(정렬) + fileCount', async () => {
    const a = await scanBranches(fixtureDir, [rel])
    const b = await scanBranches(fixtureDir, [rel])
    expect(a).toEqual(b) // 결정론
    expect(a.fileCount).toBe(1)
    expect(a.signals.length).toBe(5)
    // relPath,line 오름차순.
    for (let i = 1; i < a.signals.length; i++) {
      expect(a.signals[i].line).toBeGreaterThanOrEqual(a.signals[i - 1].line)
    }
  })

  it('읽기 실패 파일은 건너뜀(누락 방어)', async () => {
    const set = await scanBranches(fixtureDir, ['nope.java', rel])
    expect(set.fileCount).toBe(1) // 존재하는 1개만
  })
})
