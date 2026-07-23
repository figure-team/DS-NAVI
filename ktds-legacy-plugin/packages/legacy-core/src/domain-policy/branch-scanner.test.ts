import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { extractBranches, scanBranches, extractEnums } from './branch-scanner.js'

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

  it('THEN(처리 본문) 추출 — if consequence / 삼항 결과:대안', async () => {
    const branches = await extractBranches(rel, src)
    const authIf = branches.find((b) => b.condition.startsWith('acc == null'))!
    expect(authIf.then).toContain('return "deny"') // consequence 블록 요약
    const feeTernary = branches.find((b) => b.condition === 'amount > 100000')!
    expect(feeTernary.then).toBe('0 : 2500') // 결과 : 대안
    const switchBr = branches.find((b) => b.kind === 'switch')!
    expect(switchBr.then).toBe('') // switch 는 케이스별 → 공란
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

describe('enum 추출 (§3 상태값 시드)', () => {
  const enumSrc = `package com.example;
public enum MemberStatus {
  ACTIVE,
  DORMANT,
  WITHDRAWN
}`

  it('enum 이름 + 상수 목록 + file:line', async () => {
    const enums = await extractEnums('domain/MemberStatus.java', enumSrc)
    expect(enums.length).toBe(1)
    expect(enums[0].enumName).toBe('MemberStatus')
    expect(enums[0].constants).toEqual(['ACTIVE', 'DORMANT', 'WITHDRAWN'])
    expect(enums[0].line).toBeGreaterThan(0)
  })

  it('enum 없는 파일 → 빈 배열', async () => {
    expect(await extractEnums('x.java', 'package p; class C {}')).toEqual([])
  })
})

// ── Kotlin(.kt) 분기·enum 추출 (2026-07-23 갭 해소) ──────────────────────────

describe('분기 스캐너 — Kotlin(.kt)', () => {
  const ktSrc = `package com.music
class MusicController {
  fun putFee(r: Req): Int {
    if (r.useType == null && r.amount > 0) { return reject() } else { return ok() }
    return when (r.axis) {
      "A" -> 1
      "B", "C" -> 2
      else -> 0
    }
  }
  fun grade(v: Boolean): String = if (v) "vip" else "normal"
}`

  it('Kotlin if_expression=if · when_expression=switch(삼항 없음) + 조건식', async () => {
    const branches = await extractBranches('MusicController.kt', ktSrc)
    const conds = branches.map((b) => `${b.kind}:${b.condition}`)
    expect(conds).toContain('if:r.useType == null && r.amount > 0')
    expect(conds).toContain('switch:r.axis') // when(r.axis) → 괄호 제거
    expect(conds).toContain('if:v') // 식(expression) if 도 검출
    // Kotlin 엔 ternary 노드가 없다 — if 가 겸한다.
    expect(branches.some((b) => b.kind === 'ternary')).toBe(false)
  })

  it('Kotlin THEN(consequence) 추출 + when THEN 공란 + 클래스/메서드 귀속', async () => {
    const branches = await extractBranches('MusicController.kt', ktSrc)
    const feeIf = branches.find((b) => b.condition.startsWith('r.useType'))!
    expect(feeIf.then).toContain('return reject()')
    expect(feeIf.className).toBe('MusicController')
    expect(feeIf.methodName).toBe('putFee')
    const whenBr = branches.find((b) => b.kind === 'switch')!
    expect(whenBr.then).toBe('') // 케이스별 → 공란(Java switch 와 동형)
  })

  it('Java 파서 하드코딩 회귀 없음 — .kt 는 Kotlin, .java 는 Java', async () => {
    // 같은 로직을 Java 확장자로 주면 Java 파서라 Kotlin 식 if 는 안 잡힌다(언어 분기 확인).
    const ktBranches = await extractBranches('X.kt', ktSrc)
    expect(ktBranches.length).toBeGreaterThan(0) // Kotlin 파서로는 검출
  })

  it('Kotlin enum class → 이름 + 상수', async () => {
    const enums = await extractEnums('Status.kt', 'package p\nenum class Status { ACTIVE, CLOSED, PENDING }')
    expect(enums.length).toBe(1)
    expect(enums[0].enumName).toBe('Status')
    expect(enums[0].constants).toEqual(['ACTIVE', 'CLOSED', 'PENDING'])
  })
})
